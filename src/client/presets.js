/**
 * dsh-music-on · 预置音景客户端
 *
 * 三层音源分流（manifest 每条带 source 字段）：
 *   embedded        —— 本插件生成的 WAV 种子。首次使用下载到本地缓存目录，校验 sha256 + sizeBytes，
 *                      通过后解码进 AudioContext，按 loopStart/loopEnd 无缝循环播放。频谱可用。
 *   bilibili-embed  —— B站公开播放器 iframe。能真出声，但音频不进入 AudioContext，频谱不可用，UI 必须标注。
 *   platform-link   —— 网易云/QQ音乐等，只提供「打开原平台」跳转，不做内嵌播放。
 *
 * 本模块只用浏览器原生能力：fetch / WebCrypto（crypto.subtle）/ AudioContext / Cache 目录（走宿主桥）。
 * 不打包、不引第三方依赖，作为 ESM 直接 import。
 *
 * 缓存目录与容量上限从 settings 读取（字段名容错：storageDir / cacheDir / presetsDir，
 * cacheLimitMb / cacheLimit / maxCacheMb），读不到就用默认值，绝不硬依赖 settings 存在。
 */

/* ------------------------------------------------------------------ */
/* 常量与默认值                                                        */
/* ------------------------------------------------------------------ */

/** 清单文件相对插件根的路径。 */
export const MANIFEST_PATH = 'presets/manifest.json';

/** settings 读不到时的默认值。 */
const DEFAULTS = Object.freeze({
  storageDir: 'dsh-music-on/presets-cache',
  cacheLimitMb: 64,
  hostCache: 'showDirectoryPicker',
  fetchTimeoutMs: 30000,
  verifyOnPlay: false,
});

/** 三层音源。 */
export const SOURCE = Object.freeze({
  EMBEDDED: 'embedded',
  BILIBILI: 'bilibili-embed',
  PLATFORM: 'platform-link',
});

/** 条目状态。 */
export const STATUS = Object.freeze({
  READY: 'ready',
  NEEDS_CONFIG: 'needs-config',
  UNAVAILABLE: 'unavailable',
});

/** 各 source 的能力矩阵，UI 直接用来显示徽标。 */
export const SOURCE_CAPABILITY = Object.freeze({
  [SOURCE.EMBEDDED]: { plays: true, spectrum: true, offline: true, label: '本地合成' },
  [SOURCE.BILIBILI]: { plays: true, spectrum: false, offline: false, label: 'B站嵌入' },
  [SOURCE.PLATFORM]: { plays: false, spectrum: false, offline: false, label: '外部跳转' },
});

/** 六类音景的展示顺序与中文名。 */
export const CATEGORIES = Object.freeze([
  { id: 'white-noise', name: '白噪音' },
  { id: 'rain', name: '雨声' },
  { id: 'cafe', name: '咖啡馆' },
  { id: 'beat', name: '鼓点' },
  { id: 'jazz', name: '爵士' },
  { id: 'lofi', name: 'Lo-Fi' },
]);

/* ------------------------------------------------------------------ */
/* settings 读取（容错，不硬依赖）                                     */
/* ------------------------------------------------------------------ */

/**
 * 从宿主提供的 settings 里取预置相关配置。
 * settings 可以是对象，也可以是 async 函数 / Promise（宿主注入时机不确定）。
 * 任何字段缺失都退回默认值，读不到也不抛错。
 */
