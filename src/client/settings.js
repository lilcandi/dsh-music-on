/**
 * 设置真相源（唯一一份）。
 *
 * 设计要点：
 * 1. 纯浏览器模块，不 import 任何平台包，可在 node 里直接跑测试。
 * 2. 工厂签名 createSettingsStore(): store，只认命名空间 dsh-music-on:settings。
 *    宿主 ctx 存在时顺带挂 ctx.configForms 二级通道，但事件监听只挂一次（模块级单例）。
 * 3. 规范化一律走 normalizeSettings：坏数据、旧数据、越界值都不会穿透到 UI。
 * 4. 写盘失败不丢内存态：内存里一定是用户刚点的值，transport 标记真实落点。
 *
 * 持久化通道优先级：localStorage > configForms(ctx) > memory-only。
 * 之所以 localStorage 排第一：它是唯一「刷新页面后必然还在」的通道，
 * configForms 只有在插件被 profile 正式登记时才存在。
 */

export const NS = 'dsh-music-on';
export const STORAGE_KEY = 'dsh-music-on:settings';

/**
 * 频谱样式。
 *
 * `dots` 是主推样式（细圆点柱 + 蓝白发光），也是新的默认值 —— 用户明确要求
 * 「这种类型的频谱，蓝白色特效」。
 * `bars` 保留为粗柱（旧观感），`line` 是连线，`wave` 是镜像时域波形。
 * 四者必须都有真实绘制实现：早先 `wave` 只在白名单里、绘制函数退回柱状，
 * 选了等于没选，属于「选项撒谎」。
 */
export const SPECTRUM_STYLES = ['dots', 'bars', 'line', 'wave', 'off'];
export const SPECTRUM_FPS = [30, 60];
export const SPECTRUM_PLACEMENTS = ['bar', 'panel'];
/** 通栏频谱的层级：front 浮在正文之上，back 沉到正文之下只透暗纹。 */
export const SPECTRUM_DEPTHS = ['front', 'back'];
export const SPECTRUM_GLOWS = ['off', 'soft', 'strong'];
export const LOOP_MODES = ['all', 'one', 'off'];
export const CACHE_LIMIT_MIN_MB = 64;
export const CACHE_LIMIT_MAX_MB = 4096;
export const DOCK_SIZES = ['compact', 'normal', 'wide'];
export const AUTOPLAY_TARGETS = ['both', 'link', 'file', 'off'];

/**
 * 歌单识别数量的边界。
 *
 * 上限 200 由宿主 `MAX_TRACK_LIMIT` 决定：QQ 的 vkey 接口实测 300 首直接 414，
 * 200 首就会静默只回 100 条，所以宿主按 100 一首一块地取。
 * 下限 5 只是避免「设成 1 首又抱怨歌单白解析」这种无意义操作。
 */
export const PLATFORM_LIMIT_MIN = 5;
export const PLATFORM_LIMIT_MAX = 200;

export const DEFAULT_SETTINGS = Object.freeze({
  volume: 0.6,
  spectrumStyle: 'dots',
  spectrumFps: 60,
  spectrumPlacement: 'bar',
  spectrumDepth: 'front',
  spectrumBars: 48,
  spectrumGlow: 'soft',
  spectrumGain: 1,
  spectrumHeight: 64,
  loopMode: 'all',
  cacheLimitMB: 512,
  proxyEnabled: true,
  allowAutoplay: true,
  autoplayTarget: 'both',
  crossfadeSec: 0,
  fadeOnPause: true,
  startCollapsed: true,
  dockSize: 'normal',
  /** 拖动后记住的位置（viewport 像素）。null = 默认右下角，跟随窗口尺寸。 */
  dockX: null,
  dockY: null,
  showTitles: true,
  rememberQueue: true,
  /** 粘贴歌单时最多入队多少首**能播的**曲目。 */
  platformTrackLimit: 60,
});

/**
 * Schema 单源：设置页、校验、文档全部从这里读，禁止在别处再写一遍字段定义。
 * kind: range | select | boolean；action 表示按钮类条目（无值）。
 */
