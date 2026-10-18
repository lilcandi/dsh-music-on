/**
 * dsh-music-on —— 收藏与历史的数据层。
 *
 * 存在理由：引擎的队列是**易失**的。它表达「这一次听什么」，靠 rememberQueue
 * 勉强跨刷新活着；但它不是「我攒下来的东西」。用户真正要的是两件长期资产：
 *   收藏 —— 主动挑出来、打算反复听的链接；
 *   历史 —— 凡粘贴进来过的链接自动记一笔，忘了在哪见过时能翻回来。
 *
 * 四条设计约束（改动前先读）：
 *  1) 只存**可重建播放的地址**。绝不序列化 Blob / objectURL —— 本地拖入的文件
 *     没有稳定地址，重启后必然失效；把它写进历史就是留一条永远播不了的死行。
 *  2) id 就是规范化后的 url 本身。同一条链接重复粘贴自动去重，不需要额外哈希表，
 *     也不会出现「两条一模一样的收藏」。
 *  3) 规范化必须剥掉分享追踪参数（spm_id_from / vd_source / utm_* 等）。
 *     同一支视频从 App 分享和从网页复制会带上不同的尾巴，不剥就会去重失败。
 *  4) 读写全部包在 try 里。隐私模式 / 被策略禁用时 localStorage 会抛，
 *     收藏坏掉不能连带把设置页一起打崩。
 */

/** 收藏键。带版本号，将来结构变了可以并存而不是互相污染。 */
export const FAV_KEY = 'dsh-music-on:favorites.v1';
/** 历史键。与收藏分开存：清空历史不该顺手清掉收藏。 */
export const HIST_KEY = 'dsh-music-on:history.v1';
/** 收藏上限。用户主动攒的东西给宽一些。 */
export const FAV_MAX = 200;
/** 历史上限。自动记录的流水，留最近的即可。 */
export const HIST_MAX = 100;
/** 标题截断长度。防止一条畸形标题把整份存储撑爆。 */
const TITLE_MAX = 200;

/**
 * 分享追踪参数黑名单。
 *
 * 判定用**精确名**而不是前缀通配：`id`、`p`、`t` 这类短参数在网易云 / QQ 音乐
 * 里是业务参数，一旦按前缀误删，收藏就变成一条打不开的链接。
 */
const TRACKING_PARAMS = new Set([
  'spm_id_from', 'spm_id', 'from_source', 'from_spmid', 'vd_source',
  'share_source', 'share_medium', 'share_plat', 'share_session_id', 'share_tag',
  'unique_k', 'bbid', 'ts', 'wts', 'seid', 'buvid', 'up_id', 'tab',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'timestamp', 'src', 'source', 'ref', 'referer', 'track', 'trackid',
]);

/** 平台域名表。判定一律用「等于 或 以 .域名 结尾」，绝不用子串包含。 */
const PLATFORM_HOSTS = [
  ['bilibili', ['bilibili.com', 'b23.tv', 'biliapi.net']],
  ['netease', ['music.163.com']],
  ['qqmusic', ['y.qq.com', 'c.y.qq.com']],
  ['youtube', ['youtube.com', 'youtu.be']],
];

/** 平台显示名。UI 上的小标签直接读这里，避免两处各写一遍中文。 */
export const PLATFORM_LABELS = Object.freeze({
  bilibili: 'B站',
  netease: '网易云',
  qqmusic: 'QQ音乐',
  youtube: 'YouTube',
  direct: '直链',
  other: '链接',
});

/* ---------------- 基础工具 ---------------- */

function safeStorage() {
  try {
    if (typeof localStorage === 'undefined' || localStorage === null) return null;
    return localStorage;
  } catch (_error) {
    return null;
  }
}

/** 取主机名。URL 解析失败时返回空串，让平台判定落到 other。 */
function hostOf(url) {
  try {
    return String(new globalThis.URL(url).hostname || '').toLowerCase();
  } catch (_error) {
    return '';
  }
}

