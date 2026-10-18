/**
 * dsh-music-on · 链接入口（把「粘贴的一坨文本」分流成引擎能播的东西）
 *
 * 为什么需要这一层：`engine.addUrl` 只是把字符串塞进 `audio.src`，它假定你给的
 * 是**音频文件的直链**。用户粘贴的是 B站/网易云/QQ音乐的**页面地址**，Chromium
 * 拿去当媒体源会直接抛
 *   `Failed to load because no supported source was found.`
 * 所以粘贴进来的东西必须先判类型，再分别走三条通道：
 *
 *   1) 直链音频（.mp3/.m4a/.wav/...）  → engine.addUrl
 *   2) 站内可代理音频（白名单域内）    → 走 /api/dsh-music-on/stream 交给宿主代取
 *   3) B站视频（BV 号）                → 双轨：先试流代理（真频谱），失败落 iframe
 *   4) 网易云 / QQ音乐 歌单或单曲      → 只入队 + 给「打开原平台」跳转，不假装能播
 *   5) 一段文本里混着多条链接          → 逐条处理，返回明细
 *
 * 设计原则：**绝不假装能播**。平台不给直链就不给，把原因写清楚（unavailableReason），
 * 而不是塞个假 src 让播放器报英文错。
 */

import { detectPlatform, extractId, normalizeUrl, isUrlAllowed, describeError } from './parser.js';
import { recordHistoryMany } from './library.js';

/** 站内解析路由。与 src/shared.js 的 RESOLVE_PATH 同源（这里用字面量便于单测）。 */
export const RESOLVE_PATH = '/api/dsh-music-on/resolve';
/** 流代理路由。 */
export const STREAM_PATH = '/api/dsh-music-on/stream';

/** B站 BV 号。 */
const BV_RE = /^BV[0-9A-Za-z]{10}$/;

/** 一眼就能当音频直链的扩展名。 */
const AUDIO_EXT_RE = /\.(mp3|m4a|aac|wav|flac|ogg|oga|opus|weba|webm)(\?|#|$)/i;

/** 从任意文本里抠出所有 http(s) 链接，去掉末尾的标点。 */
export function extractUrls(text) {
  const source = typeof text === 'string' ? text : '';
  const hits = source.match(/https?:\/\/[^\s<>"']+/gi) || [];
  const cleaned = hits.map((raw) =>
    raw.replace(/[),.;:!?\]}]+$/, (tail) => (tail.includes('?') || tail.includes('#') ? tail : tail.replace(/[.,;:!?]+$/, ''))),
  );
  if (cleaned.length > 0) return Array.from(new Set(cleaned));
  // 用户可能只粘了 `music.163.com/playlist?id=1` 这种丢了协议的
  const bare = source.trim();
  if (bare !== '' && !/\s/.test(bare) && /^[\w.-]+\.[a-z]{2,}\//i.test(bare)) return [`https://${bare}`];
  // 或者干脆就是一个 BV 号
  if (BV_RE.test(bare)) return [`https://www.bilibili.com/video/${bare}`];
  if (/^av\d+$/i.test(bare)) return [`https://www.bilibili.com/video/${bare}`];
  return [];
}

/**
 * 判一条链接该走哪条路。纯函数、无网络、无副作用，单测直接打这里。
 *
 * @param {string} url
 * @returns {{ route: 'audio-direct'|'stream'|'bilibili'|'platform'|'unsupported',
 *             platform: string|null, ids: object, reason: string|null }}
 */
export function classifyUrl(url) {
  // normalizeUrl 对非法输入是**抛错**（E_UNSUPPORTED_URL）而不是返回 null，
  // 所以这里必须 try：用户随手粘一段乱码不该让整条入队流程炸掉。
  let normalized;
  try {
    normalized = normalizeUrl(url);
  } catch (_error) {
    normalized = null;
  }
  if (!normalized) {
    return { route: 'unsupported', platform: null, ids: {}, reason: '不是合法的 http(s) 链接' };
  }

  const platform = detectPlatform(normalized);
  const ids = (platform && extractId(normalized, platform)) || {};

  if (platform === 'bilibili-video' || platform === 'bilibili-short') {
    return { route: 'bilibili', platform, ids, reason: null };
  }
  if (platform === 'bilibili-audio') {
    return { route: 'bilibili', platform, ids, reason: null };
  }

  // 平台页面一律只给跳转。注意这里不能只匹配已知的 platform 字面量：
  // parser 对同域不同路径会给出 `netease-track` / `qq-*` 这类更细的名字，
  // 漏掉任何一个都会让它掉进下面的 `stream` 分支，最后变成一次必然失败的代理。
  if (isPlatformPage(platform)) {
    return { route: 'platform', platform, ids, reason: platformReason(platform) };
  }

  if (AUDIO_EXT_RE.test(normalized)) {
    return { route: 'audio-direct', platform, ids, reason: null };
  }
  // 已知平台的域内页面（例如 parser 因为 id 形状不准则返回 unknown 的 QQ 单曲页）：
  // 交给宿主解析试一次 —— 它认得出路径里的 id 就能出可播曲目，认不出才退回跳转。
  if (isPlatformHost(normalized)) {
    return { route: 'platform', platform, ids, reason: '该平台链接会交给宿主解析，解析不出可播曲目时退回「打开原平台」' };
  }
  // 白名单域内的未知页面：让宿主 resolve 判一次（它可能认出裸音频流）
  if (isUrlAllowed(normalized)) {
    return { route: 'stream', platform, ids, reason: null };
  }
  return { route: 'unsupported', platform, ids, reason: '不在受支持的音乐平台或音频直链范围内' };
}

/** 域名是否属于「只有页面、没有可代理直链」的平台。 */
function isPlatformHost(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'music.163.com' || host === 'y.qq.com' || host.endsWith('.y.qq.com')
      || host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be';
  } catch (_error) {
    return false;
  }
}