export const SETTINGS_SCHEMA = Object.freeze([
  {
    key: 'volume',
    kind: 'range',
    type: 'number',
    default: DEFAULT_SETTINGS.volume,
    min: 0,
    max: 1,
    step: 0.01,
    label: '默认音量',
    help: '新会话首次播放时的音量，不影响当前正在播放的音量。',
  },
  {
    key: 'spectrumStyle',
    kind: 'select',
    type: "SpectrumStyle = 'dots' | 'bars' | 'line' | 'wave' | 'off'",
    default: DEFAULT_SETTINGS.spectrumStyle,
    options: [
      { value: 'dots', label: '圆点（蓝白）' },
      { value: 'bars', label: '粗柱' },
      { value: 'line', label: '折线' },
      { value: 'wave', label: '波形' },
      { value: 'off', label: '关闭' },
    ],
    label: '频谱样式',
    help: '关闭后完全不创建 canvas 与动画循环，最省电。',
  },
  {
    key: 'spectrumFps',
    kind: 'select',
    type: '30 | 60',
    default: DEFAULT_SETTINGS.spectrumFps,
    options: [
      { value: 30, label: '30 fps' },
      { value: 60, label: '60 fps' },
    ],
    label: '频谱帧率',
    help: '系统开启「减少动态效果」时，实际帧率会进一步压到 10fps。',
  },
  {
    key: 'spectrumPlacement',
    kind: 'select',
    type: "SpectrumPlacement = 'bar' | 'panel'",
    default: DEFAULT_SETTINGS.spectrumPlacement,
    options: [
      { value: 'bar', label: '贴底通栏' },
      { value: 'panel', label: '嵌在卡片内' },
    ],
    label: '频谱位置',
    help: '贴底通栏铺满窗口下方，只在音乐库展开时出现；嵌入则跟着卡片走。',
  },
  {
    key: 'spectrumDepth',
    kind: 'select',
    type: "SpectrumDepth = 'front' | 'back'",
    default: DEFAULT_SETTINGS.spectrumDepth,
    options: [
      { value: 'front', label: '浮在页面之上' },
      { value: 'back', label: '藏进页面之下' },
    ],
    label: '频谱层级',
    help: '只对贴底通栏生效。浮起时清楚可见；藏起来时压到正文之下，只在侧栏与边距的空白处透出暗纹，不抢注意力。卡片头部的 ⤒ 可以临时把它提上来看一眼。',
  },
  {
    key: 'spectrumBars',
    kind: 'range',
    type: 'number (16-96)',
    default: DEFAULT_SETTINGS.spectrumBars,
    min: 16,
    max: 96,
    step: 8,
    label: '频谱柱数',
    help: '柱子越多越细腻，代价是每帧绘制量线性增长。',
  },
  {
    key: 'spectrumGain',
    kind: 'range',
    type: 'number (0.5-4)',
    default: DEFAULT_SETTINGS.spectrumGain,
    min: 0.5,
    max: 4,
    step: 0.1,
    label: '频谱灵敏度',
    help: '安静的音乐把灵敏度调高，柱体才不会被压成一条直线。',
  },
  {
    key: 'spectrumGlow',
    kind: 'select',
    type: "SpectrumGlow = 'off' | 'soft' | 'strong'",
    default: DEFAULT_SETTINGS.spectrumGlow,
    options: [
      { value: 'off', label: '无光晕' },
      { value: 'soft', label: '柔和' },
      { value: 'strong', label: '强烈' },
    ],
    label: '频谱光晕',
    help: '光晕是纯视觉特效，关掉能让低端机帧率更稳。',
  },
  {
    key: 'spectrumHeight',
    kind: 'range',
    type: 'number (32-160)',
    default: DEFAULT_SETTINGS.spectrumHeight,
    min: 32,
    max: 160,
    step: 8,
    label: '频谱高度 (px)',
    help: '贴底通栏与嵌入两种位置都按这个高度渲染。',
  },
  {
    key: 'loopMode',
    kind: 'select',
    type: "LoopMode = 'all' | 'one' | 'off'",
    default: DEFAULT_SETTINGS.loopMode,
    options: [
      { value: 'all', label: '列表循环' },
      { value: 'one', label: '单曲循环' },
      { value: 'off', label: '播完停止' },
    ],
    label: '默认循环模式',
    help: '仅作为新会话的初始值，播放器上的按钮仍可临时切换。',
  },
  {
    key: 'cacheLimitMB',
    kind: 'range',
    type: 'number (64-4096)',
    default: DEFAULT_SETTINGS.cacheLimitMB,
    min: CACHE_LIMIT_MIN_MB,
    max: CACHE_LIMIT_MAX_MB,
    step: 64,
    label: '缓存上限 (MB)',
    help: '音景文件本地缓存的总容量上限，超出后按最近最少使用淘汰。',
  },
  {
    key: 'proxyEnabled',
    kind: 'boolean',
    type: 'boolean',
    default: DEFAULT_SETTINGS.proxyEnabled,
    label: '平台代理下载',
    help: '关掉后只使用随插件分发的 seed 音景，不发起任何额外网络请求。',
  },
  {
    key: 'allowAutoplay',
    kind: 'boolean',
    type: 'boolean',
    default: DEFAULT_SETTINGS.allowAutoplay,
    label: '自动开始播放',
    help: '加入曲目后立刻开播。浏览器仍可能拦下无声自动播放，此时点一下播放键即可。',
  },
  {
    key: 'autoplayTarget',
    kind: 'select',
    type: "AutoplayTarget = 'both' | 'link' | 'file' | 'off'",
    default: DEFAULT_SETTINGS.autoplayTarget,
    options: [
      { value: 'both', label: '链接和文件都自动播' },
      { value: 'link', label: '只有粘贴链接自动播' },
      { value: 'file', label: '只有拖入文件自动播' },
      { value: 'off', label: '都不自动播' },
    ],
    label: '自动播放范围',
    help: '想「排队但不打断当前这首」时选「都不自动播」，加完自己按播放。',
  },
  {
    key: 'crossfadeSec',
    kind: 'range',
    type: 'number (0-12)',
    default: DEFAULT_SETTINGS.crossfadeSec,
    min: 0,
    max: 12,
    step: 1,
    label: '切歌淡入淡出 (秒)',
    help: '0 表示硬切。非 0 时新曲淡入、旧曲淡出，适合整段铺背景音的场合。',
  },
  {
    key: 'fadeOnPause',
    kind: 'boolean',
    type: 'boolean',
    default: DEFAULT_SETTINGS.fadeOnPause,
    label: '暂停时淡出',
    help: '关掉就是立刻静音，不会有一段渐弱。',
  },
  {
    key: 'startCollapsed',
    kind: 'boolean',
    type: 'boolean',
    default: DEFAULT_SETTINGS.startCollapsed,
    label: '启动时收起为胶囊',
    help: '关掉则每次打开界面都直接展开成完整卡片。',
  },
  {
    key: 'dockSize',
    kind: 'select',
    type: "DockSize = 'compact' | 'normal' | 'wide'",
    default: DEFAULT_SETTINGS.dockSize,
    options: [
      { value: 'compact', label: '小' },
      { value: 'normal', label: '中' },
      { value: 'wide', label: '大' },
    ],
    label: '胶囊大小',
    help: '三档同时缩放胶囊与展开卡片：小 248px、中 320px、大 420px。卡片打开时头部还有 ⤢ 键可以随时切档，不必进设置。',
  },
  {
    key: 'showTitles',
    kind: 'boolean',
    type: 'boolean',
    default: DEFAULT_SETTINGS.showTitles,
    label: '显示曲名',
    help: '关掉后只留走带按钮，最省纵向空间。',
  },
  {
    key: 'rememberQueue',
    kind: 'boolean',
    type: 'boolean',
    default: DEFAULT_SETTINGS.rememberQueue,
    label: '记住播放队列',
    help: '刷新页面后恢复上次的队列与进度；本地拖入的文件重启后需要重新拖。',
  },
  {
    key: 'platformTrackLimit',
    kind: 'range',
    type: 'number',
    default: DEFAULT_SETTINGS.platformTrackLimit,
    min: PLATFORM_LIMIT_MIN,
    max: PLATFORM_LIMIT_MAX,
    step: 5,
    label: '歌单识别数量',
    help: '粘贴网易云 / QQ 音乐歌单时，最多入队多少首**能播的**曲目。会员曲目与拿不到直链的会被直接跳过，不会占用这个名额。数值越大，解析等待越久。',
  },
]);

