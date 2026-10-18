/**
 * dsh-music-on · host 侧 DASH 音频流代理（stream）
 *
 * 职责边界（写死在这里，改动前先想清楚）：
 * 1) 只把「B 站稿件的一路 DASH 音频」转成浏览器 <audio> 能直接播的同源流。
 *    不做混流、不转码、不落盘，294MB 文件一个字节都不缓存在进程里。
 * 2) 直链绝不缓存：B 站 CDN 直链（baseUrl 里的 deadline / eid 签名）是限时的，
 *    唯一可缓存的中间产物是 playurl 的「清单」，60 秒硬上限（见 DEFAULTS.cacheTtlMs）。
 * 3) 安全边界是硬要求：bvid/cid 正则、直链域名白名单、逐跳重定向校验、
 *    出口 IP 校验（连接时校验，防 DNS rebinding）。缺一条这个路由就是任意 URL 代理。
 *
 * 宿主挂载方式（已在本机 DSH 0.2.1-rc.2 源码核实）：
 *   ctx.connection.fetch.register({ path, methods, requestBody, fetch })
 *   范例：...\dsh-api-session-controller\lib\index.js:2482 `/api/file`
 *   共享 `/api` 前缀由 dsh-client-connection 在 lib/index.js:1044-1058 挂好，
 *   内部强制 peer.principal.kind === "owner"，非 owner 一律 403 —— 不要用
 *   ctx.webServer.register 裸挂，那会绕过登录态与 Host/Origin 防护。
 *
 * 浏览器连接层的真实行为（bridge，dsh-client-connection/lib/index.js:40-110，
 * 决定了「流式」到底能不能成立）：
 *   · 响应体 `for await (const chunk of response.body)` + `res.write` + 背压等待 drain，
 *     **不会把响应整块 buffer**（只有请求体在 requestBody:"buffered" 下会）。
 *   · 响应头用 `Object.fromEntries(response.headers.entries())` 摊平，
 *     Set-Cookie 会被折叠、值为 undefined 的条目会被过滤 —— 所以本模块的响应头
 *     只用字符串或字符串数组，绝不放 undefined。
 *   · 客户端断开 → bridge 的 abort signal 触发 → request.signal 触发 →
 *     上游节点请求被 destroy（ABORTED 不写日志，属正常路径）。
 *
 * 上游实测（2026-10-18 本机 node:https 直连，UA=桌面 Chrome/124）：
 *   GET api.bilibili.com/x/player/playurl?bvid=..&cid=..&qn=64&fnval=16
 *     → 200 code=0，dash.audio 3 条：30232/30216/30280，bandwidth 123756/65674/209347，
 *       mimeType audio/mp4，codecid 0，codecs mp4a.40.2，baseUrl 主机
 *       upos-sz-mirrorcos.bilivideo.com / upos-sz-mirrorcoso1.bilivideo.com
 *   GET <baseUrl> + Range: bytes=0-2047（带 Referer、不带 Cookie）
 *     → 206，Content-Type **application/octet-stream**，Content-Range: bytes 0-2047/<total>
 *   · 不带 Referer 也返回 206（与本机旧笔记「必须 Referer」不一致，实测为准），
 *     但仍然发 Referer：将来 CDN 策略收紧时不吃亏。
 *   · 伪造 53 字符子域 upos-sz-mirror<53a>.bilivideo.com → ENOTFOUND，
 *     说明「域名白名单 + 单标签长度上限」足以把任意 URL 代理压到 B 站 CDN 之内。
 *   · baseUrl 末尾带 `&range=bytes=0-15` 时上游照样认 Range 头（206/16 字节），
 *     所以转发 Range 头是唯一正解，不要去拼查询参数。
 */

import { createHash } from 'node:crypto';
import dns from 'node:dns';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

import {
  TOKEN_ERRORS,
  createMediaTokenStore,
  readMediaToken,
} from './mediatoken.js';

/** 路由路径。与 src/shared.js 的 STREAM_PATH 必须逐字相等（有单测钉住）。 */
export const STREAM_PATH = '/api/dsh-music-on/stream';

/* ------------------------------------------------------------------ *
 * 安全边界：B 站 CDN 域名白名单
 * ------------------------------------------------------------------ */

/**
 * 允许代理的 CDN 根域。只列 B 站自己的分发域名，一个第三方都不放。
 * akamaized.net 是被 B 站拿来 CNAME 的 Akamai 入口，实测会出现在 baseUrl 里。
 */
export const ALLOWED_CDN_DOMAINS = Object.freeze([
  'bilivideo.com',
  'bilivideo.cn',
  'bilibili.com',
  'hdslb.com',
  'szbdyd.com',
  'akamaized.net',
  'mcdn.bilivideo.cn',
  'mirroraliyun.com',
]);

/**
 * 平台音频 CDN 根域（网易云 / QQ 音乐）。**只在 token 通道生效**，`src=` 裸参数
 * 永远看不到这张表。
 *
 * 这是本模块最重要的安全分界，别改错方向：
 *   白名单**没有**被放宽成「任意第三方 CDN」。授权与寻址被拆开了 ——
 *   只有宿主自己解析过、并据此签发 HMAC 票据的地址，才允许落在这张表覆盖的域名上。
 *   客户端拿不到票据里的 URL，也无从伪造签名，因此它无法请求任何一个未经解析的地址。
 *   若把这张表并进 ALLOWED_CDN_DOMAINS，`src=` 立刻退化成开放代理。
 *
 * 域名取值依据（2026-10-18 本机实测，见 scripts/probe-platform-cdn.mjs）：
 *   网易云 enhance/player/url 返回 m701.music.126.net、m801.music.126.net
 *   QQ CgiGetVkey 的 sip 返回 aqqmusic.tc.qq.com、sjy6.stream.qqmusic.qq.com
 */
export const PLATFORM_CDN_DOMAINS = Object.freeze([
  'music.126.net',
  'tc.qq.com',
  'stream.qqmusic.qq.com',
]);

/**
 * 按目标 host 选 Referer。平台 CDN 会校验来源，发错 referer 直接 403。
 *
 * 实测结论（probe-platform-cdn.mjs）：网易云与 QQ 的 CDN **不带 Referer 也返 206**，
 * 但仍然照发 —— 将来收紧时不吃亏，与 B 站那边的处理保持一致。
 *
 * @param {string} hostname
 * @returns {string}
 */
export function refererForHost(hostname) {
  const host = normalizeHostname(hostname);
  if (host === 'music.126.net' || host.endsWith('.music.126.net')) return 'https://music.163.com/';
  if (host === 'tc.qq.com' || host.endsWith('.tc.qq.com')) return 'https://y.qq.com/';
  if (host === 'stream.qqmusic.qq.com' || host.endsWith('.stream.qqmusic.qq.com')) return 'https://y.qq.com/';
  return DEFAULTS.referer;
}

/**
 * 单个 hostname 里各标签的字符集。比「通用 URL 合法字符」更窄是有意的：
 * 它顺手挡掉 `%`（不允许出现任何编码后的路径片段）与 `_`（B 站 CDN 没有）。
 */
const HOST_LABEL_PATTERN = /^[a-z0-9-]+$/;

/** DNS 名总长上限（RFC 1035，含点）。伪造超长子域在 DNS 层就 ENOTFOUND。 */
const MAX_HOSTNAME_LENGTH = 253;

/* ------------------------------------------------------------------ *
 * 错误码（客户端 resolve.js 的错误码是「解析」语义，这里是「流」语义，两套不混用）
 * ------------------------------------------------------------------ */

