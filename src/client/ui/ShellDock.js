/**
 * dsh-music-on —— 右下角音乐库（ShellDock）。
 *
 * 落点是宿主 `shell.overlay` 槽位。这个槽位的事实（读自
 * `dsh-client-ui-layout/lib/client.js`）：
 *   - 容器 `.AppFrame_overlayLayer` 是 `position:absolute; inset:0; z-index:20;
 *     pointer-events:none`，直接子元素自动 `pointer-events:auto`。
 *   - 坐标系原点就是整个应用视口左上角，`bottom:16px; right:16px` 即「右下空白处」。
 *   - 容器本身不可点，所以本组件最外层必须自带实体盒子，且不能撑满视口，
 *     否则会把整个界面变成不可点的遮罩。
 *
 * 三个可视状态：
 *   collapsed —— 右下角一枚胶囊（唱片图标 + 曲名 + 频谱微柱 + 播放键）
 *   expanded  —— 向上浮起的卡片：走带、进度、音量、拖放区、链接输入、队列
 *   hidden    —— 用户彻底关掉，只留一枚极小的召唤按钮
 *
 * 频谱两种形态：`bar` 贴在屏幕底边通栏（用户要的「页面底部有频谱动画」），
 * `panel` 嵌在卡片里。两者同一份 AnalyserNode 数据，不额外开上下文。
 */
import { PLUGIN_ID } from '../../shared.js';
import { intakeLinks, resolvePlatform, summarizeReport, hasDegradedItem } from '../linkintake.js';
import { entryFrom, isFavorite, subscribeLibrary, toggleFavorite } from '../library.js';

const COLLAPSE_KEY = `${PLUGIN_ID}:dock.collapsed`;
const HIDDEN_KEY = `${PLUGIN_ID}:dock.hidden`;
/** 频谱关掉之前用的是哪种样式，供快捷开关「开回来」时还原。 */
const SPECTRUM_MEMO_KEY = `${PLUGIN_ID}:spectrum.memo`;

/** 自检打的那条地址。钉一条稳定的 B 站视频，保证解析路真的有活可干。 */
const BILIBILI_PROBE_URL = 'https://www.bilibili.com/video/BV1Lyw7zPEeo/';

/** 从 localStorage 读一个布尔；隐私模式下 localStorage 会抛，一律降级为默认值。 */
function readFlag(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === '1') return true;
    if (raw === '0') return false;
  } catch (_error) {
    /* 无 localStorage：用默认值，不阻断渲染 */
  }
  return fallback;
}

/** 用户从没手动开合过 → null。用来判断「设置里的启动态该不该生效」。 */
function readFlagRaw(key) {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === '1') return true;
    if (raw === '0') return false;
  } catch (_error) {
    /* 同上 */
  }
  return null;
}

function writeFlag(key, value) {
  try {
    window.localStorage.setItem(key, value ? '1' : '0');
  } catch (_error) {
    /* 同 readonly localStorage 情形 */
  }
}

/** 通用文本读取：频谱上次开着的样式之类的短字符串。 */
function readText(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (_error) {
    return null;
  }
}

function writeText(key, value) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch (_error) {
    /* 忽略 */
  }
}

/* ============================================================
 * 播放列表持久化
 *
 * 用户要「保留不消失、可多次使用」。引擎的队列活在心里，刷新即散，
 * 所以这里把「可重建的描述」落盘：每条记录只存
 *   { kind, title, url|file|bvid|page|embedUrl, category, duration }
 * 绝不存 Blob 或 objectURL —— 前者序列化不了，后者刷新即失效。
 *
 * 本地文件（拖进来的）没有稳定地址，重建时标 `missing: true`，
 * 列表里显示成灰条并提示「请重新拖入」，而不是静默丢掉整条。
 * ============================================================ */

const QUEUE_KEY = `${PLUGIN_ID}:queue.v1`;
const QUEUE_MAX = 200;

/**
 * 把引擎的 track 压成可序列化的一条。
 * @param {object} track engine.describeTrack() 的输出
 * @returns {object|null}
 */
function serializeTrack(track) {
  if (!track || typeof track !== 'object') return null;
  const raw = track.raw || track;
  const record = {
    kind: track.kind || raw.kind || '',
    title: track.title || track.name || '',
    artist: track.artist || '',
    duration: typeof track.duration === 'number' && Number.isFinite(track.duration) ? track.duration : null,
    category: track.category || raw.category || '',
    spectrumAvailable: track.spectrumAvailable !== false,
  };
  // 按类型挑一个能重建的地址，一次只留一个字段，避免半残记录
  //
  // 平台曲目的 url 是票据路径 `/api/dsh-music-on/stream?mt=…`，票据 TTL 只有 10 分钟。
  // 落盘它等于存一条必然失效的死链（刷新后点了就报错）。所以这里**不存票据地址**，
  // 改存源歌单地址 sourceUrl，恢复时重新解析一次拿新票据。
  const ticketPath = typeof raw.url === 'string' && raw.url.startsWith('/api/dsh-music-on/stream') ? raw.url : null;
  const sourceUrl = typeof raw.sourceUrl === 'string' && /^https?:\/\//i.test(raw.sourceUrl) ? raw.sourceUrl : null;
  if (sourceUrl !== null) {
    record.sourceUrl = sourceUrl;
    record.platform = typeof raw.platform === 'string' ? raw.platform : '';
    // 单曲页地址同时留着：恢复时要靠它把「存下来的这条」对回「重新解析出的那条」。
    if (typeof raw.pageUrl === 'string' && raw.pageUrl !== '') record.pageUrl = raw.pageUrl;
  } else if (typeof raw.url === 'string' && raw.url !== '' && ticketPath === null) {
    record.url = raw.url;
  } else if (typeof raw.pageUrl === 'string' && raw.pageUrl !== '') {
    record.pageUrl = raw.pageUrl;
  }
  if (typeof raw.bvid === 'string' && raw.bvid !== '') record.bvid = raw.bvid;
  if (typeof raw.embedUrl === 'string' && raw.embedUrl !== '') record.embedUrl = raw.embedUrl;
  // 封面是纯 https 外链（平台图床），不带凭据、不会过期，可以安全落盘。
  // 不存它的话，刷新后恢复的队列全员退回纯黑胶，用户会以为播放列表被降级了。
  if (typeof raw.cover === 'string' && /^https:\/\//i.test(raw.cover)) record.cover = raw.cover;
  // 本地文件没有可重建的地址，只能留个名字让用户知道少了什么
  if (!record.url && !record.pageUrl && !record.bvid && !record.embedUrl) {
    record.missing = true;
  }
  return record;
}

function saveQueue(queue) {
  try {
    const list = (Array.isArray(queue) ? queue : []).map(serializeTrack).filter(Boolean).slice(0, QUEUE_MAX);
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(list));
  } catch (_error) {
    /* 隐私模式或超配额：静默降级，不影响本次使用 */
  }
}

function loadQueue() {
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object') : [];
  } catch (_error) {
    return [];
  }
}

function clearSavedQueue() {
  try {
    window.localStorage.removeItem(QUEUE_KEY);
  } catch (_error) {
    /* 忽略 */
  }
}


