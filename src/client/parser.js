/**
 * dsh-music-on · 客户端链接解析（纯函数，零副作用）
 *
 * 设计铁律：
 * 1) 本文件不 import 任何浏览器 API、DOM、fetch、node 内置模块。node --test 可直接 import。
 * 2) 所有函数是纯函数：同一输入永远同一输出，不读时钟、不读环境。
 * 3) 安全判定与网络无关：白名单是文本级判定，host 侧还要再过一次同样的判定逐跳校验。
 *    两层重复不是冗余——客户端这层只是快速失败与 UI 提示，真正的边界在 host。
 *
 * 支持的 URL 形态全部来自实测（见 test/parser.test.js 的正例表）。
 */

/** 平台标识。 */
export const PLATFORMS = Object.freeze([
  'bilibili-video',
  'bilibili-favlist',
  'netease-playlist',
  'netease-track',
  'qq-playlist',
  'qq-track',
  'youtube-video',
  'youtube-playlist',
  'direct-audio',
  'unknown',
]);

/** 错误码全集。host 与 client 共用同一套字面量，UI 直接展示。 */
export const ERROR_CODES = Object.freeze({
  UNSUPPORTED_URL: 'E_UNSUPPORTED_URL',
  RESOLVE_TIMEOUT: 'E_RESOLVE_TIMEOUT',
  RESOLVE_BLOCKED: 'E_RESOLVE_BLOCKED',
  NO_STREAM: 'E_NO_STREAM',
  DECODE_FAILED: 'E_DECODE_FAILED',
  // 仅在「调用方把 host 返回的 JSON 交给 normalizeResult」这一侧出现：
  BAD_RESPONSE: 'E_BAD_RESPONSE',
});

/**
 * 白名单根域。判定规则是「等于 s 或以后缀 .s 结尾」，不做子串包含判断
 * （否则 `evilbilibili.com`、`bilibili.com.evil.tld` 都会误判通过）。
 */
export const ALLOWED_DOMAINS = Object.freeze([
  'bilibili.com',
  'b23.tv',
  'music.163.com',
  'y.qq.com',
  'youtube.com',
  'youtu.be',
]);

/** 直链音频的扩展名白名单（只用于 direct-audio 判定，不代表一定能播）。 */
const AUDIO_EXTENSIONS = Object.freeze([
  '.mp3', '.m4a', '.aac', '.flac', '.wav', '.ogg', '.oga', '.opus', '.weba', '.m3u8', '.mpd',
]);

/** 明确拒绝的协议。http/https 之外的一切都拒绝（含 file:、data:、javascript:、blob: 等）。 */
const ALLOWED_PROTOCOLS = Object.freeze(['http:', 'https:']);

/** bilibili 视频号/番剧号形态。BV 号固定 12 位（BV + 10 位 base58）；av 号纯数字。 */
const BVID_RE = /^BV[0-9A-Za-z]{10}$/;
const AVID_RE = /^av[0-9]+$/i;
const EPID_RE = /^ep[0-9]+$/i;
const SSID_RE = /^ss[0-9]+$/i;

/* ------------------------------------------------------------------ *
 * 错误对象
 * ------------------------------------------------------------------ */

/**
 * 构造带 code 的错误。与普通 Error 的区别：code 永远在顶层，UI 可直接复制。
 * @param {string} code 错误码（ERROR_CODES 之一）
 * @param {string} message 面向用户的中文原因
 * @param {Record<string, unknown>} [detail] 附加诊断信息（不含任何机密）
 * @returns {Error & { code: string, detail?: object }}
 */
export function createResolveError(code, message, detail) {
  const error = new Error(message);
  error.name = 'MusicOnResolveError';
  error.code = code;
  if (detail !== undefined) error.detail = detail;
  return error;
}

/** 判断任意值是否本模块产出的错误（跨模块实例判断，不依赖 instanceof）。 */
export function isResolveError(value) {
  if (!value || typeof value !== 'object') return false;
  if (value.name !== 'MusicOnResolveError') return false;
  return Object.values(ERROR_CODES).includes(value.code);
}

/* ------------------------------------------------------------------ *
 * URL 归一与安全判定
 * ------------------------------------------------------------------ */