/** 归一化用的小工具，全部对 undefined / null / 字符串数字容错。 */
function toNumber(value, fallback, min, max) {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  const clamped = Math.min(max, Math.max(min, num));
  return clamped;
}

function toBool(value, fallback) {
  if (value === true || value === false) return value;
  if (value === 'true' || value === 1 || value === '1') return true;
  if (value === 'false' || value === 0 || value === '0') return false;
  return fallback;
}

function roundTo(value, step) {
  if (!Number.isFinite(step) || step <= 0) return value;
  const digits = String(step).split('.')[1];
  const scale = Math.pow(10, digits ? digits.length : 0);
  return Math.round(value * scale) / scale;
}

/**
 * 坐标对校验。两个都必须是有限数才算「记住过位置」。
 * 单个值合法、另一个是脏值时必须整体作废 —— 半残坐标会把胶囊钉到视口外。
 */
function toPoint(x, y) {
  // null 必须当「没记住位置」处理。不能落到 Number(null)===0：
  // 归一化是幂等的（测试会连跑两遍），第一遍把坐标写成 null，
  // 第二遍若把 null 读成 0，胶囊就被悄悄钉到视口左上角。
  if (x === null || y === null || x === undefined || y === undefined) return null;
  const nx = typeof x === 'number' ? x : Number(x);
  const ny = typeof y === 'number' ? y : Number(y);
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null;
  // 允许负值（多屏或窗口极小时用户可能拖出边界），但不接受荒谬量级。
  if (Math.abs(nx) > 20000 || Math.abs(ny) > 20000) return null;
  return { x: Math.round(nx), y: Math.round(ny) };
}