function hostMatches(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * 把用户粘贴的链接压成稳定形式，用作收藏/历史的唯一 id。
 *
 * 只动查询串与锚点，path 与 host 一律原样保留 —— B 站的 bvid、网易云的
 * 歌单 id 都在 path 或必留参数里，动它们等于把链接改坏。
 * @param {unknown} raw 原始链接。
 * @returns {string} 规范化后的链接；无法解析时返回去空格的原串。
 */
export function canonicalUrl(raw) {
  const text = String(raw === null || raw === undefined ? '' : raw).trim();
  if (text === '') return '';
  let parsed = null;
  try {
    parsed = new globalThis.URL(text);
  } catch (_error) {
    return text;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return text;
  for (const key of [...parsed.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) parsed.searchParams.delete(key);
  }
  parsed.hash = cleanHash(parsed.hash);
  return parsed.toString();
}

/**
 * 清理 URL 的 hash 段。
 *
 * 绝不能不问青红皂白把 hash 整个删掉：网易云网页版的业务参数就在 hash 里
 * （`music.163.com/#/playlist?id=24381616`），QQ 音乐分享链接同理。删掉 hash 后
 * 这类链接会塌缩成裸域名 —— 既打不开，而且**所有**网易云链接会共用一个 id，
 * 收藏里只剩最后一条。这个坑是实测出来的，不是推测。
 *
 * 规则：hash 路径保留；hash 里的 query 按同一份黑名单过滤；过滤后只剩空路径
 * 的 `#/`、`#` 视为纯锚点，丢弃。
 * @param {string} raw 原始 hash（含开头的 #）。
 * @returns {string} 处理后的 hash，可为空串。
 */
function cleanHash(raw) {
  const hash = String(raw || '');
  if (hash === '' || hash === '#') return '';
  const body = hash.replace(/^#!?/, '');
  const mark = body.indexOf('?');
  if (mark < 0) {
    // 无 query 的纯路径 hash：`#/playlist/24381616` 这种 id 在 path 里，必须留。
    return body === '' || body === '/' ? '' : `#${body}`;
  }
  const path = body.slice(0, mark);
  const params = new URLSearchParams(body.slice(mark + 1));
  for (const key of [...params.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) params.delete(key);
  }
  const query = params.toString();
  const rebuilt = `${path}${query === '' ? '' : `?${query}`}`;
  return rebuilt === '' || rebuilt === '/' ? '' : `#${rebuilt}`;
}

/**
 * 按域名判定平台。判定失败返回 'other'，由调用方决定要不要再问解析器。
 * @param {unknown} url 链接。
 * @returns {string} bilibili | netease | qqmusic | youtube | direct | other
 */
export function platformOf(url) {
  const host = hostOf(url);
  for (const [platform, domains] of PLATFORM_HOSTS) {
    if (domains.some((domain) => hostMatches(host, domain))) return platform;
  }
  if (/\.(mp3|m4a|aac|wav|flac|ogg|oga|opus|weba|webm)(\?|#|$)/i.test(String(url || ''))) {
    return 'direct';
  }
  return 'other';
}

/**
 * 平台标签文案。
 * @param {string} platform platformOf 的输出。
 * @returns {string} 可直接渲染的短标签。
 */
export function platformLabel(platform) {
  return PLATFORM_LABELS[platform] || PLATFORM_LABELS.other;
}

/**
 * 条目归一化。任何一条脏数据都不该让整份列表读不出来，故这里只做「能不能用」的判定。
 *
 * 关键：url 必须是 http(s)。`file:` / `blob:` / 空串一律拒绝 —— 它们重启后必然失效，
 * 存进去只会让用户点一条播不了的死链，却以为是插件坏了。
 * @param {unknown} raw 原始条目。
 * @returns {object|null} 干净条目，或 null 表示该条应被丢弃。
 */
export function normalizeEntry(raw) {
  // 裸链接也要收：UI 上「收藏当前这首」常常只拿得到一个 url 字符串，
  // 逼调用方先包一层对象只会多出忘记包的地方。
  const source = typeof raw === 'string' ? { url: raw } : raw;
  if (!source || typeof source !== 'object') return null;
  const url = canonicalUrl(source.url);
  if (url === '' || !/^https?:\/\//i.test(url)) return null;
  const rawTitle = typeof source.title === 'string' ? source.title.trim() : '';
  const title = rawTitle === '' ? '' : rawTitle.slice(0, TITLE_MAX);
  const platform = typeof source.platform === 'string' && source.platform !== ''
    ? source.platform
    : platformOf(url);
  const kind = typeof source.kind === 'string' ? source.kind : '';
  const now = Date.now();
  const addedAt = Number.isFinite(source.addedAt) ? source.addedAt : now;
  const playedAt = Number.isFinite(source.playedAt) ? source.playedAt : addedAt;
  const plays = Number.isFinite(source.plays) && source.plays > 0 ? Math.floor(source.plays) : 1;
  return { id: url, url, title, platform, kind, addedAt, playedAt, plays };
}

/** 由一条曲目 / 解析结果造条目。UI 层不必各自拼对象。 */
export function entryFrom(link, extra) {
  const base = typeof link === 'string' ? { url: link } : (link || {});
  return normalizeEntry({ ...base, ...(extra || {}) });
}

/**
 * 相对时间文案。
 * @param {number} ts 时间戳（毫秒）。
 * @param {number} [now] 参照时刻，单测注入用。
 * @returns {string} 「刚刚 / N 分钟前 / …」或具体日期。
 */
export function relativeTime(ts, now) {
  const time = Number.isFinite(ts) ? ts : 0;
  const base = Number.isFinite(now) ? now : Date.now();
  const diff = base - time;
  // 时钟回拨时 diff 为负，直接当刚刚，不要算出「-3 小时前」这种鬼东西。
  if (!(diff > 0)) return '刚刚';
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return '刚刚';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.floor(hour / 24);
  if (day < 30) return `${day} 天前`;
  const date = new Date(time);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/* ---------------- 读写 ---------------- */

function readList(key, max) {
  const storage = safeStorage();
  if (storage === null) return [];
  try {
    const raw = storage.getItem(key);
    if (typeof raw !== 'string' || raw === '') return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return dedupe(parsed, max);
  } catch (_error) {
    return [];
  }
}

/** 去重 + 截断 + 归一化，三个动作必须一起做，任何一步漏掉都会让列表越用越脏。 */
function dedupe(list, max) {
  const out = [];
  const seen = new Set();
  for (const item of Array.isArray(list) ? list : []) {
    const entry = normalizeEntry(item);
    if (entry === null || seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(entry);
    if (out.length >= max) break;
  }
  return out;
}

function writeList(key, list, max) {
  const clean = dedupe(list, max);
  const storage = safeStorage();
  if (storage !== null) {
    try {
      storage.setItem(key, JSON.stringify(clean));
    } catch (_error) {
      // 配额满 / 隐私模式：内存里仍然给出新列表，UI 不会假装什么都没发生。
    }
  }
  return clean;
}

/* ---------------- 订阅 ---------------- */

/** @type {Set<Function>} */
const listeners = new Set();
let storageBound = false;

function emit() {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch (_error) {
      // 单个订阅者抛错不能带崩其余订阅者。
    }
  }
}

/**
 * 跨标签页同步。只挂一次；storage 事件在其它标签页写同两个键时触发。
 */
function bindStorage() {
  if (storageBound) return;
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  storageBound = true;
  window.addEventListener('storage', (event) => {
    if (event && event.key !== null && event.key !== FAV_KEY && event.key !== HIST_KEY) return;
    emit();
  });
}

/**
 * 订阅收藏/历史的任何变化（本页写入、跨标签页写入都算）。
 * @param {Function} listener 无参回调。
 * @returns {Function} 取消订阅。
 */
export function subscribeLibrary(listener) {
  if (typeof listener !== 'function') return () => {};
  bindStorage();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/* ---------------- 收藏 ---------------- */

/** @returns {object[]} 收藏列表（最近加入的在前）。 */
export function loadFavorites() {
  return readList(FAV_KEY, FAV_MAX);
}

/**
 * 加入收藏。重复加入视为「提到最前」，不会产生第二条。
 * @param {unknown} entry 条目或裸链接。
 * @returns {object[]} 新的收藏列表。
 */
export function addFavorite(entry) {
  const normalized = normalizeEntry(entry);
  if (normalized === null) return loadFavorites();
  const rest = loadFavorites().filter((item) => item.id !== normalized.id);
  const list = writeList(FAV_KEY, [normalized, ...rest], FAV_MAX);
  emit();
  return list;
}

/**
 * 移除收藏。
 * @param {string} id 条目 id（规范化后的 url）。
 * @returns {object[]} 新的收藏列表。
 */
export function removeFavorite(id) {
  const list = writeList(FAV_KEY, loadFavorites().filter((item) => item.id !== id), FAV_MAX);
  emit();
  return list;
}

/**
 * 收藏状态查询。每次现读，不做缓存 —— 收藏是低频操作，正确性比省一次 JSON.parse 重要。
 * @param {string} id 条目 id。
 * @returns {boolean} 是否已收藏。
 */
export function isFavorite(id) {
  return loadFavorites().some((item) => item.id === id);
}

/**
 * 收藏 / 取消收藏，一步到位。
 * @param {unknown} entry 条目或裸链接。
 * @returns {{list: object[], favorited: boolean}} 新列表与最终状态。
 */
export function toggleFavorite(entry) {
  const normalized = normalizeEntry(entry);
  if (normalized === null) return { list: loadFavorites(), favorited: false };
  if (isFavorite(normalized.id)) {
    return { list: removeFavorite(normalized.id), favorited: false };
  }
  return { list: addFavorite(normalized), favorited: true };
}

/** @returns {object[]} 清空后的空列表。 */
export function clearFavorites() {
  const list = writeList(FAV_KEY, [], FAV_MAX);
  emit();
  return list;
}

/* ---------------- 历史 ---------------- */

/** @returns {object[]} 历史列表（最近播放的在前）。 */
export function loadHistory() {
  return readList(HIST_KEY, HIST_MAX);
}

/**
 * 记一笔历史。
 *
 * 重复出现不新增行，只把时间提到最前并累加播放次数 —— 用户反复粘同一份歌单时，
 * 历史列表不该被同一条刷屏。
 * @param {unknown} entry 条目或裸链接。
 * @returns {object[]} 新的历史列表。
 */
export function recordHistory(entry) {
  const normalized = normalizeEntry(entry);
  if (normalized === null) return loadHistory();
  const existing = loadHistory();
  const previous = existing.find((item) => item.id === normalized.id);
  const merged = {
    ...normalized,
    // 曲名以新解析到的为准（歌单改名 / 首次解析失败后重试成功都能被纠正），
    // 但新值为空时保留旧的，不要用空串把已有标题抹掉。
    title: normalized.title !== '' ? normalized.title : (previous ? previous.title : ''),
    addedAt: previous ? previous.addedAt : normalized.addedAt,
    playedAt: normalized.playedAt,
    plays: (previous ? previous.plays : 0) + 1,
  };
  const list = writeList(
    HIST_KEY,
    [merged, ...existing.filter((item) => item.id !== normalized.id)],
    HIST_MAX,
  );
  emit();
  return list;
}

/**
 * 批量记历史（一次粘贴多条链接时用）。只在末尾统一广播一次，
 * 避免 N 条链接触发 N 次重渲染。
 * @param {unknown[]} entries 条目数组。
 * @returns {object[]} 新的历史列表。
 */
export function recordHistoryMany(entries) {
  const list = Array.isArray(entries) ? entries : [];
  let current = loadHistory();
  for (const item of list) {
    const normalized = normalizeEntry(item);
    if (normalized === null) continue;
    const previous = current.find((row) => row.id === normalized.id);
    const merged = {
      ...normalized,
      title: normalized.title !== '' ? normalized.title : (previous ? previous.title : ''),
      addedAt: previous ? previous.addedAt : normalized.addedAt,
      playedAt: normalized.playedAt,
      plays: (previous ? previous.plays : 0) + 1,
    };
    current = [merged, ...current.filter((row) => row.id !== normalized.id)];
  }
  const written = writeList(HIST_KEY, current, HIST_MAX);
  emit();
  return written;
}

/**
 * 从历史里删掉一条。
 * @param {string} id 条目 id。
 * @returns {object[]} 新的历史列表。
 */
export function removeHistory(id) {
  const list = writeList(HIST_KEY, loadHistory().filter((item) => item.id !== id), HIST_MAX);
  emit();
  return list;
}

/** @returns {object[]} 清空后的空列表。 */
export function clearHistory() {
  const list = writeList(HIST_KEY, [], HIST_MAX);
  emit();
  return list;
}

/** 测试出口。 */
export const __test = {
  canonicalUrl,
  platformOf,
  normalizeEntry,
  dedupe,
  readList,
  writeList,
  emit,
  TRACKING_PARAMS,
  TITLE_MAX,
};