/** parser 给出的平台名是否属于「只能跳转、没有直链」的那一类。 */
function isPlatformPage(platform) {
  if (typeof platform !== 'string' || platform === '' || platform === 'unknown') return false;
  return platform.startsWith('netease') || platform.startsWith('qq') || platform.startsWith('youtube');
}

function platformReason(platform) {
  if (platform.startsWith('netease')) return '网易云链接会解析成可播放曲目，需要会员的曲目只能跳原平台';
  if (platform.startsWith('qq')) return 'QQ音乐链接会解析成可播放曲目，需要会员的曲目只能跳原平台';
  return 'YouTube 需要额外解码服务，这里只做跳转';
}

/** B站的 embed 播放器地址（走官方 iframe，能出声但拿不到频谱）。 */
export function buildBilibiliEmbedUrl(ids, page) {
  const spec = ids || {};
  if (typeof spec.bvid === 'string' && BV_RE.test(spec.bvid)) {
    const p = Number.isInteger(page) && page > 0 ? page : 1;
    return `https://player.bilibili.com/player.html?bvid=${spec.bvid}&p=${p}&autoplay=1&danmaku=0&high_quality=1`;
  }
  if (spec.aid) {
    return `https://player.bilibili.com/player.html?aid=${String(spec.aid)}&autoplay=1&danmaku=0&high_quality=1`;
  }
  return null;
}

/** 同源 fetch 的 JSON 封装；解析路由要求 owner principal，所以带 credentials。 */
async function fetchJson(url, { fetchImpl, signal } = {}) {
  const doFetch = fetchImpl || (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null);
  if (!doFetch) throw new Error('当前环境没有 fetch');
  const response = await doFetch(url, {
    method: 'GET',
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
    signal,
  });
  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body && (body.message || body.code) ? `：${body.message || body.code}` : '';
    } catch (_error) {
      /* 响应体不是 JSON，忽略 */
    }
    throw new Error(`解析服务返回 HTTP ${response.status}${detail}`);
  }
  return await response.json();
}