export const ERROR_CODES = Object.freeze({
  /** 参数缺失/畸形：bvid 不匹配 ^BV[0-9A-Za-z]{10}$、cid 非纯数字等 */
  BAD_REQUEST: 'E_STREAM_BAD_REQUEST',
  /** 作品不存在 / B 站接口返回非 0 code（如 -400 请求错误、-404 稿件不可见） */
  UPSTREAM_BAD: 'E_STREAM_UPSTREAM_BAD',
  /** 该稿件没有可用的 DASH 音频（互动视频、纯图稿、或需要登录） */
  NO_AUDIO: 'E_STREAM_NO_AUDIO',
  /** 白名单拒绝：域名/协议/出口 IP 不在允许集内 */
  BLOCKED: 'E_STREAM_BLOCKED',
  /** 直链过期或被 CDN 拒绝（403/404/410）→ 客户端应清缓存重取清单 */
  EXPIRED: 'E_STREAM_EXPIRED',
  /** 上游超时 / 连接失败 / 5xx → 客户端可重试一次 */
  UPSTREAM_FAILED: 'E_STREAM_UPSTREAM_FAILED',
  /** 客户端断开 → 上游被取消，**这是正常路径，不写日志、不进错误计数** */
  ABORTED: 'E_STREAM_ABORTED',
});

/** 错误码 → HTTP 状态码。表在单测里逐条钉死，改一个就红。 */
export const STATUS_BY_CODE = Object.freeze({
  E_STREAM_BAD_REQUEST: 400,
  E_STREAM_BLOCKED: 403,
  E_STREAM_NO_AUDIO: 404,
  E_STREAM_EXPIRED: 410,
  E_STREAM_UPSTREAM_BAD: 502,
  E_STREAM_UPSTREAM_FAILED: 504,
  E_STREAM_ABORTED: 499,
});

/** 客户端看到码之后的动作。写成数据而不是散落在注释里，降级链才有唯一事实来源。 */
export const RECOVERY_BY_CODE = Object.freeze({
  E_STREAM_BAD_REQUEST: 'no-retry',
  E_STREAM_BLOCKED: 'no-retry',
  E_STREAM_NO_AUDIO: 'degrade-embed',
  E_STREAM_EXPIRED: 'refresh-once',
  E_STREAM_UPSTREAM_BAD: 'degrade-embed',
  E_STREAM_UPSTREAM_FAILED: 'retry-once',
  E_STREAM_ABORTED: 'no-retry',
});

/** 默认参数。全部可在 createStreamApi 的 options 覆盖，便于单测把超时压到毫秒级。 */
export const DEFAULTS = Object.freeze({
  /** 清单缓存：B 站直链约 2 小时失效，60 秒是「足够吸收连续 Range 请求」与「足够新鲜」的折中。 */
  cacheTtlMs: 60_000,
  cacheMaxEntries: 32,
  /** playurl 接口超时。它是一个小 JSON，正常几十毫秒。 */
  manifestTimeoutMs: 8_000,
  /** 直链首字节超时：等到 response 头就算赢，之后是流式透传。 */
  streamTimeoutMs: 15_000,
  maxRedirects: 3,
  /** 客户端没给 Range 时的默认分片：4MiB ≈ 209347bps 音频的 160 秒，够边播边拉。 */
  defaultChunkBytes: 4 * 1024 * 1024,
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  referer: 'https://www.bilibili.com/',
  /** 浏览器 <audio> 不能可靠嗅探 application/octet-stream —— 这是本路由存在的首要原因。 */
  contentType: 'audio/mp4',
});

/* ------------------------------------------------------------------ *
 * 错误
 * ------------------------------------------------------------------ */

/**
 * @param {string} code
 * @param {string} message
 * @param {Record<string, unknown>} [detail]
 * @returns {Error & { code: string, detail?: object }}
 */
export function createStreamError(code, message, detail) {
  const error = new Error(message);
  error.name = 'MusicOnStreamError';
  error.code = code;
  if (detail !== undefined) error.detail = detail;
  return error;
}

/**
 * @param {string} code
 * @returns {number}
 */
export function statusForCode(code) {
  const status = STATUS_BY_CODE[code];
  return status === undefined ? 500 : status;
}

/**
 * @param {string} code
 * @returns {string}
 */
export function recoveryForCode(code) {
  const action = RECOVERY_BY_CODE[code];
  return action === undefined ? 'no-retry' : action;
}

/* ------------------------------------------------------------------ *
 * 参数校验
 * ------------------------------------------------------------------ */

/** BV 号：BV + 10 位 base58 字符。写死，不接受小写 bv 前缀。 */
export const BVID_PATTERN = /^BV[0-9A-Za-z]{10}$/;
/** 纯数字，无符号无空白。 */
export const CID_PATTERN = /^[0-9]{1,20}$/;
/** aid 形态（客户端 sources.js 会传 aid），同样只收纯数字。 */
export const AID_PATTERN = /^[0-9]{1,20}$/;

/**
 * 解析并校验查询参数。**这是唯一入口**，任何一条不合格都整条拒绝。
 *
 * 为什么 aid 必须配 bvid 或 cid 才算有效：单独 aid 无法定位到某一 P，
 * 而我们的 playurl 调用是 (bvid|aid) + (cid|page)，缺了 cid 就得再请求一次
 * view 接口 —— 那条路会让「一个 GET」变成两次网络往返，反而放大攻击面。
 *
 * @param {URLSearchParams|Record<string,string>} input
 * @returns {{ bvid: string|null, aid: string|null, cid: string|null, page: number }}
 */
export function parseStreamQuery(input) {
  const get = (name) => {
    if (input instanceof URLSearchParams) return input.get(name);
    const value = input ? input[name] : undefined;
    return typeof value === 'string' ? value : undefined;
  };

  const bvid = get('bvid');
  const aid = get('aid');
  const cid = get('cid');
  const pageRaw = get('page');

  if (bvid !== undefined && bvid !== null && bvid !== '' && !BVID_PATTERN.test(bvid)) {
    throw createStreamError(ERROR_CODES.BAD_REQUEST, 'bvid 必须是 BV+10 位字母数字', { bvid });
  }
  if (aid !== undefined && aid !== null && aid !== '' && !AID_PATTERN.test(aid)) {
    throw createStreamError(ERROR_CODES.BAD_REQUEST, 'aid 必须是纯数字', { aid });
  }
  if (cid !== undefined && cid !== null && cid !== '' && !CID_PATTERN.test(cid)) {
    throw createStreamError(ERROR_CODES.BAD_REQUEST, 'cid 必须是纯数字', { cid });
  }
  let page = 1;
  if (pageRaw !== undefined && pageRaw !== null && pageRaw !== '') {
    if (!CID_PATTERN.test(pageRaw)) {
      throw createStreamError(ERROR_CODES.BAD_REQUEST, 'page 必须是纯数字', { page: pageRaw });
    }
    page = Math.max(1, Number(pageRaw));
  }

  const hasBvid = typeof bvid === 'string' && bvid !== '';
  const hasAid = typeof aid === 'string' && aid !== '';
  if (!hasBvid && !hasAid) {
    throw createStreamError(ERROR_CODES.BAD_REQUEST, '至少需要 bvid 或 aid', {});
  }
  const hasCid = typeof cid === 'string' && cid !== '';
  if (!hasCid && page < 1) {
    throw createStreamError(ERROR_CODES.BAD_REQUEST, '缺少 cid 时 page 至少为 1', { page });
  }
  return {
    bvid: hasBvid ? bvid : null,
    aid: hasAid ? aid : null,
    cid: hasCid ? cid : null,
    page,
  };
}

/* ------------------------------------------------------------------ *
 * Range 头
 * ------------------------------------------------------------------ */

/**
 * 解析浏览器发来的 Range 头。
 *
 * 只支持单个闭区间 `bytes=a-b` / 开区间 `bytes=a-` / 后缀 `bytes=-n` 三种。
 * 多段 Range（a-b,c-d）返回 `multi`，上层按整文件 200 处理：
 * 浏览器对 <audio> 发多段是极少数行为，给 multipart/byteranges 徒增透传复杂度。
 *
 * @param {string|null|undefined} raw
 * @returns {{ kind:'none' } | { kind:'invalid' } | { kind:'multi' } |
 *           { kind:'range', start:number|null, end:number|null }}
 */