/** 秒 → m:ss；未知（NaN / Infinity / 负数）返回 '--:--'，绝不让 NaN 漏到界面。 */
function fmtTime(sec) {
  if (typeof sec !== 'number' || !Number.isFinite(sec) || sec < 0) return '--:--';
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/**
 * 显示用时长。B站 embed 会给一个 10865 秒之类的假值，那个数字来自播放器元数据，
 * 与当前音频无关，直接透到进度条会显示成「181:05」。所以只信引擎给的真实 duration。
 */
function displayDuration(state) {
  return state && state.mode === 'external' ? NaN : state && state.duration;
}

/** 曲名兜底：没有标题时不要显示 "undefined"。 */
function trackLabel(state, t) {
  const track = state && state.track;
  if (!track) return t('dock.idle', '未播放');
  return track.title || track.name || track.fileName || t('dock.untitled', '未命名');
}

/**
 * 当前曲目的「可收藏页面地址」。
 *
 * 地址由 sources.js 的 trackPageUrl 统一回推（见那里的注释）：引擎内部那份
 * 地址可能是 blob: 或 player.bilibili.com 的播放器壳，两者存进收藏都必然打不开。
 * 拿不到就返回空串，调用方据此提示原因。
 * @param {object} engine 播放引擎。
 * @returns {string} https 页面地址，或空串。
 */
function currentPageUrl(engine) {
  if (!engine || typeof engine.getState !== 'function') return '';
  const snapshot = engine.getState();
  const track = snapshot && (snapshot.currentTrack || snapshot.track);
  return track && typeof track.pageUrl === 'string' ? track.pageUrl : '';
}

/**
 * 当前曲目的封面。
 *
 * 只认 https / 同源相对路径 / blob:。
 * 特别挡住 http: —— 宿主页面是 https 或 127.0.0.1，混入 http 图片会触发
 * 混合内容拦截，界面上表现为「封面一片空白」，且控制台只有一条不可见的警告。
 * 解析层已经把 B 站的 http:// 转成 https://，这里再兜一次。
 */
function trackCover(state) {
  const track = state && state.track;
  const raw = track && (track.cover || track.coverUrl || track.artwork);
  if (typeof raw !== 'string') return null;
  const url = raw.trim();
  if (url === '') return null;
  if (/^https:\/\//i.test(url)) return url;
  if (/^(blob:|data:image\/|\/)/i.test(url)) return url;
  return null;
}

/** 三档尺寸的循环顺序与显示。用户要「大中小三个大小」。 */
const SIZE_ORDER = ['compact', 'normal', 'wide'];
const SIZE_LABELS = { compact: '小', normal: '中', wide: '大' };
const SIZE_GLYPHS = { compact: '▭', normal: '▭▭', wide: '▭▭▭' };

/**
 * 定位样式。
 *
 * pos 为 null 时交给 CSS 用 right/bottom 贴右下角 —— 这样窗口缩放会自动跟边；
 * 拖动过之后切成绝对 left/top，此时必须靠 clampToViewport 自己夹住，
 * 否则窗口一缩小胶囊就跑到视口外，用户会以为插件消失了。
 *
 * 注意：拖动过程中的实时坐标来自 liveRef，重渲染时也要读它，
 * 否则 React 会把 handler 刚写的 left/top 覆盖回拖动起点。
 */
function dockPositionStyle(pick, pos, live) {
  // 判定只看「有没有坐标」，不看 pick（holding）。
  // live 本身就是「已被拖动接管」的强信号：applyPos 一旦写过，盒子就必须按
  // 绝对 left/top 解释。若还要求 pick 为真，重渲染那一帧 holding 尚未提交时
  // 会返回 null，React 就把 handler 刚写好的 left/top 清回 CSS 的右下角 ——
  // 表现正是「按住能看见动，一停就弹回原位」。
  const point = live || pos;
  if (!point) return null;
  return { left: `${point.x}px`, top: `${point.y}px`, right: 'auto', bottom: 'auto' };
}

/**
 * 从一次 pointerdown 里解析出拖动起点。
 *
 * 关键：坐标一律相对**拖动手柄**取，而不是相对正在移动的那个盒子。
 * 展开态手柄（黑胶舞台）在卡片顶部，卡片整体往左上位移后指针仍停在画面原位，
 * 若按卡片原点算 offset，下一次 move 会算出 pos + 位移量，卡片每帧右移，
 * 越拖越远像在逃。用 handle 自身原点则恒等：位移量相同，盒子跟着指针走。
 * 回落链：el → 事件目标 → ownerDocument 的 body 尺寸（兜底不抛）。
 */
function dragAnchorFrom(el, clientX, clientY) {
  if (el && typeof el.getBoundingClientRect === 'function') {
    const rect = el.getBoundingClientRect();
    return { offsetX: clientX - rect.left, offsetY: clientY - rect.top, width: rect.width, height: rect.height };
  }
  return { offsetX: 0, offsetY: 0, width: 0, height: 0 };
}

/**
 * 当前曲目该走哪条渲染通道。
 *
 * 之前这里只有「有没有在播」，结果就是：B 站链接解析成功、引擎把状态切到
 * external（音频元素已卸、频谱停），而这块界面**根本没有 iframe**，
 * 于是界面显示播放中、耳朵里一片安静 —— 用户看到的就是「加入成功但不播放」。
 *
 * 判定顺序不能反：先看 embedUrl 是否存在（url-audio 降级后 embedUrl 仍在），
 * 再看 mode。只看 mode 会漏掉「kind 仍是 url-audio、只是降级了」的情况。
 *
 * @returns {{ external: boolean, embedUrl: string|null }}
 */
function playbackSurface(state) {
  const track = state && state.track;
  const embedUrl = track && typeof track.embedUrl === 'string' && track.embedUrl !== '' ? track.embedUrl : null;
  const external = Boolean(embedUrl) || (state && state.mode === 'external');
  return { external, embedUrl };
}

/**
 * 把引擎快照归一成 UI 用的形状。
 *
 * 这是「明明在播却显示未播放、进度条不动」的病根：引擎给的是
 * `status='playing'` / `currentTime` / `currentTrack`，而 UI 一直在读
 * `playing` / `position` / `track` —— 三个字段全部落空，于是布尔值恒为
 * undefined、时间恒为 0。归一化集中在一处，任何一侧改名字都只改这里。
 *
 * @param {object} state engine.getState() 的快照
 */
function normalizeState(state) {
  const src = state || {};
  const status = typeof src.status === 'string' ? src.status : '';
  const track = src.currentTrack || src.track || null;
  const position = typeof src.currentTime === 'number'
    ? src.currentTime
    : typeof src.position === 'number' ? src.position : 0;
  // 引擎在 track 里塞的是 duration；external 时 displayDuration 会压成 NaN。
  // track 可能是 null（还没载入任何曲目），全靠可选链兜住。
  const trackDuration = track && typeof track.duration === 'number' ? track.duration : NaN;
  const rawDuration = typeof src.duration === 'number' ? src.duration : trackDuration;
  const duration = displayDuration({ ...src, track, duration: rawDuration });
  return {
    ...src,
    track,
    currentTrack: track,
    status,
    playing: src.playing === true || status === 'playing',
    loading: status === 'loading',
    busy: src.busy === true || status === 'loading' || status === 'switching',
    position,
    currentTime: position,
    duration,
  };
}

/**
 * 右下角音乐库。
 *
 * props 由 register.js 注入（不走宿主 inject 表面，因为那些服务对
 * shell.overlay 这个 root 级槽位不是必需的）：`{ engine, store, t, React }`。
 */
export function createShellDock(props) {
  const { engine, store, t } = props;
  const { useState, useEffect, useRef, useCallback, useMemo, createElement: h } = props.React;

  return function ShellDock() {
    const settings = useStoreSnapshot(props.React, store);

    // 首帧就必须听设置：若靠 useEffect 二次修正，刷新瞬间会在右下角闪一下
    // 收起胶囊再变成展开卡片，观感像「卡了一帧」。所以初值直接读设置，
    // 本地手动开合记录（readFlagRaw 非 null）优先。
    const [collapsed, setCollapsed] = useState(() => {
      const manual = readFlagRaw(COLLAPSE_KEY);
      if (manual !== null) return manual;
      return settings ? settings.startCollapsed !== false : true;
    });
    const [hidden, setHidden] = useState(() => readFlag(HIDDEN_KEY, false));
    const [state, setState] = useState(() => normalizeState(engine && engine.getState ? engine.getState() : {}));
    const [queue, setQueue] = useState(() => (engine && engine.getQueue ? engine.getQueue() : []));
    const [draft, setDraft] = useState('');
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState(null); // { tone: 'ok'|'bad', text }
    const [dragging, setDragging] = useState(false);
    /**
     * 当前曲目是否已收藏。
     *
     * 必须在任何 useCallback 之前声明：依赖数组在渲染期求值，声明到下方会抛
     * `ReferenceError: Cannot access 'x' before initialization`（本插件踩过两次）。
     * 初值同步读一次存储，避免首帧渲染出空心星再跳成实心。
     */
    const [favOn, setFavOn] = useState(() => {
      const url = currentPageUrl(engine);
      return url === '' ? false : isFavorite(url);
    });
    /**
     * 拖动定位的「按下即接管」临时状态。
     *
     * 这里必须有一个**按下就立刻生效**的开关，而不是等到指针移动 3px 才切绝对定位。
     * 原因链：卡片静止时是 `right/bottom` 贴角，而 base 偏移量的参照物（手柄黑胶）
     * 是被 flex 居中/右对齐在卡片里的；一旦按下不动就切到 `left/top`，没有位移，
     * 画面零变化。若等到有位移才切，第一帧的位置会按「右下角体系」解释，
     * 于是拖动第一下是跳跃的。所以：pointerdown → holding=true → 位置在当前坐标
     * 落定（视觉不动）→ 之后每帧都按同一条 left/top 逻辑推进。
     *
     * 注意：holding 的真正声明在下方「拖动定位」段 —— 那里要先读到 settings 里
     * 已保存的 dockX/dockY 才能决定初值，不能在这里就写死 false。
     */
    const [peekSpectrum, setPeekSpectrum] = useState(false);
    /** back 模式下想临时看一眼，不该永久改变设置，3 秒后自动沉回去。 */
    useEffect(() => {
      if (!peekSpectrum) return undefined;
      const timer = window.setTimeout(() => setPeekSpectrum(false), 3000);
      return () => window.clearTimeout(timer);
    }, [peekSpectrum]);
    const dragDepth = useRef(0);
    /**
     * 音量旋钮的三件套。
     *
     * `volumeRef` 是必须的：滚轮一次能连发好几个事件，而 setState/设置落盘都是
     * 异步批量提交的，第二次事件读 settings 里的 volume 仍是旧值 —— 连滚十格只涨一格。
     * 所以旋钮的「当前值」以 ref 为准，settings 只负责跨刷新持久化。
     */
    const knobRef = useRef(null);
    const knobDragRef = useRef(null);
    /**
     * 旋钮拖动的 window 监听，与胶囊拖动同构。
     *
     * 旋钮直径只有 30px，指针往外甩几像素就离开元素，React 的 onPointerMove
     * 随即不再派发 —— 拖动当场断掉。必须挂 window 才收得到。
     */
    const knobListenersRef = useRef(null);
    /** onKnobDown（靠前）要调 onKnobUp（靠后），用 ref 中转绕开依赖前向引用。 */
    const onKnobUpRef = useRef(null);
    const volumeRef = useRef(typeof settings.volume === 'number' ? settings.volume : 0.8);
    /** 拖动结束那次补发的 click 要吃掉，否则「调完音量顺手被静音」。 */
    const knobMovedRef = useRef(false);
    /** 静音前的音量，供再点一次恢复（固定回 0.8 会把用户的细调抹掉）。 */
    const lastLoudRef = useRef(0.8);
    /**
     * 旋钮自己的显示值。
     *
     * 为什么不直接读 settings.volume：拖动旋钮时每一帧都调 applyVolume(commit=false)，
     * 不落盘就不会有新的 settings 快照回流，指针会停在按下那一刻而旋钮纹丝不动。
     * 也没有反过来「每帧都落盘换一次重渲染」—— 那会把设置 store 打成筛子。
     */
    const [knobValue, setKnobValue] = useState(volumeRef.current);
    const [knobDragging, setKnobDragging] = useState(false);

    // ---- 设置派生的常量必须全部集中在这里，位于任何 useCallback 之前 ----
    // 铁律：useCallback 的依赖数组在渲染期就被求值。把依赖项声明到下方，
    // 每次渲染都会抛 `ReferenceError: Cannot access 'x' before initialization`，
    // React 随即卸载整棵子树 —— 界面右下角空白，而服务端路由、bundle 内容、
    // 安装自检全部照常通过，三套证据都不指向这里。
    // 音量不再有 `vol` 派生常量：它以旋钮自己的 knobValue 为准（拖动时不落盘、
    // 不等 settings 回流），settings.volume 只负责跨刷新持久化，见 applyVolume。
    const spectrumCfg = {
      style: settings.spectrumStyle || 'dots',
      fps: settings.spectrumFps || 60,
      bars: settings.spectrumBars || 48,
      gain: typeof settings.spectrumGain === 'number' ? settings.spectrumGain : 1,
      glow: settings.spectrumGlow || 'soft',
      height: settings.spectrumHeight || 64,
      // 宽度百分比交给外壳算像素：Spectrum 只认自己容器的真实宽度。
      span: Number.isFinite(Number(settings.spectrumSpan)) ? Number(settings.spectrumSpan) : 80,
    };
    const spectrumStyle = spectrumCfg.style;
    const spectrumSpan = Math.min(100, Math.max(20, spectrumCfg.span));
    /** 配色主题：只换 CSS 令牌，不动结构。 */
    const theme = settings.theme || 'whale';
    const spectrumPlacement = settings.spectrumPlacement || 'bar';
    /** 通栏频谱的层级：front 浮在页面前，back 藏在页面里只透出暗纹。 */
    const spectrumDepth = settings.spectrumDepth === 'back' ? 'back' : 'front';
    /** 用户在卡片里临时把「藏起来」的频谱提上来看一眼。 */
    const spectrumPeek = spectrumDepth === 'back' && peekSpectrum;
    const dockSize = settings.dockSize || 'normal';
    const showTitles = settings.showTitles !== false;
    const autoplayTarget = settings.autoplayTarget || 'both';
    const autoOn = settings.allowAutoplay !== false && autoplayTarget !== 'off';
    const autoLinks = autoOn && (autoplayTarget === 'both' || autoplayTarget === 'link');
    const autoFiles = autoOn && (autoplayTarget === 'both' || autoplayTarget === 'file');
    // 歌单一次入队多少首**能播的**曲目。筛选在宿主侧完成（见 resolve.js 的
    // collectPlayableTracks）：客户端只负责把这个数传过去。
    const trackLimit = Number.isFinite(Number(settings.platformTrackLimit))
      ? Number(settings.platformTrackLimit)
      : 60;

    // ---- 订阅引擎状态。三个回调都由 engine 返回取消函数。 ----
    useEffect(() => {
      if (!engine || typeof engine.onStateChange !== 'function') return undefined;
      // 进度是独立事件（250ms 一推），必须单独订阅，否则「进度条不动」。
      // 状态事件只在切歌/播放/暂停时来，之间那几十秒时间轴全靠这条。
      const offTime = typeof engine.onTimeUpdate === 'function'
        ? engine.onTimeUpdate((tick) => {
          const time = tick && typeof tick === 'object' ? tick.currentTime : tick;
          if (typeof time !== 'number' || !Number.isFinite(time)) return;
          setState((prev) => normalizeState({
            ...prev,
            currentTime: time,
            duration: tick && typeof tick.duration === 'number' ? tick.duration : prev.duration,
          }));
        })
        : undefined;
      const offState = engine.onStateChange((next) => setState(normalizeState(next || {})));
      const offTrack = typeof engine.onTrackChange === 'function'
        ? engine.onTrackChange(() => setState(normalizeState(engine.getState ? engine.getState() : {})))
        : undefined;
      const offQueue = typeof engine.onQueueChange === 'function'
        ? engine.onQueueChange((next) => {
          // 引擎推的是 {items, currentIndex}，早期 UI 也接受裸数组。两种都吃下，
          // 否则队列区域永远停在「拖入音频」这句空文案上。
          if (Array.isArray(next)) setQueue(next);
          else if (next && Array.isArray(next.items)) setQueue(next.items);
          else setQueue([]);
        })
        : undefined;
      const offError = typeof engine.onError === 'function'
        ? engine.onError((error) => {
          const text = error && error.message ? error.message : String(error);
          setNote({ tone: 'bad', text });
        })
        : undefined;
      // 首帧补齐：注册监听之前可能已经在播。
      if (typeof engine.getState === 'function') setState(normalizeState(engine.getState()));
      if (typeof engine.getQueue === 'function') {
        const initial = engine.getQueue();
        setQueue(Array.isArray(initial) ? initial : initial && Array.isArray(initial.items) ? initial.items : []);
      }
      return () => {
        if (offTime) offTime();
        if (offState) offState();
        if (offTrack) offTrack();
        if (offQueue) offQueue();
        if (offError) offError();
      };
    }, []);

    useEffect(() => { writeFlag(COLLAPSE_KEY, collapsed); }, [collapsed]);
    useEffect(() => { writeFlag(HIDDEN_KEY, hidden); }, [hidden]);

    // ---- 拖动定位 ----
    //
    // 位置以「viewport 坐标」存进设置（dockX / dockY），null 表示走默认右下角：
    // 默认位置用 CSS 的 right/bottom 表达，窗口缩放时自动贴边；一旦拖动过就切成
    // 绝对 left/top，此时必须自己夹在视口内，否则窗口一缩小胶囊就飞出屏幕外。
    const [pos, setPos] = useState(() => {
      const sx = settings.dockX;
      const sy = settings.dockY;
      return typeof sx === 'number' && typeof sy === 'number' ? { x: sx, y: sy } : null;
    });
    /**
     * 已保存过位置的胶囊，刷新后就该直接按 left/top 定位。
     *
     * holding 原本只表示「这一次按下中」，初值是 false；于是刷新后 pos 有值、
     * holding 却是 false，dockPositionStyle 直接返回 null，CSS 的 right/bottom
     * 又把胶囊拉回右下角 —— 用户看到的就是「拖完刷新就回去了」。
     * 起始 holding 必须由 pos 是否为空决定。
     */
    const [holding, setHolding] = useState(() => {
      const sx = settings.dockX;
      const sy = settings.dockY;
      return typeof sx === 'number' && typeof sy === 'number';
    });
    // dragging 已在文件上方声明（拖放文件用），这里复用同一个标志：
    // 拖动定位与拖入文件都会让胶囊进入「拾起」的视觉态，语义一致。
    /** 拖动中不回写设置：每帧都 patch 会把 localStorage/配置通道打爆。 */
    const dragRef = useRef(null);
    const posRef = useRef(pos);
    posRef.current = pos;
    /**
     * 拖动期间的实时坐标。与 `pos` 的分工：
     *   - `pos`（state）只记「最终落点」，落手后才 set，触发一次重渲染并持久化；
     *   - `liveRef`（可变对象）记「这一刻盒子在哪」，pointermove 每帧改它，不重渲染。
     *
     * 两者都必须被渲染期的 dockPositionStyle 读到，否则 React 每帧都会用
     * 过期的 `pos` 把 left/top 覆盖回去 —— 这正是前几轮「拖不动」的直接原因。
     */
    const liveRef = useRef(null);
    const holdingRef = useRef(false);
    const stackRef = useRef(null);
    /**
     * 手柄各自的 ref。
     *
     * 不用 event.currentTarget 取参照物：pointer capture 生效后 currentTarget 仍对，
     * 但 React 的合成事件在 capture 期间 currentTarget 可能已被置空（宿主对不同
     * React 版本行为不一致）。拿显式 ref 是唯一稳定的参照物来源。
     */
    const collapsedHandleRef = useRef(null);
    const stageHandleRef = useRef(null);
    /** 胶囊/卡片本体。定位基准与尺寸测量都用它，手柄在盒子里不是顶点。 */
    const panelRef = useRef(null);

    /** 落点持久化。只能在这里写 store —— 每帧 move 都 patch 会把存储通道打爆。 */
    const commitPos = useCallback((next) => {
      if (!store || typeof store.patch !== 'function') return;
      store.patch('dockX', next ? next.x : null);
      store.patch('dockY', next ? next.y : null);
    }, [store]);

    /** 把坐标夹进视口，并至少留 40px 可见，防止拖到完全摸不着。 */
    const clampToViewport = useCallback((x, y) => {
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
      const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
      const el = panelRef.current || stackRef.current;
      const w = el && el.offsetWidth ? el.offsetWidth : 320;
      const hgt = el && el.offsetHeight ? el.offsetHeight : 64;
      const margin = 40;
      const maxX = Math.max(margin, vw - w);
      const maxY = Math.max(margin, vh - hgt);
      return {
        x: Math.round(Math.min(Math.max(-(w - margin), x), maxX)),
        y: Math.round(Math.min(Math.max(0, y), maxY)),
      };
    }, []);

    /**
     * 拖拽接管。
     *
     * 铁律：**拖动期间位置只有唯一来源**。
     *
     * 之前的写法是 applyPos 直接往面板的 style 上写 left/top，而 React 每次重渲染
     * 都会用 `...dockPositionStyle(holding, pos)` 整份覆盖 style —— pos 是 state，
     * 拖动过程中从不更新。于是每帧的顺序是「handler 写 left → React 覆盖回原点」，
     * 盒子纹丝不动，用户看到的就是「怎么拖都不动」。
     *
     * 现在改成：位置写进 `liveRef`（可变对象，不触发重渲染），重渲染时由
     * dockPositionStyle 读它；同时往 DOM 上写一次内联样式，保证 handler 当帧生效，
     * 不等 React。两条路径读同一个来源，谁后写都是同一个值。
     */
    const applyPos = useCallback((next) => {
      const point = { x: next.x, y: next.y };
      liveRef.current = point;
      // 同步把「拖过之外」的状态也推进到位。
      // holdingRef 必须在第一个 setState 之前置真 —— 否则这一次重渲染仍按
      // 「右下角贴边」解释位置，而下一帧才切绝对定位，中间会闪一次。
      const wasHolding = holdingRef.current;
      holdingRef.current = true;
      // 只能写外层 .dmo-dock-stack：它是 position:absolute 的定位盒，
      // 内层 .dmo-dock 被 `.dmo-dock-stack > .dmo-dock` 降级成 position:relative，
      // 在相对定位上写 left:690px 表示「从静态位置右移 690px」，与 viewport 坐标
      // 不是同一个体系 —— 夹取算出来的视口坐标会被当成偏移量，越拖越偏。
      const el = stackRef.current || panelRef.current;
      if (el && el.style) {
        el.style.left = `${point.x}px`;
        el.style.top = `${point.y}px`;
        el.style.right = 'auto';
        el.style.bottom = 'auto';
      }
      if (!wasHolding) setHolding(true);
    }, []);

    /**
     * 拖动监听解绑器。
     *
     * 为什么必须在 window 上挂监听，而不是只靠 React 的 onPointerMove：
     * pointermove 只在指针**位于该元素上方**时才派发给它。胶囊只有几十像素宽，
     * 用户一拖就必然把指针甩到胶囊之外，那一刻事件不再上门，拖动当场断掉
     * —— 用户看到的就是「按下去没反应 / 拖两下就掉」。
     *
     * 唯一的解药就是在 window 上挂监听：指针跑到视口任何角落都收得到，
     * 元素被 React 卸载重建也照样有效。这也是本插件拖动通道的**唯一**实现。
     *
     * 绝不要「顺手再加一层 setPointerCapture 保险」—— 捕获会把 compatibility
     * mouse events 的目标重定向到捕获元素，合成出的 click 于是落在容器而非按钮上，
     * 结果是「能拖了，但所有按钮点了都没反应」。详见 onDragStart 里的说明。
     */
    const dragListenersRef = useRef(null);

    /**
     * 拖动结束后的那一次 click 必须被吃掉。
     *
     * 收起态整枚胶囊都是拖动面，而胶囊里同时有「展开」按钮与「频谱」按钮。
     * 用户按住拖完松手时，只要指针还停在按钮上，浏览器就会照常合成一次 click
     * 派给那个按钮 —— 结果是「想拖动，却把卡片拖开了」。模拟器测不到这一层，
     * 因为它是浏览器对 pointerdown/pointerup 的原生合成行为，不是 React 逻辑。
     */
    const suppressClickRef = useRef(false);

    const detachDragListeners = useCallback(() => {
      const off = dragListenersRef.current;
      dragListenersRef.current = null;
      if (!off || typeof window === 'undefined') return;
      window.removeEventListener('pointermove', off.move);
      window.removeEventListener('pointerup', off.up);
      window.removeEventListener('pointercancel', off.up);
    }, []);

    /** 拖动核心：只吃 pointerId/clientX/clientY，与事件来源无关（React 或 window 都能喂）。 */
    const stepDrag = useCallback((event) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const next = clampToViewport(event.clientX - drag.grabX, event.clientY - drag.grabY);
      if (!drag.moved) {
        // 4px 死区：按住不动时的轻微抖动不该被当成拖动，否则单击展开会失灵。
        if (Math.abs(event.clientX - drag.startX) < 4 && Math.abs(event.clientY - drag.startY) < 4) return;
        drag.moved = true;
        // 一旦真拖动过，落手后的那次 click 就是副作用，必须抑制。
        suppressClickRef.current = true;
        // 越过死区才进入「拾起」态：这一次 setState 之后，定位交给 liveRef。
        setDragging(true);
        setHolding(true);
        holdingRef.current = true;
      }
      drag.last = next;
      applyPos(next);
    }, [applyPos, clampToViewport]);

    const finishDrag = useCallback((event) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      dragRef.current = null;
      detachDragListeners();
      setDragging(false);
      if (drag.moved) {
        // 落手后的那次 click 由 swallowClickAfterDrag 吃掉。但若指针已经拖离胶囊，
        // 那次 click 根本不会派发到这里，标志位会残留下来 —— 用一个 0ms 兜底复位，
        // 保证它最多只影响紧接着的那一次点击，不会把用户下一次真心点击也吞掉。
        if (typeof setTimeout === 'function') {
          setTimeout(() => { suppressClickRef.current = false; }, 0);
        }
      }
      if (drag.moved && drag.last) {
        // 落手：liveRef 与 state 收敛到同一个点，并持久化。
        liveRef.current = { x: drag.last.x, y: drag.last.y };
        setPos(drag.last);
        commitPos(drag.last);
      } else {
        // 没真正拖动：撤销「按下即接管」，回到贴角定位体系。
        // liveRef 必须一起清掉，否则下次渲染仍按左上来解释位置。
        holdingRef.current = false;
        liveRef.current = null;
        setHolding(false);
      }
    }, [commitPos, detachDragListeners]);

    const onDragStart = useCallback((event) => {
      // 只认主键，避开右键菜单与中键滚动。
      if (event.button !== 0) return;
      // 取 rect 要用**真正承载绝对定位的那只盒子**（.dmo-dock-stack）：
      // 内层 .dmo-dock 被 CSS 降级成 position:relative，两者虽贴在一起、
      // 但只有 stack 的 left/top 才是 viewport 坐标系里的落点。
      const panel = stackRef.current || panelRef.current || event.currentTarget;
      if (!panel || typeof panel.getBoundingClientRect !== 'function') return;
      const rect = panel.getBoundingClientRect();
      // 已经有一次拖动在跑（同一次按下被内外两层都收到）就别覆盖起点，
      // 否则 grabX 会被算成相对另一个节点的偏移，盒子开始乱跳。
      if (dragRef.current && dragRef.current.pointerId === event.pointerId) return;
      detachDragListeners();
      dragRef.current = {
        pointerId: event.pointerId,
        // 指针相对盒子左上角的偏移 —— 拖动时保持这个偏移，盒子才会「跟手」。
        grabX: event.clientX - rect.left,
        grabY: event.clientY - rect.top,
        moved: false,
        startX: event.clientX,
        startY: event.clientY,
        origin: { x: rect.left, y: rect.top },
        panel,
      };
      /*
       * 按下只登记起点，**不 setState**。
       *
       * 之前按下就 applyPos + setDragging(true)，两者都会触发重渲染，
       * 而重渲染期间 React 会把 ref 回调重新执行一遍，某些路径下形成
       * 「渲染 → setState → 渲染」的自激环（实测报 Maximum call stack size exceeded）。
       * 现在按下阶段零状态变更：盒子原地不动，等 pointermove 越过 4px 死区
       * 才真正接管定位。少了这次无谓重渲染，单击展开也更干净。
       */
      /*
       * 这里**绝不能调 setPointerCapture**。
       *
       * 指针捕获会把该指针的 compatibility mouse events 目标一并重定向到捕获元素：
       * pointerdown 与 pointerup 都落在整枚胶囊上，浏览器于是把合成出的 click 的
       * target 也设成胶囊本身，而不是指针底下的那个按钮 —— 结果就是「能拖了，
       * 但所有按钮点了都没反应」，因为子按钮的 onClick 永远收不到事件。
       *
       * 拖动本身不依赖捕获：window 监听是主通道，指针跑到视口任何角落都收得到，
       * 元素在拖动中被 React 卸载重建也照样有效。捕获纯属多余，且有害。
       */
      if (typeof window !== 'undefined') {
        dragListenersRef.current = { move: stepDrag, up: finishDrag };
        window.addEventListener('pointermove', stepDrag);
        window.addEventListener('pointerup', finishDrag);
        window.addEventListener('pointercancel', finishDrag);
      }
    }, [detachDragListeners, stepDrag, finishDrag]);

    /** React 侧通道：与 window 通道同一套逻辑，谁先到都算数（重复到达会被 moved/last 覆盖，无副作用）。 */
    const onDragMove = useCallback((event) => { stepDrag(event); }, [stepDrag]);
    const onDragEnd = useCallback((event) => { finishDrag(event); }, [finishDrag]);

    /**
     * 吃掉「拖动结束后的那一次 click」。
     *
     * 挂在外层容器的捕获阶段，这样无论落点落在展开按钮、频谱键还是正文上，
     * 都由这里先拦下，不必给每个子按钮各加一道判断。标志位只对紧接着的那一次
     * click 生效：读完立刻复位，避免把用户下一次真心点击也一起吞掉。
     */
    const swallowClickAfterDrag = useCallback((event) => {
      if (!suppressClickRef.current) return;
      suppressClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
    }, []);

    // 组件卸载时务必摘掉挂在 window 上的监听，否则整页会残留一个吃 pointermove 的幽灵。
    useEffect(() => () => detachDragListeners(), [detachDragListeners]);

    // 收藏状态跟着「当前曲目」与「存储变化」两条线走：换歌要重算，
    // 在设置页删掉收藏、或另一个标签页改了收藏，这里也要跟着变。
    useEffect(() => {
      const sync = () => {
        const url = currentPageUrl(engine);
        setFavOn(url === '' ? false : isFavorite(url));
      };
      sync();
      return subscribeLibrary(sync);
    }, [engine, state.track]);

    /**
     * 收藏 / 取消收藏当前曲目。
     *
     * 地址一律取 track.pageUrl —— 引擎内部那份地址可能是 blob: 或
     * player.bilibili.com 的播放器壳，存进去重启后必然打不开。
     * pageUrl 由 sources.js 的 trackPageUrl 统一回推成原始页面地址。
     */
    const toggleFav = useCallback(() => {
      const track = state.track;
      const url = track && typeof track.pageUrl === 'string' ? track.pageUrl : '';
      if (url === '') {
        flash(t('dock.favNoUrl', '当前曲目没有可收藏的链接地址'));
        return;
      }
      const result = toggleFavorite(entryFrom(url, {
        title: track.title,
        platform: track.kind === 'external-embed' ? 'bilibili' : undefined,
      }));
      setFavOn(result.favorited === true);
      flash(result.favorited === true
        ? t('dock.favorited', '已收藏')
        : t('dock.unfavorited', '已取消收藏'));
    }, [state.track, t]);

    /** 双击手柄复位到默认右下角。 */
    const onDragReset = useCallback(() => {
      dragRef.current = null;
      holdingRef.current = false;
      liveRef.current = null;
      setHolding(false);
      setDragging(false);
      setPos(null);
      // 两层的行内定位都要清：定位写在 stack 上，但旧版本往 panel 也写过，
      // 残留的内联 left/top 会让复位后的胶囊依然卡在绝对定位里。
      for (const el of [stackRef.current, panelRef.current]) {
        if (!el || !el.style) continue;
        el.style.left = '';
        el.style.top = '';
        el.style.right = '';
        el.style.bottom = '';
      }
      commitPos(null);
    }, [commitPos]);

    // 窗口尺寸变化后重新夹一遍，避免胶囊被挤出可视区。
    useEffect(() => {
      if (!pos) return undefined;
      const handle = () => {
        setPos((prev) => (prev ? clampToViewport(prev.x, prev.y) : prev));
      };
      window.addEventListener('resize', handle);
      return () => window.removeEventListener('resize', handle);
    }, [pos, clampToViewport]);

    /**
     * 队列落盘。
     *
     * 只写「可重建的描述」，不写引擎对象。条件：
     *   - 设置里 rememberQueue 打开（用户可关）；
     *   - 队列非空，或确实是用户清空了（此时也要写空，否则下次又冒出来）。
     */
    const queueReadyRef = useRef(false);
    useEffect(() => {
      if (!settings.rememberQueue) return;
      // 首帧不下笔：那一刻 queue 还是初始空数组，写下去会抹掉上次保存的列表。
      if (!queueReadyRef.current) {
        queueReadyRef.current = true;
        return;
      }
      saveQueue(queue);
    }, [queue, settings.rememberQueue]);

    // 提示条自行消失，但不打断任何操作。
    // 失败提示给足 15 秒：解析失败的原因（HTTP 状态、上游文案）是一整句话，
    // 4 秒来不及读，等于没提示。点一下也能立刻关掉。
    useEffect(() => {
      if (note === null) return undefined;
      const ttl = note.tone === 'bad' ? 15000 : 4000;
      const timer = window.setTimeout(() => setNote(null), ttl);
      return () => window.clearTimeout(timer);
    }, [note]);

    // ---- 操作面。全部包一层 try：任何一个抛错都不能炸掉整块界面。 ----
    const guard = useCallback((fn) => async (...args) => {
      try {
        await fn(...args);
      } catch (error) {
        setNote({ tone: 'bad', text: error && error.message ? error.message : String(error) });
      }
    }, []);

    /**
     * 瞬时提示：给「开关类」操作专用。
     *
     * 卡片展开时提示条在卡片里，收起时必须有个可读的确认 —— 否则用户按了
     * 频谱开关、界面毫无变化（收起态本来就不画频谱），只能以为按钮失灵。
     * 用 useRef 转发而不是 useCallback：它必须在 toggleSpectrum 的定义之前
     * 就存在，而 toggleSpectrum 又要在依赖数组里引用一个稳定引用。
     */
    const flashRef = useRef(setNote);
    flashRef.current = setNote;
    const flash = useCallback((text) => {
      flashRef.current({ tone: 'ok', text });
    }, []);

    const togglePlay = guard(async () => {
      if (!engine) return;
      await engine.toggle();
    });

    /**
     * 从磁盘恢复队列。
     *
     * 只做一次，且仅当引擎队列为空时。恢复逐条走 engine.addUrl / addEmbed / addBilibili，
     * 全部带 playFirst:false —— 刷新页面不该突然出声。
     * 本地文件条目没有可重建地址（标了 missing），跳过，不当作失败。
     *
     * 位置纪律：必须放在 flash 之后。effect 的依赖数组在渲染期求值，
     * 引用到下方才声明的 useCallback 会抛 ReferenceError 并卸载整棵子树
     * —— 这正是右下角胶囊整块消失过的原因。
     */
    const restoredRef = useRef(false);
    useEffect(() => {
      if (restoredRef.current) return;
      if (!engine || typeof engine.addUrl !== 'function') return;
      restoredRef.current = true;
      if (!settings.rememberQueue) return;
      const current = typeof engine.getQueue === 'function' ? engine.getQueue() : [];
      const currentCount = Array.isArray(current) ? current.length : (current && Array.isArray(current.items) ? current.items.length : 0);
      if (currentCount > 0) return;
      const saved = loadQueue();
      if (saved.length === 0) return;
      const run = async () => {
        let restored = 0;
        let deadTickets = 0;
        // 第一遍：平台曲目按源歌单分组，一个歌单只重新解析一次。
        // 票据 TTL 10 分钟、宿主重启还换密钥，落盘的票据地址刷新后必然已死，
        // 所以这里必须换一张新票据，不能拿旧地址直接 addUrl。
        const bySource = new Map();
        for (const item of saved) {
          if (!item || item.missing) continue;
          const src = typeof item.sourceUrl === 'string' ? item.sourceUrl : null;
          if (src === null) continue;
          if (!bySource.has(src)) bySource.set(src, []);
          bySource.get(src).push(item);
        }
        for (const [src, wanted] of bySource) {
          let resolved = null;
          try {
            resolved = await resolvePlatform(src, { limit: trackLimit });
          } catch (_error) {
            resolved = null;
          }
          if (resolved === null || resolved.ok !== true) {
            deadTickets += wanted.length;
            continue;
          }
          // 按单曲页地址对回原来的条目；对不上就按标题兜底。
          const pool = Array.isArray(resolved.tracks) ? resolved.tracks : [];
          for (const item of wanted) {
            const match = pool.find((t) => typeof t.pageUrl === 'string' && t.pageUrl === item.pageUrl)
              || pool.find((t) => item.title && t.title === item.title);
            if (!match || typeof match.streamPath !== 'string' || match.streamPath === '') {
              deadTickets += 1;
              continue;
            }
            try {
              await engine.addPlatform({
                streamPath: match.streamPath,
                pageUrl: match.pageUrl || item.pageUrl,
                sourceUrl: src,
                title: match.title || item.title,
                artist: match.artist,
                duration: match.duration,
                platform: item.platform,
                id: match.id,
                cover: match.cover,
                reason: null,
              }, { playFirst: false });
              restored += 1;
            } catch (_error) {
              deadTickets += 1;
            }
          }
        }
        // 第二遍：其余条目按地址直接恢复。
        for (const item of saved) {
          if (!item || item.missing || item.sourceUrl) continue;
          try {
            if (item.embedUrl && typeof engine.addEmbed === 'function') {
              await engine.addEmbed(item.embedUrl, { playFirst: false, title: item.title });
            } else if (item.url || item.pageUrl) {
              await engine.addUrl(item.url || item.pageUrl, { playFirst: false });
            } else if (item.bvid && typeof engine.addBilibili === 'function') {
              await engine.addBilibili({ bvid: item.bvid, title: item.title }, { playFirst: false });
            } else {
              continue;
            }
            restored += 1;
          } catch (_error) {
            /* 单条恢复失败不打断其余条目 */
          }
        }
        if (restored > 0) {
          const extra = deadTickets > 0
            ? t('dock.queueRestoredPartial', { count: deadTickets })
            : '';
          flash(t('dock.queueRestored', `已恢复上次的播放列表（${restored} 条）`) + extra);
        } else if (deadTickets > 0) {
          // 一条都恢复不了时必须说话：静默失败会让用户以为持久化根本没生效。
          flashRef.current({
            tone: 'bad',
            text: t('dock.queueRestoreFailed', `上次的 ${deadTickets} 条平台曲目需要重新解析，请重新粘贴歌单链接`),
          });
        }
      };
      void run();
    }, [engine, settings.rememberQueue, flash, t, trackLimit]);

    /**
     * 关掉外部播放器。
     *
     * 只做两件事：收起 iframe、停掉这条音源。不动队列 —— 用户可能还想留着它。
     * 引擎在 external 模式下 audio 是空的，pause() 若无副作用则顺手吞掉异常。
     */
    const closeEmbed = guard(async () => {
      setEmbedDismissed(true);
      if (engine) {
        try {
          if (typeof engine.pause === 'function') await engine.pause();
        } catch (error) {
          // 外部模式下没有可暂停的内部元素，属正常情况，不打扰用户。
          void error;
        }
      }
      flash(t('dock.embedClosed', '外部播放器已关闭，可在播放列表里重新打开'));
    });

    const addFiles = useCallback(async (files) => {
      if (!engine || !files || files.length === 0) return;
      setBusy(true);
      try {
        // playFirst 必须有：引擎只有在「当前没在播 + playFirst」时才会自动开播，
        // 不给这个参数的表现就是「提示已加入，但一声不响」。
        // 是否真的给，由设置页的「自动播放范围」决定（autoFiles）。
        const result = await engine.addFiles(files, { playFirst: autoFiles });
        setNote({ tone: 'ok', text: autoFiles ? t('dock.added', '已加入并开始播放') : t('dock.queued', '已加入队列，按播放键开始') });
        void result;
      } catch (error) {
        setNote({ tone: 'bad', text: error && error.message ? error.message : String(error) });
      } finally {
        setBusy(false);
      }
    }, [engine, t, autoFiles]);

    // ---- 一次性的通道自检：把「解析 / 流代理」在真实浏览器里的响应摊开 ----
    // 为什么要做这件事：命令行访问 /api 恒为 401（宿主按 owner principal 鉴权），
    // 所以任何「curl 通了 = 浏览器通了」的推断都不成立。唯一可信的证据是在
    // 这个页面里用同源 fetch 打一次，把 status 和响应体头几个字显示出来。
    const runSelfCheck = useCallback(async () => {
      setBusy(true);
      try {
        const target = '/api/dsh-music-on/resolve?url=' + encodeURIComponent(BILIBILI_PROBE_URL);
        let line = '';
        try {
          const res = await fetch(target, { credentials: 'same-origin', headers: { accept: 'application/json' } });
          let head = '';
          try {
            const text = await res.text();
            head = text.slice(0, 120).replace(/\s+/g, ' ');
          } catch (_error) {
            head = '(响应体不可读)';
          }
          line = `解析 HTTP ${res.status}｜${head}`;
        } catch (error) {
          line = `解析请求失败：${error && error.message ? error.message : String(error)}`;
        }
        setNote({ tone: 'bad', text: line });
      } finally {
        setBusy(false);
      }
    }, []);

    const submitLink = useCallback(async () => {
      const text = draft.trim();
      if (!text) return;
      setBusy(true);
      try {
        // 关键：绝不能把页面地址直接丢给 engine.addUrl——那会把 B站页面当成音频文件，
        // audio 元素随即报 `Failed to load because no supported source was found`。
        // intakeLinks 先判类型，再按 audio-direct / bilibili / stream / platform 分流。
        const report = await intakeLinks(engine, text, { playFirst: autoLinks, limit: trackLimit });
        if (report.added > 0) {
          setDraft('');
          // 语气必须跟着「主路是否降级」走。绿色提示配静音是最坏的组合：
          // 用户以为成功了，其实只落了一条待点两下的 iframe。
          const degraded = hasDegradedItem(report);
          // 解析出的真曲名要带回提示里。否则多份歌单混在一起时，用户根本不知道
          // 刚解析进来的是哪一条，只能去列表里逐行比对。
          const firstTitle = (Array.isArray(report.items) ? report.items : [])
            .map((item) => (item && (item.title || item.name)) || '')
            .find((title) => title !== '');
          const summary = summarizeReport(report);
          setNote({ tone: degraded ? 'bad' : 'ok', text: firstTitle ? `${summary} · ${firstTitle}` : summary });
          // 引擎在浏览器拦下自动播放时会置 autoplayBlocked；这里主动探一次，
          // 让用户知道「要再点一下播放键」而不是以为又没反应。
          const state = engine.getState ? engine.getState() : null;
          if (state && state.autoplayBlocked === true) {
            setNote({ tone: 'bad', text: t('dock.autoplayBlocked', '已就绪，点一下播放键出声') });
          }
        } else {
          setNote({ tone: 'bad', text: summarizeReport(report) });
        }
      } catch (error) {
        setNote({ tone: 'bad', text: error && error.message ? error.message : String(error) });
      } finally {
        setBusy(false);
      }
    }, [draft, engine, t, autoLinks, trackLimit]);

    // ---- 拖放：整块界面都是投放区，用深度计数避免子元素冒泡造成的闪断。 ----
    const onDragEnter = useCallback((event) => {
      if (!event.dataTransfer) return;
      const types = Array.from(event.dataTransfer.types || []);
      if (!types.includes('Files')) return;
      event.preventDefault();
      dragDepth.current += 1;
      setDragging(true);
    }, []);
    const onDragOver = useCallback((event) => {
      if (!event.dataTransfer) return;
      const types = Array.from(event.dataTransfer.types || []);
      if (!types.includes('Files')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }, []);
    const onDragLeave = useCallback(() => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    }, []);
    const onDrop = useCallback((event) => {
      if (!event.dataTransfer) return;
      event.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      const files = Array.from(event.dataTransfer.files || []).filter(
        (f) => typeof f.type === 'string' && (f.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac|aac|opus|webm)$/i.test(f.name)),
      );
      if (files.length === 0) {
        setNote({ tone: 'bad', text: t('dock.notAudio', '只接受音频文件') });
        return;
      }
      void addFiles(files);
    }, [addFiles, t]);

    const onSeek = useCallback((event) => {
      const value = Number(event.target.value);
      if (!Number.isFinite(value) || !engine) return;
      try {
        engine.seek(value);
      } catch (_error) {
        /* 进度条拖到未加载区段时 seek 可能抛，忽略即可 */
      }
    }, []);

    /**
     * 音量写入的唯一出口。
     *
     * 三条通道（旋钮拖动 / 滚轮 / 键盘）都汇到这里，避免三份夹取逻辑漂移。
     * `commit=false` 用于拖动过程中的连续帧：只写引擎与 ref，不落盘 ——
     * 拖一次旋钮会经过上百个 0.01 步进，逐帧 patch 会把设置 store 打成筛子。
     */
    const applyVolume = useCallback((next, commit) => {
      const raw = Number(next);
      if (!Number.isFinite(raw)) return;
      const value = Math.min(1, Math.max(0, raw));
      volumeRef.current = value;
      setKnobValue(value);
      if (engine && typeof engine.setVolume === 'function') {
        try {
          engine.setVolume(value);
        } catch (_error) {
          /* 音量写失败不该阻断界面 */
        }
      }
      if (commit === true && store && typeof store.patch === 'function') {
        try {
          store.patch('volume', Math.round(value * 100) / 100);
        } catch (_error) {
          /* 落盘失败时旋钮仍可用，只是刷新后回默认 */
        }
      }
    }, [engine, store]);

    /**
     * 设置页里改了音量（或换了 profile）时把旋钮同步过来。
     *
     * 只在差值超过 0.5% 时才写，否则拖动旋钮落盘 → settings 回流 → 这里再写一遍，
     * 每一格都触发一次无意义的额外渲染。
     */
    useEffect(() => {
      const next = typeof settings.volume === 'number' ? settings.volume : 0.8;
      if (Math.abs(next - volumeRef.current) > 0.005) {
        volumeRef.current = next;
        setKnobValue(next);
      }
    }, [settings.volume]);

    /**
     * 滚轮调音量：一格 = 5%。
     *
     * 必须 `preventDefault`：旋钮悬停时滚轮默认会滚动整张卡片（`.dmo-card`
     * 带 overflow:auto），音量与页面同时动，手感全废。React 的 onWheel 是
     * passive 委托，拦不住默认滚动，所以监听要在 effect 里以 `{ passive: false }`
     * 挂在真实节点上（见下方 knobWheel effect）。
     */
    const stepVolume = useCallback((deltaSteps) => {
      const steps = Number(deltaSteps);
      if (!Number.isFinite(steps) || steps === 0) return;
      applyVolume(volumeRef.current + steps * 0.05, true);
    }, [applyVolume]);

    /**
     * 旋钮拖动：垂直位移线性映射。
     *
     * 130px 竖向行程对应 0→1 是调音台旋钮的通行手感：细调够细，一口气也能拉满。
     *
     * 关键在于**不能只靠 React 的 onPointerMove**：旋钮只有 30px，指针一往外甩
     * 就离开元素，pointermove 不再派发，拖动当场断掉 —— 这和胶囊拖动踩的是同一个坑。
     * 所以按下时把监听挂到 window 上（见 onKnobDown），本函数只吃坐标。
     */
    const stepKnob = useCallback((event) => {
      const drag = knobDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const dy = event.clientY - drag.startY;
      if (!drag.moved && Math.abs(dy) >= 2) drag.moved = true;
      applyVolume(drag.startValue - dy / 130, false);
    }, [applyVolume]);

    const detachKnobListeners = useCallback(() => {
      const listeners = knobListenersRef.current;
      if (!listeners || typeof window === 'undefined') return;
      window.removeEventListener('pointermove', listeners.move);
      window.removeEventListener('pointerup', listeners.up);
      window.removeEventListener('pointercancel', listeners.up);
      knobListenersRef.current = null;
    }, []);

    const onKnobDown = useCallback((event) => {
      if (event.button !== 0) return;
      if (knobDragRef.current) return;
      detachKnobListeners();
      knobDragRef.current = {
        pointerId: event.pointerId,
        startY: event.clientY,
        startValue: volumeRef.current,
        moved: false,
      };
      setKnobDragging(true);
      event.preventDefault();
      // 拖动途中一律拦掉 text selection / 拖拽图片等默认行为
      if (typeof window !== 'undefined') {
        const up = () => {
          onKnobUpRef.current();
        };
        knobListenersRef.current = { move: stepKnob, up };
        window.addEventListener('pointermove', stepKnob);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
      }
    }, [detachKnobListeners, stepKnob]);

    const onKnobMove = useCallback((event) => { stepKnob(event); }, [stepKnob]);

    const onKnobUp = useCallback(() => {
      const drag = knobDragRef.current;
      if (!drag) return;
      knobDragRef.current = null;
      setKnobDragging(false);
      detachKnobListeners();
      // 拖动过就不落 click 到静音开关上：这里把 moved 留在 ref 上供 onClick 判断。
      knobMovedRef.current = drag.moved;
      applyVolume(volumeRef.current, true);
    }, [applyVolume, detachKnobListeners]);

    // onKnobDown 里的 window 监听要调 onKnobUp，而它声明在后面，
    // 用一个 ref 中转（直接引用会掉进「依赖前向引用」那个坑）。
    onKnobUpRef.current = onKnobUp;

    // 卸载时摘干净，避免整页残留一个吃 pointermove 的幽灵。
    useEffect(() => () => detachKnobListeners(), [detachKnobListeners]);

    const onKnobKeys = useCallback((event) => {
      const map = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 4, PageDown: -4 };
      if (event.key === 'Home') {
        event.preventDefault();
        applyVolume(0, true);
        return;
      }
      if (event.key === 'End') {
        event.preventDefault();
        applyVolume(1, true);
        return;
      }
      const steps = map[event.key];
      if (!steps) return;
      event.preventDefault();
      stepVolume(steps);
    }, [applyVolume, stepVolume]);

    /**
     * 单击旋钮 = 静音开关。
     *
     * 必须先看 knobMovedRef：拖完旋钮松手时浏览器会补一次 click，
     * 不复位就会「调完音量立刻被静音」。标志位用完即清。
     */
    const onKnobClick = useCallback(() => {
      if (knobMovedRef.current) {
        knobMovedRef.current = false;
        return;
      }
      if (volumeRef.current <= 0.001) applyVolume(lastLoudRef.current, true);
      else {
        lastLoudRef.current = volumeRef.current > 0 ? volumeRef.current : 0.8;
        applyVolume(0, true);
      }
    }, [applyVolume]);

    /**
     * 滚轮监听必须手挂，而且必须 `passive: false`。
     *
     * React 的 onWheel 走的是 passive 委托，回调里 preventDefault() 是空操作，
     * 于是「滚轮调音量」会同时把整张卡片滚走。唯一可靠办法是把监听直接
     * 挂在真实 DOM 节点上并声明非 passive。
     *
     * 依赖里带 collapsed / hidden：旋钮只在展开态存在，收起再展开时
     * DOM 节点是新的，只依赖 stepVolume 的话监听会挂在上一个已卸载的节点上。
     */
    useEffect(() => {
      const node = knobRef.current;
      if (!node || typeof node.addEventListener !== 'function') return undefined;
      const onWheel = (event) => {
        event.preventDefault();
        const dir = event.deltaY > 0 ? -1 : event.deltaY < 0 ? 1 : 0;
        if (dir !== 0) stepVolume(dir);
      };
      node.addEventListener('wheel', onWheel, { passive: false });
      return () => node.removeEventListener('wheel', onWheel);
    }, [stepVolume, collapsed, hidden]);

    /**
     * 频谱快捷开关：一键在「开」和「关」之间切换，并立刻落盘。
     *
     * 为什么要记上一次开的样式：用户点「关」只是想暂时清屏，再点开时应该回到
     * 他原先选的那个样式，而不是被重置成默认柱状。
     */
    const toggleSpectrum = useCallback(() => {
      if (!store || typeof store.patch !== 'function') {
        setNote({ tone: 'bad', text: t('dock.noStore', '设置存储不可用，频谱开关不能落盘') });
        return;
      }
      try {
        if (spectrumStyle !== 'off') {
          writeText(SPECTRUM_MEMO_KEY, spectrumStyle);
          store.patch('spectrumStyle', 'off');
        } else {
          const back = readText(SPECTRUM_MEMO_KEY);
          store.patch('spectrumStyle', back && back !== 'off' ? back : 'bars');
        }
        // 收起态没有卡片，消息必须落在胶囊可见处，否则用户以为开关坏了。
        flash(spectrumStyle === 'off'
          ? t('dock.spectrumTurnedOn', '频谱已打开')
          : t('dock.spectrumTurnedOff', '频谱已关闭'));
      } catch (error) {
        setNote({ tone: 'bad', text: error && error.message ? error.message : String(error) });
      }
    }, [spectrumStyle, flash]);

    // 记住当前样式，下次点开还原。唯一写入口就是这个 effect，
    // toggleSpectrum 里不再重复写，避免两处逻辑互相覆盖。
    useEffect(() => {
      if (spectrumStyle !== 'off') writeText(SPECTRUM_MEMO_KEY, spectrumStyle);
    }, [spectrumStyle]);

    /** 大 → 中 → 小 → 大，循环切换。卡片头部与设置页写的是同一个 dockSize。 */
    const cycleSize = useCallback(() => {
      if (!store || typeof store.patch !== 'function') return;
      const index = SIZE_ORDER.indexOf(dockSize);
      const next = SIZE_ORDER[(index + 1) % SIZE_ORDER.length] || 'normal';
      try {
        store.patch('dockSize', next);
        flash(`${t('dock.sizeNow', '大小')}：${SIZE_LABELS[next]}`);
      } catch (error) {
        setNote({ tone: 'bad', text: error && error.message ? error.message : String(error) });
      }
    }, [dockSize, flash]);

    const spectrumOn = spectrumStyle !== 'off';

    const playing = Boolean(state && state.playing);
    const duration = displayDuration(state);
    const position = state && typeof state.position === 'number' ? state.position : 0;
    // 频谱 / 自动播放的派生值已在上面统一定义，此处不再重复声明。
    // 音量不走这里：旋钮读自己的 knobValue，见下方 knob 的构造。
    const external = Boolean(state && state.external);

    /**
     * 外部播放器是否被用户手动收起。
     *
     * 只在「换了另一条曲目」时自动复位，不靠 effect 回落，避免刚关掉又自己弹回来。
     * 键用 embedUrl 而不用 track.id：同一个视频换 p 分集时 embedUrl 会变而 id 可能不变。
     */
    const [embedDismissed, setEmbedDismissed] = useState(false);
    const embedKeyRef = useRef(null);
    if (external) {
      const key = (state && state.embedUrl) || (state && state.track && state.track.id) || 'external';
      if (embedKeyRef.current !== key) {
        embedKeyRef.current = key;
        if (embedDismissed) setEmbedDismissed(false);
      }
    }

    // B 站 / 平台页面走 iframe：这块界面必须真的把 iframe 挂出来，
    // 否则引擎已切到外部模式、内部 audio 已卸载，用户只会看到「播放中」却没有声音。
    const surface = playbackSurface(state);

    /** 进度条已播比例，交给 CSS 画双色轨道（原生 range 画不出「已播/未播」分野）。 */
    const seekPercent = Number.isFinite(duration) && duration > 0 && Number.isFinite(position)
      ? Math.min(100, Math.max(0, (position / duration) * 100))
      : 0;

    /**
     * 音量旋钮。
     *
     * 用 div + role="slider" 而不是 <input type="range">：原生 range 在宿主
     * 深色玻璃卡上会被系统渲染成一整条灰轨，横条形态改不掉 —— 而用户要的
     * 恰好是「不是横条」。弧形档位用两层 conic-gradient 叠出来：
     * 底圈是未用到的行程（淡蓝），上层按真值截断成高亮弧。
     */
    const knobAngle = -135 + 270 * Math.min(1, Math.max(0, knobValue));
    const knob = h('div', {
      ref: knobRef,
      className: 'dmo-knob',
      role: 'slider',
      tabIndex: 0,
      'aria-label': t('dock.volume', '音量'),
      'aria-valuemin': 0,
      'aria-valuemax': 100,
      'aria-valuenow': Math.round(knobValue * 100),
      'aria-valuetext': `${Math.round(knobValue * 100)}%`,
      title: t('dock.volumeHint', '滚轮或拖动调节，单击静音'),
      'data-muted': knobValue <= 0.001 ? '1' : undefined,
      'data-dragging': knobDragging ? '1' : undefined,
      // 两条 conic-gradient 的起止角度都从这里进 CSS 变量，避免在样式表里
      // 重复写死 270° 行程（改行程只改这一个数）。
      style: {
        '--dmo-knob-angle': `${knobAngle}deg`,
        '--dmo-knob-sweep': `${270 * Math.min(1, Math.max(0, knobValue))}deg`,
      },
      onPointerDown: onKnobDown,
      onPointerMove: onKnobMove,
      onPointerUp: onKnobUp,
      onPointerCancel: onKnobUp,
      onClick: onKnobClick,
      onKeyDown: onKnobKeys,
    },
    h('span', { className: 'dmo-knob-arc', 'aria-hidden': 'true' }),
    h('span', { className: 'dmo-knob-cap', 'aria-hidden': 'true' },
      h('span', { className: 'dmo-knob-pointer', 'aria-hidden': 'true' })),
    h('span', { className: 'dmo-knob-readout', 'aria-hidden': 'true' },
      knobValue <= 0.001 ? '静音' : `${Math.round(knobValue * 100)}`));

    // 循环按钮：显示中文而不是裸枚举值。原先直接把 `state.loopMode`（'all'/'one'/'off'）
    // 塞进按钮，用户看到的是内码 `all`，看不出这是「列表循环」。走 locale，
    // 且默认值要与引擎一致（缺省 all）。
    const loopMode = (state && state.loopMode) || 'all';
    const loopLabel = loopMode === 'one'
      ? t('dock.loopOne', '单曲循环')
      : loopMode === 'off'
        ? t('dock.loopOff', '不循环')
        : t('dock.loopAll', '列表循环');
    const loopButton = h('button', {
      type: 'button',
      className: 'dmo-chip',
      'data-loop': loopMode,
      title: `${t('dock.loop', '循环模式')} · ${loopLabel}`,
      'aria-label': `${t('dock.loop', '循环模式')}: ${loopLabel}`,
      onClick: () => guard(async () => engine.cycleLoopMode())(),
    }, loopLabel);

    // 当前曲目「入了队但播不了」的原因（网易云/QQ 会员曲拿不到直链）。
    // 引擎把原因写在 track.unavailableReason 上，UI 必须把它抬到可见处：
    // 否则卡片一切正常、进度条停在 0，用户看到的只是「点了没反应」。
    const blockedReason = state && state.track && typeof state.track.unavailableReason === 'string'
      && state.track.unavailableReason !== ''
      ? state.track.unavailableReason
      : null;

    const panelClass = [
      'dmo-dock',
      collapsed ? 'dmo-dock--collapsed' : 'dmo-dock--expanded',
      dragging ? 'dmo-dock--dragging' : '',
      `dmo-dock--size-${dockSize}`,
      showTitles ? '' : 'dmo-dock--no-titles',
    ].filter(Boolean).join(' ');

    // ---- 定位唯一层 ----
    //
    // 位置只写在最外层 .dmo-dock-stack 上：它是 `position:absolute` 的定位盒，
    // 内层 .dmo-dock 被 `.dmo-dock-stack > .dmo-dock` 降级成 `position:relative`，
    // 在相对定位上写 left 表示「从静态位置右移」，与 viewport 坐标不是一个体系。
    //
    // 收起态与展开态**都必须**经过这一层。此前收起态在下面直接 return 自己的 div，
    // 从不渲染 stack，于是 stackRef 在收起态恒为 null：拖动 handler 拿不到参照物，
    // 定位样式也永远落不到正确的盒子上 —— 这就是「长按拖动一直无效」的结构性根因，
    // 前几轮在 handler 内部反复改逻辑都没碰到它。
    const stackStyle = dockPositionStyle(holding, pos, liveRef.current);
    const wrapStack = (...children) => h('div', {
      className: 'dmo-dock-stack',
      ref: stackRef,
      style: stackStyle,
      'data-depth': spectrumDepth,
      // 主题只体现在这个自定义属性上：CSS 里 [data-theme='x'] 覆盖一套令牌。
      // 挂在 stack 而不是 document 上，是为了不污染宿主页面 —— 但设置分区
      // 不在 stack 里，所以 Settings 那边单独挂一份（见 Settings.jsx 的根节点）。
      'data-dmo-theme': theme,
    }, ...children);

    /**
     * 底部通栏频谱。
     *
     * **收起态与展开态都渲染**。此前它只在展开态分支末尾拼进返回树，
     * 于是用户收起胶囊就再也看不见频谱，被当成「频谱功能消失」。
     * 频谱是常驻装饰，不该随面板开合消失 —— 开关只有设置项里的 spectrumStyle。
     *
     * Spectrum 自己管 analyser 取用、DPR、可见性暂停与 reduced-motion 降帧，
     * 这里只套一层负责定位的外壳，绝不再造第二套 FFT。
     *
     * 层级两种（data-depth）：
     *   front —— 浮在正文之上，可见但不下手（外壳 pointer-events:none）
     *   back  —— 沉到宿主内容层之下，只在侧栏与边距的空白处透出来，形成「藏在页面里」的暗纹
     * back 用负 z-index，所以必须挂在上面的 .dmo-dock-stack 里 ——
     * 那个隔离层才有自己的层叠上下文，否则负值只会沉到 .overlayLayer 内部底部，整体仍浮在正文上。
     */
    const spectrumBar = spectrumPlacement === 'bar' && engine && spectrumStyle !== 'off'
      ? h('div', {
        className: 'dmo-barspectrum',
        'data-style': spectrumStyle,
        'data-glow': spectrumCfg.glow,
        'data-depth': spectrumPeek ? 'peek' : spectrumDepth,
        // 通栏频谱走 fixed 贴视口底沿，本来就**不**跟随胶囊位置：
        // 它是「页面底部」的装饰，胶囊挪到哪儿它都该留在底部。
        // 这里绝不能引用 .dmo-dock-stack 的坐标，也不能改成 absolute。
        //
        // 宽度走 --dmo-span：整条带子按视口百分比铺开并居中，剩下的留白交给
        // margin auto（不是 transform，避免和 [data-depth] 的层叠/过渡打架）。
        style: {
          height: `${spectrumCfg.height}px`,
          '--dmo-span': `${spectrumSpan}%`,
        },
      }, props.Spectrum ? h(props.Spectrum, { engine, settings: { ...settings, ...spectrumCfg } }) : null)
      : null;

    // ---- 彻底隐藏后只留一枚很小的召唤按钮，否则用户永远找不回来。 ----
    if (hidden) {
      return wrapStack(h('button', {
        type: 'button',
        className: 'dmo-dock-revive',
        title: t('dock.show', '显示音乐库'),
        'aria-label': t('dock.show', '显示音乐库'),
        onClick: () => setHidden(false),
      }, '♪'), spectrumBar);
    }

    // ---- 收起态：一枚胶囊。点正文展开，点频谱键只切频谱。 ----
    // 结构是「外层 div 当容器 + 内层 button 只包正文 + 兄弟按钮」。
    // 绝不能写成 button 套 button：HTML 里非法，浏览器会把内层拆出去，
    // 结果就是点频谱键反而把卡片展开了 —— 这正是用户报的「胶囊上的频谱无效」。
    if (collapsed) {
      return wrapStack(h('div', {
        ref: panelRef,
        className: panelClass,
        'data-dragging': dragging ? '1' : undefined,
        // 整枚胶囊都是拖动面。
        //
        // 之前只把手柄（左侧黑胶）当拖动面，用户实际按的是胶囊身上的空白与文字区，
        // 那些地方没有 pointerdown，于是「怎么拖都不动」。把 pointer 事件挂到整枚
        // 胶囊上，再用 4px 死区区分「点」与「拖」：位移没超死区就当点击透传，
        // 超了就当拖动。这样既不用猜用户按哪儿，也不破坏展开按钮。
        onPointerDown: onDragStart,
        onPointerMove: onDragMove,
        onPointerUp: onDragEnd,
        onPointerCancel: onDragEnd,
        // 拖完落手时浏览器合成的 click 在这里被拦下（捕获阶段），
        // 否则指针停在哪个按钮上就会触发哪个按钮 —— 最常见的表现是「一拖就把卡片拖开了」。
        onClickCapture: swallowClickAfterDrag,
        onDragEnter: onDragEnter,
        onDragOver: onDragOver,
        onDragLeave: onDragLeave,
        onDrop: onDrop,
      },
      h('div', { className: 'dmo-capsule' },
        // 黑胶只是视觉与双击复位入口：pointerdown 已经上移到整枚胶囊，
        // 这里再挂一次会让同一次按下触发两遍 onDragStart（第二次把 grabX 覆盖成
        // 相对手柄的偏移），所以只在手柄上保留双击复位。
        h('span', {
          className: 'dmo-drag-handle',
          title: t('dock.dragHint', '拖动移动位置，双击复位'),
          'aria-hidden': true,
          ref: collapsedHandleRef,
          onDoubleClick: onDragReset,
        }, h('span', { className: 'dmo-vinyl', 'data-playing': playing ? '1' : undefined, 'data-cover': trackCover(state) ? '1' : undefined },
          trackCover(state)
            ? h('img', { className: 'dmo-vinyl-cover', src: trackCover(state), alt: '', draggable: false, onError: (e) => { const el = e.currentTarget; el.style.display = 'none'; } })
            : null,
          h('span', { className: 'dmo-vinyl-label' }, playing ? '♫' : '♪'))),
        h('button', {
          type: 'button',
          className: 'dmo-capsule-main',
          title: t('dock.expand', '展开音乐库'),
          'aria-expanded': false,
          onClick: () => setCollapsed(false),
        },
        h('span', { className: 'dmo-capsule-text' },
          h('span', { className: 'dmo-capsule-name' }, trackLabel(state, t)),
          h('span', { className: 'dmo-capsule-meta' }, `${fmtTime(position)} / ${fmtTime(duration)}`))),
        // 频谱一键开关就放在胶囊上：用户看着频谱动，想关掉时不该被迫先展开卡片。
        h('button', {
          type: 'button',
          className: 'dmo-capsule-spectrum',
          'data-on': spectrumOn ? '1' : undefined,
          title: spectrumOn ? t('dock.spectrumOff', '关闭频谱') : t('dock.spectrumOn', '打开频谱'),
          'aria-label': spectrumOn ? t('dock.spectrumOff', '关闭频谱') : t('dock.spectrumOn', '打开频谱'),
          'aria-pressed': spectrumOn,
          onClick: (event) => {
            event.stopPropagation();
            toggleSpectrum();
          },
        }, spectrumOn ? '≋' : '∅'),
        h('button', {
          type: 'button',
          className: 'dmo-capsule-btn',
          title: playing ? t('dock.pause', '暂停') : t('dock.play', '播放'),
          'aria-label': playing ? t('dock.pause', '暂停') : t('dock.play', '播放'),
          onClick: (event) => {
            event.stopPropagation();
            void togglePlay();
          },
        }, playing ? '❚❚' : '▶'),
        h('span', { className: 'dmo-capsule-dot', 'data-busy': busy ? '1' : undefined }),
        // 收起态也要能看见提示：切换频谱的确认、拖放的拒绝原因都落在这里。
        note ? h('span', { className: `dmo-capsule-note dmo-note--${note.tone}`, title: note.text }, note.text) : null),
      dragging ? h('div', { className: 'dmo-dock-dropveil' }, t('dock.dropHere', '松手即播放')) : null), spectrumBar);
    }

    // ---- 展开态：整张卡片。 ----
    //
    // 外层另有 .dmo-dock-stack（见文件末尾的 return）负责定位与层叠上下文：
    // 频谱的「藏进页面里」用负 z-index 实现，而负值只能沉到**最近的层叠上下文**底部。
    // 宿主 .overlayLayer 是 z-index:20 的独立上下文，不在中间先垫一层隔离层的话，
    // 负 z-index 只会沉到 overlay 内部底部，整体仍浮在正文之上，效果正好相反。
    // 隔离层本身绝不给 inset:0 —— 它会紧贴子节点，撑满就会变成吃点击的透明遮罩。
    const panel = h('div', {
      ref: panelRef,
      className: panelClass,
      'data-dragging': dragging ? '1' : undefined,
      // 展开态同理：拖动面是卡片顶部的黑胶舞台，但卡片里全是按钮
      // （播放/上一首/下一首/循环/自检/队列行）。拖完落手若指针正停在其中
      // 一个按钮上，浏览器会把 click 派给「按下与松手的共同祖先」——
      // 对舞台内起拖、舞台外松手的情况，那个祖先正是这张卡片。
      // 在卡片上挂捕获阶段的抑制器，一次盖住所有子按钮。
      onClickCapture: swallowClickAfterDrag,
      onDragEnter: onDragEnter,
      onDragOver: onDragOver,
      onDragLeave: onDragLeave,
      onDrop: onDrop,
    },
    // 外部播放器舞台。放在卡片内地平线上方，宽高由 CSS 控制；
    // sandbox 必须给 allow-same-origin，否则 player.bilibili.com 的脚本拿不到自己的存储，直接黑屏。
    //
    // 关闭按钮不可省：iframe 是全屏级文档，里面点任何东西都出不来。
    // 用户想「关掉这个播放器」时，界面上必须有个属于本插件的出口 ——
    // 否则只能把整条队列清空，代价太大。
    surface.external && !embedDismissed
      ? h('div', { className: 'dmo-embed' },
        h('button', {
          type: 'button',
          className: 'dmo-embed-close',
          title: t('dock.embedClose', '关闭外部播放器'),
          'aria-label': t('dock.embedClose', '关闭外部播放器'),
          onClick: closeEmbed,
        }, '✕'),
        surface.embedUrl
          ? h('iframe', {
            className: 'dmo-embed-frame',
            src: surface.embedUrl,
            title: trackLabel(state, t),
            allow: 'autoplay; fullscreen; picture-in-picture; encrypted-media',
            frameBorder: '0',
            scrolling: 'no',
            sandbox: 'allow-scripts allow-same-origin allow-presentation allow-popups allow-forms',
            referrerPolicy: 'no-referrer-when-downgrade',
          })
          : h('div', { className: 'dmo-embed-missing' }, t('dock.noEmbed', '这条音源没有可嵌入的地址')),
        h('div', { className: 'dmo-embed-note' },
          t('dock.embedNote', '外部播放器：进度与音量由播放器自身控制，频谱不可用')))
      : null,

    h('div', { className: 'dmo-card' },
      // 黑胶舞台：展开后延续胶囊的黑胶语言，封面来自解析层给的 track.cover。
      // 没有封面（本地文件、直链音频）时退化为纯黑胶，不显示空白 img。
      //
      // 拖动事件挂在**整个舞台**（含封面与元信息），不只挂在黑胶那块小圆盘上：
      // 圆盘只有 68px，用户很难精准按住，之前「拖不动」很可能就是没按中手柄。
      // 舞台内没有可交互控件，pointerdown 挂在这里不会吃掉任何点击。
      h('div', {
        className: 'dmo-vinyl-stage',
        'data-playing': playing ? '1' : undefined,
        title: t('dock.dragHint', '拖动移动位置，双击复位'),
        onPointerDown: onDragStart,
        onPointerMove: onDragMove,
        onPointerUp: onDragEnd,
        onPointerCancel: onDragEnd,
        onDoubleClick: onDragReset,
      },
        h('div', {
          className: 'dmo-drag-handle dmo-drag-handle--stage',
          ref: stageHandleRef,
        },
        h('span', {
          className: 'dmo-vinyl dmo-vinyl--lg',
          'data-playing': playing ? '1' : undefined,
          'data-cover': trackCover(state) ? '1' : undefined,
        },
        trackCover(state)
          ? h('img', {
            className: 'dmo-vinyl-cover',
            src: trackCover(state),
            alt: '',
            draggable: false,
            onError: (e) => { e.currentTarget.style.display = 'none'; },
          })
          : null,
        h('span', { className: 'dmo-vinyl-label' }, playing ? '♫' : '♪'))),
        h('div', { className: 'dmo-vinyl-meta' },
          h('span', { className: 'dmo-vinyl-title' }, trackLabel(state, t)),
          h('span', { className: 'dmo-vinyl-sub' },
            surface.external
              ? t('dock.externalBadge', '外部播放器')
              : (state.artist || t('dock.localBadge', '本地播放'))))),

      // 卡片头
      h('div', { className: 'dmo-card-head' },
        h('span', { className: 'dmo-card-title' }, t('dock.title', '音乐库')),
        h('span', { className: 'dmo-card-sub' }, trackLabel(state, t)),
        h('span', { className: 'dmo-card-head-actions' },
          // 收藏当前曲目。星标放在卡片右上角（locale 文案也是这么引导用户的）。
          // 没有可保存地址时按钮仍然可点 —— 点了会给出原因，比一个静默禁用的按钮诚实。
          h('button', {
            type: 'button',
            className: `dmo-icon dmo-icon--fav${favOn ? ' is-on' : ''}`,
            title: favOn ? t('dock.favorited', '已收藏') : t('dock.favorite', '收藏当前曲目'),
            'aria-label': favOn ? t('dock.favorited', '已收藏') : t('dock.favorite', '收藏当前曲目'),
            'aria-pressed': favOn,
            onClick: toggleFav,
          }, favOn ? '★' : '☆'),
          // 三档尺寸的快捷入口：用户要「大中小三个大小」，不该每次进设置页。
          h('button', {
            type: 'button',
            className: 'dmo-icon dmo-icon--size',
            title: `${t('dock.sizeCycle', '切换大小')}（${SIZE_LABELS[dockSize] || '中'}）`,
            'aria-label': t('dock.sizeCycle', '切换大小'),
            'data-size': dockSize,
            onClick: cycleSize,
          }, SIZE_GLYPHS[dockSize] || '▭'),
          h('button', {
            type: 'button',
            className: `dmo-icon dmo-icon--spectrum${spectrumOn ? ' is-on' : ''}`,
            title: spectrumOn ? t('dock.spectrumOff', '关闭频谱') : t('dock.spectrumOn', '打开频谱'),
            'aria-label': spectrumOn ? t('dock.spectrumOff', '关闭频谱') : t('dock.spectrumOn', '打开频谱'),
            'aria-pressed': spectrumOn,
            onClick: toggleSpectrum,
          }, '≋'),
          // 「藏起来」的频谱需要一个临时提上来的入口：平时它压在页面下面，
          // 用户想确认它在动，按下这个键就能让它浮上来亮 3 秒再沉回去。
          spectrumDepth === 'back'
            ? h('button', {
              type: 'button',
              className: `dmo-icon dmo-icon--peek${peekSpectrum ? ' is-on' : ''}`,
              title: peekSpectrum ? t('dock.spectrumSink', '让频谱沉回页面下') : t('dock.spectrumPeek', '把频谱提上来看看'),
              'aria-label': peekSpectrum ? t('dock.spectrumSink', '让频谱沉回页面下') : t('dock.spectrumPeek', '把频谱提上来看看'),
              'aria-pressed': peekSpectrum,
              onClick: () => setPeekSpectrum((prev) => !prev),
            }, '⤒')
            : null,
          h('button', {
            type: 'button',
            className: 'dmo-icon',
            title: t('dock.collapse', '收起'),
            'aria-label': t('dock.collapse', '收起'),
            onClick: () => setCollapsed(true),
          }, '▾'),
          h('button', {
            type: 'button',
            className: 'dmo-icon',
            title: t('dock.hide', '隐藏'),
            'aria-label': t('dock.hide', '隐藏'),
            onClick: () => setHidden(true),
          }, '✕'))),

      // 走带：上一首 / 播放 / 下一首，右侧挂音量旋钮与循环
      h('div', { className: 'dmo-transport' },
        h('button', {
          type: 'button',
          className: 'dmo-icon dmo-icon--lg',
          title: t('dock.prev', '上一首'),
          'aria-label': t('dock.prev', '上一首'),
          onClick: () => guard(async () => engine.prev())(),
        }, '⏮'),
        h('button', {
          type: 'button',
          className: 'dmo-play',
          title: playing ? t('dock.pause', '暂停') : t('dock.play', '播放'),
          'aria-label': playing ? t('dock.pause', '暂停') : t('dock.play', '播放'),
          disabled: busy,
          onClick: () => void togglePlay(),
        }, playing ? '❚❚' : '▶'),
        h('button', {
          type: 'button',
          className: 'dmo-icon dmo-icon--lg',
          title: t('dock.next', '下一首'),
          'aria-label': t('dock.next', '下一首'),
          onClick: () => guard(async () => engine.next())(),
        }, '⏭'),
        h('div', { className: 'dmo-transport-tail' }, knob, loopButton)),

      // 进度条独占一整行。
      //
      // 原先进度条被塞在走带行里，与上一首/播放/下一首、两个时间戳抢同一行，
      // 在 340px 宽的卡片里只剩几十像素 —— 既看不出进度也拖不准。
      // 用户的诉求很直接：最长的那根横条应该是音乐进度，不是音量。
      h('div', { className: 'dmo-progress' },
        h('span', { className: 'dmo-time' }, fmtTime(position)),
        h('input', {
          className: 'dmo-seek',
          type: 'range',
          min: 0,
          // 时长未知时给 1，避免 max=0 让浏览器把滑块画成禁用态
          max: Number.isFinite(duration) && duration > 0 ? duration : 1,
          step: 0.1,
          value: Number.isFinite(position) ? position : 0,
          disabled: !Number.isFinite(duration) || duration <= 0,
          'aria-label': t('dock.seek', '进度'),
          // 已播进度交给 CSS 画在轨道上：原生 range 的 accent-color 只能整体着色，
          // 画不出「已播蓝、未播灰」的对照。
          style: { '--dmo-seek-p': `${seekPercent}%` },
          onChange: onSeek,
        }),
        h('span', { className: 'dmo-time' }, fmtTime(duration))),

      // 链接输入
      h('form', {
        className: 'dmo-link',
        onSubmit: (event) => {
          event.preventDefault();
          void submitLink();
        },
      },
      h('input', {
        className: 'dmo-link-input',
        type: 'text',
        value: draft,
        placeholder: t('dock.linkPlaceholder', '粘贴 B站 / 网易云 / QQ音乐 链接或歌单'),
        'aria-label': t('dock.linkPlaceholder', '粘贴链接'),
        onChange: (event) => setDraft(event.target.value),
      }),
      h('button', {
        type: 'submit',
        className: 'dmo-btn dmo-primary',
        disabled: busy || draft.trim() === '',
      }, t('dock.add', '加入')),
      h('button', {
        type: 'button',
        className: 'dmo-btn dmo-selfcheck',
        title: '打一次 /api/dsh-music-on/resolve，把真实 HTTP 状态显示出来',
        disabled: busy,
        onClick: () => { void runSelfCheck(); },
      }, t('dock.selfCheck', '自检'))),

      // 播放列表
      //
      // 这不是「队列的另一份 UI」，而是唯一让用户看见「先放什么、后放什么」的地方。
      // 引擎本身一直是数组队列，缺的只是可读的列表：序号、曲名、时长、逐条删除。
      // 每行必须是 div 而不是 button——行里还有删除按钮，button 嵌套 button 在
      // HTML 里是非法的，浏览器会直接把内层按钮拆出去，点删除会误触发播放。
      h('div', { className: 'dmo-queue' },
        h('div', { className: 'dmo-queue-head' },
          h('span', { className: 'dmo-queue-title' }, t('dock.playlist', '播放列表')),
          h('span', { className: 'dmo-queue-count' }, `${queue.length}`),
          queue.length > 0
            ? h('button', {
              type: 'button',
              className: 'dmo-queue-clear',
              title: t('dock.clear', '清空'),
              onClick: () => guard(async () => {
                await engine.clear();
                // 清空要连同磁盘一起清，否则下次刷新又「恢复」出这份列表。
                clearSavedQueue();
                flash(t('dock.cleared', '播放列表已清空'));
              })(),
            }, t('dock.clear', '清空'))
            : null),
        queue.length === 0
          ? h('div', { className: 'dmo-queue-empty' }, t('dock.queueEmpty', '拖入音频，或粘贴歌单链接'))
          : h('div', { className: 'dmo-queue-list' }, queue.map((item, index) => {
            const active = Boolean(item && state.track && state.track.id === item.id);
            const seconds = typeof item.duration === 'number' ? item.duration : NaN;
            // 网易云 / QQ 的会员曲拿不到直链，它们**仍然入队**（用户能看到曲名、
            // 能跳原平台），但点下去必然报错。不给它们一个视觉标记，
            // 队列里每一行看起来都一样，用户只会以为是随机的「点了没反应」。
            const blocked = typeof item.unavailableReason === 'string' && item.unavailableReason !== '';
            return h('div', {
              key: `${item.id || index}`,
              className: `dmo-queue-row${active ? ' dmo-queue-row--active' : ''}${blocked ? ' dmo-queue-row--blocked' : ''}`,
              'data-kind': item.kind || '',
              'data-blocked': blocked ? '1' : undefined,
            },
            h('span', { className: 'dmo-queue-index' }, active ? '▶' : String(index + 1)),
            h('button', {
              type: 'button',
              className: 'dmo-queue-name',
              title: blocked ? `${item.title || item.name || ''} — ${item.unavailableReason}` : (item.title || item.name || ''),
              onClick: () => guard(async () => engine.loadAt(index))(),
            }, item.title || item.name || t('dock.untitled', '未命名')),
            blocked
              ? h('span', {
                className: 'dmo-queue-badge',
                title: item.unavailableReason,
              }, t('dock.vipBadge', '无直链'))
              : null,
            h('span', { className: 'dmo-queue-time' }, Number.isFinite(seconds) && seconds > 0 ? fmtTime(seconds) : ''),
            h('button', {
              type: 'button',
              className: 'dmo-queue-del',
              title: t('dock.remove', '移除'),
              'aria-label': t('dock.remove', '移除'),
              onClick: () => guard(async () => engine.remove(index))(),
            }, '✕'));
          }))),

      // 音源诊断行：只在「当前曲目本该出声却没走内部音频图」时出现。
      // 没有这一行，用户面对的是一张一切正常的卡片和一片安静——
      // 那正是「加入了但没声音」这类问题反复说不清的原因。
      //
      // 三种通道都要说清楚，尤其第三种：网易云/QQ 的会员曲**没有票据**，
      // 它入队成功、曲名正常显示、卡片看不出任何异样，点下去却必然报错。
      // 这一行把「为什么不会响」写在界面上，而不是留给用户猜。
      surface.external
        ? h('div', { className: 'dmo-diag' },
          h('span', { className: 'dmo-diag-label' }, t('dock.diagTitle', '播放通道')),
          h('span', { className: 'dmo-diag-value' },
            surface.embedUrl
              ? t('dock.diagExternal', '内嵌播放器（频谱不可用）')
              : t('dock.diagNoEmbed', '没有可用的播放地址')))
        : (blockedReason
          ? h('div', { className: 'dmo-diag dmo-diag--blocked' },
            h('span', { className: 'dmo-diag-label' }, t('dock.diagTitle', '播放通道')),
            h('span', { className: 'dmo-diag-value' }, blockedReason))
          : null),
      note ? h('div', { className: `dmo-note dmo-note--${note.tone}` }, note.text) : null,
      dragging ? h('div', { className: 'dmo-dock-dropveil' }, t('dock.dropHere', '松手即播放')) : null));

    // 空闲态绝不能带内联 left/top —— 那一对坐标是「拖过之后」的绝对定位，
    // 而 dockPositionStyle 在没有坐标时会返回 null，正好把静止态交回给 CSS 的
    // right/bottom 贴角逻辑，窗口缩放才会自动跟边。
    //
    // spectrumBar 在函数前段就已构造好（收起/隐藏两条分支也要用它），这里只管拼接。
    return wrapStack(panel, spectrumBar);
  };
}