/**
 * 调宿主解析路由，拿一条 B站链接的 cid / 标题 / 时长。
 * 失败一律降级为 iframe，不阻断入队。
 *
 * **契约必须与 src/host/resolve.js 对齐**：宿主返回的是
 *   { ok:true, result:{ platform, title, cover, pageUrl, tracks:[{title,artist,bvid,cid,duration,streamOnly}] }, ms, cached }
 * 包在 `result` 里，曲目在 `tracks[]` 里 —— 不是顶层的 `track`。
 * 之前这里读 `body.track`，永远读不到，于是 cid 恒为 null，
 * 引擎只能拿 bvid 拼出 `?bvid=..` 而没有 cid，流代理白白多打一次 view 接口。
 *
 * @returns {Promise<{ ok: boolean, cid?: string|number, title?: string, duration?: number, streamOnly?: boolean, error?: string }>}
 */
export async function resolveBilibili(url, { fetchImpl } = {}) {
  const target = `${RESOLVE_PATH}?url=${encodeURIComponent(url)}`;
  try {
    const body = await fetchJson(target, { fetchImpl });
    if (!body || body.ok === false) {
      throw new Error((body && body.message) || (body && body.code) || '解析服务返回失败');
    }
    const result = body.result || body;
    const tracks = Array.isArray(result.tracks) ? result.tracks : [];
    const track = tracks[0];
    if (!track) throw new Error((body && body.message) || '解析结果没有曲目');
    return {
      ok: true,
      cid: track.cid,
      title: track.title || result.title,
      duration: typeof track.duration === 'number' ? track.duration : undefined,
      streamOnly: track.streamOnly !== false,
      // 封面可能挂在 result 顶层（视频级 pic），也可能在 track 上；两处都认。
      cover: track.cover || result.cover || null,
    };
  } catch (error) {
    return { ok: false, error: error && error.message ? error.message : String(error) };
  }
}

/**
 * 客户端侧最多接收多少首（硬上限，不是默认值）。
 *
 * 「要几首」由设置项 `platformTrackLimit` 决定并作为 `limit` 传给宿主，
 * 宿主按那个数去凑；这里只是防一条异常响应把队列撑爆的最后一道闸。
 *
 * **必须与宿主侧 `MAX_TRACK_LIMIT`（200）相等**。宿主最多签 200 张票据，
 * 客户端截得比它小就是白扔票据；截得比它大则超出的那部分根本没有 streamPath，
 * 只会在下面被当作会员曲目跳过。
 */
export const MAX_PLATFORM_TRACKS = 200;

/** 平台标识 → 引擎识别的 source 名。 */
function platformKeyOf(platform) {
  if (typeof platform !== 'string') return null;
  if (platform.startsWith('netease')) return 'netease';
  if (platform.startsWith('qq')) return 'qq';
  if (platform.startsWith('youtube')) return 'youtube';
  if (platform.startsWith('bilibili')) return 'bilibili';
  return null;
}

/**
 * 调宿主解析路由，拿一个平台链接（网易云 / QQ音乐）的曲目清单。
 *
 * **契约必须与 src/host/resolve.js 对齐**：宿主返回
 *   { ok:true, result:{ platform, title, cover, pageUrl,
 *                       tracks:[{ id, title, artist, pageUrl, streamOnly, streamPath?, duration }] } }
 * `streamPath` 是宿主签发的票据路径（`/api/dsh-music-on/stream?mt=...`），
 * 有了它这首**真的能播且频谱是真的**；没有它说明是 VIP 曲，只能跳原平台。
 *
 * 早期版本把平台页面直接塞进 iframe —— 那两个站都设了 X-Frame-Options /
 * CSP frame-ancestors，iframe 必然白屏，等于什么都没发生。
 *
 * @param {string} url
 * @param {{ fetchImpl?: Function, limit?: number }} [deps]
 * @returns {Promise<{ ok:boolean, platform?:string, title?:string, tracks?:object[], scanned?:number, error?:string }>}
 */