export function parseRangeHeader(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return { kind: 'none' };
  const text = raw.trim();
  const match = /^bytes=(.*)$/i.exec(text);
  if (!match) return { kind: 'invalid' };
  const spec = match[1].trim();
  if (spec.includes(',')) return { kind: 'multi' };
  const parts = /^([0-9]*)-([0-9]*)$/.exec(spec);
  if (!parts) return { kind: 'invalid' };
  const rawStart = parts[1];
  const rawEnd = parts[2];
  if (rawStart === '' && rawEnd === '') return { kind: 'invalid' };
  const start = rawStart === '' ? null : Number(rawStart);
  const end = rawEnd === '' ? null : Number(rawEnd);
  if (start !== null && end !== null && end < start) return { kind: 'invalid' };
  return { kind: 'range', start, end };
}

/**
 * 把 Range 落成对上游的具体请求头。服务端没有 Range 能力（multipart/none）时
 * 自己切一个分片，避免「一个 GET 拖整个 294MB」。
 *
 * @param {{kind:string,start?:number|null,end?:number|null}} range
 * @param {number} totalBytes 已知总长；-1 表示未知
 * @param {number} defaultChunkBytes
 * @returns {{ header: string|null, start: number, end: number, suffix: boolean }}
 */
export function planUpstreamRange(range, totalBytes, defaultChunkBytes) {
  const chunk = Number.isFinite(defaultChunkBytes) && defaultChunkBytes > 0 ? Math.floor(defaultChunkBytes) : DEFAULTS.defaultChunkBytes;
  if (range && range.kind === 'range') {
    if (range.start === null) {
      // 后缀形式 bytes=-N：取末尾 N 字节。总长未知时无法换算，退化为从 0 起的默认分片。
      const n = Number(range.end);
      if (Number.isFinite(totalBytes) && totalBytes > 0 && n >= 0) {
        const start = Math.max(0, totalBytes - n);
        return { header: `bytes=${start}-${totalBytes - 1}`, start, end: totalBytes - 1, suffix: true };
      }
      return { header: `bytes=0-${chunk - 1}`, start: 0, end: chunk - 1, suffix: true };
    }
    const start = range.start;
    const end = range.end === null || range.end === undefined ? start + chunk - 1 : range.end;
    return { header: `bytes=${start}-${end}`, start, end, suffix: false };
  }
  if (Number.isFinite(totalBytes) && totalBytes > 0) {
    const end = Math.min(totalBytes - 1, chunk - 1);
    return { header: `bytes=0-${end}`, start: 0, end, suffix: false };
  }
  return { header: `bytes=0-${chunk - 1}`, start: 0, end: chunk - 1, suffix: false };
}

/* ------------------------------------------------------------------ *
 * 域名 / 出口 IP 校验（自带一份，不碰 resolve.js）
 * ------------------------------------------------------------------ */

/**
 * 小写 + 去方括号 + 去尾点。
 * @param {string} hostname
 * @returns {string}
 */
export function normalizeHostname(hostname) {
  let host = String(hostname || '').toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  if (host.endsWith('.')) host = host.slice(0, -1);
  return host;
}

/**
 * 是不是一个裸 IP（v4 点分、纯数字、十六进制、或含冒号的 v6）。
 * @param {string} hostname
 * @returns {boolean}
 */
export function isIpLiteral(hostname) {
  const host = normalizeHostname(hostname);
  if (host === '') return false;
  if (host.includes(':')) return true;
  if (/^[0-9]+$/.test(host)) return true;
  if (/^0x[0-9a-f]+$/i.test(host)) return true;
  return /^[0-9]{1,3}(\.[0-9]{1,3}){3}$/.test(host);
}

/**
 * 逐标签校验一个 hostname：非空、不超长、字符集受限。
 * @param {string} host
 * @returns {boolean}
 */
export function isWellFormedHostname(host) {
  if (host === '' || host.length > MAX_HOSTNAME_LENGTH) return false;
  const labels = host.split('.');
  if (labels.length < 2) return false;
  for (const label of labels) {
    if (label === '' || label.length > 63) return false;
    if (!HOST_LABEL_PATTERN.test(label)) return false;
    if (label.startsWith('-') || label.endsWith('-')) return false;
  }
  return true;
}

/**
 * hostname 是否命中 B 站 CDN 根域（等于或子域）。
 * @param {string} hostname
 * @returns {boolean}
 */