export async function readSettings(settings) {
  let raw = {};
  try {
    const resolved = typeof settings === 'function' ? await settings() : await settings;
    if (resolved && typeof resolved === 'object') raw = resolved;
  } catch {
    raw = {};
  }
  const pick = (...keys) => {
    for (const key of keys) {
      const value = raw?.[key];
      if (value !== undefined && value !== null && value !== '') return value;
    }
    return undefined;
  };
  const limitRaw = pick('cacheLimitMb', 'cacheLimit', 'maxCacheMb');
  const limit = Number(limitRaw);
  const timeoutRaw = Number(pick('fetchTimeoutMs', 'downloadTimeoutMs'));

  return {
    storageDir: String(pick('storageDir', 'cacheDir', 'presetsDir') ?? DEFAULTS.storageDir),
    cacheLimitMb: Number.isFinite(limit) && limit > 0 ? limit : DEFAULTS.cacheLimitMb,
    hostCache: String(pick('hostCache', 'cacheMode') ?? DEFAULTS.hostCache),
    fetchTimeoutMs: Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : DEFAULTS.fetchTimeoutMs,
    verifyOnPlay: Boolean(pick('verifyOnPlay') ?? DEFAULTS.verifyOnPlay),
  };
}

/* ------------------------------------------------------------------ */
/* 缓存后端                                                            */
/* ------------------------------------------------------------------ */

/**
 * 缓存后端抽象。宿主优先注入 `cacheStore`（具备 get/set/delete/list/clear/size 的对象）；
 * 没有注入时退回 IndexedDB（浏览器原生，能存 Blob），再没有就纯内存（当次会话有效）。
 * 三条路径都满足 presets.js 自身的接口，UI 不需要知道用的是哪个。
 */
function createMemoryCache() {
  const map = new Map();
  return {
    kind: 'memory',
    async get(key) {
      return map.get(key) ?? null;
    },
    async set(key, blob) {
      map.set(key, blob);
    },
    async delete(key) {
      map.delete(key);
    },
    async list() {
      return [...map.entries()].map(([key, blob]) => ({ key, sizeBytes: blob?.size ?? 0 }));
    },
    async clear() {
      map.clear();
    },
  };
}

function createIdbCache(dbName = 'dsh-music-on-presets', storeName = 'files') {
  if (typeof indexedDB === 'undefined') return null;
  let dbPromise = null;
  const open = () => {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  };
  const tx = async (mode, fn) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      let result;
      try {
        result = fn(store);
      } catch (error) {
        reject(error);
        return;
      }
      transaction.oncomplete = () => resolve(result?.__req ? result.__req.result : result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  };
  return {
    kind: 'indexeddb',
    async get(key) {
      const blob = await tx('readonly', (store) => ({ __req: store.get(key) }));
      return blob ?? null;
    },
    async set(key, blob) {
      await tx('readwrite', (store) => {
        store.put(blob, key);
        return null;
      });
    },
    async delete(key) {
      await tx('readwrite', (store) => {
        store.delete(key);
        return null;
      });
    },
    async list() {
      const entries = await tx('readonly', (store) => ({ __req: store.getAllKeys() }));
      const keys = entries ?? [];
      const out = [];
      for (const key of keys) {
        const blob = await this.get(key);
        out.push({ key, sizeBytes: blob?.size ?? 0 });
      }
      return out;
    },
    async clear() {
      await tx('readwrite', (store) => {
        store.clear();
        return null;
      });
    },
  };
}

/**
 * @param {object} opts
 * @param {object} [opts.cacheStore] 宿主注入的缓存后端
 * @param {string} [opts.storageDir] 宿主落盘目录（仅用于展示与命名空间）
 */
export function createCache(opts = {}) {
  const store = opts.cacheStore ?? createIdbCache(`dsh-music-on-presets:${opts.storageDir ?? 'default'}`) ?? createMemoryCache();
  return {
    kind: store.kind ?? 'host',
    storageDir: opts.storageDir ?? DEFAULTS.storageDir,
    get: (key) => store.get(key),
    set: (key, blob) => store.set(key, blob),
    delete: (key) => store.delete(key),
    list: () => store.list(),
    clear: () => store.clear(),
  };
}

/* ------------------------------------------------------------------ */
/* 清单加载                                                            */
/* ------------------------------------------------------------------ */

const isBvId = (value) => typeof value === 'string' && /^BV[0-9A-Za-z]{10}$/.test(value.trim());