export async function resolvePlatform(url, { fetchImpl, limit } = {}) {
  // limit 交给宿主去「凑够 N 首能播的」——筛会员曲目必须在服务端做，
  // 客户端拿到的每一首都已经签好票据了。
  const limitPart = Number.isFinite(Number(limit)) && Number(limit) > 0
    ? `&limit=${Math.trunc(Number(limit))}`
    : '';
  const target = `${RESOLVE_PATH}?url=${encodeURIComponent(url)}${limitPart}`;
  try {
    const body = await fetchJson(target, { fetchImpl });
    if (!body || body.ok === false) {
      throw new Error((body && body.message) || (body && body.code) || '解析服务返回失败');
    }
    const result = body.result || body;
    const tracks = Array.isArray(result.tracks) ? result.tracks : [];
    if (tracks.length === 0) throw new Error('解析结果没有曲目');
    return {
      ok: true,
      platform: result.platform || null,
      title: result.title || null,
      cover: result.cover || null,
      pageUrl: result.pageUrl || url,
      // scanned 是宿主的诊断值：扫了多少首候选才凑出这些。有了它才能如实说
      // 「跳过 12 首会员曲目」，而不是让用户以为歌单只有 30 首。
      scanned: Number.isFinite(Number(result.scanned)) ? Number(result.scanned) : null,
      tracks,
    };
  } catch (error) {
    return { ok: false, error: error && error.message ? error.message : String(error) };
  }
}

/**
 * 把一批链接灌进引擎。这是 UI 唯一需要调用的入口。
 *
 * **会真的开始播**：所有 add* 都带 `playFirst`，引擎的语义是
 * 「playFirst && 当前没有在播」→ loadAt(..., {autoplay:true})。
 * 之前没传这个参数，所以卡片上显示「已加入」却一声不响——那是参数没给，不是播放器坏了。
 *
 * @param {object} engine createEngine() 的产物
 * @param {string} text   用户粘贴的原始文本
 * @param {{ fetchImpl?: Function, playFirst?: boolean, limit?: number }} [deps]
 *   `limit`：歌单最多要几首**能播的**曲目，由设置项 `platformTrackLimit` 提供。
 *   不传时宿主按默认 60 首处理。
 * @returns {Promise<{ added: number, skipped: number, items: object[], errors: string[] }>}
 */