export function isAllowedCdnHostname(hostname) {
  const host = normalizeHostname(hostname);
  if (!isWellFormedHostname(host)) return false;
  return ALLOWED_CDN_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

/**
 * 这个直链能不能代理。`src=` 参数的唯一守门人 —— 少任何一条，本路由就是任意 URL 代理。
 *
 * 拒绝清单（按顺序，每条都有单测）：
 *   1) 非字符串 / 空串 / 含控制字符
 *   2) 协议不是 https（B 站 CDN 全量 https，收 http 只会给内网探测开口子）
 *   3) 带 userinfo（user:pass@）
 *   4) hostname 是裸 IP（含 0x 十六进制、纯数字、v6）
 *   5) hostname 不在 B 站 CDN 白名单内
 *   6) 路径或查询里出现任何编码后的百分号（排除 %2f%2e 一类的绕法）
 *
 * @param {unknown} input
 * @returns {{ ok:true, url:string, hostname:string } | { ok:false, message:string }}
 */
export function checkStreamUrl(input) {
  if (typeof input !== 'string') return { ok: false, message: 'src 必须是字符串' };
  const text = input.trim();
  if (text === '') return { ok: false, message: 'src 为空' };
  if (/[\u0000-\u001f\u007f]/.test(text)) return { ok: false, message: 'src 含控制字符' };
  let parsed;
  try {
    parsed = new URL(text);
  } catch (_error) {
    return { ok: false, message: 'src 不是合法 URL' };
  }
  if (parsed.protocol !== 'https:') return { ok: false, message: 'src 只允许 https' };
  if (parsed.username !== '' || parsed.password !== '') return { ok: false, message: 'src 不允许携带凭据' };
  const hostname = normalizeHostname(parsed.hostname);
  if (hostname === '') return { ok: false, message: 'src 没有主机名' };
  if (isIpLiteral(hostname)) return { ok: false, message: 'src 不允许是 IP 字面量' };
  if (!isAllowedCdnHostname(hostname)) return { ok: false, message: 'src 域名不在 B 站 CDN 白名单内' };
  if (parsed.pathname.includes('%') || parsed.search.includes('%')) {
    return { ok: false, message: 'src 不允许出现百分号编码' };
  }
  return { ok: true, url: parsed.href, hostname };
}

/**
 * **token 通道专用**的直链校验。与 checkStreamUrl 只差一处：域名表换成
 * PLATFORM_CDN_DOMAINS。其余五条规则逐字相同 —— 协议、凭据、IP 字面量、
 * 主机名形态、百分号编码，一条都不放松。
 *
 * 这个函数**只能**被 media token 分支调用。一旦把它挂到 `src=` 通道上，
 * 那条路由立刻变成「可代理网易云与 QQ 任意地址」的开放代理 —— 因为 src 是
 * 客户端可控的明文参数，而 token 是宿主签发的、客户端无法伪造的票据。
 *
 * @param {unknown} input
 * @returns {{ ok:true, url:string, hostname:string } | { ok:false, message:string }}
 */
export function checkPlatformUrl(input) {
  if (typeof input !== 'string') return { ok: false, message: '直链必须是字符串' };
  const text = input.trim();
  if (text === '') return { ok: false, message: '直链为空' };
  if (/[\u0000-\u001f\u007f]/.test(text)) return { ok: false, message: '直链含控制字符' };
  let parsed;
  try {
    parsed = new URL(text);
  } catch (_error) {
    return { ok: false, message: '直链不是合法 URL' };
  }
  if (parsed.protocol !== 'https:') return { ok: false, message: '直链只允许 https' };
  if (parsed.username !== '' || parsed.password !== '') return { ok: false, message: '直链不允许携带凭据' };
  const hostname = normalizeHostname(parsed.hostname);
  if (hostname === '') return { ok: false, message: '直链没有主机名' };
  if (isIpLiteral(hostname)) return { ok: false, message: '直链不允许是 IP 字面量' };
  const allowed = PLATFORM_CDN_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  if (!allowed) return { ok: false, message: '直链域名不在平台 CDN 白名单内' };
  // 百分号编码检查保留：宿主自己签发的 URL 里不该出现它，出现即说明解析结果被污染。
  if (parsed.pathname.includes('%') || parsed.search.includes('%')) {
    return { ok: false, message: '直链不允许出现百分号编码' };
  }
  return { ok: true, url: parsed.href, hostname };
}

const PRIVATE_V4 = Object.freeze([
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
]);

function ipv4ToInt(ip) {
  const parts = String(ip).split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^[0-9]{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = value * 256 + n;
  }
  return value;
}

/**
 * @param {string} ip
 * @returns {boolean}
 */
export function isPrivateIPv4(ip) {
  const value = ipv4ToInt(ip);
  if (value === null) return true;
  for (const [base, bits] of PRIVATE_V4) {
    const baseValue = ipv4ToInt(base);
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    if (((value & mask) >>> 0) === ((baseValue & mask) >>> 0)) return true;
  }
  return false;
}

/**
 * @param {string} ip 未加方括号的 IPv6 文本
 * @returns {boolean}
 */
export function isPrivateIPv6(ip) {
  const text = normalizeHostname(ip);
  if (text === '') return true;
  const lower = text;
  if (lower === '::1' || lower === '::') return true;
  const mapped = /^::ffff:(.+)$/i.exec(lower);
  if (mapped) {
    const tail = mapped[1];
    if (/^[0-9]{1,3}(\.[0-9]{1,3}){3}$/.test(tail)) return isPrivateIPv4(tail);
    return true;
  }
  if (/^fe[89ab]/.test(lower)) return true;
  const first = lower.split(':')[0];
  if (first === 'fc00' || first === 'fd00') return true;
  if (/^f[cd][0-9a-f]{2}$/.test(first)) return true;
  if (/^ff[0-9a-f]{2}$/.test(first)) return true;
  if (lower.startsWith('2001:db8')) return true;
  if (lower.startsWith('64:ff9b')) return true;
  return false;
}

/**
 * 这个地址能不能连。多 A 记录里混一个内网也整条拒绝。
 * @param {string} ip
 * @param {number} [family]
 * @returns {boolean}
 */
export function isPublicAddress(ip, family) {
  const resolvedFamily = family === 4 || family === 6 ? family : (String(ip).includes(':') ? 6 : 4);
  if (resolvedFamily === 6) return !isPrivateIPv6(ip);
  if (!/^[0-9]{1,3}(\.[0-9]{1,3}){3}$/.test(String(ip))) return false;
  return !isPrivateIPv4(ip);
}

/**
 * 生成 lookup 包装器：校验的地址集与真正连接的地址集必须是同一份（防 DNS rebinding）。
 * @param {(host:string, opts:object, cb:Function)=>void} baseLookup
 * @param {(ip:string, family?:number)=>boolean} [policy]
 * @returns {(host:string, opts:object, cb:Function)=>void}
 */
export function createPinnedLookup(baseLookup, policy = isPublicAddress) {
  return (host, opts, cb) => {
    const options = typeof opts === 'function' ? {} : (opts || {});
    baseLookup(host, { ...options, all: true }, (error, addresses) => {
      if (error) {
        cb(error);
        return;
      }
      const list = Array.isArray(addresses) ? addresses : [addresses];
      if (list.length === 0) {
        cb(new Error('ENOTFOUND'));
        return;
      }
      for (const entry of list) {
        if (!entry || !policy(entry.address, Number(entry.family))) {
          cb(createStreamError(ERROR_CODES.BLOCKED, '目标解析到非公网地址', { address: entry && entry.address }));
          return;
        }
      }
      if (options.all === true) {
        cb(null, list);
        return;
      }
      const byFamily = options.family === 6 ? list.find((e) => Number(e.family) === 6) : list.find((e) => Number(e.family) === 4);
      const chosen = byFamily || list[0];
      cb(null, chosen.address, Number(chosen.family));
    });
  };
}

/* ------------------------------------------------------------------ *
 * 受控 HTTP：一次请求，响应体原样交出去（绝不 buffer）
 * ------------------------------------------------------------------ */

/**
 * 发一个受控 GET，返回 { status, headers, body: IncomingMessage, destroy }。
 *
 * 为什么不用全局 fetch / undici：宿主进程的 HTTPS_PROXY / NODE_USE_ENV_PROXY
 * 指向本机代理时（本机 127.0.0.1:7897 实测 ECONNREFUSED），全局 dispatcher 会被
 * 直接拖死。node:https 只有在显式传 agent/dispatcher 时才看代理环境变量，
 * 这里固定走系统 DNS + createPinnedLookup，链路完全自控。
 *
 * 调用方**必须**在拿到响应后自己负责 destroy，否则连接泄漏。
 *
 * @param {string} url 已过 checkStreamUrl / isAllowedCdnHostname 的 URL
 * @param {object} [options]
 * @param {Record<string,string|number>} [options.headers]
 * @param {number} [options.timeoutMs] 首字节超时（拿到响应头即解除）
 * @param {Function} [options.lookup]
 * @param {Function} [options.request] 单测注入；签名同 node:https.request
 * @param {AbortSignal} [options.signal]
 * @param {(url:string)=>({ok:boolean,message?:string})} [options.check] 逐跳校验器
 * @returns {Promise<{status:number, headers:object, body:import('node:stream').Readable, finalUrl:string, destroy:(reason?:Error)=>void}>}
 */
export function openUpstream(url, options = {}) {
  const {
    headers = {},
    timeoutMs = DEFAULTS.streamTimeoutMs,
    lookup,
    request: requestFn,
    signal,
    check,
  } = options;

  // 注意：逐跳校验由 openUpstreamFollowing 负责。openUpstream 只管「连」这件事，
  // 不重复校验（否则每跳会白跑一遍 DNS 无关的字符串检查，且两处规则容易漂移）。
  void check;

  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      reject(createStreamError(ERROR_CODES.BLOCKED, '只允许 https 上游'));
      return;
    }
    const send = requestFn || httpsRequest;
    const pinnedLookup = createPinnedLookup(lookup || dns.lookup);
    const upstream = send(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname.replace(/^\[|\]$/g, ''),
        port: parsed.port || 443,
        path: `${parsed.pathname}${parsed.search}`,
        method: 'GET',
        headers: {
          'user-agent': DEFAULTS.userAgent,
          // Referer 按目标 host 选：平台 CDN（网易云 / QQ）与 B 站要的来源不同。
          // 调用方仍可通过 options.headers 覆盖（...headers 在后面）。
          referer: refererForHost(parsed.hostname),
          accept: '*/*',
          'accept-encoding': 'identity',
          ...headers,
        },
        lookup: pinnedLookup,
      },
      (response) => {
        clearTimeout(timer);
        resolve({
          status: Number(response.statusCode) || 0,
          headers: response.headers,
          body: response,
          finalUrl: url,
          destroy: (reason) => {
            try {
              if (reason) response.destroy(reason);
              else response.destroy();
            } catch (_error) {
              /* 已关闭 */
            }
            try {
              upstream.destroy();
            } catch (_error) {
              /* 已关闭 */
            }
          },
        });
      },
    );

    const timer = setTimeout(() => {
      const failure = createStreamError(ERROR_CODES.UPSTREAM_FAILED, `上游 ${timeoutMs}ms 未响应`, { url });
      try {
        upstream.destroy(failure);
      } catch (_error) {
        /* 已关闭 */
      }
      reject(failure);
    }, timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();

    const onAbort = () => {
      clearTimeout(timer);
      reject(createStreamError(ERROR_CODES.ABORTED, '客户端已断开'));
      try {
        upstream.destroy();
      } catch (_error) {
        /* 已关闭 */
      }
    };
    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      if (typeof signal.addEventListener === 'function') signal.addEventListener('abort', onAbort, { once: true });
    }

    upstream.on('error', (error) => {
      clearTimeout(timer);
      reject(wrapNetworkError(error, url));
    });
    upstream.end();
  });
}