/**
 * 把任意输入压成合法设置。任何一条非法都退到默认值，绝不抛错。
 * @param {unknown} input
 * @returns {typeof DEFAULT_SETTINGS}
 */
export function normalizeSettings(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const volumeStep = 0.01;
  const volume = roundTo(toNumber(raw.volume, DEFAULT_SETTINGS.volume, 0, 1), volumeStep);
  const spectrumStyle = SPECTRUM_STYLES.includes(raw.spectrumStyle)
    ? raw.spectrumStyle
    : DEFAULT_SETTINGS.spectrumStyle;
  const fpsRaw = toNumber(raw.spectrumFps, DEFAULT_SETTINGS.spectrumFps, 1, 240);
  // 只接受 30 / 60 两档，其余就近取整，避免旧数据写出奇怪帧率。
  const spectrumFps = SPECTRUM_FPS.reduce((best, item) =>
    Math.abs(item - fpsRaw) < Math.abs(best - fpsRaw) ? item : best,
  );
  const loopMode = LOOP_MODES.includes(raw.loopMode) ? raw.loopMode : DEFAULT_SETTINGS.loopMode;
  const spectrumPlacement = SPECTRUM_PLACEMENTS.includes(raw.spectrumPlacement)
    ? raw.spectrumPlacement
    : DEFAULT_SETTINGS.spectrumPlacement;
  const spectrumDepth = SPECTRUM_DEPTHS.includes(raw.spectrumDepth)
    ? raw.spectrumDepth
    : DEFAULT_SETTINGS.spectrumDepth;
  const cacheLimitMB = toNumber(
    raw.cacheLimitMB,
    DEFAULT_SETTINGS.cacheLimitMB,
    CACHE_LIMIT_MIN_MB,
    CACHE_LIMIT_MAX_MB,
  );
  const spectrumBars = Math.round(toNumber(raw.spectrumBars, DEFAULT_SETTINGS.spectrumBars, 16, 96) / 8) * 8;
  const spectrumGain = roundTo(
    toNumber(raw.spectrumGain, DEFAULT_SETTINGS.spectrumGain, 0.5, 4),
    0.1,
  );
  const spectrumHeight = Math.round(
    toNumber(raw.spectrumHeight, DEFAULT_SETTINGS.spectrumHeight, 32, 160) / 8,
  ) * 8;
  const spectrumGlow = SPECTRUM_GLOWS.includes(raw.spectrumGlow)
    ? raw.spectrumGlow
    : DEFAULT_SETTINGS.spectrumGlow;
  const autoplayTarget = AUTOPLAY_TARGETS.includes(raw.autoplayTarget)
    ? raw.autoplayTarget
    : DEFAULT_SETTINGS.autoplayTarget;
  const dockSize = DOCK_SIZES.includes(raw.dockSize) ? raw.dockSize : DEFAULT_SETTINGS.dockSize;
  const crossfadeSec = Math.round(toNumber(raw.crossfadeSec, DEFAULT_SETTINGS.crossfadeSec, 0, 12));
  // 拖动位置：两个都必须是有限数才算记住过；任何一个是脏值就整体回落默认右下角，
  // 否则会算出「x 有效、y 无效」的半残坐标，胶囊直接飞出视口。
  const dockPos = toPoint(raw.dockX, raw.dockY);
  const dockX = dockPos ? dockPos.x : DEFAULT_SETTINGS.dockX;
  const dockY = dockPos ? dockPos.y : DEFAULT_SETTINGS.dockY;
  // 按 5 对齐：滑杆 step 是 5，跑出个 61 会让滑杆显示与真实值错开。
  const platformTrackLimit = Math.round(
    toNumber(raw.platformTrackLimit, DEFAULT_SETTINGS.platformTrackLimit, PLATFORM_LIMIT_MIN, PLATFORM_LIMIT_MAX) / 5,
  ) * 5;
  return {
    volume,
    spectrumStyle,
    spectrumFps,
    spectrumPlacement,
    spectrumDepth,
    spectrumBars,
    spectrumGain,
    spectrumGlow,
    spectrumHeight,
    loopMode,
    cacheLimitMB: Math.round(cacheLimitMB),
    proxyEnabled: toBool(raw.proxyEnabled, DEFAULT_SETTINGS.proxyEnabled),
    allowAutoplay: toBool(raw.allowAutoplay, DEFAULT_SETTINGS.allowAutoplay),
    autoplayTarget,
    crossfadeSec,
    fadeOnPause: toBool(raw.fadeOnPause, DEFAULT_SETTINGS.fadeOnPause),
    startCollapsed: toBool(raw.startCollapsed, DEFAULT_SETTINGS.startCollapsed),
    dockSize,
    dockX,
    dockY,
    showTitles: toBool(raw.showTitles, DEFAULT_SETTINGS.showTitles),
    rememberQueue: toBool(raw.rememberQueue, DEFAULT_SETTINGS.rememberQueue),
    platformTrackLimit,
  };
}

