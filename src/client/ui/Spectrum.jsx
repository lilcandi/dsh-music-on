import { createElement as h, useEffect, useRef } from 'react';

/**
 * 频谱可视化。props = { engine, settings }
 *
 * engine 契约（由 engine.js 提供，已定死）：
 * - engine.getAnalyser(): AnalyserNode | null；外部播放器模式返回 null（不是静音 analyser）
 * - engine.getState(): { mode: 'internal' | 'external', spectrumAvailable: boolean, duration: number | null, seekable: boolean, ... }
 * - engine.onStateChange(listener): () => void，模式切换 / 播放状态变化时推事件，无需轮询
 *
 * settings 契约：
 * - settings.spectrumStyle: 'dots' | 'bars' | 'line' | 'wave' | 'off'（缺省 dots）
 * - settings.spectrumFps: 30 | 60
 * - settings.spectrumBars: 16-96，8 的倍数（缺省 48）
 * - settings.spectrumGain: 0.5-4（缺省 1）
 * - settings.spectrumGlow: 'off' | 'soft' | 'strong'（缺省 soft）
 * - settings.spectrumHeight: 32-160 —— 由外部容器（ShellDock）负责，本组件只把 canvas 填满容器
 *
 * 注意：本宿主对插件客户端代码是零转译静态投递（readFileSync 后拼 combo 脚本），
 * 因此本文件必须是纯 ESM + createElement，不能出现任何 JSX 标签。
 * 只允许 import 'react'（平台种子词）；任何相对路径 / 第三方包 / Node 内置模块都会在
 * 宿主模块表 require 阶段直接抛 `missed the module table`。
 *
 * 行为契约：
 * 1. fftSize 默认 2048；analyser 上不是这个值时由本组件显式设定。
 * 2. 对数频段映射到 settings.spectrumBars 根柱（音乐感知上低频不该只占 1/4 屏）。
 * 3. 峰值慢回落：每帧 -0.6（以 60fps 为基准，按实际 dt 缩放），且永不低于当前值。
 * 4. DPR 自适应：canvas 像素尺寸 = CSS 尺寸 * min(devicePixelRatio, 2)。
 * 5. 不可见（IntersectionObserver）或 document.hidden 时停 rAF；恢复时重开。
 * 6. prefers-reduced-motion 或用户低帧率设置时降频到 10fps，而不是让频谱消失。
 * 7. 卸载必须 cancelAnimationFrame + disconnect observer + 取消所有订阅
 *    （React 18 StrictMode 双挂载下不能留下第二套循环）。
 * 8. 无 analyser（外部播放器 / 窗口化代理播放）时画呼吸基线，绝不黑屏。
 *
 * 色板：读 `.dmo` 容器（会继承到 canvas）上由 styles.js 定义的本插件 CSS 变量，
 * 因此必须 `getComputedStyle(canvas)` 而不是 document.documentElement：
 *   --dmo-spec-base  柱子底色 / 底噪
 *   --dmo-spec-low   竖直渐变下端
 *   --dmo-spec-high  竖直渐变上端
 *   --dmo-spec-glow  光晕色
 * 读不到就用下面的 FALLBACK 常量（深底上的淡蓝→白）。
 */

const FFT_SIZE = 2048;
const PEAK_DECAY_PER_FRAME = 0.6;
const REF_FRAME_MS = 1000 / 60;
const REDUCED_MOTION_FPS = 10;
const MAX_DPR = 2;
/**
 * analyser 重试间隔。engine 的 AudioContext 在首次播放时才创建，而本组件往往
 * 在那之前就挂载了；500ms 一次的重试足以在用户看到播放开始后立刻接上频谱，
 * 又不会在无播放的空转期疯狂调用 getAnalyser。
 */
const ANALYSER_PROBE_MS = 500;

/** 样式枚举。顺序无关，只用于合法性判断。 */
const STYLE_VALUES = ['dots', 'bars', 'line', 'wave', 'blocks', 'mirror', 'off'];
const DEFAULT_STYLE = 'dots';

const DEFAULT_BAR_COUNT = 48;
const BAR_COUNT_MIN = 16;
/** 上限 160：窄柱 × 满铺需要这个密度，48 柱满铺只能变成一排粗柱。 */
const BAR_COUNT_MAX = 160;
const BAR_COUNT_STEP = 8;

const GAIN_MIN = 0.5;
const GAIN_MAX = 4;
const GAIN_DEFAULT = 1;

const GLOW_VALUES = ['off', 'soft', 'strong'];
const GLOW_DEFAULT = 'soft';
/**
 * 光晕强度。单位是 CSS 像素（shadowBlur 在 setTransform 之后按 CSS 单位走）。
 * soft 用主题色，strong 固定一档更亮的蓝白，保证「强」在深浅主题里都够亮。
 */
const GLOW_BLUR = { off: 0, soft: 6, strong: 12 };
const GLOW_STRONG_COLOR = 'rgba(120,190,255,0.85)';