/**
 * 校验并解析 manifest。
 * 只有 url/pageUrl/bvid 都是空、或者 sha256 缺失这类「结构性错误」才记一条问题；
 * 故意留空的 needs-config 条目属于合法状态，不算错误。
 */
export function parseManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.items)) {
    throw new Error('preset manifest 结构不合法：缺少 items 数组');
  }
  const issues = [];
  const seen = new Set();
  const items = [];

  for (const raw of manifest.items) {
    if (!raw || typeof raw !== 'object') {
      issues.push('忽略非对象条目');
      continue;
    }
    const id = String(raw.id ?? '').trim();
    if (!id) {
      issues.push('忽略缺少 id 的条目');
      continue;
    }
    if (seen.has(id)) {
      issues.push(`条目 id 重复：${id}`);
      continue;
    }
    seen.add(id);

    const source = [SOURCE.EMBEDDED, SOURCE.BILIBILI, SOURCE.PLATFORM].includes(raw.source)
      ? raw.source
      : SOURCE.EMBEDDED;

    let status = raw.status;
    if (![STATUS.READY, STATUS.NEEDS_CONFIG, STATUS.UNAVAILABLE].includes(status)) {
      status = STATUS.NEEDS_CONFIG;
    }

    // 就绪判定由内容决定，不信 status 一家之言
    let playable = false;
    let reason = raw.unavailableReason ?? null;
    if (source === SOURCE.EMBEDDED) {
      const hasFile = typeof raw.url === 'string' && raw.url.length > 0;
      const hasHash = typeof raw.sha256 === 'string' && /^[0-9a-f]{64}$/.test(raw.sha256);
      const hasSize = Number.isFinite(Number(raw.sizeBytes)) && Number(raw.sizeBytes) > 0;
      playable = hasFile && hasHash && hasSize;
      if (!playable) {
        if (status === STATUS.READY) {
          issues.push(`${id}: status=ready 但缺少 url/sha256/sizeBytes，降级为 needs-config`);
          status = STATUS.NEEDS_CONFIG;
        }
        reason ??= hasFile ? '清单缺少 sha256 或 sizeBytes，无法校验' : '清单未提供音频文件地址';
      }
    } else if (source === SOURCE.BILIBILI) {
      playable = isBvId(raw.bvid);
      if (!playable) {
        if (status === STATUS.READY) {
          issues.push(`${id}: status=ready 但没有合法 bvid，降级为 needs-config`);
          status = STATUS.NEEDS_CONFIG;
        }
        reason ??= '等待开发者填入公开视频 BV 号';
      }
    } else {
      playable = typeof raw.pageUrl === 'string' && /^https?:\/\//.test(raw.pageUrl);
      if (!playable) {
        if (status === STATUS.READY) {
          issues.push(`${id}: status=ready 但没有 pageUrl，降级为 needs-config`);
          status = STATUS.NEEDS_CONFIG;
        }
        reason ??= '等待开发者填入公开歌单页 URL';
      }
    }

    const capability = SOURCE_CAPABILITY[source];
    items.push({
      ...raw,
      id,
      source,
      status,
      playable,
      spectrumAvailable: playable ? raw.spectrumAvailable === true : false,
      unavailableReason: playable ? null : reason,
      label: capability.label,
    });
  }

  return {
    version: Number(manifest.version) || 1,
    loopCrossfadeSec: Number(manifest.loopCrossfadeSec) || 0.25,
    items,
    issues,
  };
}

/**
 * 把相对路径解析成绝对地址。
 *
 * 为什么不用 `new URL(x, base)`：本模块在 Node 侧自检 / vm 沙箱里也会被加载，
 * 那里没有 `location`，裸写 `location?.href` 仍会在 `new URL(baseUrl, location?.href)`
 * 这一层触发 `ReferenceError: URL is not defined`——`URL` 只在浏览器全局才有。
 * 所以这里按 `globalThis.location` 取值，缺失时用 BASE_ORIGIN 兜底。
 */