export function defaultSettings() {
  return normalizeSettings(DEFAULT_SETTINGS);
}

function safeStorage() {
  try {
    if (typeof localStorage === 'undefined' || localStorage === null) return null;
    return localStorage;
  } catch (_error) {
    // 隐私模式 / 被策略禁用时 getItem 会抛，当作没有存储。
    return null;
  }
}

export function readLocal() {
  const storage = safeStorage();
  if (storage === null) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (typeof raw !== 'string' || raw === '') return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return normalizeSettings(parsed);
  } catch (_error) {
    return null;
  }
}

export function writeLocal(settings) {
  const storage = safeStorage();
  if (storage === null) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(normalizeSettings(settings)));
    return true;
  } catch (_error) {
    return false;
  }
}

export function clearLocal() {
  const storage = safeStorage();
  if (storage === null) return false;
  try {
    storage.removeItem(STORAGE_KEY);
    return true;
  } catch (_error) {
    return false;
  }
}

/**
 * 事件级单例：多个 store 实例（设置页 / 主面板 / hover 卡片各拿一份）时，
 * 多标签页同步监听只挂一次，避免重复回灌。
 */
let sharedBridgeCount = 0;

function bindCrossTab(publish) {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return () => {};
  }
  const handler = (event) => {
    if (event.key !== null && event.key !== STORAGE_KEY) return;
    publish(readLocal(), 'local');
  };
  window.addEventListener('storage', handler);
  sharedBridgeCount += 1;
  return () => {
    if (typeof window.removeEventListener === 'function') {
      window.removeEventListener('storage', handler);
    }
    sharedBridgeCount = Math.max(0, sharedBridgeCount - 1);
  };
}

/**
 * 设置仓库。
 * @param {object} [ctx] 宿主 ctx（可选），有 configForms 时作为二级持久化通道。
 */