/**
 * 柱宽与缝的几何约束。
 *
 * 旧版把柱宽死夹在 [2,4]、缝死夹在 [1.5,2]，于是 48 柱 × 6px pitch = 286px 就是
 * 物理上限，无论窗口多宽都只有屏幕中间一小撮 —— 这就是用户说的「频谱太短」。
 *
 * 新版换了个前提：**整排必须铺满容器**。柱宽上限抬到 24px 让低柱数也能撑开，
 * 缝按槽位的 34% 取（最宽 8px）。想要「细密圆点」的观感就把柱数调到 140-160、
 * 宽度拉到 100%，那时 pitch 只有 7px 上下，柱子自然细。
 */
const DOT_W_MIN = 2;
const DOT_W_MAX = 16;
/** 柱宽占槽位的比例，剩下的就是缝：0.5 = 柱与缝等宽，观感最接近「细密刻度」。 */
const DOT_W_RATIO = 0.5;
/** 极窄容器（slot < 2.5px）的最后退让：宁可缝收窄到 0.5px 也不让相邻柱重叠。 */
const DOT_GAP_FLOOR = 0.5;
/** 底噪圆点与柱顶峰值标记的固定高度。 */
const FLOOR_H = 2;
const PEAK_H = 2;

/** 读不到 CSS 变量时的兜底（深底、淡蓝到白）。 */
const FALLBACK_PALETTE = Object.freeze({
  base: 'rgba(150,200,255,0.30)',
  low: 'rgba(120,180,255,0.55)',
  high: 'rgba(255,255,255,0.98)',
  glow: 'rgba(90,170,255,0.55)',
});

/* ---------------- 小工具 ---------------- */

/** 读一个 CSS 变量并带兜底色；取不到就用兜底。 */
function cssVar(styles, name, fallback) {
  if (!styles || typeof styles.getPropertyValue !== 'function') return fallback;
  const value = styles.getPropertyValue(name);
  const text = typeof value === 'string' ? value.trim() : '';
  return text === '' ? fallback : text;
}

/**
 * 对数频段边界。index 0 从 bin 1 起，最高到 Nyquist 前一格。
 * 用比例而非绝对 bin 号，采样率变化时映射不崩。
 */
function logBandEdges(binCount, bars) {
  const edges = new Int32Array(bars + 1);
  const minBin = 1;
  const maxBin = Math.max(minBin + 1, binCount - 1);
  const logMin = Math.log(minBin);
  const logMax = Math.log(maxBin);
  let prev = minBin;
  edges[0] = minBin;
  for (let i = 1; i <= bars; i += 1) {
    const ratio = i / bars;
    let bin = Math.round(Math.exp(logMin + (logMax - logMin) * ratio));
    if (bin <= prev) bin = prev + 1;
    if (bin > maxBin) bin = maxBin;
    edges[i] = bin;
    prev = bin;
  }
  return edges;
}

/** 每根柱取该频段内的最大值；取均值会把瞬态吃掉，视觉上像没在动。 */
function sampleBands(freq, edges, bars, out) {
  for (let i = 0; i < bars; i += 1) {
    const from = edges[i];
    const to = Math.max(from + 1, edges[i + 1]);
    let peak = 0;
    for (let bin = from; bin < to && bin < freq.length; bin += 1) {
      if (freq[bin] > peak) peak = freq[bin];
    }
    out[i] = peak / 255;
  }
  return out;
}

function prefersReducedMotion() {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches === true;
  } catch (_error) {
    return false;
  }
}