export async function intakeLinks(engine, text, deps = {}) {
  const urls = extractUrls(text);
  const report = { added: 0, skipped: 0, items: [], errors: [] };
  const playFirst = deps.playFirst !== false;
  // 成功入队的链接攒在这里，循环结束统一写一次历史。
  // 逐条写会触发 N 次广播 → 设置页的收藏/历史表重渲染 N 次。
  const recorded = [];

  if (urls.length === 0) {
    report.errors.push('没认出链接：请粘贴以 http(s) 开头的 B站 / 网易云 / QQ音乐 地址，或直接拖入音频文件');
    return report;
  }
  if (!engine || typeof engine.addUrl !== 'function') {
    report.errors.push('播放引擎未就绪');
    return report;
  }

  for (const url of urls) {
    const verdict = classifyUrl(url);
    try {
      if (verdict.route === 'audio-direct') {
        await engine.addUrl(url, { playFirst });
        report.items.push({ url, route: verdict.route, added: true });
        report.added += 1;
        recorded.push({ url, platform: verdict.platform });
        continue;
      }

      if (verdict.route === 'bilibili') {
        const resolved = await resolveBilibili(url, deps);
        const embedUrl = buildBilibiliEmbedUrl(verdict.ids, verdict.ids && verdict.ids.page);
        // cid 只在**确实是合法正整数**时才往下传。之前把 track.cid 原样透传，
        // 上游若给 0 或字符串 '0'，会拼出 `?bvid=..&cid=0`，宿主随即拿着 0 去问
        // playurl，得到一个必然失败的响应 —— 表现就是「加入成功但没声音」。
        const cid = resolved.ok ? toSafeCid(resolved.cid) : null;
        // 标题兜底：解析失败时宁可显示可读的站内标识，也不要只甩一个裸 BV 号。
        const title = resolved.title || (verdict.ids && verdict.ids.bvid ? `Bilibili ${verdict.ids.bvid}` : url);
        // 封面：宿主解析层已从 view 接口的 data.pic 取到并转成 https。
        // 这里原样透传，UI 侧负责 <img> 失败时退回黑胶图形。
        const cover = resolved.ok && typeof resolved.cover === 'string' && resolved.cover
          ? resolved.cover
          : null;
        await engine.addBilibili({
          bvid: verdict.ids && verdict.ids.bvid,
          cid: cid === null ? undefined : cid,
          page: verdict.ids && verdict.ids.page,
          title,
          duration: resolved.duration,
          embedUrl,
          cover,
          // 注意：unavailableReason 只描述「流代理主路为什么不可用」，
          // 不能因为解析失败就把整条曲目标成不可用 —— embedUrl 还在，照样能出声。
          unavailableReason: resolved.ok ? null : (resolved.error || null),
        }, { playFirst });
        report.items.push({ url, route: 'bilibili', added: true, cid, title, note: resolved.ok ? null : resolved.error });
        report.added += 1;
        recorded.push({ url, title, platform: verdict.platform, kind: 'bilibili' });
        continue;
      }

      if (verdict.route === 'stream') {
        await engine.addUrl(`${STREAM_PATH}?url=${encodeURIComponent(url)}`, { playFirst });
        report.items.push({ url, route: 'stream', added: true });
        report.added += 1;
        recorded.push({ url, platform: verdict.platform });
        continue;
      }

      if (verdict.route === 'platform') {
        // 平台链接走真解析：宿主批量取直链并签发票据，客户端拿票据取流。
        // 宿主侧已经按「凑够 N 首能播的」筛过一轮，返回的曲目基本都带 streamPath；
        // 这里再兜一次：**没有票据的曲目直接跳过，不进队列**。
        // 早期版本把它们塞进队列并标「无直链」，结果列表里一堆点下去就报错的灰条，
        // 用户只会归咎于「这播放器坏了」。
        const resolved = await resolvePlatform(url, deps);
        if (resolved.ok !== true) {
          report.skipped += 1;
          report.errors.push(`${url}：${resolved.error || '解析失败'}`);
          report.items.push({ url, route: 'platform', added: false, note: resolved.error });
          continue;
        }
        const platformKey = platformKeyOf(resolved.platform || verdict.platform);
        const list = resolved.tracks.slice(0, MAX_PLATFORM_TRACKS);
        // playFirst 只给**第一首**：引擎的语义是「队列里还没有当前曲目时才自动开播」，
        // 后续每首再传 true 也不会重复触发，但显式只在首条传更贴合意图。
        let firstOfBatch = report.added === 0;
        let addedHere = 0;
        let vipSkipped = 0;
        for (const track of list) {
          const streamPath = typeof track.streamPath === 'string' && track.streamPath !== '' ? track.streamPath : null;
          if (streamPath === null) {
            vipSkipped += 1;
            continue;
          }
          await engine.addPlatform({
            streamPath,
            pageUrl: track.pageUrl || resolved.pageUrl || url,
            // 源歌单地址：票据 10 分钟过期，刷新后只能靠它重新解析。
            sourceUrl: url,
            title: track.title || resolved.title || url,
            artist: track.artist,
            duration: track.duration,
            platform: platformKey,
            id: track.id,
            // 逐曲封面优先；单曲链接时宿主把封面放在 result 顶层，回落到它。
            cover: (typeof track.cover === 'string' && track.cover !== ''
              ? track.cover
              : (typeof resolved.cover === 'string' && resolved.cover !== '' ? resolved.cover : undefined)),
            reason: null,
          }, { playFirst: playFirst && firstOfBatch });
          firstOfBatch = false;
          addedHere += 1;
          report.added += 1;
          recorded.push({
            url: track.pageUrl || url,
            title: track.title || resolved.title,
            platform: platformKey,
            kind: 'platform',
          });
        }
        if (addedHere === 0) {
          report.skipped += 1;
          const why = vipSkipped > 0
            ? `解析到 ${vipSkipped} 首但都需要会员，拿不到可播地址`
            : '解析结果里没有可播曲目';
          report.errors.push(`${url}：${why}`);
          report.items.push({ url, route: 'platform', added: false, note: why });
          continue;
        }
        // 提示里如实说出「扫了多少、跳了多少」，否则用户会以为歌单就这么几首。
        const notes = [];
        if (vipSkipped > 0) notes.push(`跳过 ${vipSkipped} 首会员曲目`);
        const truncated = resolved.tracks.length - list.length;
        if (truncated > 0) notes.push(`另有 ${truncated} 首未入队（一次最多 ${MAX_PLATFORM_TRACKS} 首）`);
        report.items.push({
          url,
          route: 'platform',
          added: true,
          title: resolved.title || platformLabel(verdict.platform),
          note: notes.length > 0 ? notes.join('，') : null,
        });
        continue;
      }

      report.skipped += 1;
      report.errors.push(`${url}：${verdict.reason || '不受支持'}`);
      report.items.push({ url, route: verdict.route, added: false, note: verdict.reason });
    } catch (error) {
      report.skipped += 1;
      report.errors.push(`${url}：${describeError(error)}`);
      report.items.push({ url, route: verdict.route, added: false, note: describeError(error) });
    }
  }

  // 历史只在真正入队之后写。失败的那些不记 —— 历史列表里塞满「打不开的死链」
  // 比没有历史更糟。写库本身包在 try 里：存储坏了不能反过来把入队结果毁掉。
  if (recorded.length > 0) {
    try {
      recordHistoryMany(recorded);
    } catch (_error) {
      // 历史是附加价值，落不下不影响这次播放。
    }
  }

  return report;
}