export function createSettingsStore(ctx) {
  let current = readLocal() || defaultSettings();
  let transport = 'local';
  /** @type {Set<(next: object) => void>} */
  const listeners = new Set();

  function publish(next, nextTransport) {
    current = normalizeSettings(next);
    if (nextTransport !== undefined) transport = nextTransport;
    for (const listener of [...listeners]) {
      try {
        listener(current);
      } catch (_error) {
        // 单个订阅者抛错不能拖垮其它订阅者（设置页崩了不能让播放器也停）。
      }
    }
    return current;
  }

  const unbindCrossTab = bindCrossTab((next, nextTransport) => {
    // 其它标签页改了设置：只在真正不同的时候广播，避免无意义重渲染。
    if (next === null) return;
    if (JSON.stringify(next) === JSON.stringify(current)) return;
    publish(next, nextTransport);
  });

  function formOf() {
    try {
      const forms = ctx && ctx.configForms;
      if (!forms || typeof forms.get !== 'function') return null;
      const form = forms.get(NS);
      if (!form || typeof form.getSnapshot !== 'function') return null;
      return form;
    } catch (_error) {
      return null;
    }
  }

  function loadFromForms() {
    const form = formOf();
    if (form === null) return null;
    try {
      const snapshot = form.getSnapshot();
      if (!snapshot || snapshot.status !== 'ready') return null;
      const value = snapshot.value;
      if (!value || typeof value !== 'object') return null;
      return value.settings && typeof value.settings === 'object' ? value.settings : value;
    } catch (_error) {
      return null;
    }
  }

  async function saveToForms(settings) {
    const form = formOf();
    if (form === null) return false;
    try {
      const snapshot = form.getSnapshot();
      if (!snapshot || snapshot.status !== 'ready' || snapshot.writable === false) return false;
      let wrote = 0;
      for (const key of Object.keys(settings)) {
        try {
          await form.set(key, settings[key]);
          wrote += 1;
        } catch (_error) {
          // 单字段失败不中断，按总写入数判断。
        }
      }
      return wrote > 0;
    } catch (_error) {
      return false;
    }
  }

  /**
   * 同步写：先把值写进 localStorage 并广播，再旁路写 configForms。
   * 之所以同步落地 localStorage：UI 的 onChange 立刻要看到回显，
   * 若等异步通道返回，开关会出现「点一下不动再跳一下」。
   */
  function commit(next) {
    const settings = normalizeSettings(next);
    const wroteLocal = writeLocal(settings);
    publish(settings, wroteLocal ? 'local' : 'memory');
    if (formOf() !== null) {
      // 后台补写 configForms，失败无所谓，localStorage 已经是真相。
      void saveToForms(settings).then((ok) => {
        if (ok && transport === 'local') transport = 'config+local';
      });
    }
    return settings;
  }

  return {
    ns: NS,
    storageKey: STORAGE_KEY,
    get() {
      return current;
    },
    get transport() {
      return transport;
    },
    transportName() {
      return transport;
    },
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** 一次性整体替换（导入 / 重置用）。 */
    save(next) {
      return commit(next);
    },
    /** 只改一项：设置页每一行 onChange 都走这里。 */
    patch(key, value) {
      return commit({ ...current, [key]: value });
    },
    reset() {
      return commit(defaultSettings());
    },
    /** 从 configForms 拉一次；localStorage 已有值时不覆盖（本机优先）。 */
    async load() {
      const viaForms = loadFromForms();
      if (viaForms === null) return current;
      const localRaw = readLocal();
      if (localRaw !== null) {
        // 本机已存在设置：以本机为准，但把 configForms 里的缺省键补齐进内存。
        publish({ ...viaForms, ...localRaw }, transport);
        return current;
      }
      publish(viaForms, 'config');
      return current;
    },
    dispose() {
      listeners.clear();
      unbindCrossTab();
    },
  };
}

/**
 * React 绑定。刻意不 import 'react'：调用方把 react 命名空间传进来，
 * 这样本文件在 node 里零依赖可测。
 * @param {{ useState: Function, useEffect: Function }} react
 * @param {{ get: Function, subscribe: Function }} store
 */
export function useSettings(react, store) {
  const { useState, useEffect } = react;
  // store 可能还没就绪（宿主在 effect 阶段才注入）：这种情况下保持空快照，
  // 等 store 真的到了再订阅，而不是在 effect 里对 undefined 调方法炸掉整个设置页。
  const [snapshot, setSnapshot] = useState(() => (store && typeof store.get === 'function' ? store.get() : null));
  useEffect(() => {
    if (!store || typeof store.subscribe !== 'function') return undefined;
    // 订阅里的 setState 是幂等的；normalizeSettings 保证每次都是新对象引用，
    // 但内容相同的写入会由 Object.is 之外的手动短路在 store 侧避免，这里无需额外判断。
    const off = store.subscribe((next) => setSnapshot(next));
    return () => {
      off();
    };
  }, [store]);
  return snapshot;
}