/** 把一条圆角矩形追加进当前路径，不重置路径（wave 需要一次 fill 掉一整排）。 */
function roundRectPath(ctx, x, y, w, height, r) {
  const radius = Math.max(0, Math.min(r, w / 2, height / 2));
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, height, radius);
    return;
  }
  // 老 Safari 没有 roundRect，手搓一条路径（首条 moveTo 起新子路径）。
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + height - radius);
  ctx.quadraticCurveTo(x + w, y + height, x + w - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/** 单条圆角矩形（自带 beginPath）。 */
function roundRect(ctx, x, y, w, height, r) {
  ctx.beginPath();
  roundRectPath(ctx, x, y, w, height, r);
}

/** engine 可能没实现 getAnalyser（早期版本），三种取法都试一遍。 */
function readAnalyser(engine) {
  if (!engine || typeof engine !== 'object') return null;
  try {
    if (typeof engine.getAnalyser === 'function') {
      const node = engine.getAnalyser();
      if (node) return node;
    }
    if (engine.analyser && typeof engine.analyser === 'object') return engine.analyser;
  } catch (_error) {
    return null;
  }
  return null;
}

/** 从 engine 读一次状态；拿不到就当可用。 */
function readEngineState(engine) {
  try {
    if (engine && typeof engine.getState === 'function') {
      const state = engine.getState();
      if (state && typeof state === 'object') return state;
    }
    // engine 也暴露了 spectrumAvailable / analyser 这两个 getter，
    // getState 缺失时用它们兜一次，省得整个组件退回「永远可用」。
    if (engine && typeof engine === 'object') {
      const available = engine.spectrumAvailable;
      if (typeof available === 'boolean') {
        return { mode: available ? 'internal' : 'external', spectrumAvailable: available };
      }
    }
  } catch (_error) {
    // 状态读失败不影响降级判断，走默认分支。
  }
  return null;
}

/* ---------------- 设置归一化（导出给自检脚本） ---------------- */

export function normalizeStyle(value) {
  return STYLE_VALUES.includes(value) ? value : DEFAULT_STYLE;
}

/** 柱数：夹到 16-96 并按 8 对齐；读不到用 48。 */
export function normalizeBarCount(value) {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return DEFAULT_BAR_COUNT;
  const clamped = Math.min(BAR_COUNT_MAX, Math.max(BAR_COUNT_MIN, Math.round(num)));
  return Math.round(clamped / BAR_COUNT_STEP) * BAR_COUNT_STEP;
}

/** 灵敏度：夹到 0.5-4；读不到用 1。 */
export function normalizeGain(value) {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return GAIN_DEFAULT;
  return Math.min(GAIN_MAX, Math.max(GAIN_MIN, num));
}

export function normalizeGlow(value) {
  return GLOW_VALUES.includes(value) ? value : GLOW_DEFAULT;
}

/**
 * dots / bars / wave 共用的水平几何。返回柱宽、间距、pitch 与起始 x。
 *
 * 核心契约：**整排铺满给定宽度**（`total === width`，误差 < 0.01px）。
 * 旧实现把柱宽夹在 [2,4]、缝夹在 [1.5,2]，整排最多 286px，窗口再宽也只居中一小撮；
 * 那正是「频谱太短」的根源。现在改成：
 *
 *   slot = width / count                每根柱均分到的槽位
 *   barW = clamp(slot × 0.5, 2, 16)     柱宽 = 槽位一半，细密但不糊成实心
 *   gap  = slot - barW                  缝自动吃掉剩余，≥ 0.5px 保证不粘连
 *   x0   = 0                            不再居中，从左边铺到右边
 *
 * 槽位极窄（96 柱挤在 320px 容器里）时 barW 触底 2px、gap 触底 0.5px，
 * 此时整排会溢出容器 —— 那就照实溢出（overflow 由外层裁掉），
 * 绝不为了「塞下」而让相邻柱重叠：重叠在视觉上会糊成一条实心带，比截断更糟。
 *
 * @param {number} width CSS 像素宽度。
 * @param {number} count 柱数。
 * @returns {{barW:number, gap:number, step:number, slot:number, x0:number, total:number}}
 */
export function dotLayout(width, count) {
  const n = Math.max(1, Math.round(count) || 1);
  const w = Math.max(1, Number(width) || 1);
  const slot = w / n;

  let barW = Math.min(DOT_W_MAX, Math.max(DOT_W_MIN, slot * DOT_W_RATIO));
  // 缝由「剩下多少宽度」反解：n 根柱 + (n-1) 个缝必须精确等于容器宽。
  // 写成 (w - barW*n)/(n-1) 而不是 slot - barW，是为了让最后一根柱正好贴住右边界 ——
  // 用 slot - barW 会剩半个缝的右侧留白，加起来看着就「差一截没铺满」。
  let gap = n === 1 ? 0 : (w - barW * n) / (n - 1);
  if (gap < DOT_GAP_FLOOR) {
    // 槽位太挤：缝收到下限，柱宽按剩余空间反算；仍放不下就照实溢出（不重叠优先）。
    gap = DOT_GAP_FLOOR;
    barW = n === 1 ? w : Math.max(1, (w - gap * (n - 1)) / n);
  }

  const step = barW + gap;
  const total = step * (n - 1) + barW;
  return { barW, gap, step, slot, x0: 0, total };
}

/* ---------------- 组件 ---------------- */

export function Spectrum(props) {
  const { engine, settings } = props || {};
  const style = normalizeStyle(settings && settings.spectrumStyle);
  const configuredFps = settings && settings.spectrumFps === 30 ? 30 : 60;
  const barCount = normalizeBarCount(settings && settings.spectrumBars);
  const gain = normalizeGain(settings && settings.spectrumGain);
  const glow = normalizeGlow(settings && settings.spectrumGlow);

  // 外部播放器模式下没有 analyser：先按 engine 当前状态定初始占位，再靠事件刷新。
  //
  // 判据只能是 mode === 'external'，不能再叠加 spectrumAvailable。
  // 空闲态（刚打开页面、什么都没放）engine 的 spectrumAvailable 也是 false，
  // 此时频谱在画呼吸基线 —— 那是「有点可画」，不是「没有频谱」。
  // 早先写成 `spectrumAvailable !== false` 就直接把「外部播放器 · 无频谱」
  // 这枚徽标焊在了空面板的右下角。
  const initialSpectrumAvailable = (() => {
    const state = readEngineState(engine);
    if (state === null) return true;
    return state.mode !== 'external';
  })();

  const canvasRef = useRef(null);
  const hostRef = useRef(null);
  const rafRef = useRef(0);
  const geometryRef = useRef({ width: 0, height: 0, dpr: 1 });
  // 峰值 / 频段数组按 settings.spectrumBars 分配；柱数变化时在 effect 里重建。
  const peaksRef = useRef(null);
  const bandsRef = useRef(null);
  const edgesRef = useRef(null);
  const visibleRef = useRef(true);
  const externalRef = useRef(initialSpectrumAvailable === false);

  useEffect(() => {
    if (style === 'off') return undefined;
    const canvas = canvasRef.current;
    if (canvas === null || canvas === undefined) return undefined;
    const maybeCtx = canvas.getContext('2d');
    if (maybeCtx === null || maybeCtx === undefined) return undefined;
    const ctx2d = maybeCtx;

    const reduced = prefersReducedMotion();
    const fps = reduced ? Math.min(REDUCED_MOTION_FPS, configuredFps) : configuredFps;
    const intervalMs = 1000 / Math.max(1, fps);

    // 柱数变化：数组长度、频段边界都要跟着重建，否则会画到旧长度的尾巴上。
    if (!peaksRef.current || peaksRef.current.length !== barCount) {
      peaksRef.current = new Float32Array(barCount);
      bandsRef.current = new Float32Array(barCount);
    }

    /*
     * analyser 是「懒创建」的：engine 的 AudioContext 在首次真正播放时才建
     * （见 engine.js 的 ensureContext），而频谱组件通常在播放前就已挂载。
     * 因此这里绝不能只在挂载时取一次 —— 那样默认路径下 analyser 永远是 null，
     * 频谱会一直停在呼吸基线上，用户看到的就是「有动静但不是频谱」。
     * 做法：挂载时先绑，绑不到就用默认 bin 数把缓冲备好；之后每帧（节流 500ms）
     * 重试一次，拿到就换绑并重建缓冲。
     */
    let analyser = null;
    let binCount = FFT_SIZE / 2;
    let freq = new Uint8Array(binCount);
    let waveBuf = new Uint8Array(FFT_SIZE);
    let nextProbeTs = 0;

    /**
     * 绑定一个 AnalyserNode：校正 fftSize，按它的 bin 数重建缓冲与对数频段边界。
     * 同一节点且 bin 数没变时直接返回，避免每帧重建数组。
     * @param {object | null} node AnalyserNode 或 null。
     * @returns {boolean} 是否已绑定可用节点。
     */
    function bindAnalyser(node) {
      if (!node || typeof node !== 'object') return false;
      if (node.fftSize !== FFT_SIZE) {
        try {
          node.fftSize = FFT_SIZE;
        } catch (_error) {
          // 某些实现上 fftSize 只读，那就用现有 bin 数。
        }
      }
      const bins = Number(node.frequencyBinCount);
      const safeBins = Number.isFinite(bins) && bins > 0 ? Math.floor(bins) : FFT_SIZE / 2;
      if (node === analyser && safeBins === binCount && freq !== null) return true;
      const timeSize = Number.isFinite(node.fftSize) && node.fftSize > 0 ? node.fftSize : safeBins * 2;
      analyser = node;
      binCount = safeBins;
      freq = new Uint8Array(safeBins);
      waveBuf = new Uint8Array(timeSize);
      edgesRef.current = logBandEdges(safeBins, barCount);
      return true;
    }

    bindAnalyser(readAnalyser(engine));
    peaksRef.current.fill(0);
    bandsRef.current.fill(0);

    /** 色板缓存：getComputedStyle 每帧调用会强制样式重算，只在尺寸/主题变化时失效。 */
    let paletteCache = null;

    function readPalette() {
      let computed = null;
      try {
        // 必须取 canvas：变量定义在 `.dmo` 容器上，靠继承落到 canvas。
        computed = getComputedStyle(canvas);
      } catch (_error) {
        computed = null;
      }
      return {
        base: cssVar(computed, '--dmo-spec-base', FALLBACK_PALETTE.base),
        low: cssVar(computed, '--dmo-spec-low', FALLBACK_PALETTE.low),
        high: cssVar(computed, '--dmo-spec-high', FALLBACK_PALETTE.high),
        glow: cssVar(computed, '--dmo-spec-glow', FALLBACK_PALETTE.glow),
      };
    }

    function palette() {
      if (paletteCache === null) paletteCache = readPalette();
      return paletteCache;
    }

    /** 按 CSS 尺寸 + DPR 重设画布；尺寸没变就不动，避免每帧清屏抖动。 */
    function resize() {
      const host = hostRef.current || canvas;
      const dpr = Math.min(MAX_DPR, Math.max(1, window.devicePixelRatio || 1));
      const rect = host.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width || host.clientWidth || 320));
      const height = Math.max(1, Math.round(rect.height || host.clientHeight || 64));
      const pixelW = Math.round(width * dpr);
      const pixelH = Math.round(height * dpr);
      if (canvas.width !== pixelW || canvas.height !== pixelH) {
        canvas.width = pixelW;
        canvas.height = pixelH;
      }
      geometryRef.current = { width, height, dpr };
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      paletteCache = null;
    }

    /** 光晕参数：off 时返回 0，调用方据此跳过 shadowBlur 写入。 */
    function glowParams(colors) {
      const blur = GLOW_BLUR[glow] || 0;
      return { blur, color: glow === 'strong' ? GLOW_STRONG_COLOR : colors.glow };
    }

    /**
     * dots：用户主样式。细柱 + 每柱一根 2px 底噪圆点 + 柱顶 2px 白色峰值点。
     * 底噪点对每根柱都画（不只是 0 值柱），底噪线才连贯不断。
     */
    function drawDots(colors) {
      const { width, height } = geometryRef.current;
      const layout = dotLayout(width, barCount);
      const { barW, step, x0 } = layout;
      const radius = barW / 2;
      const { blur, color: glowColor } = glowParams(colors);
      const floorY = height - FLOOR_H;
      const bands = bandsRef.current;
      const peaks = peaksRef.current;

      for (let i = 0; i < barCount; i += 1) {
        const x = x0 + i * step;
        const value = bands[i];

        ctx2d.fillStyle = colors.base;
        roundRect(ctx2d, x, floorY, barW, FLOOR_H, radius);
        ctx2d.fill();

        if (value > 0.001) {
          const barH = Math.max(FLOOR_H, value * height);
          const top = height - barH;
          // 竖直渐变：底端淡蓝 → 顶端近白，柱越高白色占比越大。
          const gradient = ctx2d.createLinearGradient(0, height, 0, top);
          gradient.addColorStop(0, colors.low);
          gradient.addColorStop(1, colors.high);
          if (blur > 0) {
            ctx2d.shadowBlur = blur;
            ctx2d.shadowColor = glowColor;
          }
          ctx2d.fillStyle = gradient;
          roundRect(ctx2d, x, top, barW, barH, radius);
          ctx2d.fill();
          if (blur > 0) {
            // 每根柱画完立刻复位，否则后面的柱会吃到前一根的阴影拖尾。
            ctx2d.shadowBlur = 0;
            ctx2d.shadowColor = 'transparent';
          }
        }

        const peak = peaks[i];
        if (peak > 0.002) {
          const py = Math.max(0, Math.min(height - PEAK_H, height - peak * height));
          ctx2d.fillStyle = colors.high;
          roundRect(ctx2d, x, py, barW, PEAK_H, PEAK_H / 2);
          ctx2d.fill();
        }
      }
      // 收尾复位：任何异常路径都不能把光晕状态带进下一帧。
      ctx2d.shadowBlur = 0;
    }

    /** bars：同一套蓝白配色 + 可选的柔和光晕，不再读宿主 alias 变量。 */
    function drawBars(colors) {
      const { width, height } = geometryRef.current;
      const layout = dotLayout(width, barCount);
      const { barW, step, x0 } = layout;
      const radius = Math.min(barW / 2, 3);
      const { blur, color: glowColor } = glowParams(colors);
      const bands = bandsRef.current;
      const peaks = peaksRef.current;

      for (let i = 0; i < barCount; i += 1) {
        const x = x0 + i * step;
        const value = bands[i];

        // 基座轨道：给低频留一点存在感，否则深底上像一条空白。
        ctx2d.fillStyle = colors.base;
        roundRect(ctx2d, x, height - FLOOR_H, barW, FLOOR_H, radius);
        ctx2d.fill();

        if (value > 0.001) {
          const barH = Math.max(FLOOR_H, value * height);
          const top = height - barH;
          const gradient = ctx2d.createLinearGradient(0, height, 0, top);
          gradient.addColorStop(0, colors.low);
          gradient.addColorStop(1, colors.high);
          if (blur > 0) {
            ctx2d.shadowBlur = blur;
            ctx2d.shadowColor = glowColor;
          }
          ctx2d.fillStyle = gradient;
          roundRect(ctx2d, x, top, barW, barH, radius);
          ctx2d.fill();
          if (blur > 0) {
            ctx2d.shadowBlur = 0;
            ctx2d.shadowColor = 'transparent';
          }
        }

        const peak = peaks[i];
        if (peak > 0.002) {
          const py = Math.max(0, Math.min(height - PEAK_H, height - peak * height));
          ctx2d.fillStyle = colors.high;
          roundRect(ctx2d, x, py, barW, PEAK_H, PEAK_H / 2);
          ctx2d.fill();
        }
      }
      ctx2d.shadowBlur = 0;
    }

    /** line：时域折线（保留旧语义），配色换成同一套蓝白。 */
    function drawLine(colors) {
      const { width, height } = geometryRef.current;
      const step = width / Math.max(1, barCount - 1);
      const bands = bandsRef.current;
      const peaks = peaksRef.current;

      ctx2d.strokeStyle = colors.base;
      ctx2d.lineWidth = 1;
      ctx2d.beginPath();
      ctx2d.moveTo(0, height - 1);
      ctx2d.lineTo(width, height - 1);
      ctx2d.stroke();

      ctx2d.lineWidth = 1.6;
      ctx2d.lineJoin = 'round';
      ctx2d.strokeStyle = colors.high;
      ctx2d.beginPath();
      for (let i = 0; i < barCount; i += 1) {
        const x = i * step;
        const y = height - bands[i] * height;
        if (i === 0) ctx2d.moveTo(x, y);
        else ctx2d.lineTo(x, y);
      }
      ctx2d.stroke();

      // 峰值用短横线保留，波形样式下同样需要「慢回落」的视觉线索。
      ctx2d.strokeStyle = colors.low;
      ctx2d.lineWidth = 1.2;
      for (let i = 0; i < barCount; i += 1) {
        const peak = peaks[i];
        if (peak <= 0.002) continue;
        const x = i * step;
        const y = Math.max(1, height - peak * height);
        ctx2d.beginPath();
        ctx2d.moveTo(Math.max(0, x - step * 0.3), y);
        ctx2d.lineTo(Math.min(width, x + step * 0.3), y);
        ctx2d.stroke();
      }
    }

    /**
     * wave：时域波形，画成上下对称的镜像振幅条（原来 wave 会静默退回柱状）。
     * 整排一次 fill（蓝白渐变）+ 一次 stroke（1.5px 白边），避免每列两次状态切换。
     */
    function drawWave(colors) {
      const { width, height } = geometryRef.current;
      const layout = dotLayout(width, barCount);
      const { barW, step, x0 } = layout;
      const center = height / 2;
      const bands = bandsRef.current;

      const gradient = ctx2d.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, colors.low);
      gradient.addColorStop(0.5, colors.high);
      gradient.addColorStop(1, colors.low);

      ctx2d.beginPath();
      for (let i = 0; i < barCount; i += 1) {
        const amp = bands[i];
        const half = Math.min(center, Math.max(0.75, amp * center));
        const x = x0 + i * step;
        // 镜像：以中线为轴对称，高度 = 2 * half。
        roundRectPath(ctx2d, x, center - half, barW, half * 2, barW / 2);
      }
      ctx2d.fillStyle = gradient;
      ctx2d.fill();

      ctx2d.strokeStyle = colors.high;
      ctx2d.lineWidth = 1.5;
      ctx2d.lineJoin = 'round';
      ctx2d.stroke();
    }

    /**
     * blocks：音频可视化软件的传统观感 —— 每列一串独立小方块，
     * 亮起的方块为渐变色，未亮起的留极淡的占位格。
     *
     * 与 dots 的区别在语义：dots 是「一条连续的柱体」，blocks 是「离散的格数」，
     * 读数像音量表而不是频谱带。格高固定 4px，所以高度变化是跳跃的，更硬朗。
     */
    function drawBlocks(colors) {
      const { width, height } = geometryRef.current;
      const layout = dotLayout(width, barCount);
      const { barW, step, x0 } = layout;
      const radius = Math.min(barW / 2, 2);
      const { blur, color: glowColor } = glowParams(colors);
      const bands = bandsRef.current;
      const cellH = 4;
      const cellGap = 2;
      const pitchY = cellH + cellGap;
      const maxCells = Math.max(1, Math.floor(height / pitchY));
      const gradient = ctx2d.createLinearGradient(0, height, 0, 0);
      gradient.addColorStop(0, colors.low);
      gradient.addColorStop(1, colors.high);

      for (let i = 0; i < barCount; i += 1) {
        const x = x0 + i * step;
        const lit = Math.min(maxCells, Math.round(bands[i] * maxCells));
        const peakCell = Math.min(maxCells, Math.round(peaksRef.current[i] * maxCells));

        // 未亮的占位格：只画最底下 3 个，避免整屏都是网格噪声。
        for (let c = 0; c < Math.min(3, maxCells - lit); c += 1) {
          ctx2d.fillStyle = colors.base;
          roundRect(ctx2d, x, height - (c + 1) * pitchY + cellGap, barW, cellH, radius);
          ctx2d.fill();
        }

        for (let c = 0; c < lit; c += 1) {
          if (blur > 0) {
            ctx2d.shadowBlur = blur;
            ctx2d.shadowColor = glowColor;
          }
          ctx2d.fillStyle = gradient;
          roundRect(ctx2d, x, height - (c + 1) * pitchY + cellGap, barW, cellH, radius);
          ctx2d.fill();
          if (blur > 0) {
            ctx2d.shadowBlur = 0;
            ctx2d.shadowColor = 'transparent';
          }
        }

        // 峰值：单独一格更亮，读出「刚才到过哪儿」。
        if (peakCell > lit && peakCell <= maxCells) {
          ctx2d.fillStyle = colors.high;
          roundRect(ctx2d, x, height - peakCell * pitchY + cellGap, barW, cellH, radius);
          ctx2d.fill();
        }
      }
      ctx2d.shadowBlur = 0;
    }

    /**
     * mirror：从屏幕中线向上下两侧对称展开，像一条横向的声波。
     *
     * 与 wave 的区别：wave 画的是时域采样（连续波形），mirror 画的是频域各频段
     * 的柱体，上下对称只是造型。频域信息量更大，视觉上也更像「音乐条」。
     */
    function drawMirror(colors) {
      const { width, height } = geometryRef.current;
      const layout = dotLayout(width, barCount);
      const { barW, step, x0 } = layout;
      const radius = barW / 2;
      const { blur, color: glowColor } = glowParams(colors);
      const center = height / 2;
      const bands = bandsRef.current;
      const gradient = ctx2d.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, colors.high);
      gradient.addColorStop(0.5, colors.low);
      gradient.addColorStop(1, colors.high);

      for (let i = 0; i < barCount; i += 1) {
        const x = x0 + i * step;
        // 上限 center 保证不越出画布；下限 1px 保证中线永远有一条连续的光带。
        const half = Math.min(center, Math.max(1, bands[i] * center));
        if (blur > 0) {
          ctx2d.shadowBlur = blur;
          ctx2d.shadowColor = glowColor;
        }
        ctx2d.fillStyle = gradient;
        roundRect(ctx2d, x, center - half, barW, half * 2, radius);
        ctx2d.fill();
        if (blur > 0) {
          ctx2d.shadowBlur = 0;
          ctx2d.shadowColor = 'transparent';
        }
      }
      ctx2d.shadowBlur = 0;
    }

    function step(now, prevTs) {
      const { width, height } = geometryRef.current;
      const nowTs = typeof now === 'number' ? now : performance.now();
      const dt = prevTs === null ? intervalMs : Math.max(1, nowTs - prevTs);
      // 帧间隔缩放：30fps 下每帧回落量是 60fps 的两倍，观感一致。
      const decay = (PEAK_DECAY_PER_FRAME * dt) / REF_FRAME_MS;
      const bands = bandsRef.current;
      const peaks = peaksRef.current;

      // 懒绑定的 analyser 还没到位（或换了一颗新的）时，节流重试一次。
      if (analyser === null && nextProbeTs <= nowTs) {
        nextProbeTs = nowTs + ANALYSER_PROBE_MS;
        bindAnalyser(readAnalyser(engine));
      }

      if (analyser !== null && !externalRef.current) {
        if (style === 'wave' || style === 'line') {
          analyser.getByteTimeDomainData(waveBuf);
          // 时域数据也要压成 barCount 个采样点，宽度才稳定。
          const chunk = Math.max(1, Math.floor(waveBuf.length / barCount));
          const boost = style === 'wave' ? 1.6 : 2.2;
          for (let i = 0; i < barCount; i += 1) {
            let peak = 0;
            const from = i * chunk;
            for (let k = from; k < from + chunk && k < waveBuf.length; k += 1) {
              const amplitude = Math.abs(waveBuf[k] - 128);
              if (amplitude > peak) peak = amplitude;
            }
            bands[i] = Math.min(1, (peak / 128) * boost * gain);
          }
        } else {
          analyser.getByteFrequencyData(freq);
          sampleBands(freq, edgesRef.current, barCount, bands);
          for (let i = 0; i < barCount; i += 1) {
            // 灵敏度乘在归一化值上，最后封顶 1：超过 1 只会被柱顶削平。
            bands[i] = Math.min(1, bands[i] * gain);
          }
        }
      } else {
        // 无 analyser（外部播放器 / 窗口化代理播放）：画一条呼吸基线，
        // 明确「没有频谱但组件还活着」，而不是黑屏。
        // 幅度比内部模式的底噪略高：dots 的柱高有 2px 下限，太低的起伏会被下限吃掉。
        const t = nowTs / 1000;
        for (let i = 0; i < barCount; i += 1) {
          bands[i] = 0.035 + 0.02 * (1 + Math.sin(t * 1.2 + i * 0.35));
        }
      }

      for (let i = 0; i < barCount; i += 1) {
        const value = bands[i];
        const decayed = peaks[i] - decay;
        // 硬要求：峰值不低于当前值。
        peaks[i] = Math.max(value, decayed > 0 ? decayed : 0);
      }

      ctx2d.clearRect(0, 0, width, height);
      const colors = palette();
      if (style === 'dots') drawDots(colors);
      else if (style === 'blocks') drawBlocks(colors);
      else if (style === 'mirror') drawMirror(colors);
      else if (style === 'wave') drawWave(colors);
      else if (style === 'line') drawLine(colors);
      else drawBars(colors);
    }

    let prevTs = null;

    function loop(now) {
      rafRef.current = 0;
      const ts = typeof now === 'number' ? now : performance.now();
      if (!visibleRef.current || (typeof document !== 'undefined' && document.hidden === true)) {
        // 不可见就彻底停：不再调度下一帧，等 resume() 重新拉起。
        return;
      }
      // 按目标帧率节流：60fps 屏上也只画 settings 要求的帧数。
      if (prevTs === null || ts - prevTs >= intervalMs - 1) {
        try {
          step(ts, prevTs);
        } catch (_error) {
          // 单帧渲染异常不能杀死循环（analyser 被销毁时很常见）。
        }
        prevTs = ts;
      }
      rafRef.current = requestAnimationFrame(loop);
    }

    function resume() {
      if (rafRef.current !== 0) return;
      if (!visibleRef.current) return;
      if (typeof document !== 'undefined' && document.hidden === true) return;
      prevTs = null;
      rafRef.current = requestAnimationFrame(loop);
    }

    function suspend() {
      if (rafRef.current !== 0) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      prevTs = null;
    }

    resize();
    // 先画一帧静态内容：即便 rAF 被暂停，用户也能看到框架而不是空白。
    try {
      step(performance.now(), null);
    } catch (_error) {
      // 首帧失败不影响后续
    }

    // 尺寸变化单独监听；容器宽度变了 DPR 也可能变（跨显示器拖动）。
    let resizeObserver = null;
    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(() => {
        resize();
      });
      resizeObserver.observe(hostRef.current || canvas);
    } else if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('resize', resize);
    }

    // 可见性：文档隐藏 / 容器滚出视口 → 停 rAF。
    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.hidden === true) suspend();
      else resume();
    };
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', onVisibility);
    }

    let observer = null;
    if (typeof IntersectionObserver === 'function') {
      const host = hostRef.current || canvas;
      observer = new IntersectionObserver(
        (entries) => {
          const entry = entries && entries[0];
          visibleRef.current = entry ? entry.isIntersecting === true : true;
          if (visibleRef.current) resume();
          else suspend();
        },
        { threshold: 0.01 },
      );
      observer.observe(host);
    }

    // 模式切换：external 时 analyser 为 null，改成占位基线并继续跑（不消失）。
    let offState = null;
    if (engine && typeof engine.onStateChange === 'function') {
      try {
        const unsubscribe = engine.onStateChange((state) => {
          const next = state && typeof state === 'object' ? state : readEngineState(engine);
          if (next !== null) {
            // 同上：只认 mode === 'external'。空闲态 spectrumAvailable 也是 false，
            // 照它判会把徽标又焊回去。
            externalRef.current = next.mode === 'external';
          }
          // 状态变化是最强的「引擎可能刚建好」信号：立刻重绑，不等 500ms 重试窗口。
          if (bindAnalyser(readAnalyser(engine))) nextProbeTs = 0;
          if (visibleRef.current) resume();
        });
        offState = typeof unsubscribe === 'function' ? unsubscribe : null;
      } catch (_error) {
        offState = null;
      }
    }

    resume();

    // 主题切换：CSS 变量变了但不会触发重渲染，色板失效 + 补画一帧即可。
    let mq = null;
    const onScheme = () => {
      paletteCache = null;
      if (rafRef.current === 0) {
        try {
          step(performance.now(), null);
        } catch (_error) {
          // 忽略
        }
      }
    };
    try {
      if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
        mq = window.matchMedia('(prefers-color-scheme: dark)');
        if (mq && typeof mq.addEventListener === 'function') mq.addEventListener('change', onScheme);
      }
    } catch (_error) {
      mq = null;
    }

    return () => {
      // 卸载：所有句柄必须还回去，否则 StrictMode / 热更新会叠出多套循环。
      if (rafRef.current !== 0) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      if (observer !== null) {
        observer.disconnect();
        observer = null;
      }
      if (resizeObserver !== null) {
        resizeObserver.disconnect();
        resizeObserver = null;
      } else if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener('resize', resize);
      }
      if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
      if (typeof offState === 'function') offState();
      offState = null;
      if (mq !== null && typeof mq.removeEventListener === 'function') mq.removeEventListener('change', onScheme);
      mq = null;
      peaksRef.current.fill(0);
      bandsRef.current.fill(0);
    };
    // 只有这些项变了才重建循环；engine 是稳定引用（Lead 约定 engine 单例）。
  }, [engine, style, configuredFps, barCount, gain, glow]);

  if (style === 'off') {
    // 关闭态连 canvas 都不创建：零动画、零监听。
    return null;
  }

  const children = [
    h('canvas', {
      key: 'canvas',
      ref: canvasRef,
      className: 'dmo-spectrum-canvas',
      'aria-hidden': 'true',
    }),
  ];
  if (initialSpectrumAvailable === false) {
    children.push(
      h(
        'span',
        { key: 'badge', className: 'dmo-spectrum-badge' },
        '外部播放器 · 无频谱',
      ),
    );
  }

  return h(
    'div',
    {
      ref: hostRef,
      className: 'dmo-spectrum',
      'data-style': style,
      'data-fps': String(configuredFps),
      'data-bars': String(barCount),
      'data-glow': glow,
      'data-spectrum': initialSpectrumAvailable === false ? 'unavailable' : 'available',
    },
    children,
  );
}

/** 自检脚本用出口：几何 / 归一化 / 色板兜底值。 */
export const __test = {
  normalizeStyle,
  normalizeBarCount,
  normalizeGain,
  normalizeGlow,
  dotLayout,
  FALLBACK_PALETTE,
  constants: {
    FFT_SIZE,
    DEFAULT_BAR_COUNT,
    BAR_COUNT_MIN,
    BAR_COUNT_MAX,
    DOT_W_MIN,
    DOT_W_MAX,
    DOT_W_RATIO,
    DOT_GAP_FLOOR,
    FLOOR_H,
    PEAK_H,
    GLOW_BLUR,
  },
};

export default Spectrum;