/**
 * 跟随重定向，每一跳都重新过校验。B 站 CDN 偶尔 302 到另一个镜像子域。
 * @param {string} startUrl
 * @param {object} [options] 透传 openUpstream 的选项
 * @param {number} [maxRedirects]
 * @returns {Promise<object>}
 */
export async function openUpstreamFollowing(startUrl, options = {}, maxRedirects = DEFAULTS.maxRedirects) {
  const check = typeof options.check === 'function' ? options.check : (candidate) => checkStreamUrl(candidate);
  let current = startUrl;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const verdict = check(current);
    if (verdict.ok !== true) {
      throw createStreamError(ERROR_CODES.BLOCKED, verdict.message || '重定向目标被拒', { url: current, hop });
    }
    const response = await openUpstream(current, { ...options, check });
    const location = response.headers && response.headers.location;
    if (response.status >= 300 && response.status < 400 && typeof location === 'string') {
      response.destroy();
      if (hop === maxRedirects) {
        throw createStreamError(ERROR_CODES.UPSTREAM_FAILED, '重定向次数超限', { hops: hop + 1 });
      }
      current = new URL(location, current).href;
      continue;
    }
    return { ...response, finalUrl: current, hops: hop + 1 };
  }
  throw createStreamError(ERROR_CODES.UPSTREAM_FAILED, '重定向次数超限', {});
}

/**
 * @param {unknown} error
 * @param {string} [url]
 * @returns {Error & { code?: string }}
 */
function wrapNetworkError(error, url) {
  if (error && typeof error.code === 'string' && Object.values(ERROR_CODES).includes(error.code)) return error;
  const code = error && error.code ? String(error.code) : 'unknown';
  if (code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'ECONNREFUSED' || code === 'EHOSTUNREACH') {
    return createStreamError(ERROR_CODES.UPSTREAM_FAILED, `上游网络失败：${code}`, { url, cause: code });
  }
  if (code === 'ABORT_ERR' || code === 'ERR_STREAM_PREMATURE_CLOSE') {
    return createStreamError(ERROR_CODES.ABORTED, '客户端已断开', { url });
  }
  return createStreamError(ERROR_CODES.UPSTREAM_FAILED, '上游请求失败', { url, cause: code });
}

/* ------------------------------------------------------------------ *
 * 清单缓存（只缓存 playurl JSON，绝不缓存直链响应体）
 * ------------------------------------------------------------------ */

/**
 * LRU + TTL。命中会刷新 LRU 顺序，过期即删。
 * @param {number} ttlMs
 * @param {number} maxEntries
 * @param {() => number} [now]
 */
export function createCache(ttlMs, maxEntries, now = Date.now) {
  const store = new Map();
  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= now()) {
        store.delete(key);
        return undefined;
      }
      store.delete(key);
      store.set(key, entry);
      return entry.value;
    },
    set(key, value) {
      store.delete(key);
      store.set(key, { value, expiresAt: now() + ttlMs });
      while (store.size > maxEntries) {
        const oldest = store.keys().next();
        if (oldest.done) break;
        store.delete(oldest.value);
      }
    },
    /** 直链过期时清空：下一次请求必须重新问 playurl。 */
    clear() {
      store.clear();
    },
    /**
     * 按 (bvid,cid) 精确失效。只清一条，不牵连其它曲目。
     * @param {string} key
     */
    delete(key) {
      store.delete(key);
    },
    get size() {
      return store.size;
    },
  };
}

/**
 * @param {{bvid:string|null, aid:string|null, cid:string|null}} query
 * @returns {string}
 */
export function manifestCacheKey(query) {
  const raw = `${query.bvid || ''}|${query.aid || ''}|${query.cid || ''}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

/* ------------------------------------------------------------------ *
 * playurl 清单
 * ------------------------------------------------------------------ */

/** B 站音频码率档位。30216=64k、30232=132k、30280=192k、30250=Dolby、30251=Hi-Res。 */
export const AUDIO_QUALITY_IDS = Object.freeze({
  HIRES: [30251],
  DOLBY: [30250],
  HIGH: [30280],
  MEDIUM: [30232],
  LOW: [30216],
});

/**
 * 从 playurl 响应里挑一条音频。
 *
 * 判定顺序（写死，单测覆盖）：
 *   1) dash.audio 必须是数组且非空，否则 NO_AUDIO
 *   2) 目标码率档位优先：传入 quality 是数字时按 id 命中
 *   3) 否则取 bandwidth 最大的那条（最优可用）
 *   4) baseUrl / base_url 必须能过 checkStreamUrl，否则换下一条（全部不合格 → BLOCKED）
 *
 * @param {object} payload playurl JSON
 * @param {{ quality?: number|null }} [options]
 * @returns {{ id:number, bandwidth:number, mimeType:string, codecs:string|null, url:string, backupUrls:string[], hostname:string }}
 */
export function pickAudioStream(payload, options = {}) {
  const dash = payload && payload.data && payload.data.dash ? payload.data.dash : null;
  const audio = dash && Array.isArray(dash.audio) ? dash.audio : null;
  if (!audio || audio.length === 0) {
    throw createStreamError(ERROR_CODES.NO_AUDIO, '该稿件没有 DASH 音频轨', {
      code: payload && payload.code,
      message: payload && payload.message,
    });
  }
  const quality = Number.isFinite(options.quality) ? Number(options.quality) : null;
  const candidates = audio
    .map((entry) => ({
      id: Number(entry.id) || 0,
      bandwidth: Number(entry.bandwidth) || 0,
      mimeType: typeof entry.mimeType === 'string' ? entry.mimeType : 'audio/mp4',
      codecs: typeof entry.codecs === 'string' ? entry.codecs : null,
      baseUrl: typeof entry.baseUrl === 'string' ? entry.baseUrl : (typeof entry.base_url === 'string' ? entry.base_url : ''),
      backupUrls: Array.isArray(entry.backupUrl)
        ? entry.backupUrl.filter((u) => typeof u === 'string')
        : Array.isArray(entry.backup_url)
          ? entry.backup_url.filter((u) => typeof u === 'string')
          : [],
    }))
    .filter((entry) => entry.baseUrl !== '');

  if (candidates.length === 0) {
    throw createStreamError(ERROR_CODES.NO_AUDIO, 'DASH 音频轨没有可用直链', {});
  }

  const ordered = quality === null
    ? [...candidates].sort((a, b) => b.bandwidth - a.bandwidth)
    : [
        ...candidates.filter((entry) => entry.id === quality).sort((a, b) => b.bandwidth - a.bandwidth),
        ...candidates.filter((entry) => entry.id !== quality).sort((a, b) => b.bandwidth - a.bandwidth),
      ];

  for (const entry of ordered) {
    const primary = checkStreamUrl(entry.baseUrl);
    if (primary.ok === true) {
      const backups = entry.backupUrls.filter((candidate) => checkStreamUrl(candidate).ok === true);
      return {
        id: entry.id,
        bandwidth: entry.bandwidth,
        mimeType: entry.mimeType,
        codecs: entry.codecs,
        url: primary.url,
        backupUrls: backups,
        hostname: primary.hostname,
      };
    }
  }
  throw createStreamError(ERROR_CODES.BLOCKED, '所有音频直链都不在白名单内', {
    hosts: ordered.map((entry) => {
      try {
        return new URL(entry.baseUrl).hostname;
      } catch (_error) {
        return 'invalid';
      }
    }),
  });
}

/**
 * 构造 playurl 请求地址。
 * @param {{bvid:string|null, aid:string|null, cid:string|null, page:number}} query
 * @returns {string}
 */
export function buildPlayurlUrl(query) {
  const params = new URLSearchParams();
  if (query.bvid) params.set('bvid', query.bvid);
  else if (query.aid) params.set('avid', query.aid);
  if (query.cid) params.set('cid', query.cid);
  else if (query.page > 1) params.set('p', String(query.page));
  // qn 只对 FLV/MP4 生效，DASH 下要 fnval=16；带 4048 是为了拿全部分段与备份域名。
  params.set('qn', '64');
  params.set('fnval', '16');
  // fourk 让 dash 字段完整下发（互动视频才不会有 audio），缺它时部分稿件 audio 为空。
  params.set('fourk', '1');
  return `https://api.bilibili.com/x/player/playurl?${params.toString()}`;
}