function resolveUrl(path, baseUrl) {
  const U = globalThis.URL;
  if (typeof U !== 'function') return String(path);
  const origin = globalThis.location?.href ?? BASE_ORIGIN;
  try {
    return new U(String(path), new U(baseUrl, origin)).href;
  } catch {
    return String(path);
  }
}

/** 无 location 时的兜底 origin（同源占位，不会被真正请求）。 */
const BASE_ORIGIN = 'http://localhost/';

/**
 * 惰性取 fetch。
 *
 * 为什么不在参数默认值里写 `globalThis.fetch`：esbuild 会把 bundle 里的顶层代码
 * 提到立即执行的位置，而 `globalThis.fetch` 在 `dsh-client-modules` 的 require 沙箱
 * 里可能尚未装配，取值时机太早会拿到 undefined。改成调用期再取。
 */
function defaultFetch() {
  return typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null;
}

/** 拉清单。按 baseUrl 解析成绝对地址，便于 fetch。 */
export async function loadManifest({ baseUrl = './', fetchImpl, manifestPath = MANIFEST_PATH } = {}) {
  const doFetch = fetchImpl ?? defaultFetch();
  if (!doFetch) throw new Error('dsh-music-on: 当前环境没有 fetch，无法加载预置音景');
  const url = resolveUrl(manifestPath, baseUrl);
  const response = await doFetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`清单加载失败：HTTP ${response.status} ${url}`);
  return parseManifest(await response.json());
}

/* ------------------------------------------------------------------ */
/* 下载 + 校验                                                         */
/* ------------------------------------------------------------------ */

/** 字节 → hex，不依赖 Buffer（浏览器里没有）。 */
function bytesToHex(buffer) {
  const view = new Uint8Array(buffer);
  let out = '';
  for (let i = 0; i < view.length; i++) out += view[i].toString(16).padStart(2, '0');
  return out;
}

/** WebCrypto sha256。crypto.subtle 只在安全上下文（https / localhost）可用。 */
export async function sha256Hex(buffer) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('当前不是安全上下文（需要 https 或 localhost），crypto.subtle 不可用');
  const digest = await subtle.digest('SHA-256', buffer);
  return bytesToHex(digest);
}

async function fetchWithTimeout(doFetch, url, timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return fetchImpl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 把 embedded 条目落到本地缓存：命中即返回；未命中下载 → 校验 → 失败删除重下一次。
 * 只重试一次：清单本身是错的（sha 对不上）时反复重下没有意义，必须把原因抛给 UI。
 *
 * @returns {Promise<{blob: Blob, fromCache: boolean, attempts: number}>}
 */
export async function ensureCached(item, { cache, baseUrl = './', fetchImpl, fetchTimeoutMs = DEFAULTS.fetchTimeoutMs, retries = 1 } = {}) {
  if (item.source !== SOURCE.EMBEDDED) throw new Error(`${item.id}: 不是 embedded 条目，不能下载缓存`);
  if (!item.playable) throw new Error(`${item.id}: 未就绪（${item.unavailableReason ?? '清单未提供可用音频'}）`);
  const doFetch = fetchImpl ?? defaultFetch();
  if (!doFetch) throw new Error(`${item.id}: 当前环境没有 fetch`);

  const cacheKey = `preset:${item.id}:${item.sha256}`;

  const cached = await cache.get(cacheKey);
  if (cached) return { blob: cached, fromCache: true, attempts: 0 };

  const url = resolveUrl(item.url, baseUrl);
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let response;
    try {
      response = await fetchWithTimeout(doFetch, url, fetchTimeoutMs);
    } catch (error) {
      lastError = new Error(`${item.id}: 下载失败（${error?.message ?? error}）`);
      continue;
    }
    if (!response.ok) {
      lastError = new Error(`${item.id}: 下载失败 HTTP ${response.status}`);
      continue;
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength !== item.sizeBytes) {
      lastError = new Error(`${item.id}: 体积校验失败（期望 ${item.sizeBytes}，实际 ${buffer.byteLength}）`);
      continue;
    }
    let digest;
    try {
      digest = await sha256Hex(buffer);
    } catch (error) {
      throw new Error(`${item.id}: 无法校验 sha256（${error?.message ?? error}）`);
    }
    if (digest !== item.sha256) {
      lastError = new Error(`${item.id}: sha256 校验失败（期望 ${item.sha256.slice(0, 12)}…，实际 ${digest.slice(0, 12)}…）`);
      continue;
    }

    const blob = new Blob([buffer], { type: 'audio/wav' });
    await cache.set(cacheKey, blob);
    return { blob, fromCache: false, attempts: attempt + 1 };
  }

  // 失败路径：确保没有残留半截文件
  await cache.delete(cacheKey).catch(() => {});
  throw lastError ?? new Error(`${item.id}: 下载失败`);
}