/**
 * cid 规整成「合法正整数或 null」。
 *
 * 为什么必须卡：宿主 stream 路由的 `parseStreamQuery` 只认 `^\d{1,20}$`，
 * 但 `0`、`''`、`null`、`'undefined'` 都能从上游 JSON 里流出来。
 * 拼进查询串后要么被宿主当缺失（多打一次 view），要么直接拿 0 去问 playurl，
 * 拿回一个必然失败的响应 —— 界面表现为「已加入，但没声音」，且没有任何报错。
 *
 * @param {unknown} value
 * @returns {string|null}
 */
function toSafeCid(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!/^\d{1,20}$/.test(text)) return null;
  const num = Number(text);
  if (!Number.isSafeInteger(num) || num <= 0) return null;
  return text;
}

/** 平台的中文名，给队列行显示。 */
export function platformLabel(platform) {
  switch (platform) {
    case 'netease-playlist': return '网易云歌单';
    case 'netease-song':
    case 'netease-track': return '网易云单曲';
    case 'netease-album': return '网易云专辑';
    case 'qq-playlist': return 'QQ音乐歌单';
    case 'qq-song':
    case 'qq-track': return 'QQ音乐单曲';
    case 'qq-album': return 'QQ音乐专辑';
    case 'youtube-video': return 'YouTube';
    default: return null;
  }
}

/**
 * 给 UI 用的一句话小结。
 *
 * **必须把「加入了，但主路失败」的原因说出来。**
 * 之前这里只拼「已加入 N 条」，把 item.note 里的解析失败信息全吞掉，
 * 于是界面上是一条漂亮的绿色提示，用户耳朵里却是静音 —— 诊断信息被自己的
 * 成功文案掩盖了。现在只要有任何一条带着 note 加入，就把原因追在后面。
 *
 * @param {{ added: number, skipped: number, items: object[], errors: string[] }} report
 * @returns {string}
 */
export function summarizeReport(report) {
  if (!report) return '';
  const parts = [];
  if (report.added > 0) parts.push(`已加入 ${report.added} 条`);
  if (report.skipped > 0) parts.push(`跳过 ${report.skipped} 条`);
  const items = Array.isArray(report.items) ? report.items : [];
  const notes = items
    .filter((item) => item && item.added === true && typeof item.note === 'string' && item.note !== '')
    .map((item) => item.note);
  if (notes.length > 0) parts.push(`但：${notes[0]}`);
  if (report.errors.length > 0 && report.added === 0) parts.push(report.errors[0]);
  return parts.join('，');
}

/**
 * 报告里是否有「入队成功但主路不可用」的条目。
 * UI 据此把提示语气从 ok 改成 bad：绿色提示配静音是最坏的组合。
 *
 * @param {{ items?: object[] }} report
 * @returns {boolean}
 */
export function hasDegradedItem(report) {
  const items = report && Array.isArray(report.items) ? report.items : [];
  return items.some((item) => item && item.added === true && typeof item.note === 'string' && item.note !== '');
}

export const __test = { extractUrls, classifyUrl, buildBilibiliEmbedUrl, platformLabel, summarizeReport, toSafeCid, AUDIO_EXT_RE, BV_RE };