/* ------------------------------------------------------------------ *
 * 响应构造
 * ------------------------------------------------------------------ */

/**
 * 透传用的安全头。**每个值都必须是字符串**：bridge 会 Object.fromEntries 摊平，
 * undefined 会被过滤，Set-Cookie 会被折叠。
 * @param {object} extra
 * @returns {Record<string,string>}
 */
function baseStreamHeaders(extra = {}) {
  return {
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'accept-ranges': 'bytes',
    // 同源流本来用不到 CORS，但客户端一旦有人把 <audio> 的 crossOrigin 打开，
    // 缺这个头就会让 MediaElementSource 输出静音（play() 照样成功、进度照常走）。
    // 补上它是零成本的保险：本路由总是同源，通配不泄露任何凭据。
    'access-control-allow-origin': '*',
    ...extra,
  };
}

/**
 * 标准 JSON 错误响应。
 * @param {string} code
 * @param {string} message
 * @param {Record<string, unknown>} [detail]
 * @returns {Response}
 */
export function streamErrorResponse(code, message, detail) {
  const body = JSON.stringify({
    ok: false,
    code,
    message,
    recovery: recoveryForCode(code),
    ...(detail ? { detail } : {}),
  });
  return new Response(body, {
    status: statusForCode(code),
    headers: baseStreamHeaders({ 'content-type': 'application/json; charset=utf-8' }),
  });
}

/**
 * 把上游 206/200 响应改写成浏览器 <audio> 能吃的 206/200。
 *
 * 三个必做改写（每一个都是实测坑）：
 *   1) Content-Type 强制 audio/mp4：上游 application/octet-stream 让 audio 元素
 *      不能可靠嗅探，直接 ERR_SRC_NOT_SUPPORTED。
 *   2) 只保留白名单头：上游的 content-encoding / set-cookie / vary 之类流给浏览器
 *      可能反噬（浏览器会按 content-encoding 二次解码）。
 *   3) 总长以 Content-Range 的 `/总长` 为准，上游不给就用 content-length 补。
 *
 * @param {object} upstream openUpstreamFollowing 的返回值
 * @param {{ contentType?: string }} [options]
 * @returns {Response}
 */
export function passthroughResponse(upstream, options = {}) {
  const headers = upstream.headers || {};
  const status = Number(upstream.status) || 0;
  const upstreamType = typeof headers['content-type'] === 'string' ? headers['content-type'].toLowerCase() : '';
  // 上游明确说不是媒体（例如 HTML 错误页）就别伪造 206，交给上层映射成错误。
  if (upstreamType.startsWith('text/') || upstreamType.startsWith('application/json')) {
    upstream.destroy();
    throw createStreamError(ERROR_CODES.EXPIRED, `直链返回了非媒体内容（${upstreamType}）`, { status });
  }

  const out = baseStreamHeaders({ 'content-type': options.contentType || DEFAULTS.contentType });

  const contentRange = headers['content-range'];
  const total = numberHeader(headers['content-length']);
  if (status === 206) {
    if (typeof contentRange === 'string') out['content-range'] = contentRange;
    // 206 却没有长度：B 站 CDN 在边缘节点抖动时会这么回（实测 8MiB 分段偶发）。
    // 用 content-range 推总长反填，浏览器才肯完整读完一个分片。
    const length = total !== null && total > 0
      ? String(total)
      : rangeTotalFromContentRange(contentRange);
    if (length !== null) out['content-length'] = length;
    return new Response(upstream.body, { status: 206, headers: out });
  }

  // 上游给的是整文件 200：我们自己按已知总长补一个 content-range，让浏览器能 seek。
  if (total !== null && total > 0) {
    out['content-range'] = `bytes 0-${total - 1}/${total}`;
    out['content-length'] = String(total);
    return new Response(upstream.body, { status: 206, headers: out });
  }
  return new Response(upstream.body, { status: 200, headers: out });
}

/**
 * 把 content-length 解析成数字：缺失/非法一律 null（绝不把 NaN 写进头）。
 * @param {unknown} value
 * @returns {number|null}
 */
export function numberHeader(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw === null || raw === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * 从 `bytes 0-4194303/284325961` 推这一段的字节数，用于上游没给 content-length 时补长度。
 * `/*` 未知总长时只能靠区间本身推。
 * @param {unknown} contentRange
 * @returns {string|null}
 */
export function rangeTotalFromContentRange(contentRange) {
  if (typeof contentRange !== 'string') return null;
  const match = /^bytes\s+(\d+)-(\d+)\/(?:\d+|\*)$/i.exec(contentRange.trim());
  if (match === null) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start) return null;
  return String(end - start + 1);
}

/**
 * 探测视频某一 P 的 cid。只在调用方没给 cid 时用，一次网络往返。
 * @param {{bvid:string|null, aid:string|null, page:number}} query
 * @param {{ request?:Function, lookup?:Function, timeoutMs?:number }} [options]
 * @returns {Promise<string>}
 */
export async function lookupCid(query, options = {}) {
  const params = new URLSearchParams();
  if (query.bvid) params.set('bvid', query.bvid);
  else params.set('aid', query.aid);
  const url = `https://api.bilibili.com/x/web-interface/view?${params.toString()}`;
  const response = await openUpstreamFollowing(
    url,
    {
      ...options,
      timeoutMs: options.timeoutMs || DEFAULTS.manifestTimeoutMs,
      check: (candidate) => {
        const parsed = (() => {
          try {
            return new URL(candidate);
          } catch (_error) {
            return null;
          }
        })();
        if (parsed === null) return { ok: false, message: '不是合法 URL' };
        const host = normalizeHostname(parsed.hostname);
        const allowed = host === 'api.bilibili.com' || host === 'www.bilibili.com' || isAllowedCdnHostname(host);
        return allowed ? { ok: true } : { ok: false, message: '接口域名不在允许集内' };
      },
    },
    DEFAULTS.maxRedirects,
  );
  const text = await readText(response.body, 4 * 1024 * 1024);
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (_error) {
    throw createStreamError(ERROR_CODES.UPSTREAM_BAD, 'view 接口返回非 JSON', { status: response.status });
  }
  if (Number(payload.code) !== 0 || !payload.data) {
    throw createStreamError(ERROR_CODES.UPSTREAM_BAD, `view 接口 code=${payload.code}`, {
      apiMessage: payload.message,
    });
  }
  const pages = Array.isArray(payload.data.pages) ? payload.data.pages : [];
  const wanted = Math.max(1, Number(query.page) || 1);
  const page = pages.find((entry) => Number(entry.page) === wanted);
  if (!page || page.cid === undefined) {
    throw createStreamError(ERROR_CODES.NO_AUDIO, `该稿件没有第 ${wanted} P`, { pages: pages.length });
  }
  return String(page.cid);
}

/**
 * 读完一个小响应体（只用于 JSON 接口，不用于媒体）。
 *
 * 这里做了三件容易漏的事，任何一件漏了都会让调用方挂死或拿到坏 JSON：
 *   1) chunk 一律 coerce 成 Buffer（假上游/自定义 request 可能给字符串）
 *   2) error / end / abort 三个出口都要 settle，且只 settle 一次
 *   3) 成功路径上主动 release，避免上游句柄悬挂
 *
 * @param {import('node:stream').Readable} body
 * @param {number} maxBytes
 * @returns {Promise<string>}
 */