/** 按容量上限裁剪缓存：先删最旧的，直到总量降到 limitMb 以下。 */
export async function enforceCacheLimit(cache, limitMb, { protectKeys = [] } = {}) {
  if (!(limitMb > 0)) return { removed: 0, sizeBytes: 0 };
  const entries = await cache.list();
  const limitBytes = limitMb * 1024 * 1024;
  let total = entries.reduce((sum, entry) => sum + (entry.sizeBytes ?? 0), 0);
  const protect = new Set(protectKeys);
  let removed = 0;
  for (const entry of entries) {
    if (total <= limitBytes) break;
    if (protect.has(entry.key)) continue;
    await cache.delete(entry.key);
    total -= entry.sizeBytes ?? 0;
    removed += 1;
  }
  return { removed, sizeBytes: total };
}

/* ------------------------------------------------------------------ */
/* 音频引擎                                                            */
/* ------------------------------------------------------------------ */

/**
 * 音频引擎：一条音轨同时只能有一个音源，切歌就停旧的。
 * embedded 走 AudioBufferSourceNode + loop/loopStart/loopEnd，保证无缝；
 * bilibili-embed 走 iframe；platform-link 不发声，只回调 UI 去开外链。
 */
export function createEngine({ audioContextFactory, manifest, onStateChange } = {}) {
  const ctxFactory =
    audioContextFactory ??
    (() => {
      const Ctor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (!Ctor) throw new Error('当前环境没有 AudioContext，无法播放本地音景');
      return new Ctor();
    });

  let ctx = null;
  let gain = null;
  let analyser = null;
  let sourceNode = null;
  let currentId = null;
  let loopCache = new Map();
  let volume = 0.8;

  const emit = (state) => {
    try {
      onStateChange?.(state);
    } catch {
      /* UI 回调异常不能影响播放 */
    }
  };

  const ensureContext = async () => {
    if (!ctx) {
      ctx = ctxFactory();
      gain = ctx.createGain();
      gain.gain.value = volume;
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;
      gain.connect(analyser);
      analyser.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') await ctx.resume();
    return ctx;
  };

  const stopEmbedded = () => {
    if (!sourceNode) return;
    try {
      sourceNode.onended = null;
      sourceNode.stop();
      sourceNode.disconnect();
    } catch {
      /* 已停止 */
    }
    sourceNode = null;
  };

  /** 解码并缓存 AudioBuffer，避免二次解码。 */
  const decode = async (item, blob) => {
    const key = `${item.id}:${item.sha256}`;
    const cached = loopCache.get(key);
    if (cached) return cached;
    const buffer = await blob.arrayBuffer();
    const decoded = await (await ensureContext()).decodeAudioData(buffer);
    loopCache.set(key, decoded);
    return decoded;
  };

  const playEmbedded = async (item, { blob } = {}) => {
    if (!blob) throw new Error(`${item.id}: 缺少已校验的音频数据`);
    await ensureContext();
    const audioBuffer = await decode(item, blob);

    // 循环区间钳制到合法范围，避免清单写坏导致 loop 无效
    const dur = audioBuffer.duration;
    let loopStart = Number.isFinite(item.loopStart) ? item.loopStart : 0;
    let loopEnd = Number.isFinite(item.loopEnd) ? item.loopEnd : dur;
    loopStart = Math.max(0, Math.min(loopStart, dur - 0.05));
    loopEnd = Math.max(loopStart + 0.05, Math.min(loopEnd, dur));

    stopEmbedded();
    const node = ctx.createBufferSource();
    node.buffer = audioBuffer;
    node.loop = true;
    node.loopStart = loopStart;
    node.loopEnd = loopEnd;
    node.connect(gain);
    node.start(0, loopStart);
    sourceNode = node;
    currentId = item.id;

    emit({ id: item.id, source: SOURCE.EMBEDDED, playing: true, spectrum: true, loopStart, loopEnd, duration: dur });
    return { playing: true, spectrum: true };
  };

  const stop = () => {
    stopEmbedded();
    const previous = currentId;
    currentId = null;
    emit({ id: previous, playing: false, source: null, spectrum: false });
  };

  const setVolume = (value) => {
    const v = Math.max(0, Math.min(1, Number(value)));
    if (!Number.isFinite(v)) return volume;
    volume = v;
    if (gain) gain.gain.setTargetAtTime(v, ctx.currentTime, 0.02);
    return volume;
  };

  /** 频谱数据（embedded 独有）。没有 analyser 时返回 null，UI 据此隐藏频谱。 */
  const readSpectrum = () => {
    if (!analyser || !sourceNode) return null;
    const bins = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(bins);
    return bins;
  };

  return {
    playEmbedded,
    stop,
    setVolume,
    readSpectrum,
    get currentId() {
      return currentId;
    },
    get context() {
      return ctx;
    },
    get analyser() {
      return analyser;
    },
    get hasSpectrum() {
      return Boolean(analyser && sourceNode);
    },
    async close() {
      stop();
      loopCache = new Map();
      if (ctx && typeof ctx.close === 'function') await ctx.close().catch(() => {});
      ctx = null;
      gain = null;
      analyser = null;
    },
  };
}

/* ------------------------------------------------------------------ */
/* B站嵌入 / 平台跳转                                                  */
/* ------------------------------------------------------------------ */

/**
 * 生成 B站公开播放器 iframe 地址。bvid 必须已配置，否则直接报错（不生成死链）。
 *
 * B站官方参数名就是 `danmaku`（0=关闭弹幕），传 1 不关；`high_quality=1` 请求高码率，
 * 实际是否给高码率取决于视频与登录态，前端无法强求。单 P 视频不需要 p 参数，
 * 这里固定 page=1 以便与多 P 视频共用同一套 URL 结构。
 */
export function buildBilibiliEmbedUrl(item, { autoplay = 1, danmaku = 0, highQuality = 1 } = {}) {
  if (item.source !== SOURCE.BILIBILI) throw new Error(`${item.id}: 不是 bilibili-embed 条目`);
  if (!isBvId(item.bvid)) throw new Error(`${item.id}: 未配置合法 bvid（等待开发者填入公开视频 BV 号）`);
  const params = new URLSearchParams({
    bvid: item.bvid.trim(),
    p: '1',
    autoplay: String(autoplay),
    danmaku: String(danmaku),          // B站参数名就是 danmaku，不是 dm
    high_quality: String(highQuality),
  });
  return `https://player.bilibili.com/player.html?${params.toString()}`;
}

/** platform-link 只给跳转地址，不做内嵌播放。 */
export function resolvePlatformUrl(item) {
  if (item.source !== SOURCE.PLATFORM) throw new Error(`${item.id}: 不是 platform-link 条目`);
  if (!item.playable) throw new Error(`${item.id}: ${item.unavailableReason ?? '未配置平台链接'}`);
  return item.pageUrl;
}

/* ------------------------------------------------------------------ */
/* 编排层：设置 + 清单 + 缓存 + 引擎 一次性接好                         */
/* ------------------------------------------------------------------ */

/**
 * 创建预置音景控制器。UI 只需要：
 *   const presets = await createPresets({ settings, cacheStore });
 *   presets.categories()      // 分类入口
 *   await presets.prepare(id) // 下载+校验（embedded）
 *   await presets.play(id)    // 按 source 分流播放
 *   presets.onChange(fn)      // 状态订阅（含不可用原因）
 */
export async function createPresets(options = {}) {
  const {
    settings,
    cacheStore,
    baseUrl = './',
    fetchImpl,
    audioContextFactory,
    manifest: providedManifest,
    onStateChange,
  } = options;

  const config = await readSettings(settings);
  const cache = createCache({ cacheStore, storageDir: config.storageDir });
  const manifest =
    providedManifest && providedManifest.items
      ? providedManifest
      : await loadManifest({ baseUrl, fetchImpl });

  // 允许两种入参：原始清单（需解析）或 parseManifest 的结果（已带 playable/status 等派生字段）。
  // 用 items[0] 是否含派生字段区分，避免把已解析结果再解析一遍丢掉 playable。
  const looksParsed =
    Array.isArray(manifest.items) &&
    manifest.items.length > 0 &&
    manifest.items.every((item) => item && typeof item.playable === 'boolean' && typeof item.label === 'string');
  const parsed = looksParsed ? manifest : parseManifest(manifest);
  const byId = new Map(parsed.items.map((item) => [item.id, item]));
  const listeners = new Set();
  const statusMap = new Map();

  const engine = createEngine({
    audioContextFactory,
    manifest: parsed,
    onStateChange: (state) => {
      publish({ type: 'playback', ...state });
      try {
        onStateChange?.(state);
      } catch {
        /* ignore */
      }
    },
  });

  function publish(event) {
    for (const fn of listeners) {
      try {
        fn(event);
      } catch {
        /* 单个订阅者异常不阻断其它订阅者 */
      }
    }
  }

  const get = (id) => byId.get(id) ?? null;

  /** 保证 embedded 条目已在缓存里（未就绪直接抛出带原因的错误）。 */
  async function prepare(id) {
    const item = get(id);
    if (!item) throw new Error(`未知预置：${id}`);
    if (item.source !== SOURCE.EMBEDDED) return { skipped: true, item };
    if (!item.playable) {
      const error = new Error(`${item.id}: ${item.unavailableReason ?? '未就绪'}`);
      statusMap.set(item.id, { status: STATUS.UNAVAILABLE, reason: error.message });
      publish({ type: 'error', id: item.id, error });
      throw error;
    }
    try {
      const result = await ensureCached(item, {
        cache,
        baseUrl,
        fetchImpl,
        fetchTimeoutMs: config.fetchTimeoutMs,
      });
      await enforceCacheLimit(cache, config.cacheLimitMb, { protectKeys: [`preset:${item.id}:${item.sha256}`] });
      statusMap.set(item.id, { status: STATUS.READY, reason: null, fromCache: result.fromCache });
      publish({ type: 'cached', id: item.id, fromCache: result.fromCache });
      return { ...result, item };
    } catch (error) {
      statusMap.set(item.id, { status: STATUS.UNAVAILABLE, reason: error.message });
      publish({ type: 'error', id: item.id, error });
      throw error;
    }
  }

  /** 按 source 分流播放。返回值告诉 UI 该挂 iframe 还是开外链。 */
  async function play(id) {
    const item = get(id);
    if (!item) {
      const error = new Error(`未知预置：${id}`);
      publish({ type: 'error', id, error });
      throw error;
    }
    try {
      if (item.source === SOURCE.EMBEDDED) {
        const { blob } = await prepare(id);
        const state = await engine.playEmbedded(item, { blob });
        return { mode: 'audio', ...state };
      }
      if (item.source === SOURCE.BILIBILI) {
        const embedUrl = buildBilibiliEmbedUrl(item);
        publish({ type: 'embed', id, embedUrl, spectrum: false });
        return { mode: 'iframe', embedUrl, spectrum: false, note: 'B站嵌入播放，音频不进入 AudioContext，频谱不可用' };
      }
      const url = resolvePlatformUrl(item);
      publish({ type: 'external', id, url });
      return { mode: 'external', url, spectrum: false, note: '外部平台跳转，插件内不播放' };
    } catch (error) {
      statusMap.set(item.id, { status: error.status ?? STATUS.UNAVAILABLE, reason: error.message });
      publish({ type: 'error', id, error });
      throw error;
    }
  }

  async function prepareAll() {
    const targets = parsed.items.filter((item) => item.source === SOURCE.EMBEDDED && item.playable);
    const results = [];
    for (const item of targets) {
      try {
        await prepare(item.id);
        results.push({ id: item.id, ok: true });
      } catch (error) {
        results.push({ id: item.id, ok: false, error: error.message });
      }
    }
    return results;
  }

  /** 分类入口：每类给可用/待配置/不可用的条目，UI 直接渲染。 */
  function categories() {
    return CATEGORIES.map((category) => {
      const items = parsed.items.filter((item) => item.category === category.id);
      return {
        ...category,
        items,
        counts: {
          ready: items.filter((item) => item.playable).length,
          needsConfig: items.filter((item) => item.status === STATUS.NEEDS_CONFIG).length,
          unavailable: items.filter((item) => item.status === STATUS.UNAVAILABLE).length,
        },
      };
    }).filter((category) => category.items.length > 0);
  }

  function list() {
    return parsed.items.map((item) => ({
      ...item,
      runtime: statusMap.get(item.id) ?? null,
    }));
  }

  /** 每条不可用条目的原因，UI 用它在条目上挂红点 + tooltip，不允许静默失败。 */
  function unavailableReport() {
    return parsed.items
      .filter((item) => !item.playable)
      .map((item) => ({
        id: item.id,
        name: item.name,
        source: item.source,
        status: item.status,
        spectrumAvailable: false,
        reason: statusMap.get(item.id)?.reason ?? item.unavailableReason ?? '未配置',
        hint:
          item.source === SOURCE.BILIBILI
            ? '在 manifest.json 填入 bvid 并把 status 改为 "ready"'
            : item.source === SOURCE.PLATFORM
              ? '在 manifest.json 填入 pageUrl 并把 status 改为 "ready"'
              : '该条目没有音频产物，需要补生成脚本配方或移除条目',
      }));
  }

  return {
    config,
    cache,
    engine,
    manifest: parsed,
    issues: parsed.issues ?? [],
    categories,
    list,
    get,
    prepare,
    prepareAll,
    play,
    stop: () => engine.stop(),
    setVolume: (v) => engine.setVolume(v),
    readSpectrum: () => engine.readSpectrum(),
    unavailableReport,
    buildBilibiliEmbedUrl: (id) => buildBilibiliEmbedUrl(get(id)),
    resolvePlatformUrl: (id) => resolvePlatformUrl(get(id)),
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    async cacheStats() {
      const entries = await cache.list();
      const sizeBytes = entries.reduce((sum, entry) => sum + (entry.sizeBytes ?? 0), 0);
      return {
        backend: cache.kind,
        storageDir: cache.storageDir,
        limitMb: config.cacheLimitMb,
        entries: entries.length,
        sizeBytes,
        sizeMb: sizeBytes / (1024 * 1024),
      };
    },
  };
}

export default createPresets;
