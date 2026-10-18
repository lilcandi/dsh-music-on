/**
 * dsh-music-on · host 侧解析代理
 *
 * 职责边界（写死在这里，改动前先想清楚）：
 * 1) 只做「把用户粘贴的平台链接变成归一化的曲目 JSON」，不下载音频、不转码、不落盘。
 * 2) 安全边界是硬要求：白名单域名 + 逐跳重定向校验 + 出口 IP 校验（连接时校验，防 DNS rebinding）。
 * 3) 能力边界必须诚实：拿不到直链就 streamOnly:true + pageUrl，绝不伪造 url。
 *
 * 宿主挂载方式（已在本机 DSH 0.2.1-rc.2 源码核实，非猜测）：
 *   ctx.connection.fetch.register({ path, methods, requestBody, fetch })
 * 真实例子：dsh-api-session-controller/lib/index.js:2482 `/api/file`。
 * 共享 `/api` 前缀路由由 dsh-client-connection 在 lib/index.js:1044-1058 挂好，
 * 内部强制 peer.principal.kind === "owner"，非 owner 一律 403 —— 所以不要用
 * ctx.webServer.register 裸挂，那会绕过登录态与 Host/Origin 防护。
 *
 * 路径约束（dsh-client-connection/lib/index.js:690 + 926）：
 *   ENDPOINT_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/
 *   endpoint = pathname.slice("/api/".length)
 * 因此 `/api/dsh-music-on/resolve` 合法；一旦引入下划线之外的怪字符就会被拒。
 */

import { createHash } from 'node:crypto';
import dns from 'node:dns';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

import { buildMediaStreamPath } from './mediatoken.js';
// 路由解析与平台识别**只有一份实现**，就在客户端 parser.js 里。
// 这里曾经各写一份，结果 host 那份落后于 client 那份：
// `https://music.163.com/playlist?id=xxx`（path 路由 + search query）在客户端
// 识别正确，在宿主却解析出 null → resolve 抛 E_UNSUPPORTED_URL → 「网易云解析失败」。
// parser.js 是纯函数模块（零 import、零浏览器全局），宿主可以直接 import。
// 用别名导入：本文件自己还导出一个 detectPlatform（历史上给外部调用），
// 两者同义，但同名导入会直接 SyntaxError。
import {
  detectPlatform as detectPlatformShared,
  extractId as extractIdShared,
} from '../client/parser.js';

/** 与客户端 parser.js 完全同源的白名单。两侧各自有单测，同表同结果。 */
export const ALLOWED_DOMAINS = Object.freeze([
  'bilibili.com',
  'b23.tv',
  'music.163.com',
  'y.qq.com',
  'youtube.com',
  'youtu.be',
]);

/** 错误码全集（与客户端一致）。 */
export const ERROR_CODES = Object.freeze({
  UNSUPPORTED_URL: 'E_UNSUPPORTED_URL',
  RESOLVE_TIMEOUT: 'E_RESOLVE_TIMEOUT',
  RESOLVE_BLOCKED: 'E_RESOLVE_BLOCKED',
  NO_STREAM: 'E_NO_STREAM',
  DECODE_FAILED: 'E_DECODE_FAILED',
  BAD_RESPONSE: 'E_BAD_RESPONSE',
});

/** 路由路径。方法只有 GET。 */
export const RESOLVE_PATH = '/api/dsh-music-on/resolve';