export function readText(body, maxBytes) {
  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */
    const chunks = [];
    let size = 0;
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      body.off('error', onError);
      body.off('close', onClose);
      body.off('end', onEnd);
      // 已经拿到结果就把流放掉：上游句柄不悬着，也不会再回调进来。
      if (typeof body.destroy === 'function') body.destroy();
      fn(value);
    };
    /** @param {unknown} error */
    const onError = (error) => finish(reject, error);
    const onEnd = () => finish(resolve, Buffer.concat(chunks, size).toString('utf8'));
    const onClose = () => {
      // close 在 end 之后也会触发；此时数据已齐，按成功处理，不能白白丢掉一个合法响应。
      if (settled) return;
      finish(resolve, Buffer.concat(chunks, size).toString('utf8'));
    };
    body.on('error', onError);
    body.on('end', onEnd);
    body.on('close', onClose);
    body.on('data', (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > maxBytes) {
        finish(reject, createStreamError(ERROR_CODES.UPSTREAM_BAD, '响应体超过上限', { maxBytes }));
        return;
      }
      chunks.push(buffer);
    });
  });
}

/* ------------------------------------------------------------------ *
 * API 本体
 * ------------------------------------------------------------------ */

/**
 * 构造流代理 API。返回对象既可直接给路由用，也可被单测直接驱动。
 *
 * @param {object} [options]
 * @param {number} [options.cacheTtlMs]
 * @param {number} [options.cacheMaxEntries]
 * @param {number} [options.manifestTimeoutMs]
 * @param {number} [options.streamTimeoutMs]
 * @param {number} [options.defaultChunkBytes]
 * @param {string} [options.contentType]
 * @param {Function} [options.lookup] 单测注入 DNS
 * @param {Function} [options.request] 单测注入 node:https.request 级别实现
 * @param {() => number} [options.now] 单测注入时钟
 */
export function createStreamApi(options = {}) {
  const settings = {
    cacheTtlMs: options.cacheTtlMs ?? DEFAULTS.cacheTtlMs,
    cacheMaxEntries: options.cacheMaxEntries ?? DEFAULTS.cacheMaxEntries,
    manifestTimeoutMs: options.manifestTimeoutMs ?? DEFAULTS.manifestTimeoutMs,
    streamTimeoutMs: options.streamTimeoutMs ?? DEFAULTS.streamTimeoutMs,
    defaultChunkBytes: options.defaultChunkBytes ?? DEFAULTS.defaultChunkBytes,
    contentType: options.contentType ?? DEFAULTS.contentType,
  };
  const cache = createCache(settings.cacheTtlMs, settings.cacheMaxEntries, options.now);
  const lookup = options.lookup;
  const requestFn = options.request;
  // 令牌表由 index.js 传入（与 resolve 路由共用同一个 store，签发与验证必须同密钥）。
  // 缺省自建一个：单测与「只挂 stream 路由」的场景都能独立工作。
  const mediaTokens = options.mediaTokens || createMediaTokenStore(options);

  /** 请求 playurl 并归一成可代理的一条音频。 */
  async function fetchManifest(query) {
    const url = buildPlayurlUrl(query);
    const response = await openUpstreamFollowing(
      url,
      {
        lookup,
        request: requestFn,
        timeoutMs: settings.manifestTimeoutMs,
        check: (candidate) => {
          let parsed;
          try {
            parsed = new URL(candidate);
          } catch (_error) {
            return { ok: false, message: '不是合法 URL' };
          }
          if (parsed.protocol !== 'https:') return { ok: false, message: 'playurl 只允许 https' };
          const host = normalizeHostname(parsed.hostname);
          const allowed = host === 'api.bilibili.com' || host === 'api.biliapi.net' || isAllowedCdnHostname(host);
          return allowed ? { ok: true } : { ok: false, message: '接口域名不在允许集内' };
        },
      },
      DEFAULTS.maxRedirects,
    );
    if (response.status !== 200) {
      response.destroy();
      throw createStreamError(ERROR_CODES.UPSTREAM_BAD, `playurl 返回 HTTP ${response.status}`, {
        status: response.status,
      });
    }
    const text = await readText(response.body, 4 * 1024 * 1024);
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (_error) {
      throw createStreamError(ERROR_CODES.UPSTREAM_BAD, 'playurl 返回非 JSON', {});
    }
    if (Number(payload.code) !== 0 || !payload.data) {
      // -400/-404/-403 都归到 UPSTREAM_BAD：对用户来说都是「这条稿件拿不到音频」。
      throw createStreamError(ERROR_CODES.UPSTREAM_BAD, `playurl code=${payload.code}`, {
        apiMessage: payload.message,
        code: payload.code,
      });
    }
    const picked = pickAudioStream(payload, { quality: query.quality ?? null });
    return { ...picked, issuedAt: (options.now ? options.now() : Date.now()) };
  }

  return {
    cache,
    settings,
    mediaTokens,
    /**
     * 解析请求 → 返回 Response。**永不抛出**；失败一律走 streamErrorResponse。
     *
     * @param {Request} request
     * @returns {Promise<Response>}
     */
    async handle(request) {
      const url = new URL(request.url);

      // token 通道优先于一切：它自带授权（宿主签发的 HMAC 票据），
      // 不需要 bvid/cid，也不需要走 playurl。三条通道互斥，先判它。
      const rawToken = readMediaToken(url.searchParams);
      if (rawToken !== null) {
        const verdict = mediaTokens.verify(rawToken);
        if (verdict.ok !== true) {
          const map = {
            [TOKEN_ERRORS.EXPIRED]: ERROR_CODES.EXPIRED,
            [TOKEN_ERRORS.MISSING]: ERROR_CODES.BAD_REQUEST,
            [TOKEN_ERRORS.MALFORMED]: ERROR_CODES.BAD_REQUEST,
            [TOKEN_ERRORS.BAD_SIGNATURE]: ERROR_CODES.BLOCKED,
          };
          const code = map[verdict.code] || ERROR_CODES.BAD_REQUEST;
          return streamErrorResponse(code, `媒体令牌不可用：${verdict.code}`, { tokenCode: verdict.code });
        }
        const payload = verdict.payload;
        // 票据里的 URL 是宿主自己写进去的，但仍然要再校验一遍 ——
        // 密钥若泄漏、或将来有人往载荷里塞了别的地址，这道校验是最后一道闸。
        const check = checkPlatformUrl(payload.u);
        if (check.ok !== true) {
          return streamErrorResponse(ERROR_CODES.BLOCKED, check.message || '令牌内的直链被拒绝', {});
        }
        const manifest = {
          url: check.url,
          hostname: check.hostname,
          id: 0,
          bandwidth: 0,
          mimeType: payload.m || DEFAULTS.contentType,
          backupUrls: [],
        };
        const tokenRange = parseRangeHeader(request.headers.get('range'));
        try {
          // 第五个参数是「每一跳重定向」的校验函数。token 通道必须传
          // checkPlatformUrl —— 缺了它 stream() 会退回默认的 checkStreamUrl，
          // 平台 CDN 立刻被 B 站白名单拒掉（403 E_STREAM_BLOCKED）。
          return await this.stream(manifest, tokenRange, request, null, checkPlatformUrl);
        } catch (error) {
          if (error && error.code === ERROR_CODES.ABORTED) {
            return streamErrorResponse(ERROR_CODES.ABORTED, '客户端已断开');
          }
          const code = error && typeof error.code === 'string' && Object.values(ERROR_CODES).includes(error.code)
            ? error.code
            : ERROR_CODES.UPSTREAM_FAILED;
          return streamErrorResponse(code, error && error.message ? error.message : '未知错误', error && error.detail ? error.detail : undefined);
        }
      }

      let query;
      try {
        query = parseStreamQuery(url.searchParams);
      } catch (error) {
        return streamErrorResponse(error.code || ERROR_CODES.BAD_REQUEST, error.message);
      }

      const explicitSrc = url.searchParams.get('src');
      let manifest;
      try {
        if (typeof explicitSrc === 'string' && explicitSrc !== '') {
          // 显式 src：只做白名单校验，完全不碰 playurl。用于调试与直链自检。
          const verdict = checkStreamUrl(explicitSrc);
          if (verdict.ok !== true) {
            return streamErrorResponse(ERROR_CODES.BLOCKED, verdict.message || 'src 被拒绝', {});
          }
          manifest = { url: verdict.url, hostname: verdict.hostname, id: 0, bandwidth: 0, mimeType: DEFAULTS.contentType, backupUrls: [] };
        } else {
          if (query.cid === null) {
            query.cid = await lookupCid(query, { lookup, request: requestFn, timeoutMs: settings.manifestTimeoutMs });
          }
          const key = manifestCacheKey(query);
          const hit = cache.get(key);
          if (hit !== undefined) {
            manifest = hit;
          } else {
            manifest = await fetchManifest(query);
            cache.set(key, manifest);
          }
        }
      } catch (error) {
        if (error && error.code === ERROR_CODES.ABORTED) return streamErrorResponse(ERROR_CODES.ABORTED, '客户端已断开');
        const code = error && typeof error.code === 'string' && Object.values(ERROR_CODES).includes(error.code)
          ? error.code
          : ERROR_CODES.UPSTREAM_FAILED;
        return streamErrorResponse(code, error && error.message ? error.message : '未知错误', error && error.detail ? error.detail : undefined);
      }

      const range = parseRangeHeader(request.headers.get('range'));
      try {
        return await this.stream(manifest, range, request, query);
      } catch (error) {
        if (error && error.code === ERROR_CODES.ABORTED) {
          return streamErrorResponse(ERROR_CODES.ABORTED, '客户端已断开');
        }
        const code = error && typeof error.code === 'string' && Object.values(ERROR_CODES).includes(error.code)
          ? error.code
          : ERROR_CODES.UPSTREAM_FAILED;
        return streamErrorResponse(code, error && error.message ? error.message : '未知错误', error && error.detail ? error.detail : undefined);
      }
    },

    /**
     * 打开上游并透传。上游 403/404 意味着直链过期：清掉清单缓存让下一次重新取。
     *
     * @param {{url:string, backupUrls?:string[]}} manifest
     * @param {object} range parseRangeHeader 的结果
     * @param {Request} request
     * @param {object} [query] 仅用于失效时精确定位缓存条目
     * @returns {Promise<Response>}
     */
    /**
     * 取流。
     *
     * `checkFn` 决定**每一跳重定向**用哪张域名白名单校验：
     *   · B站通道（query 非空）走 checkStreamUrl，只认 B 站 CDN；
     *   · token 通道（query 为 null）走 checkPlatformUrl，只认平台 CDN。
     * 早先这里写死 checkStreamUrl，于是平台直链在取流时被自己的白名单拒掉，
     * 报 `E_STREAM_BLOCKED: src 域名不在 B 站 CDN 白名单内` —— 解析成功却一声不响。
     *
     * @param {object} manifest
     * @param {object} range
     * @param {Request} request
     * @param {object|null} query  B站通道的解析参数；token 通道传 null
     * @param {(url:string) => object} [checkFn]
     */
    async stream(manifest, range, request, query, checkFn) {
      const check = typeof checkFn === 'function' ? checkFn : (candidate) => checkStreamUrl(candidate);
      const signal = request && request.signal ? request.signal : undefined;
      // multi/invalid：按「整段」处理，但用默认分片而不是拖整个文件。
      const plan = planUpstreamRange(
        range && (range.kind === 'range') ? range : { kind: 'none' },
        -1,
        settings.defaultChunkBytes,
      );
      const headers = { range: plan.header };
      const candidates = [manifest.url, ...(Array.isArray(manifest.backupUrls) ? manifest.backupUrls : [])];
      let lastError = null;

      for (const candidate of candidates) {
        let upstream;
        try {
          upstream = await openUpstreamFollowing(
            candidate,
            { headers, lookup, request: requestFn, timeoutMs: settings.streamTimeoutMs, signal, check },
            DEFAULTS.maxRedirects,
          );
        } catch (error) {
          lastError = error;
          if (error && error.code === ERROR_CODES.ABORTED) throw error;
          continue;
        }
        if (upstream.status === 206 || upstream.status === 200) {
          // 用 manifest 自带的 mimeType：B站是 audio/mp4，网易云是 audio/mpeg。
          // 早先写死 settings.contentType 会把 mp3 标成 mp4 —— 元素能靠嗅探播出，
          // 但响应头在说谎，任何按类型判断的消费者都会被误导。
          return passthroughResponse(upstream, { contentType: manifest.mimeType || settings.contentType });
        }
        upstream.destroy();
        const status = upstream.status;
        if (status === 403 || status === 404 || status === 410) {
          if (query) cache.delete(manifestCacheKey(query));
          throw createStreamError(ERROR_CODES.EXPIRED, `直链已失效（HTTP ${status}）`, { status, hostname: safeHost(candidate) });
        }
        lastError = createStreamError(ERROR_CODES.UPSTREAM_FAILED, `上游 HTTP ${status}`, {
          status,
          hostname: safeHost(candidate),
        });
      }
      throw lastError || createStreamError(ERROR_CODES.UPSTREAM_FAILED, '没有可用的上游直链', {});
    },

    /**
     * 只返回清单 JSON（调试与客户端预热用，不含媒体字节）。
     * @param {{bvid?:string, aid?:string, cid?:string, page?:string}} params
     */
    async describe(params) {
      const query = parseStreamQuery(params || {});
      if (query.cid === null) {
        query.cid = await lookupCid(query, { lookup, request: requestFn, timeoutMs: settings.manifestTimeoutMs });
      }
      const key = manifestCacheKey(query);
      const hit = cache.get(key);
      const manifest = hit !== undefined ? hit : await fetchManifest(query);
      if (hit === undefined) cache.set(key, manifest);
      return {
        bvid: query.bvid,
        cid: query.cid,
        audioId: manifest.id,
        bandwidth: manifest.bandwidth,
        mimeType: manifest.mimeType,
        codecs: manifest.codecs ?? null,
        hostname: manifest.hostname,
        issuedAt: manifest.issuedAt ?? null,
        cacheTtlMs: settings.cacheTtlMs,
      };
    },
  };
}