/**
 * 沿父链向上找到真正的「面板」节点（.dmo-dock）。
 *
 * 存在理由：拖动起点的参照物必须是正在移动的那个盒子。panelRef 在 React 里
 * 只有 commit 之后才会被赋值，而收起态/展开态两条分支各自 return 自己的根节点，
 * 事件回调里直接读 ref 可能拿到 null。向上找祖先是不依赖 ref 的兜底，
 * 也避免把手柄（黑胶）的内边距算进偏移。
 *
 * @param {Element|null} node 事件目标。
 * @returns {Element|null} 最近的 .dmo-dock 祖先，找不到返回原节点。
 */
function findDockAncestor(node) {
  let el = node;
  for (let guard = 0; el && guard < 24; guard += 1) {
    if (typeof el.className === 'string' && el.className.includes('dmo-dock')) return el;
    el = el.parentElement || el.parentNode || null;
  }
  return node || null;
}

/**
 * 直接订阅设置 store 的小 hook。
 *
 * 不用 useSyncExternalStore：宿主各版本支持不一，而这个 store 变更频率极低
 * （用户点设置才变），手写订阅少一个不兼容点。
 */
function useStoreSnapshot(React, store) {
  const [snap, setSnap] = React.useState(() => (store && store.get ? store.get() : {}));
  React.useEffect(() => {
    if (!store || typeof store.subscribe !== 'function') return undefined;
    setSnap(store.get());
    return store.subscribe((next) => setSnap(next || {}));
  }, [store]);
  return snap;
}

/**
 * 测试出口。`normalizeState` 是「在播却显示未播放」的唯一防线，
 * 必须能脱离浏览器直接断言，否则那个 bug 只能靠人肉眼发现。
 */
export const __test = { normalizeState, displayDuration, trackLabel, playbackSurface, fmtTime };