/**
 * 把用户粘贴的输入归一成可解析的 URL 字符串。
 * 处理四类输入：完整 URL、缺协议的 `www.bilibili.com/...`、带空白的粘贴、网易云 `#/` 路由。
 *
 * 关键防御：
 * - 先把整个串做一次 percent-decode，让 `%2f%2f`、`%40` 之类的编码绕过在判定前暴露。
 *   解码是循环的（最多 3 轮），防 `%252f` 二次编码。
 * - 只保留 http/https；`java\tscript:` 这类带控制字符的伪协议在 URL 构造后必然失败，直接拒绝。
 *
 * @param {unknown} input 用户输入
 * @returns {string} 归一后的 URL 字符串
 * @throws {Error & {code:string}} E_UNSUPPORTED_URL
 */
export function normalizeUrl(input) {
  if (typeof input !== 'string') {
    throw createResolveError(ERROR_CODES.UNSUPPORTED_URL, '输入必须是字符串');
  }
  // 1) 去掉所有控制字符与首尾空白（粘贴常带 \u200b、换行、制表符）。
  let text = input.replace(/[\u0000-\u001f\u007f\u200b-\u200f\ufeff]/g, '').trim();
  if (text === '') {
    throw createResolveError(ERROR_CODES.UNSUPPORTED_URL, '输入为空');
  }

  // 2) 循环解码，最多 3 轮；decode 失败就停在上一轮（畸形百分号编码不是绕过手段，会在 URL 构造处失败）。
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
  // 解码后如果赫然出现内网字面量，直接判死（连协议补全都省了）。
  text = decoded;

  // 3) 补协议：只对「看起来像域名」的输入补 https，其余保持原样交给 URL 构造器拒绝。
  if (!/^[A-Za-z][A-Za-z0-9+.-]*:/.test(text)) {
    if (/^\/\//.test(text)) text = `https:${text}`;
    else if (/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+([/?#]|$)/.test(text)) text = `https://${text}`;
  }

  let parsed;
  try {
    parsed = new URL(text);
  } catch (_error) {
    throw createResolveError(ERROR_CODES.UNSUPPORTED_URL, '不是合法的 URL');
  }

  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    throw createResolveError(ERROR_CODES.RESOLVE_BLOCKED, `协议 ${parsed.protocol} 不在白名单内`, {
      protocol: parsed.protocol,
    });
  }
  if (parsed.username !== '' || parsed.password !== '') {
    throw createResolveError(ERROR_CODES.RESOLVE_BLOCKED, 'URL 不允许携带 userinfo（@ 混淆）');
  }
  // 归一化阶段就把 IP 字面量与私网主机判死：这样任何调用方（包括直接拿 normalizeUrl
  // 结果去拼请求的人）都拿不到一个能指向内网的字符串。域名白名单判定留在 isUrlAllowed。
  const host = normalizeHostname(parsed.hostname);
  if (host === '' || isIpLiteral(host) || host === 'localhost' || host.endsWith('.localhost')) {
    throw createResolveError(ERROR_CODES.RESOLVE_BLOCKED, `主机名 ${host || '(空)'} 不允许（IP/本地名）`, { hostname: host });
  }
  return parsed.href;
}

/**
 * 提取用于域名判定的 hostname（小写、去 IPv6 方括号、去尾点）。
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
 * 判定 hostname 是否命中白名单根域（等于或子域）。
 * @param {string} hostname
 * @returns {boolean}
 */
export function isAllowedHostname(hostname) {
  const host = normalizeHostname(hostname);
  if (host === '') return false;
  return ALLOWED_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

/**
 * 一句话判定：这个 URL 能不能交给 host 去抓。
 * 与 host 侧 isUrlAllowed 的判定逻辑必须一致（两侧各自有单测，同表同结果）。
 *
 * 拒绝清单（全部进单测）：
 * - 非 http/https：file:、data:、javascript:、blob:、ftp: …
 * - 任意 IP 直连：127.0.0.1、8.8.8.8、[::1]、[::ffff:127.0.0.1]
 * - 内网/保留段：10/8、172.16/12、192.168/16、169.254/16、100.64/10、0.0.0.0、
 *   224/4 组播、240/4 保留，以及 IPv6 的 ::1、fe80::/10、fc00::/7、::ffff:0:0/96 映射
 * - 特殊主机名：localhost、*.localhost、intranet、以及任何带点的「单标签本地名」
 * - userinfo 混淆：http://bilibili.com@evil.tld/、http://evil.tld#@bilibili.com
 * - 编码绕过：%2f%2f、%40、%252e、全角点、尾点、大小写混写
 * - 白名单外的真域名：evilbilibili.com、bilibili.com.evil.tld、music.163.com.evil.tld
 *
 * @param {string} url 已经过 normalizeUrl 或原始文本（内部会再归一一次）
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
  // 任何 IP 字面量（IPv4 点分、IPv6 冒号）一律拒绝，白名单只会是域名。
  if (isIpLiteral(host)) return false;
  return isAllowedHostname(host);
}

/**
 * 判定一个 hostname 是否是 IP 字面量（不查 DNS，纯文本）。
 * 覆盖：点分四段、含冒号的 IPv6、十进制/十六进制整数写法（如 2130706433）。
 * @param {string} host 已归一化的小写 hostname
 * @returns {boolean}
 */
export function isIpLiteral(host) {
  if (host.includes(':')) return true;
  if (/^[0-9]+$/.test(host)) return true;
  if (/^0x[0-9a-f]+$/i.test(host)) return true;
  return /^[0-9]{1,3}(\.[0-9]{1,3}){3}$/.test(host);
}

/* ------------------------------------------------------------------ *
 * 平台识别
 * ------------------------------------------------------------------ */

/**
 * 识别平台。只做字符串级判定，不发任何请求。
 *
 * @param {string} url 用户粘贴的链接
 * @returns {'bilibili-video'|'bilibili-favlist'|'netease-playlist'|'netease-track'
 *   |'qq-playlist'|'qq-track'|'youtube-video'|'youtube-playlist'|'direct-audio'|'unknown'}
 */
export function detectPlatform(url) {
  let parsed;
  try {
    parsed = new URL(normalizeUrl(url));
  } catch (_error) {
    return 'unknown';
  }
  if (!isUrlAllowed(parsed.href)) return 'unknown';

  const host = normalizeHostname(parsed.hostname);

  // bilibili：favlist 优先于 video（收藏夹页的 path 里可能同时含 /video 字样）
  if (host === 'b23.tv' || host === 'bilibili.com' || host.endsWith('.bilibili.com')) {
    if (findFavlistId(parsed) !== null) return 'bilibili-favlist';
    if (findBilibiliVideoId(parsed) !== null) return 'bilibili-video';
    return 'unknown';
  }

  // 网易云：hash 路由与 path 路由两种都认
  if (host === 'music.163.com') {
    const route = neteaseRoute(parsed);
    if (route.kind === 'playlist') return 'netease-playlist';
    if (route.kind === 'track') return 'netease-track';
    return 'unknown';
  }

  // QQ 音乐：只认 playlist / songDetail（其它页面不是「可解析的曲目集合」）
  if (host === 'y.qq.com') {
    const route = qqRoute(parsed);
    if (route.kind === 'playlist') return 'qq-playlist';
    if (route.kind === 'track') return 'qq-track';
    return 'unknown';
  }

  // YouTube
  if (host === 'youtu.be') return 'youtube-video';
  if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
    if (parsed.searchParams.get('list')) return 'youtube-playlist';
    if (parsed.pathname.startsWith('/playlist')) return 'youtube-playlist';
    if (parsed.searchParams.get('v') || parsed.pathname.startsWith('/shorts/')
      || parsed.pathname.startsWith('/embed/') || parsed.pathname.startsWith('/live/')
      || parsed.pathname.startsWith('/watch')) return 'youtube-video';
    return 'unknown';
  }

  // 直链音频：扩展名命中即认，能不能播另说（host 只做 HEAD 探活，不做担保）
  const ext = extensionOf(parsed.pathname);
  if (AUDIO_EXTENSIONS.includes(ext)) return 'direct-audio';

  return 'unknown';
}

/**
 * 提取平台内 id。返回值形状随平台不同，字段名固定，未命中的字段不出现。
 *
 * - bilibili-video   → { bvid } 或 { aid }
 * - bilibili-favlist → { fid, mid? }
 * - netease-playlist → { playlistId }
 * - netease-track    → { trackId }
 * - qq-playlist      → { playlistId }
 * - qq-track         → { songmid }
 * - youtube-video    → { videoId }
 * - youtube-playlist → { listId }
 * - direct-audio     → { url }
 * - unknown          → {}
 *
 * @param {string} url
 * @param {string} [platform] 省略则内部先 detectPlatform
 * @returns {Record<string, string>}
 */
export function extractId(url, platform) {
  const kind = platform || detectPlatform(url);
  let parsed;
  try {
    parsed = new URL(normalizeUrl(url));
  } catch (_error) {
    return {};
  }
  if (!isUrlAllowed(parsed.href)) return {};

  switch (kind) {
    case 'bilibili-video': {
      const id = findBilibiliVideoId(parsed);
      return id === null ? {} : id;
    }
    case 'bilibili-favlist': {
      const fid = findFavlistId(parsed);
      if (fid === null) return {};
      const mid = pathSegmentAfter(parsed.pathname, 'space.bilibili.com');
      const out = { fid };
      if (mid !== null) out.mid = mid;
      return out;
    }
    case 'netease-playlist': {
      const route = neteaseRoute(parsed);
      return route.playlistId ? { playlistId: route.playlistId } : {};
    }
    case 'netease-track': {
      const route = neteaseRoute(parsed);
      return route.trackId ? { trackId: route.trackId } : {};
    }
    case 'qq-playlist': {
      const route = qqRoute(parsed);
      return route.playlistId ? { playlistId: route.playlistId } : {};
    }
    case 'qq-track': {
      const route = qqRoute(parsed);
      return route.songmid ? { songmid: route.songmid } : {};
    }
    case 'youtube-video': {
      const videoId = youtubeVideoId(parsed);
      return videoId ? { videoId } : {};
    }
    case 'youtube-playlist': {
      const listId = parsed.searchParams.get('list');
      return listId ? { listId } : {};
    }
    case 'direct-audio':
      return { url: parsed.href };
    default:
      return {};
  }
}

/* ------------------------------------------------------------------ *
 * 各平台内部提取器
 * ------------------------------------------------------------------ */

function extensionOf(pathname) {
  const match = /\.([A-Za-z0-9]+)$/.exec(String(pathname || ''));
  return match ? `.${match[1].toLowerCase()}` : '';
}

function findBilibiliVideoId(parsed) {
  const host = normalizeHostname(parsed.hostname);
  // 1) path 形态：/video/BVxxx、/video/av170001、/bangumi/play/ep123、/bangumi/play/ss456
  const segments = parsed.pathname.split('/').filter(Boolean);
  for (const segment of segments) {
    if (BVID_RE.test(segment)) return { bvid: segment };
    if (AVID_RE.test(segment)) return { aid: segment.toLowerCase().replace(/^av/, '') };
    if (EPID_RE.test(segment) || SSID_RE.test(segment)) return { epid: segment.toLowerCase() };
  }
  // 2) query 形态：?bvid=BVxxx、?aid=170001、?oid=
  const bvid = parsed.searchParams.get('bvid');
  if (bvid && BVID_RE.test(bvid)) return { bvid };
  const aid = parsed.searchParams.get('aid');
  if (aid && /^[0-9]+$/.test(aid)) return { aid };
  // 3) b23.tv 短链：code 未知，原样带回让 host 去跟跳转
  if (host === 'b23.tv') {
    const code = segments[0];
    if (code) return { shortCode: code };
  }
  return null;
}

function findFavlistId(parsed) {
  // space.bilibili.com/<mid>/favlist?fid=<fid>&ftype=create
  if (!parsed.pathname.includes('favlist')) {
    const fidParam = parsed.searchParams.get('fid');
    if (fidParam && /^[0-9]+$/.test(fidParam) && normalizeHostname(parsed.hostname) === 'space.bilibili.com') {
      return fidParam;
    }
    return null;
  }
  const fid = parsed.searchParams.get('fid');
  if (fid && /^[0-9]+$/.test(fid)) return fid;
  return null;
}

function pathSegmentAfter(pathname, marker) {
  const parts = String(pathname || '').split('/').filter(Boolean);
  if (parts.length >= 2 && /^[0-9]+$/.test(parts[0])) return parts[0];
  void marker;
  return null;
}

/**
 * 网易云路由解析。四种写法（含 hash 路由与 path 路由的错配组合）：
 *   https://music.163.com/#/playlist?id=24381616    hash 路由 + hash query
 *   https://music.163.com/playlist?id=24381616      path 路由 + search query
 *   https://music.163.com/playlist/24381616/...     纯 path 段
 *   https://music.163.com/song?id=186016            path 路由 + search query
 *   https://music.163.com/#/song?id=186016          hash 路由 + hash query
 *
 * 关键点：hash 里的 query 不属于 parsed.searchParams，必须单独解析。
 * 也不能只按 hashPath 或只按 pathParts 判 kind —— 真实粘贴里两种混着出现，
 * 单边判定会把 `music.163.com/song?id=` 误判成 unknown（首轮单测抓到的真实缺陷）。
 */
function neteaseRoute(parsed) {
  const hash = String(parsed.hash || '');
  const hashQuery = hash.includes('?') ? new URLSearchParams(hash.slice(hash.indexOf('?') + 1)) : new URLSearchParams();
  const hashPath = hash.replace(/^#!?/, '').split('?')[0];
  const pathParts = String(parsed.pathname || '').split('/').filter(Boolean);

  const pick = (key) => {
    const value = parsed.searchParams.get(key) || hashQuery.get(key);
    return value !== null && value !== undefined && /^[0-9]+$/.test(value) ? value : null;
  };
  const isDigits = (value) => typeof value === 'string' && /^[0-9]+$/.test(value);

  const hashIsPlaylist = hashPath.startsWith('/playlist') || hashPath.startsWith('/discover/playlist');
  const hashIsTrack = hashPath.startsWith('/song') || hashPath.startsWith('/track');
  const pathIsPlaylist = pathParts[0] === 'playlist' || (pathParts[0] === 'discover' && pathParts[1] === 'playlist');
  const pathIsTrack = pathParts[0] === 'song' || pathParts[0] === 'track';

  // 纯 path 段形态优先（最不含歧义）。
  const directPlaylist = pathIsPlaylist && isDigits(pathParts[1]) ? pathParts[1] : null;
  const directTrack = pathIsTrack && isDigits(pathParts[1]) ? pathParts[1] : null;

  // query 形态：id 的含义由所在路由决定，不能无条件当歌单。
  const idParam = pick('id');
  const playlistId = directPlaylist
    || (idParam !== null && (hashIsPlaylist || pathIsPlaylist) ? idParam : null);
  const trackId = directTrack
    || (idParam !== null && (hashIsTrack || pathIsTrack) ? idParam : null)
    || pick('songid');

  let kind = 'unknown';
  if (playlistId !== null) kind = 'playlist';
  else if (trackId !== null) kind = 'track';

  return { kind, playlistId, trackId };
}

/**
 * QQ 音乐路由解析。三种写法：
 *   https://y.qq.com/n/ryqq/playlist/7253106297
 *   https://y.qq.com/n/yqq/playlist/7253106297.html
 *   https://y.qq.com/n/ryqq/songDetail/001hs89m3C5p3g
 *   https://y.qq.com/#type=taoge&id=7253106297
 */
function qqRoute(parsed) {
  const pathParts = String(parsed.pathname || '').split('/').filter(Boolean);
  const hashQuery = String(parsed.hash || '').includes('?')
    ? new URLSearchParams(String(parsed.hash).slice(String(parsed.hash).indexOf('?') + 1))
    : new URLSearchParams();

  let playlistId = null;
  let songmid = null;
  for (let i = 0; i < pathParts.length; i += 1) {
    const part = pathParts[i];
    if (part === 'playlist' || part === 'taoge') {
      const next = (pathParts[i + 1] || '').replace(/\.html$/i, '');
      if (/^[0-9]+$/.test(next)) playlistId = next;
    }
    if (part === 'songDetail' || part === 'song') {
      const next = (pathParts[i + 1] || '').replace(/\.html$/i, '');
      if (/^[0-9A-Za-z]+$/.test(next) && !/^[0-9]+$/.test(next)) songmid = next;
    }
  }
  if (playlistId === null) {
    const disstid = parsed.searchParams.get('disstid') || parsed.searchParams.get('id') || hashQuery.get('id');
    if (disstid && /^[0-9]+$/.test(disstid)) playlistId = disstid;
  }
  if (songmid === null) {
    const mid = parsed.searchParams.get('songmid');
    if (mid && /^[0-9A-Za-z]+$/.test(mid)) songmid = mid;
  }
  return {
    kind: playlistId ? 'playlist' : songmid ? 'track' : 'unknown',
    playlistId,
    songmid,
  };
}

function youtubeVideoId(parsed) {
  const host = normalizeHostname(parsed.hostname);
  if (host === 'youtu.be') {
    const id = String(parsed.pathname || '').split('/').filter(Boolean)[0];
    return id && /^[A-Za-z0-9_-]{6,}$/.test(id) ? id : null;
  }
  const v = parsed.searchParams.get('v');
  if (v && /^[A-Za-z0-9_-]{6,}$/.test(v)) return v;
  const pathParts = String(parsed.pathname || '').split('/').filter(Boolean);
  if (pathParts.length >= 2 && ['shorts', 'embed', 'live', 'v'].includes(pathParts[0])) {
    const id = pathParts[1];
    if (/^[A-Za-z0-9_-]{6,}$/.test(id)) return id;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * 结果归一
 * ------------------------------------------------------------------ */

/** track 对象的字段顺序固定，方便单测做深比较与 UI 侧稳定渲染。 */
function makeTrack(raw) {
  const title = typeof raw?.title === 'string' && raw.title.trim() !== '' ? raw.title.trim() : '未知曲目';
  const artist = typeof raw?.artist === 'string' && raw.artist.trim() !== '' ? raw.artist.trim() : '';
  const hasUrl = typeof raw?.url === 'string' && /^https?:\/\//i.test(raw.url);
  const streamOnly = raw?.streamOnly === undefined ? !hasUrl : raw.streamOnly !== false;
  const track = { title };
  if (artist !== '') track.artist = artist;
  if (hasUrl && streamOnly === false) track.url = raw.url;
  if (typeof raw?.pageUrl === 'string' && raw.pageUrl !== '') track.pageUrl = raw.pageUrl;
  track.streamOnly = streamOnly === true || !hasUrl;
  if (typeof raw?.bvid === 'string' && BVID_RE.test(raw.bvid)) track.bvid = raw.bvid;
  if (raw?.duration !== undefined && Number.isFinite(raw.duration)) track.duration = Math.max(0, Math.round(raw.duration));
  if (typeof raw?.id === 'string' && raw.id !== '') track.id = raw.id;
  return track;
}

/**
 * 把 host 返回的原始 JSON（或本地构造的对象）归一成 UI 可直接吃的结果。
 *
 * 输出契约（与 Lead 对齐过的版本）：
 * {
 *   platform, title, cover, pageUrl,
 *   tracks: [{ title, artist?, url?, pageUrl?, bvid?, duration?, id?, streamOnly }]
 * }
 *
 * 铁律：streamOnly 表达「有没有可用直链」。没有直链时 url 字段整体省略，
 * 由 pageUrl 承担跳转；绝不用 `url: null` 表达（Lead 明确要求）。
 *
 * @param {unknown} raw host 返回的原始对象
 * @returns {{ platform:string, title:string, cover:string|null, pageUrl:string|null, tracks:Array<object> }}
 * @throws {Error & {code:string}} E_DECODE_FAILED（结构不对）/ E_NO_STREAM（有结构但一条 track 都没有）
 */
export function normalizeResult(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw createResolveError(ERROR_CODES.DECODE_FAILED, '解析结果不是对象');
  }
  const source = /** @type {Record<string, any>} */ (raw);
  const platform = typeof source.platform === 'string' && PLATFORMS.includes(source.platform)
    ? source.platform
    : 'unknown';
  const tracksRaw = Array.isArray(source.tracks) ? source.tracks : null;
  if (tracksRaw === null) {
    throw createResolveError(ERROR_CODES.DECODE_FAILED, '解析结果缺少 tracks 数组');
  }
  const tracks = tracksRaw.filter((item) => item && typeof item === 'object').map((item) => makeTrack(item));
  if (tracks.length === 0) {
    throw createResolveError(ERROR_CODES.NO_STREAM, '该链接没有解析出任何可播放曲目', { platform });
  }
  return {
    platform,
    title: typeof source.title === 'string' && source.title !== '' ? source.title : '未命名',
    cover: typeof source.cover === 'string' && source.cover !== '' ? source.cover : null,
    pageUrl: typeof source.pageUrl === 'string' && source.pageUrl !== '' ? source.pageUrl : null,
    tracks,
  };
}

/**
 * 供 UI 直接展示的错误摘要：{ code, message, retryable }。
 * retryable 只对超时与暂时性阻塞为 true，其余错误重试无意义。
 * @param {unknown} error
 * @returns {{ code:string, message:string, retryable:boolean }}
 */
export function describeError(error) {
  const code = error && typeof error === 'object' && typeof error.code === 'string'
    ? error.code
    : ERROR_CODES.DECODE_FAILED;
  const message = error && typeof error === 'object' && typeof error.message === 'string' && error.message !== ''
    ? error.message
    : '未知错误';
  return {
    code,
    message,
    retryable: code === ERROR_CODES.RESOLVE_TIMEOUT || code === ERROR_CODES.RESOLVE_BLOCKED,
  };
}

/** 默认导出：便于浏览器侧 `import parser from './parser.js'` 的整体使用。 */
export default {
  PLATFORMS,
  ERROR_CODES,
  ALLOWED_DOMAINS,
  normalizeUrl,
  normalizeHostname,
  isAllowedHostname,
  isUrlAllowed,
  isIpLiteral,
  detectPlatform,
  extractId,
  normalizeResult,
  createResolveError,
  isResolveError,
  describeError,
};