/**
 * @param {string} url
 * @returns {string}
 */
function safeHost(url) {
  try {
    return new URL(url).hostname;
  } catch (_error) {
    return '';
  }
}

/** 无状态提示：不落盘、不读配置，只持有 60 秒清单缓存。 */
export const STATELESS = true;

/**
 * 注册流代理路由。**index.js 唯一需要调用的东西。**
 *
 * 为什么必须是 ctx.connection.fetch.register：
 * 宿主在 dsh-client-connection 里把 `/api` 前缀挂好了（lib/index.js:1044-1058），
 * 并对每个 exact Fetch route 强制 peer.principal.kind === "owner"（L816-836），
 * 非 owner 一律 403。裸用 ctx.webServer.register 会绕过登录态与 Host/Origin 校验。
 *
 * @param {object} ctx cordis 上下文（需有 connection 服务）
 * @param {object} [options] 透传 createStreamApi 的选项
 * @returns {() => void} 同步 disposer
 */
export function registerStreamRoute(ctx, options = {}) {
  const connection = ctx && Reflect.get(ctx, 'connection');
  if (!connection || !connection.fetch || typeof connection.fetch.register !== 'function') {
    throw new Error('dsh-music-on: ctx.connection.fetch.register unavailable');
  }
  const api = createStreamApi(options);
  connection.fetch.register({
    path: STREAM_PATH,
    methods: ['GET', 'HEAD'],
    requestBody: 'buffered',
    fetch: (request) => api.handle(request),
  });
  return () => {
    api.cache.clear();
  };
}

/** 单测入口：暴露内部件，避免为了测量而导出生产 API。 */
export const __test = {
  parseStreamQuery,
  parseRangeHeader,
  planUpstreamRange,
  normalizeHostname,
  isIpLiteral,
  isWellFormedHostname,
  isAllowedCdnHostname,
  checkStreamUrl,
  checkPlatformUrl,
  refererForHost,
  isPrivateIPv4,
  isPrivateIPv6,
  isPublicAddress,
  createPinnedLookup,
  openUpstream,
  openUpstreamFollowing,
  createCache,
  manifestCacheKey,
  pickAudioStream,
  buildPlayurlUrl,
  passthroughResponse,
  streamErrorResponse,
  baseStreamHeaders,
  readText,
  wrapNetworkError,
  safeHost,
  statusForCode,
  recoveryForCode,
};