/** 默认参数。全部可在 createResolveApi 的 options 覆盖，便于单测把超时压到毫秒级。 */
export const DEFAULTS = Object.freeze({
  timeoutMs: 10_000,
  maxRedirects: 5,
  maxBodyBytes: 4 * 1024 * 1024,
  cacheTtlMs: 5 * 60 * 1000,
  cacheMaxEntries: 64,
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  acceptLanguage: 'zh-CN,zh;q=0.9,en;q=0.8',
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
export function createResolveError(code, message, detail) {
  const error = new Error(message);
  error.name = 'MusicOnResolveError';
  error.code = code;
  if (detail !== undefined) error.detail = detail;
  return error;
}

/** 错误码 → HTTP 状态码。UI 只看 JSON 里的 code，状态码只给网络层看懂。 */
export function statusForCode(code) {
  switch (code) {
    case ERROR_CODES.UNSUPPORTED_URL:
      return 400;
    case ERROR_CODES.RESOLVE_BLOCKED:
      return 403;
    case ERROR_CODES.RESOLVE_TIMEOUT:
      return 504;
    case ERROR_CODES.NO_STREAM:
      return 404;
    case ERROR_CODES.DECODE_FAILED:
      return 502;
    default:
      return 500;
  }
}

/* ------------------------------------------------------------------ *
 * URL 归一 / 白名单判定（与客户端同逻辑，逐条单测覆盖）
 * ------------------------------------------------------------------ */

/**
 * @param {unknown} input
 * @returns {string}
 */
export function normalizeUrl(input) {
  if (typeof input !== 'string') {
    throw createResolveError(ERROR_CODES.UNSUPPORTED_URL, 'input must be a string');
  }
  let text = input.replace(/[\u0000-\u001f\u007f\u200b-\u200f\ufeff]/g, '').trim();
  if (text === '') throw createResolveError(ERROR_CODES.UNSUPPORTED_URL, 'input is empty');

  let decoded = text;
  for (let round = 0; round < 3; round += 1) {
    let next;
    try {
      next = decodeURIComponent(decoded);
    } catch (_error) {
      break;
    }
    if (next === decoded) break;
    decoded = next;
  }
  text = decoded;

  if (!/^[A-Za-z][A-Za-z0-9+.-]*:/.test(text)) {
    if (/^\/\//.test(text)) text = `https:${text}`;
    else if (/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+([/?#]|$)/.test(text)) text = `https://${text}`;
  }

  let parsed;
  try {
    parsed = new URL(text);
  } catch (_error) {
    throw createResolveError(ERROR_CODES.UNSUPPORTED_URL, 'not a valid url');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw createResolveError(ERROR_CODES.RESOLVE_BLOCKED, `protocol ${parsed.protocol} is not allowed`, {
      protocol: parsed.protocol,
    });
  }
  if (parsed.username !== '' || parsed.password !== '') {
    throw createResolveError(ERROR_CODES.RESOLVE_BLOCKED, 'url must not carry userinfo');
  }
  return parsed.href;
}

/**
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
 * @param {string} hostname
 * @returns {boolean}
 */
export function isIpLiteral(hostname) {
  const host = normalizeHostname(hostname);
  if (host.includes(':')) return true;
  if (/^[0-9]+$/.test(host)) return true;
  if (/^0x[0-9a-f]+$/i.test(host)) return true;
  return /^[0-9]{1,3}(\.[0-9]{1,3}){3}$/.test(host);
}

/**
 * hostname 是否命中白名单根域（等于或子域）。
 * @param {string} hostname
 * @returns {boolean}
 */
export function isAllowedHostname(hostname) {
  const host = normalizeHostname(hostname);
  if (host === '') return false;
  return ALLOWED_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

/**
 * 这个 URL 能不能抓。真正的边界入口，测试只调这一个。
 * @param {string} url
 * @returns {boolean}
 */
export function isUrlAllowed(url) {
  let parsed;
  try {
    parsed = new URL(normalizeUrl(url));
  } catch (_error) {
    return false;
  }
  if (parsed.username !== '' || parsed.password !== '') return false;
  const host = normalizeHostname(parsed.hostname);
  if (host === '') return false;
  if (isIpLiteral(host)) return false;
  return isAllowedHostname(host);
}

/* ------------------------------------------------------------------ *
 * 出口 IP 校验：连接时校验，防 DNS rebinding
 * ------------------------------------------------------------------ */

const PRIVATE_V4 = [
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
];

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
 * IPv4 是否落在私网/保留/回环/链路本地/组播段。
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

/** 粗粒度 IPv6 段判定：回环、未指定、链路本地、唯一本地、IPv4 映射/兼容。 */
const PRIVATE_V6_PREFIXES = ['::1', '::', 'fe80', 'fc', 'fd', 'ff', '::ffff', '64:ff9b', '2001:db8'];

/**
 * @param {string} ip 未加方括号的 IPv6 文本
 * @returns {boolean}
 */
export function isPrivateIPv6(ip) {
  const text = normalizeHostname(ip);
  if (text === '') return true;
  const lower = text.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  // IPv4 映射形态 ::ffff:1.2.3.4 —— 提取尾巴按 v4 判
  const mapped = /^::ffff:(.+)$/i.exec(lower);
  if (mapped) {
    const tail = mapped[1];
    if (/^[0-9]{1,3}(\.[0-9]{1,3}){3}$/.test(tail)) return isPrivateIPv4(tail);
    return true;
  }
  const first = lower.split(':')[0];
  if (/^fe[89ab]/.test(lower)) return true; // 链路本地 fe80::/10
  if (first === 'fc00' || first === 'fd00') return true;
  if (/^f[cd][0-9a-f]{2}$/.test(first)) return true; // 唯一本地 fc00::/7
  if (/^ff[0-9a-f]{2}$/.test(first)) return true; // 组播 ff00::/8
  if (lower.startsWith('2001:db8')) return true; // 文档段
  if (lower.startsWith('64:ff9b')) return true; // NAT64
  return false;
}

/**
 * 这个解析结果能不能连。任何一项不合格就整条拒绝（多 A 记录里混一个内网也拒）。
 * @param {string} ip
 * @param {number} family 4 或 6（0 表示按文本猜）
 * @returns {boolean}
 */
export function isPublicAddress(ip, family) {
  const resolvedFamily = family === 4 || family === 6 ? family : (String(ip).includes(':') ? 6 : 4);
  if (resolvedFamily === 6) return !isPrivateIPv6(ip);
  if (!/^[0-9]{1,3}(\.[0-9]{1,3}){3}$/.test(String(ip))) return false;
  return !isPrivateIPv4(ip);
}

/**
 * 生成 lookup 包装器：把 DNS 结果逐个校验，全部公网才放行，并把结果钉死给连接用。
 * 这是防 DNS rebinding 的关键——校验的地址集与真正连接的地址集必须是同一份。
 * @param {(host:string, opts:object, cb:Function)=>void} baseLookup
 * @param {(ip:string, family:number)=>boolean} policy
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
          cb(createResolveError(ERROR_CODES.RESOLVE_BLOCKED, 'target resolves to a non-public address', {
            address: entry && entry.address,
          }));
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
 * HTTP 抓取（自带超时、逐跳校验、体积上限）
 * ------------------------------------------------------------------ */

/**
 * 发起一次受控 GET，返回响应文本。不走全局 fetch：宿主/用户的 HTTPS_PROXY 环境变量
 * 指向本机代理时，全局 dispatcher 会被拖到超时（本机实测：127.0.0.1:7897 拒连）。
 *
 * @param {string} url 已经过 isUrlAllowed 的 URL
 * @param {object} options
 * @param {Record<string,string>} [options.headers]
 * @param {number} [options.timeoutMs]
 * @param {(url:string)=>({referer:string})} [options.refererFor]
 * @param {Function} [options.lookup] 自定义 DNS（单测注入用）
 * @param {Function} [options.request] 自定义请求函数（单测注入用）
 * @param {string} [options.allowContentTypes] 正则源串，命中才读 body
 * @returns {Promise<{ status:number, headers:Record<string,string|string[]|undefined>, body:string, finalUrl:string }>}
 */
export function httpGet(url, options = {}) {
  const {
    headers = {},
    timeoutMs = DEFAULTS.timeoutMs,
    maxBodyBytes = DEFAULTS.maxBodyBytes,
    lookup,
    request: requestFn,
  } = options;

  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (_error) {
      reject(createResolveError(ERROR_CODES.UNSUPPORTED_URL, 'not a valid url'));
      return;
    }
    const isHttps = parsed.protocol === 'https:';
    const send = requestFn || (isHttps ? httpsRequest : httpRequest);
    const pinnedLookup = createPinnedLookup(lookup || dns.lookup);
    const clientRequest = send(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname.replace(/^\[|\]$/g, ''),
        port: parsed.port || (isHttps ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: 'GET',
        family: 4,
        headers: {
          'user-agent': DEFAULTS.userAgent,
          'accept-language': DEFAULTS.acceptLanguage,
          accept: 'application/json,text/html,application/xhtml+xml,*/*;q=0.8',
          ...headers,
        },
        lookup: pinnedLookup,
      },
      (response) => {
        const status = Number(response.statusCode) || 0;
        const chunks = [];
        let size = 0;
        response.on('data', (chunk) => {
          size += chunk.length;
          if (size > maxBodyBytes) {
            clientRequest.destroy(createResolveError(ERROR_CODES.DECODE_FAILED, 'response body exceeds limit'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => {
          resolve({
            status,
            headers: response.headers,
            body: Buffer.concat(chunks, size).toString('utf8'),
            finalUrl: url,
          });
        });
        response.on('error', (error) => reject(wrapNetworkError(error)));
      },
    );

    const timer = setTimeout(() => {
      clientRequest.destroy();
      reject(createResolveError(ERROR_CODES.RESOLVE_TIMEOUT, `request exceeded ${timeoutMs}ms`, { url }));
    }, timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();

    clientRequest.on('error', (error) => {
      clearTimeout(timer);
      reject(error && error.code ? error : wrapNetworkError(error));
    });
    clientRequest.on('close', () => clearTimeout(timer));
    clientRequest.end();
  });
}

function wrapNetworkError(error) {
  if (error && typeof error.code === 'string' && Object.values(ERROR_CODES).includes(error.code)) return error;
  const code = error && error.code ? String(error.code) : 'unknown';
  if (code === 'ETIMEDOUT' || code === 'ECONNRESET') {
    return createResolveError(ERROR_CODES.RESOLVE_TIMEOUT, 'network timeout');
  }
  return createResolveError(ERROR_CODES.RESOLVE_BLOCKED, 'network request failed', { cause: code });
}

/**
 * 跟随重定向，每一跳都重新过白名单与出口 IP 策略。
 * 这是本模块最容易写漏的地方：短链 302 到内网、跳到 IP 直连，都必须在改道前拦下。
 *
 * @param {string} startUrl
 * @param {object} options 透传 httpGet 的选项
 * @returns {Promise<{ status:number, headers:object, body:string, finalUrl:string, hops:string[] }>}
 */
export async function fetchWithRedirects(startUrl, options = {}) {
  const maxRedirects = options.maxRedirects === undefined ? DEFAULTS.maxRedirects : options.maxRedirects;
  const hops = [];
  let current = normalizeUrl(startUrl);
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    if (!isUrlAllowed(current)) {
      throw createResolveError(ERROR_CODES.RESOLVE_BLOCKED, 'redirect target is not allowed', {
        url: current,
        hop,
      });
    }
    hops.push(current);
    const response = await httpGet(current, options);
    const location = response.headers && response.headers.location;
    const status = response.status;
    if (status >= 300 && status < 400 && typeof location === 'string') {
      if (hop === maxRedirects) {
        throw createResolveError(ERROR_CODES.RESOLVE_BLOCKED, 'too many redirects', { hops });
      }
      let next;
      try {
        next = new URL(location, current).href;
      } catch (_error) {
        throw createResolveError(ERROR_CODES.DECODE_FAILED, 'bad redirect location', { location });
      }
      current = next;
      continue;
    }
    return { ...response, finalUrl: current, hops };
  }
  throw createResolveError(ERROR_CODES.RESOLVE_BLOCKED, 'too many redirects', { hops });
}

/* ------------------------------------------------------------------ *
 * 平台解析器
 * ------------------------------------------------------------------ */

/** 平台页 Referer。防盗链与反爬最常见的一道墙，缺 Referer 直接 403。 */
const REFERERS = Object.freeze({
  bilibili: 'https://www.bilibili.com/',
  netease: 'https://music.163.com/',
  qq: 'https://y.qq.com/',
  youtube: 'https://www.youtube.com/',
});

function platformOf(host) {
  if (host === 'b23.tv' || host === 'bilibili.com' || host.endsWith('.bilibili.com')) return 'bilibili';
  if (host === 'music.163.com') return 'netease';
  if (host === 'y.qq.com') return 'qq';
  if (host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com')) return 'youtube';
  return 'other';
}

function apiHeaders(platform) {
  const referer = REFERERS[platform];
  const headers = {};
  if (referer) {
    headers.referer = referer;
    headers.origin = referer.replace(/\/$/, '');
  }
  return headers;
}

/* ------------------------------------------------------------------ *
 * 平台直链（网易云 / QQ 音乐）
 *
 * 背景：这两个平台**都能拿到真实音频直链**，与早期注释里写的「拿不到」相反。
 * 实测（2026-10-18 本机 node:https 直连，见 scripts/probe-platform-cdn.mjs）：
 *   · 网易云 GET /api/song/enhance/player/url?ids=[a,b,...]&br=320000
 *     一次 39ms 拿 20 首；**免费曲（fee=8）直接给 url**，VIP 曲（fee=1）给
 *     `url:null, code:-110` —— 这是版权限制，不是接口限制，必须诚实降级。
 *     返回的 url 是 http，但**换成 https 照样 206**，安全策略不必放宽到明文。
 *   · QQ  POST 语义的 musicu.fcg / CgiGetVkey，songmid 数组一次 30 首 119ms，
 *     匿名（uin=0）就给 purl，无需登录。sip 形如 aqqmusic.tc.qq.com。
 *
 * 直链**绝不回给客户端**：宿主签发 HMAC 票据（src/host/mediatoken.js），
 * 客户端只拿到 `/api/dsh-music-on/stream?mt=<token>`。
 * 这样平台 CDN 白名单只在 token 通道生效，`src=` 那条路依旧是 B 站专用。
 * ------------------------------------------------------------------ */

/**
 * 默认一次给多少首可播曲目。
 *
 * 与客户端 `MAX_PLATFORM_TRACKS` 相等 —— 那是设置项的**默认值**，
 * 用户在设置页可以改成别的数（见 `MAX_TRACK_LIMIT`）。
 */
export const MAX_STREAM_TRACKS = 60;

/**
 * 上限。设置页里的「识别数量」不能超过它。
 *
 * 取 200 的依据是两侧接口的实测天花板：
 *   · 网易云 enhance/player/url 一次 300 首 → 200，265ms，无截断；
 *   · QQ vkey 一次 **100 首正常，200 首静默只回 100 条，300 首直接 414**。
 * 再往上只会让单次解析越来越慢，而用户一次也用不完。
 */
export const MAX_TRACK_LIMIT = 200;

/**
 * 为「凑够 N 首可播」最多扫描多少首候选。
 *
 * 网易云的冷门歌单实播率约 60%，QQ 更高。取 limit 的 3 倍再夹到上限，
 * 保证「只想听 30 首」时不必把 1000 首的 id 全捞一遍。
 */
const TRACK_SCAN_FACTOR = 3;

/** 直链接口的分块大小。网易云实测 300 可发，QQ 实测 100 封顶，取两者最小值。 */
const STREAM_CHUNK = 100;

/** 两套接口的字段形状不同，取值必须两吃。 */
function neteaseArtists(item) {
  const list = Array.isArray(item.ar) ? item.ar : Array.isArray(item.artists) ? item.artists : null;
  if (list === null) return undefined;
  const names = list.map((a) => (a && a.name ? String(a.name) : '')).filter(Boolean);
  return names.length > 0 ? names.join(', ') : undefined;
}

/** `dt`（内联曲目）与 `duration`（song/detail）都是毫秒。 */
function neteaseDuration(item) {
  const ms = Number(item.dt) || Number(item.duration) || 0;
  return ms > 0 ? Math.round(ms / 1000) : undefined;
}

/**
 * 网易云单曲封面。
 *
 * 两套字段形状：歌单内联曲目用 `al.picUrl`，`song/detail` 补齐的用
 * `album.picUrl`。只认一套会让「补齐来的那批曲目」全变成没有封面的黑胶。
 * 一律 http → https（混合内容会被浏览器拦掉，封面静默消失）。
 */
function neteaseCover(item) {
  const song = item && typeof item === 'object' ? item : null;
  if (song === null) return null;
  const album = song.al && typeof song.al === 'object' ? song.al : song.album && typeof song.album === 'object' ? song.album : null;
  const raw = album && typeof album.picUrl === 'string' ? album.picUrl.trim() : '';
  return raw === '' ? null : raw.replace(/^http:/, 'https:');
}

/**
 * QQ 音乐单曲封面。
 *
 * 歌单接口给的是扁平的 `albummid`；单曲详情接口给的是嵌套的 `album.mid`。
 * 拼法同官方前端：`T002R300x300M000` + albummid + `.jpg`。
 */
function qqCover(item) {
  const song = item && typeof item === 'object' ? item : null;
  if (song === null) return null;
  const nested = song.album && typeof song.album === 'object' && typeof song.album.mid === 'string' ? song.album.mid : '';
  const flat = typeof song.albummid === 'string' ? song.albummid : typeof song.albumMid === 'string' ? song.albumMid : '';
  const mid = (flat || nested).trim();
  return mid === '' ? null : `https://y.gtimg.cn/music/photo_new/T002R300x300M000${mid}.jpg`;
}

/** 网易云返回的 type 字段 → MIME。未知一律按 mp3 处理。 */
const NETEASE_MIME = Object.freeze({
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
});

/** 按扩展名猜 MIME（QQ 只给 filename）。 */
function mimeFromPath(path) {
  const match = /\.([a-z0-9]+)(?:\?|$)/i.exec(String(path || ''));
  if (!match) return 'audio/mp4';
  const ext = match[1].toLowerCase();
  if (ext === 'mp3') return 'audio/mpeg';
  if (ext === 'm4a' || ext === 'mp4') return 'audio/mp4';
  if (ext === 'aac') return 'audio/aac';
  if (ext === 'flac') return 'audio/flac';
  if (ext === 'ogg' || ext === 'oga' || ext === 'opus') return 'audio/ogg';
  if (ext === 'wav') return 'audio/wav';
  return 'audio/mp4';
}

/**
 * 平台直链必须是 https 且主机落在平台 CDN 上，否则宁可不签。
 * 与 stream 侧 checkPlatformUrl 同规则，这里提前拦一道，避免签出必然失败的票据。
 *
 * @param {unknown} rawUrl
 * @returns {{ ok:true, url:string } | { ok:false }}
 */
function sanitizePlatformUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl === '') return { ok: false };
  let parsed;
  try {
    parsed = new URL(rawUrl.replace(/^http:/, 'https:'));
  } catch (_error) {
    return { ok: false };
  }
  if (parsed.protocol !== 'https:') return { ok: false };
  const host = normalizeHostname(parsed.hostname);
  const allowed = host === 'music.126.net' || host.endsWith('.music.126.net')
    || host === 'tc.qq.com' || host.endsWith('.tc.qq.com')
    || host === 'stream.qqmusic.qq.com' || host.endsWith('.stream.qqmusic.qq.com');
  if (!allowed) return { ok: false };
  if (parsed.pathname.includes('%') || parsed.search.includes('%')) return { ok: false };
  return { ok: true, url: parsed.href };
}

/**
 * 批量取网易云的播放直链。
 *
 * 只在**有 mediaTokens 时**才发这次请求：没有票据就没法把直链交给客户端，
 * 白拿一批地址只增加失败面。
 *
 * @param {string[]} ids
 * @param {object} ctx 解析上下文
 * @returns {Promise<Map<string, {url:string, mime:string, duration?:number}>>} id → 直链
 */
async function neteaseStreams(ids, ctx) {
  const out = new Map();
  if (!ctx.mediaTokens || ids.length === 0) return out;
  // 分块由调用方（collectPlayableTracks）负责，这里只处理传进来的这一块。
  // 保留 STREAM_CHUNK 硬切是最后一道保险：万一有调用方塞了超长数组，
  // 也不至于把 enhance 接口打回 414。
  const batch = ids.slice(0, STREAM_CHUNK);
  // 方括号在 query 里合法但易被中间层误处理，显式编码成 %5B/%5D 更稳。
  const query = `ids=${encodeURIComponent(`[${batch.join(',')}]`)}&br=320000`;
  let payload;
  try {
    const response = await ctx.fetchWithRedirects(
      `https://music.163.com/api/song/enhance/player/url?${query}`,
      { headers: apiHeaders('netease') },
    );
    if (response.status !== 200) return out;
    payload = JSON.parse(response.body);
  } catch (_error) {
    // 拿不到直链不是解析失败：歌单元数据已经拿到了，退化成「只跳转」是合法降级。
    return out;
  }
  for (const item of Array.isArray(payload && payload.data) ? payload.data : []) {
    if (!item || !item.url) continue;
    const verdict = sanitizePlatformUrl(item.url);
    if (verdict.ok !== true) continue;
    out.set(String(item.id), {
      url: verdict.url,
      mime: NETEASE_MIME[String(item.type || '').toLowerCase()] || 'audio/mpeg',
      sizeBytes: Number(item.size) || undefined,
    });
  }
  return out;
}

/**
 * 批量取 QQ 音乐的 vkey 直链。
 *
 * CgiGetVkey 是 **GET + data=<json>**（不是 POST）—— 本机实测匿名 uin=0 即可。
 * 返回的 purl 是相对路径，必须拼上 sip 才是完整地址；sip 给的是 http，升级 https。
 *
 * @param {string[]} mids
 * @param {object} ctx
 * @returns {Promise<Map<string, {url:string, mime:string}>>}
 */
async function qqStreams(mids, ctx) {
  const out = new Map();
  if (!ctx.mediaTokens || mids.length === 0) return out;
  // 实测：100 首正常，200 首静默只回 100 条，300 首直接 414。
  // 所以这里必须硬切到 STREAM_CHUNK，且分块由调用方驱动。
  const batch = mids.slice(0, STREAM_CHUNK);
  const body = JSON.stringify({
    req_0: {
      module: 'vkey.GetVkeyServer',
      method: 'CgiGetVkey',
      param: {
        guid: '10000',
        songmid: batch,
        songtype: batch.map(() => 0),
        uin: '0',
        loginflag: 1,
        platform: '20',
      },
    },
    comm: { uin: 0, format: 'json', ct: 24, cv: 0 },
  });
  let payload;
  try {
    const response = await ctx.fetchWithRedirects(
      `https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=${encodeURIComponent(body)}`,
      { headers: apiHeaders('qq') },
    );
    if (response.status !== 200) return out;
    payload = JSON.parse(response.body);
  } catch (_error) {
    return out;
  }
  const data = payload && payload.req_0 && payload.req_0.data;
  const sip = Array.isArray(data && data.sip) && typeof data.sip[0] === 'string' ? data.sip[0] : '';
  if (sip === '') return out;
  for (const item of Array.isArray(data && data.midurlinfo) ? data.midurlinfo : []) {
    if (!item || !item.purl) continue;
    const verdict = sanitizePlatformUrl(sip + item.purl);
    if (verdict.ok !== true) continue;
    out.set(String(item.songmid), {
      url: verdict.url,
      mime: mimeFromPath(item.filename || item.purl),
    });
  }
  return out;
}

/**
 * 把一条直链签成客户端可用的同源取流路径。
 * 没有票据表（单测环境未注入）时返回 null —— 调用方据此退回 streamOnly。
 *
 * @param {object} ctx
 * @param {object} spec
 * @returns {string|null}
 */
function signStreamPath(ctx, spec) {
  if (!ctx.mediaTokens || typeof ctx.mediaTokens.sign !== 'function') return null;
  try {
    return buildMediaStreamPath(ctx.mediaTokens.sign(spec));
  } catch (_error) {
    return null;
  }
}

/**
 * 把「设置页要多少首」夹成合法整数。
 *
 * **必须先把 null/undefined/空串短路掉**。`Number(null)` 是 0，而 0 会一路走到
 * 「小于 1 → 返回 1」，于是调用方不传 limit 时歌单只识别 1 首 —— 实测踩过：
 * 网易云 6 首只回来 1 首、QQ 30 首只回来 1 首，看起来像「歌单解析坏了」。
 * 不传 limit 的合法语义是「用默认值」，不是「只要一首」。
 *
 * @param {unknown} raw
 * @returns {number}
 */
export function clampTrackLimit(raw) {
  if (raw === null || raw === undefined) return MAX_STREAM_TRACKS;
  if (typeof raw === 'string' && raw.trim() === '') return MAX_STREAM_TRACKS;
  const num = Number(raw);
  if (!Number.isFinite(num)) return MAX_STREAM_TRACKS;
  const text = Math.trunc(num);
  if (text < 1) return 1;
  if (text > MAX_TRACK_LIMIT) return MAX_TRACK_LIMIT;
  return text;
}

/**
 * 分批取直链、只留可播曲目，凑够 `want` 首就停。
 *
 * **为什么必须「取完再筛」而不是「先切前 N 首」**：歌单里会员曲目的比例可以高达
 * 四成以上（实测某 73 首歌单只有 44 首能拿到直链）。若先把候选切成前 N 首，
 * 用户设置「识别 30 首」最后可能只入队 15 首 —— 而这 15 首里还有一半是点点就报错的
 * 灰色条目。现在的语义是「给你 N 首**能播的**」，不可播的直接不出现。
 *
 * 扫描上限取 `want * TRACK_SCAN_FACTOR`：既保证常见的实播率下够用，又不至于
 * 为了凑数把 1000 首的歌单全捞一遍（那是 10 次上游请求）。
 *
 * @param {object[]} candidates 候选曲目（歌单原始顺序）
 * @param {number} want 想要几首可播曲目
 * @param {object} ctx 解析上下文
 * @param {{ idOf:(item:object)=>string, fetchStreams:Function, signSpec:Function, build:Function }} spec
 * @returns {Promise<{ tracks:object[], scanned:number, playable:number }>}
 */
async function collectPlayableTracks(candidates, want, ctx, spec) {
  const tracks = [];
  const scanCap = Math.min(candidates.length, Math.max(want * TRACK_SCAN_FACTOR, STREAM_CHUNK));
  let scanned = 0;
  for (let offset = 0; offset < scanCap && tracks.length < want; offset += STREAM_CHUNK) {
    const chunk = candidates.slice(offset, Math.min(offset + STREAM_CHUNK, scanCap));
    if (chunk.length === 0) break;
    scanned += chunk.length;
    const ids = chunk.map((item) => spec.idOf(item));
    // 一次取一块的直链。取不到就算了 —— 拿不到直链不是解析失败，
    // 这一块里的曲目直接跳过，继续下一块。
    const streams = await spec.fetchStreams(ids, ctx);
    for (let i = 0; i < chunk.length; i += 1) {
      if (tracks.length >= want) break;
      const stream = streams.get(ids[i]);
      if (!stream) continue;
      const streamPath = signStreamPath(ctx, spec.signSpec(chunk[i], ids[i], stream));
      if (!streamPath) continue;
      tracks.push(spec.build(chunk[i], ids[i], stream, streamPath));
    }
  }
  return { tracks, scanned, playable: tracks.length };
}

/**
 * bilibili：shortCode 先跟跳到真实 URL 再取 BV 号；BV 号走 web-interface/view。
 * @param {string} url
 * @param {object} ctx 解析上下文（含 fetch 函数与缓存）
 * @returns {Promise<object>} 归一结果
 */
async function resolveBilibili(url, ctx) {
  let target = url;
  if (ctx.host === 'b23.tv') {
    const jumped = await ctx.fetchWithRedirects(url, { headers: apiHeaders('bilibili') });
    target = jumped.finalUrl;
  }
  const parsed = new URL(target);
  const segments = parsed.pathname.split('/').filter(Boolean);
  let bvid = null;
  let aid = null;
  for (const segment of segments) {
    if (/^BV[0-9A-Za-z]{10}$/.test(segment)) bvid = segment;
    if (/^av[0-9]+$/i.test(segment)) aid = segment.slice(2);
  }
  if (!bvid && !aid) {
    throw createResolveError(ERROR_CODES.UNSUPPORTED_URL, 'bilibili url has no BV/av id', { url: target });
  }
  const query = bvid ? `bvid=${encodeURIComponent(bvid)}` : `aid=${encodeURIComponent(aid)}`;
  const apiUrl = `https://api.bilibili.com/x/web-interface/view?${query}`;
  const response = await ctx.fetchWithRedirects(apiUrl, { headers: apiHeaders('bilibili') });
  if (response.status !== 200) {
    throw createResolveError(ERROR_CODES.DECODE_FAILED, `bilibili api http ${response.status}`);
  }
  let payload;
  try {
    payload = JSON.parse(response.body);
  } catch (_error) {
    throw createResolveError(ERROR_CODES.DECODE_FAILED, 'bilibili api returned non-json');
  }
  if (Number(payload.code) !== 0 || !payload.data) {
    throw createResolveError(ERROR_CODES.DECODE_FAILED, `bilibili api code ${payload.code}`, {
      apiMessage: payload.message,
    });
  }
  const data = payload.data;
  const pageUrl = `https://www.bilibili.com/video/${data.bvid || bvid || `av${data.aid}`}/`;
  // cid 必须带出来：客户端拿它拼 /api/dsh-music-on/stream?bvid=..&cid=..，
  // 少了这一段，流代理就得自己再打一次 view 接口去查，等于把这里已经解析好的
  // 结果白扔掉，而且多一次可失败的往返。
  const firstPage = Array.isArray(data.pages) && data.pages.length > 0 ? data.pages[0] : null;
  const cid = data.cid || (firstPage && firstPage.cid) || null;
  // 直链：B 站 DASH/FLV 需要 playurl 接口 + 多重签名，且大量稿件限制 embed。
  // 本模块不伪造直链 —— 一律 streamOnly，音频由 /api/dsh-music-on/stream 代理，
  // 拿不到就由 UI 落 embed iframe 或跳原页。
  return {
    platform: 'bilibili-video',
    title: data.title || '未命名',
    cover: typeof data.pic === 'string' ? data.pic.replace(/^http:/, 'https:') : null,
    pageUrl,
    tracks: [
      {
        title: data.title || '未命名',
        artist: data.owner && data.owner.name ? data.owner.name : undefined,
        bvid: data.bvid || bvid || undefined,
        cid: cid === null ? undefined : cid,
        pageUrl,
        streamOnly: true,
        duration: Number(data.duration) || undefined,
      },
    ],
  };
}

/**
 * bilibili 收藏夹：space.bilibili.com/<mid>/favlist?fid=<fid>。
 * 走公开的 x/v3/fav/resource/list，只取前若干页（缓存友好，不刷爆对方接口）。
 * @param {string} url
 * @param {object} ctx
 */
async function resolveBilibiliFavlist(url, ctx) {
  const parsed = new URL(url);
  const fid = parsed.searchParams.get('fid');
  const midMatch = /^\/([0-9]+)\//.exec(parsed.pathname);
  const mid = midMatch ? midMatch[1] : null;
  if (!fid || !/^[0-9]+$/.test(fid)) {
    throw createResolveError(ERROR_CODES.UNSUPPORTED_URL, 'favlist url has no fid');
  }
  const apiUrl = `https://api.bilibili.com/x/v3/fav/resource/list?media_id=${fid}&pn=1&ps=20&platform=web${
    mid ? `&mid=${mid}` : ''
  }`;
  const response = await ctx.fetchWithRedirects(apiUrl, { headers: apiHeaders('bilibili') });
  if (response.status !== 200) throw createResolveError(ERROR_CODES.DECODE_FAILED, `bilibili fav http ${response.status}`);
  let payload;
  try {
    payload = JSON.parse(response.body);
  } catch (_error) {
    throw createResolveError(ERROR_CODES.DECODE_FAILED, 'bilibili fav returned non-json');
  }
  if (Number(payload.code) !== 0 || !payload.data) {
    throw createResolveError(ERROR_CODES.DECODE_FAILED, `bilibili fav code ${payload.code}`, {
      apiMessage: payload.message,
    });
  }
  const data = payload.data;
  const medias = Array.isArray(data.medias) ? data.medias : [];
  const tracks = medias
    .filter((item) => item && item.bvid)
    .map((item) => ({
      title: item.title || '未命名',
      artist: item.upper && item.upper.name ? item.upper.name : undefined,
      bvid: item.bvid,
      pageUrl: `https://www.bilibili.com/video/${item.bvid}/`,
      streamOnly: true,
      duration: Number(item.duration) || undefined,
    }));
  if (tracks.length === 0) {
    throw createResolveError(ERROR_CODES.NO_STREAM, '收藏夹没有可解析的视频', { fid });
  }
  return {
    platform: 'bilibili-favlist',
    title: data.info && data.info.title ? data.info.title : `收藏夹 ${fid}`,
    cover: data.info && typeof data.info.cover === 'string' ? data.info.cover.replace(/^http:/, 'https:') : null,
    pageUrl: url,
    tracks,
  };
}

/**
 * 歌单曲目**全量**补齐。
 *
 * 实测（2026-10-18，本机直连）：`api/v6/playlist/detail` 返回的
 * `playlist.tracks` **只内联前 10 首**，而 `trackCount` 与 `trackIds` 是完整的。
 * 之前的实现直接吃 `tracks`，于是 73 首的歌单只解析出 10 首 ——
 * 用户看到的是「解析成功但少了一大半」，比直接报错更难发现。
 *
 * 补齐走 `api/song/detail?ids=[...]`，本机实测：
 *   · 一次 200 首 → 200，612KB，228ms
 *   · 一次 500 首 → 200，616KB，181ms
 *   · 一次 1000 首 → **code 400**（URL 长度 11399 超限）
 * 所以按 200 分块，URL 长度约 2.5KB，留足余量。
 *
 * 顺序以 `trackIds` 为准（那才是歌单真实顺序），内联项只当元数据缓存。
 * 补齐失败**绝不抛错**：拿到几首算几首。
 */
const NETEASE_DETAIL_CHUNK = 200;

/**
 * 候选池上限：一次性最多补齐多少首候选曲目。
 *
 * **不能等于「最终要几首」**。会员曲目的占比在网易云可达四成以上，
 * 若候选池只有 60 首，用户把识别数量设成 200 时永远凑不够 —— 而且由于
 * 筛掉的都是 VIP，界面会表现为「设了 200 却只进来 30 首」。
 *
 * 取 `MAX_TRACK_LIMIT * TRACK_SCAN_FACTOR` = 600：这是「要 200 首可播」在最坏
 * 实播率下仍够用的上限，也正好是 collectPlayableTracks 的扫描上限。
 * 再大会让 api/song/detail 补齐多跑几轮（每次 200 首），而收益趋于零。
 */
const MAX_CANDIDATE_TRACKS = MAX_TRACK_LIMIT * TRACK_SCAN_FACTOR;

/**
 * @param {object} playlist api/v6/playlist/detail 的 playlist 对象
 * @param {object} ctx 解析上下文
 * @param {number} [maxTracks] 候选池上限，缺省用 MAX_CANDIDATE_TRACKS
 * @returns {Promise<object[]>} 曲目原文，按歌单顺序
 */
async function neteasePlaylistTracks(playlist, ctx, maxTracks) {
  const inline = Array.isArray(playlist.tracks) ? playlist.tracks.filter((item) => item && item.id) : [];
  const byId = new Map(inline.map((item) => [String(item.id), item]));

  const ordered = [];
  const seen = new Set();
  const pushId = (value) => {
    if (value === null || value === undefined) return;
    const id = String(value);
    if (!/^[0-9]+$/.test(id) || seen.has(id)) return;
    seen.add(id);
    ordered.push(id);
  };
  for (const entry of Array.isArray(playlist.trackIds) ? playlist.trackIds : []) {
    if (entry && typeof entry === 'object') pushId(entry.id);
  }
  // trackIds 缺失时退回内联顺序，行为与旧实现一致。
  for (const item of inline) pushId(item.id);

  const cap = Number.isFinite(Number(maxTracks)) && Number(maxTracks) > 0
    ? Math.trunc(Number(maxTracks))
    : MAX_CANDIDATE_TRACKS;
  const target = ordered.slice(0, cap);
  const missing = target.filter((id) => !byId.has(id));

  for (let offset = 0; offset < missing.length; offset += NETEASE_DETAIL_CHUNK) {
    const chunk = missing.slice(offset, offset + NETEASE_DETAIL_CHUNK);
    try {
      const response = await ctx.fetchWithRedirects(
        `https://music.163.com/api/song/detail?ids=${encodeURIComponent(`[${chunk.join(',')}]`)}`,
        { headers: apiHeaders('netease') },
      );
      if (response.status !== 200) continue;
      const detail = JSON.parse(response.body);
      for (const song of Array.isArray(detail && detail.songs) ? detail.songs : []) {
        if (!song || song.id === undefined) continue;
        const id = String(song.id);
        if (!byId.has(id)) byId.set(id, song);
      }
    } catch (_error) {
      // 分块失败就跳过这一块，其余曲目照常返回。
    }
  }

  return target.map((id) => byId.get(id)).filter(Boolean);
}

/**
 * 网易云歌单 / 单曲。
 * 实测（2026-10-18，本机 node:https 直连）：
 *   · api/v6/playlist/detail 与 api/song/detail 均可直连，拿得到元数据；
 *   · api/song/enhance/player/url **免费曲（fee=8）直接给 url**，VIP 曲（fee=1）
 *     给 `url:null, code:-110` —— 那是版权限制，不是接口限制。
 * 所以有票据表时批量取直链并逐首签发票据；取不到的那几首诚实退回 streamOnly，
 * 由 UI 提示「需要会员，可跳原平台」。**绝不伪造 url。**
 * @param {string} url
 * @param {object} ctx
 */
async function resolveNetease(url, ctx, want) {
  const route = neteaseRouteOf(url);
  if (route.playlistId) {
    const apiUrl = `https://music.163.com/api/v6/playlist/detail?id=${route.playlistId}&n=1000`;
    const response = await ctx.fetchWithRedirects(apiUrl, { headers: apiHeaders('netease') });
    if (response.status !== 200) throw createResolveError(ERROR_CODES.DECODE_FAILED, `netease api http ${response.status}`);
    let payload;
    try {
      payload = JSON.parse(response.body);
    } catch (_error) {
      throw createResolveError(ERROR_CODES.DECODE_FAILED, 'netease api returned non-json');
    }
    if (Number(payload.code) !== 200 || !payload.playlist) {
      throw createResolveError(ERROR_CODES.DECODE_FAILED, `netease api code ${payload.code}`, {
        apiMessage: payload.message,
      });
    }
    const playlist = payload.playlist;
    // 不能直接吃 playlist.tracks —— 新版接口只内联前 10 首，必须按 trackIds 补齐。
    // 候选池按「要几首 × 扫描倍数」取，不能只取 want 首：会员曲目会被筛掉，
    // 候选池等于 want 就永远凑不够数。
    const raw = await neteasePlaylistTracks(playlist, ctx, want * TRACK_SCAN_FACTOR);
    if (raw.length === 0) {
      throw createResolveError(ERROR_CODES.NO_STREAM, '歌单里没有曲目', { playlistId: route.playlistId });
    }
    // 按「要几首可播」去取，凑够就停。会员曲目在这里就被筛掉了，
    // 不会走到客户端再变成一条点了就报错的灰色条目。
    const picked = await collectPlayableTracks(raw, want, ctx, {
      idOf: (item) => String(item.id),
      fetchStreams: neteaseStreams,
      signSpec: (item, id, stream) => ({
        url: stream.url,
        mime: stream.mime,
        platform: 'netease',
        id,
        title: item.name || null,
        pageUrl: `https://music.163.com/#/song?id=${id}`,
        source: 'netease',
      }),
      build: (item, id, stream, streamPath) => ({
        id,
        title: item.name || '未命名',
        artist: neteaseArtists(item),
        pageUrl: `https://music.163.com/#/song?id=${id}`,
        // 能进到这里的曲目都已签出票据，所以恒为 false。
        streamOnly: false,
        streamPath,
        duration: neteaseDuration(item),
        // 每首的单曲封面：歌单里逐曲换封面才对得上「黑胶上转的是这首歌」。
        // 拿不到时给 null，UI 会退回纯黑胶图形，绝不显示空白 img。
        cover: neteaseCover(item),
      }),
    });
    if (picked.tracks.length === 0) {
      throw createResolveError(
        ERROR_CODES.NO_STREAM,
        `扫了 ${picked.scanned} 首，没有一首能拿到直链（多为会员专享曲目）`,
        { playlistId: route.playlistId, scanned: picked.scanned },
      );
    }
    return {
      platform: 'netease-playlist',
      title: playlist.name || `歌单 ${route.playlistId}`,
      cover: typeof playlist.coverImgUrl === 'string' ? playlist.coverImgUrl : null,
      pageUrl: `https://music.163.com/#/playlist?id=${route.playlistId}`,
      // 诊断字段：让客户端能如实告诉用户「扫了多少首，拿到几首」。
      scanned: picked.scanned,
      tracks: picked.tracks,
    };
  }
  if (route.trackId) {
    const apiUrl = `https://music.163.com/api/song/detail?ids=${encodeURIComponent(`[${route.trackId}]`)}`;
    const response = await ctx.fetchWithRedirects(apiUrl, { headers: apiHeaders('netease') });
    if (response.status !== 200) throw createResolveError(ERROR_CODES.DECODE_FAILED, `netease api http ${response.status}`);
    let payload;
    try {
      payload = JSON.parse(response.body);
    } catch (_error) {
      throw createResolveError(ERROR_CODES.DECODE_FAILED, 'netease api returned non-json');
    }
    if (Number(payload.code) !== 200 || !Array.isArray(payload.songs) || payload.songs.length === 0) {
      throw createResolveError(ERROR_CODES.DECODE_FAILED, `netease api code ${payload.code}`);
    }
    const song = payload.songs[0];
    const id = String(song.id || route.trackId);
    const pageUrl = `https://music.163.com/#/song?id=${route.trackId}`;
    const streams = await neteaseStreams([id], ctx);
    const stream = streams.get(id) || null;
    const streamPath = stream ? signStreamPath(ctx, {
      url: stream.url,
      mime: stream.mime,
      platform: 'netease',
      id,
      title: song.name || null,
      pageUrl,
      source: 'netease',
    }) : null;
    return {
      platform: 'netease-track',
      title: song.name || '未命名',
      cover: song.album && typeof song.album.picUrl === 'string' ? song.album.picUrl : null,
      pageUrl,
      tracks: [
        {
          id,
          title: song.name || '未命名',
          artist: neteaseArtists(song),
          pageUrl,
          streamOnly: streamPath === null,
          ...(streamPath === null ? {} : { streamPath }),
          duration: neteaseDuration(song),
          cover: neteaseCover(song),
        },
      ],
    };
  }
  throw createResolveError(ERROR_CODES.UNSUPPORTED_URL, 'netease url has no playlist or song id', { url });
}

function neteaseRouteOf(url) {
  const ids = safeExtract(url);
  return {
    playlistId: typeof ids.playlistId === 'string' ? ids.playlistId : null,
    trackId: typeof ids.trackId === 'string' ? ids.trackId : null,
  };
}

/**
 * 统一的 id 提取：平台先由共享 parser 判定，再交给共享 extractId。
 *
 * 这里绝不自己再看一遍 pathname —— 那正是之前 host 落后于 client 的成因。
 * extractId 内部对非法 URL 已做 try/catch，这里再包一层是因为
 * 「解析不出一条链接」永远不该炸掉整批入队。
 * @param {string} url
 * @returns {Record<string, string>}
 */
function safeExtract(url) {
  try {
    return extractIdShared(url) || {};
  } catch (_error) {
    return {};
  }
}

/**
 * QQ 音乐歌单 / 单曲。
 * 实测（2026-10-18，本机）：
 *   · fcg_ucc_getcdinfo_byids_cp 返回 code:0 + cdlist[0].{dissname,logo,songlist[]}；
 *   · musicu.fcg / CgiGetVkey **匿名（uin=0）就给 purl**，一次 30 首 119ms，
 *     无需登录、无需 media_mid —— 早期注释里「vkey 需要签名，本模块不做」是错的。
 * 同样按票据表签发；没有票据表（单测）时整条退回 streamOnly。
 * @param {string} url
 * @param {object} ctx
 */
async function resolveQQ(url, ctx, want) {
  // 与 B站 / 网易云一样，id 提取只认共享 parser，不再自己扫 pathname。
  // 之前这里内联了一套更弱的实现：不认 `#type=taoge&id=`，也不认
  // `/n/ryqq/playlist/xxx` 之外的写法，与客户端判定长期不一致。
  const ids = safeExtract(url);
  const playlistId = typeof ids.playlistId === 'string' ? ids.playlistId : null;
  const songmid = typeof ids.songmid === 'string' ? ids.songmid : null;
  if (playlistId) {
    const apiUrl =
      'https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0'
      + `&disstid=${playlistId}&format=json`;
    const response = await ctx.fetchWithRedirects(apiUrl, { headers: apiHeaders('qq') });
    if (response.status !== 200) throw createResolveError(ERROR_CODES.DECODE_FAILED, `qq api http ${response.status}`);
    let payload;
    try {
      payload = JSON.parse(response.body);
    } catch (_error) {
      throw createResolveError(ERROR_CODES.DECODE_FAILED, 'qq api returned non-json');
    }
    if (Number(payload.code) !== 0 || !Array.isArray(payload.cdlist) || payload.cdlist.length === 0) {
      throw createResolveError(ERROR_CODES.DECODE_FAILED, `qq api code ${payload.code}`);
    }
    const cd = payload.cdlist[0];
    const raw = (cd.songlist || []).filter((item) => item && (item.songmid || item.mid));
    if (raw.length === 0) throw createResolveError(ERROR_CODES.NO_STREAM, '歌单里没有曲目', { playlistId });
    const picked = await collectPlayableTracks(raw, want, ctx, {
      idOf: (item) => String(item.songmid || item.mid),
      fetchStreams: qqStreams,
      signSpec: (item, id, stream) => ({
        url: stream.url,
        mime: stream.mime,
        platform: 'qq',
        id,
        title: item.songname || item.name || null,
        pageUrl: `https://y.qq.com/n/ryqq/songDetail/${id}`,
        source: 'qq',
      }),
      build: (item, id, stream, streamPath) => ({
        id,
        title: item.songname || item.name || '未命名',
        artist: Array.isArray(item.singer) && item.singer.length > 0 ? item.singer.map((s) => s.name).join(', ') : undefined,
        pageUrl: `https://y.qq.com/n/ryqq/songDetail/${id}`,
        streamOnly: false,
        streamPath,
        duration: Number(item.interval) || undefined,
        // QQ 歌单里每首歌的 albummid 是个独立字段（不在 album.mid 里），
        // 单曲分支用的 `album.mid` 在这里永远读不到。
        cover: qqCover(item),
      }),
    });
    if (picked.tracks.length === 0) {
      throw createResolveError(
        ERROR_CODES.NO_STREAM,
        `扫了 ${picked.scanned} 首，没有一首能拿到直链（版权限制或需要会员）`,
        { playlistId, scanned: picked.scanned },
      );
    }
    return {
      platform: 'qq-playlist',
      title: cd.dissname || `歌单 ${playlistId}`,
      cover: typeof cd.logo === 'string' ? cd.logo : null,
      pageUrl: `https://y.qq.com/n/ryqq/playlist/${playlistId}`,
      scanned: picked.scanned,
      tracks: picked.tracks,
    };
  }
  if (songmid) {
    const apiUrl = `https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=${encodeURIComponent(JSON.stringify({
      req_0: {
        module: 'music.pf_song_detail_svr',
        method: 'get_song_detail',
        param: { song_mid: songmid },
      },
    }))}`;
    const response = await ctx.fetchWithRedirects(apiUrl, { headers: apiHeaders('qq') });
    if (response.status !== 200) throw createResolveError(ERROR_CODES.DECODE_FAILED, `qq api http ${response.status}`);
    let payload;
    try {
      payload = JSON.parse(response.body);
    } catch (_error) {
      throw createResolveError(ERROR_CODES.DECODE_FAILED, 'qq api returned non-json');
    }
    const trackInfo = payload.req_0 && payload.req_0.data && payload.req_0.data.track_info;
    if (!trackInfo) throw createResolveError(ERROR_CODES.DECODE_FAILED, 'qq api returned no track_info');
    const singers = Array.isArray(trackInfo.singer) ? trackInfo.singer.map((s) => s.name).join(', ') : undefined;
    const pageUrl = `https://y.qq.com/n/ryqq/songDetail/${songmid}`;
    const streams = await qqStreams([songmid], ctx);
    const stream = streams.get(songmid) || null;
    const streamPath = stream ? signStreamPath(ctx, {
      url: stream.url,
      mime: stream.mime,
      platform: 'qq',
      id: songmid,
      title: trackInfo.name || null,
      pageUrl,
      source: 'qq',
    }) : null;
    return {
      platform: 'qq-track',
      title: trackInfo.name || '未命名',
      cover: typeof trackInfo.album?.mid === 'string'
        ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${trackInfo.album.mid}.jpg`
        : null,
      pageUrl,
      tracks: [
        {
          id: songmid,
          title: trackInfo.name || '未命名',
          artist: singers,
          pageUrl,
          streamOnly: streamPath === null,
          ...(streamPath === null ? {} : { streamPath }),
          duration: Number(trackInfo.interval) || undefined,
          cover: qqCover(trackInfo),
        },
      ],
    };
  }
  throw createResolveError(ERROR_CODES.UNSUPPORTED_URL, 'qq url has no playlist or songmid', { url });
}

/**
 * YouTube：本机网络不通（实测 www.youtube.com 25s 超时），但代码保留正确的 oembed 调用路径，
 * 环境能通时自动可用；不通时返回 E_RESOLVE_TIMEOUT / E_RESOLVE_BLOCKED，不假装能播。
 * @param {string} url
 * @param {object} ctx
 */
async function resolveYouTube(url, ctx) {
  const parsed = new URL(url);
  const host = normalizeHostname(parsed.hostname);
  let videoId = null;
  if (host === 'youtu.be') {
    videoId = parsed.pathname.split('/').filter(Boolean)[0] || null;
  } else if (parsed.searchParams.get('v')) {
    videoId = parsed.searchParams.get('v');
  } else {
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length >= 2 && ['shorts', 'embed', 'live'].includes(parts[0])) videoId = parts[1];
  }
  const listId = parsed.searchParams.get('list');
  if (!videoId && !listId) {
    throw createResolveError(ERROR_CODES.UNSUPPORTED_URL, 'youtube url has no video or list id', { url });
  }
  if (!videoId) {
    // 纯歌单：oembed 不支持 list，只能给页面兜底，诚实标注不可解析曲目集合。
    throw createResolveError(ERROR_CODES.NO_STREAM, 'YouTube 歌单需要可用的网络环境；当前只支持单视频解析', {
      listId,
    });
  }
  const apiUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;
  const response = await ctx.fetchWithRedirects(apiUrl, { headers: apiHeaders('youtube') });
  if (response.status !== 200) {
    throw createResolveError(ERROR_CODES.DECODE_FAILED, `youtube oembed http ${response.status}`);
  }
  let payload;
  try {
    payload = JSON.parse(response.body);
  } catch (_error) {
    throw createResolveError(ERROR_CODES.DECODE_FAILED, 'youtube oembed returned non-json');
  }
  const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
  return {
    platform: listId ? 'youtube-playlist' : 'youtube-video',
    title: payload.title || '未命名',
    cover: typeof payload.thumbnail_url === 'string' ? payload.thumbnail_url : null,
    pageUrl,
    tracks: [
      {
        title: payload.title || '未命名',
        artist: payload.author_name,
        pageUrl,
        streamOnly: true,
      },
    ],
  };
}

/**
 * 直链音频：只做 HEAD 探活，能 200 且 content-type 是音频/流才给 url，否则 streamOnly。
 * 注意：白名单只放行六个平台域，因此「用户自填的任意直链」默认进不来，
 * 这条分支实际只覆盖平台自身 CDN 里的音频直链（bilibili/网易云/QQ/YouTube 子域）。
 * @param {string} url
 * @param {object} ctx
 */
async function resolveDirectAudio(url, ctx) {
  const headers = apiHeaders(platformOf(normalizeHostname(new URL(url).hostname)));
  let probe = null;
  try {
    probe = await ctx.headProbe(url, { headers });
  } catch (_error) {
    probe = null;
  }
  const contentType = probe && probe.headers ? String(probe.headers['content-type'] || '') : '';
  const playable = Boolean(probe && probe.status >= 200 && probe.status < 300
    && (/^(audio|video)\//i.test(contentType) || /octet-stream|mpegurl|dash\+xml/i.test(contentType)));
  return {
    platform: 'direct-audio',
    title: decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || '音频直链'),
    cover: null,
    pageUrl: url,
    tracks: [
      {
        title: decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || '音频直链'),
        pageUrl: url,
        ...(playable ? { url, streamOnly: false } : { streamOnly: true }),
      },
    ],
  };
}

/* ------------------------------------------------------------------ *
 * 公共入口
 * ------------------------------------------------------------------ */

/**
 * 客户端侧同一套判定（UI 侧快速失败）。host 侧再判一次，两层不做信任传递。
 * @param {string} url
 * @returns {'bilibili-video'|'bilibili-favlist'|'netease-playlist'|'netease-track'
 *   |'qq-playlist'|'qq-track'|'youtube-video'|'youtube-playlist'|'direct-audio'|'unknown'}
 */
export function detectPlatform(url) {
  // 直接转发到共享 parser，不再维护第二份。
  // 历史教训：这份曾经内联实现，网易云分支依赖同文件那个更弱的 neteaseRouteOf，
  // 于是「客户端认得出、宿主认不出」，表现为解析失败但看不出原因。
  try {
    return detectPlatformShared(url);
  } catch (_error) {
    return 'unknown';
  }
}

/** 简单的 LRU + TTL 缓存。只缓存成功结果，错误不缓存（避免把临时故障钉死 5 分钟）。 */
function createCache(ttlMs, maxEntries) {
  const store = new Map();
  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= Date.now()) {
        store.delete(key);
        return undefined;
      }
      store.delete(key);
      store.set(key, entry);
      return entry.value;
    },
    set(key, value) {
      store.delete(key);
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      while (store.size > maxEntries) {
        const oldest = store.keys().next();
        if (oldest.done) break;
        store.delete(oldest.value);
      }
    },
    clear() {
      store.clear();
    },
    get size() {
      return store.size;
    },
  };
}

function cacheKeyOf(url) {
  return createHash('sha256').update(url).digest('hex').slice(0, 32);
}

/**
 * 构造解析 API。返回对象既可直接给路由用，也可被单测直接驱动。
 *
 * @param {object} [options]
 * @param {number} [options.timeoutMs]
 * @param {number} [options.maxRedirects]
 * @param {number} [options.maxBodyBytes]
 * @param {number} [options.cacheTtlMs]
 * @param {number} [options.cacheMaxEntries]
 * @param {Function} [options.lookup] 注入 DNS 校验（单测）
 * @param {Function} [options.request] 注入请求实现（单测）
 * @returns {{ resolve:(url:string)=>{ok:boolean,code?:string,result?:object,ms?:number}, cache:object, options:object }}
 */
export function createResolveApi(options = {}) {
  const settings = {
    timeoutMs: options.timeoutMs ?? DEFAULTS.timeoutMs,
    maxRedirects: options.maxRedirects ?? DEFAULTS.maxRedirects,
    maxBodyBytes: options.maxBodyBytes ?? DEFAULTS.maxBodyBytes,
    cacheTtlMs: options.cacheTtlMs ?? DEFAULTS.cacheTtlMs,
    cacheMaxEntries: options.cacheMaxEntries ?? DEFAULTS.cacheMaxEntries,
  };
  const cache = createCache(settings.cacheTtlMs, settings.cacheMaxEntries);
  const lookup = options.lookup;
  const requestFn = options.request;

  const transport = (url, extra = {}) => fetchWithRedirects(url, {
    timeoutMs: settings.timeoutMs,
    maxRedirects: settings.maxRedirects,
    maxBodyBytes: settings.maxBodyBytes,
    lookup,
    request: requestFn,
    ...extra,
  });

  const headProbe = async (url, extra = {}) => {
    // 简化：直接 GET 但立即放弃 body。对 HEAD 不友好的 CDN 更稳。
    const response = await transport(url, extra);
    return { status: response.status, headers: response.headers };
  };

  const ctx = {
    fetchWithRedirects: transport,
    headProbe,
    // 票据表：有它才去取平台直链，也只有它能签出客户端可用的取流路径。
    // 单测不注入时 ctx.mediaTokens 为 undefined，两条平台路径自动退回 streamOnly。
    mediaTokens: options.mediaTokens,
    get host() {
      return currentHost;
    },
  };
  let currentHost = '';

  async function resolveOnce(rawUrl, want) {
    const url = normalizeUrl(rawUrl);
    if (!isUrlAllowed(url)) {
      throw createResolveError(ERROR_CODES.RESOLVE_BLOCKED, '域名不在白名单内', { url });
    }
    const parsed = new URL(url);
    const host = normalizeHostname(parsed.hostname);
    currentHost = host;
    const platform = platformOf(host);
    if (platform === 'bilibili') {
      if (parsed.pathname.includes('favlist') || (host === 'space.bilibili.com' && parsed.searchParams.get('fid'))) {
        return resolveBilibiliFavlist(url, ctx);
      }
      return resolveBilibili(url, ctx);
    }
    // 只有这两个平台会按「要几首」去取直链。其余平台一次解析就一首（或整段），
    // 强塞 limit 只会让签名多一层没人读的参数。
    if (platform === 'netease') return resolveNetease(url, ctx, want);
    if (platform === 'qq') return resolveQQ(url, ctx, want);
    if (platform === 'youtube') return resolveYouTube(url, ctx);
    if (/\.(mp3|m4a|aac|flac|wav|ogg|oga|opus|weba|m3u8|mpd)$/i.test(parsed.pathname)) return resolveDirectAudio(url, ctx);
    throw createResolveError(ERROR_CODES.UNSUPPORTED_URL, '该域名下没有可解析的链接形态', { url });
  }

  return {
    cache,
    options: settings,
    /**
     * 解析一个链接。永不抛出：失败以 { ok:false, code, message } 返回。
     *
     * `limit` 只对网易云、QQ 音乐的歌单/单曲生效：它决定「要几首可播曲目」。
     * **必须进缓存键** —— 否则先按 10 首解析一次、再改成 30 首重发，会命中原先
     * 那份只有 10 首的缓存，用户改完设置却发现没变化。
     *
     * @param {string} rawUrl
     * @param {number} [limit]
     * @returns {Promise<{ok:true,result:object,ms:number,cached:boolean}|{ok:false,code:string,message:string,ms:number}>}
     */
    async resolve(rawUrl, limit) {
      const startedAt = Date.now();
      const want = clampTrackLimit(limit);
      let key = null;
      try {
        const normalized = normalizeUrl(rawUrl);
        key = cacheKeyOf(`${normalized}\u0000${want}`);
        const hit = cache.get(key);
        if (hit !== undefined) {
          return { ok: true, result: hit, ms: Date.now() - startedAt, cached: true };
        }
        const result = await resolveOnce(normalized, want);
        cache.set(key, result);
        return { ok: true, result, ms: Date.now() - startedAt, cached: false };
      } catch (error) {
        const code = error && typeof error.code === 'string' && Object.values(ERROR_CODES).includes(error.code)
          ? error.code
          : ERROR_CODES.DECODE_FAILED;
        return {
          ok: false,
          code,
          message: error && typeof error.message === 'string' ? error.message : 'unknown error',
          ...(error && error.detail ? { detail: error.detail } : {}),
          ms: Date.now() - startedAt,
        };
      }
    },
  };
}

/** 无状态提示：本模块不落盘、不读配置、不持有除内存缓存外的任何状态。 */
export const STATELESS = true;

/**
 * 把 Web Fetch Request 转成本模块的解析调用并回 Response。
 * 与宿主约定一致：路由只做协议适配，业务全在 createResolveApi。
 * @param {Request} request
 * @param {{ resolve:(url:string)=>Promise<object> }} api
 * @returns {Promise<Response>}
 */
export async function handleResolveRequest(request, api) {
  const baseHeaders = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(JSON.stringify({ ok: false, code: ERROR_CODES.UNSUPPORTED_URL, message: 'only GET' }), {
      status: 405,
      headers: { ...baseHeaders, allow: 'GET, HEAD' },
    });
  }
  const params = new URL(request.url).searchParams;
  const url = params.get('url');
  if (!url) {
    return new Response(JSON.stringify({ ok: false, code: ERROR_CODES.UNSUPPORTED_URL, message: 'missing url parameter' }), {
      status: 400,
      headers: baseHeaders,
    });
  }
  // limit 走 query 而不是塞进 url：url 里已经带着平台的原始查询串，混在一起
  // 会把 limit 一起转发给平台接口。
  const outcome = await api.resolve(url, params.get('limit'));
  const status = outcome.ok ? 200 : statusForCode(outcome.code);
  const body = request.method === 'HEAD' ? null : JSON.stringify(outcome);
  return new Response(body, { status, headers: baseHeaders });
}

/**
 * 注册解析路由。**这是 index.js 唯一需要调用的东西。**
 *
 * 用法（index.js 里照抄三行）：
 *   import { registerResolveRoute } from './src/host/resolve.js';
 *   ctx.inject(['connection'], (inner) => {
 *     inner.effect(() => registerResolveRoute(inner), 'dsh-music-on: resolve route');
 *   });
 *
 * 为什么必须是 ctx.connection.fetch.register：
 * 宿主在 dsh-client-connection 里已经把 `/api` 前缀路由挂好了（lib/index.js:1044-1058），
 * 并且对每个 exact Fetch route 强制 peer.principal.kind === "owner"（L822-836），
 * 非 owner 一律 403。裸用 ctx.webServer.register 会绕过登录态、Host/Origin 校验与 owner 判定。
 *
 * @param {object} ctx cordis 上下文（需有 connection 服务）
 * @param {object} [options] 透传 createResolveApi 的选项（单测可注入 request/lookup）
 * @returns {() => void} 同步 disposer；ctx.connection.fetch.register 返回的异步 disposer
 *   会被 `void` 掉，卸载由 fiber 负责。
 */
export function registerResolveRoute(ctx, options = {}) {
  const connection = ctx && Reflect.get(ctx, 'connection');
  if (!connection || !connection.fetch || typeof connection.fetch.register !== 'function') {
    throw new Error('dsh-music-on: ctx.connection.fetch.register unavailable');
  }
  const api = createResolveApi(options);
  connection.fetch.register({
    path: RESOLVE_PATH,
    methods: ['GET', 'HEAD'],
    requestBody: 'buffered',
    fetch: (request) => handleResolveRequest(request, api),
  });
  return () => {
    api.cache.clear();
  };
}

/** 单测入口：暴露内部件，避免为了测量而导出生产 API。 */
export const __test = {
  normalizeUrl,
  normalizeHostname,
  isIpLiteral,
  isPrivateIPv4,
  isPrivateIPv6,
  isPublicAddress,
  createPinnedLookup,
  createCache,
  cacheKeyOf,
  neteaseRouteOf,
  neteaseArtists,
  neteaseDuration,
  neteaseCover,
  qqCover,
  neteasePlaylistTracks,
  safeExtract,
  platformOf,
  fetchWithRedirects,
  httpGet,
};
