/**
 * dsh-music-on · Spectrum.jsx 自检（零依赖，纯 Node）
 *
 * 存在的理由：频谱是纯 canvas 副作用代码，宿主是零转译静态投递（readFileSync 后原样
 * 拼进 combo 脚本），因此任何 JSX 标签、任何非 `react` 的 import、任何 Node 内置模块
 * 都会在真实宿主里炸成一条 `missed the module table`，而本地 `node --check` 又因为
 * `.jsx` 后缀直接 ERR_UNKNOWN_FILE_EXTENSION 拿到假阳性。所以这里做三件事：
 *
 *   1) 静态断言：没有 JSX 标签、import 只有 `react`、没有内置模块、没有相对路径。
 *   2) 把源码原样复制成临时 `.mjs` 跑一次真正的 `node --check`（语法确证）。
 *   3) 用假 canvas 2D context 记录所有绘制调用，真的把组件跑起来，逐条验证行为契约。
 *
 * 假渲染层只实现 Spectrum 用到的三个 react API（createElement / useRef / useEffect），
 * 通过临时目录里的 node_modules/react 提供 —— 不改产品代码，也不装任何依赖。
 *
 * 用法：node scripts/check-spectrum.mjs
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(root, 'src/client/ui/Spectrum.jsx');

/* ---------------- 断言与计数 ---------------- */

let passed = 0;
const failures = [];
const notes = [];

function check(label, fn) {
  try {
    const detail = fn();
    passed += 1;
    console.log(`  PASS  ${label}${detail === undefined ? '' : `  — ${detail}`}`);
  } catch (error) {
    failures.push(`${label}: ${error && error.message ? error.message : error}`);
    console.log(`  FAIL  ${label}  — ${error && error.message ? error.message : error}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}（实际 ${actual}，期望 ${expected}）`);
}

function note(text) {
  notes.push(text);
  console.log(`  NOTE  ${text}`);
}

/* ---------------- 假 canvas 2D ---------------- */

/**
 * 记录型 2D context。
 *
 * 关键设计：shadowBlur 用访问器记录「写入历史」，roundRect / fill / stroke 在调用瞬间
 * 快照当时的 shadowBlur。这样既能看到光晕有没有真的加上，也能验证每根柱画完有没有
 * 复位成 0（残留会让后面的柱全部拖尾）。
 */
function createRecordingContext() {
  const ops = [];
  let shadowBlurValue = 0;
  let shadowColorValue = 'transparent';

  const ctx = {
    ops,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineJoin: 'miter',
    _shadowWrites: 0,
    get shadowBlur() {
      return shadowBlurValue;
    },
    set shadowBlur(value) {
      ctx._shadowWrites += 1;
      ops.push({ op: 'shadowBlur', value });
      shadowBlurValue = value;
    },
    get shadowColor() {
      return shadowColorValue;
    },
    set shadowColor(value) {
      shadowColorValue = value;
    },
    setTransform(...args) {
      ops.push({ op: 'setTransform', args });
    },
    clearRect(...args) {
      ops.push({ op: 'clearRect', args });
    },
    beginPath() {
      ops.push({ op: 'beginPath' });
    },
    closePath() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    roundRect(x, y, w, h, r) {
      ops.push({ op: 'roundRect', x, y, w, h, r, blur: shadowBlurValue });
    },
    rect(x, y, w, h) {
      ops.push({ op: 'roundRect', x, y, w, h, r: 0, blur: shadowBlurValue });
    },
    fill() {
      const style = ctx.fillStyle;
      ops.push({
        op: 'fill',
        gradient: !!(style && style.__gradient),
        style: style && style.__gradient ? style : String(style),
        blur: shadowBlurValue,
      });
    },
    stroke() {
      ops.push({ op: 'stroke', style: String(ctx.strokeStyle), lineWidth: ctx.lineWidth });
    },
    createLinearGradient(x0, y0, x1, y1) {
      return {
        __gradient: true,
        x0,
        y0,
        x1,
        y1,
        stops: [],
        addColorStop(offset, color) {
          this.stops.push([offset, color]);
        },
      };
    },
  };
  return ctx;
}

/* ---------------- 假 DOM ---------------- */

/** 每个元素节点都带一个可覆盖的 bounding rect；只有 canvas 才带 2D context。 */
function buildNode(element, size) {
  const props = (element && element.props) || {};
  const node = {
    type: element && element.type,
    props,
    width: 300,
    height: 150,
    style: {},
    children: [],
    getBoundingClientRect() {
      return { width: size.width, height: size.height, top: 0, left: 0, right: size.width, bottom: size.height };
    },
    clientWidth: size.width,
    clientHeight: size.height,
    addEventListener() {},
    removeEventListener() {},
  };
  if (node.type === 'canvas') {
    node.ctx = createRecordingContext();
    node.getContext = () => node.ctx;
  }
  const ref = props.ref;
  if (ref && typeof ref === 'object' && 'current' in ref) ref.current = node;
  const children = Array.isArray(props.children) ? props.children : [];
  node.children = children.filter(Boolean).map((child) => buildNode(child, size));
  return node;
}

/* ---------------- 假 analyser / engine ---------------- */

function createAnalyser() {
  const stats = { freq: 0, time: 0 };
  const analyser = {
    fftSize: 2048,
    stats,
    get frequencyBinCount() {
      return 1024;
    },
    getByteFrequencyData(array) {
      stats.freq += 1;
      for (let i = 0; i < array.length; i += 1) {
        // 低频高、高频低，带一点梳状起伏，保证 64 根柱都拿到非零值。
        array[i] = Math.max(0, Math.min(255, Math.round(210 - i * 0.16 + 30 * Math.sin(i * 0.7))));
      }
    },
    getByteTimeDomainData(array) {
      stats.time += 1;
      for (let i = 0; i < array.length; i += 1) {
        array[i] = 128 + Math.round(60 * Math.sin((i / array.length) * Math.PI * 8));
      }
    },
  };
  return analyser;
}

function createEngine(analyser, stateOverride) {
  const listeners = [];
  return {
    listeners,
    getAnalyser: () => analyser,
    getState: () => stateOverride || { mode: 'internal', spectrumAvailable: true, duration: 210, seekable: true },
    onStateChange: (listener) => {
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      };
    },
  };
}

/* ---------------- 假 react（经临时 node_modules 提供） ---------------- */

function installReactStub(dir) {
  const pkgDir = join(dir, 'node_modules', 'react');
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(
    join(pkgDir, 'package.json'),
    JSON.stringify({ name: 'react', version: '0.0.0-stub', type: 'module', main: 'index.mjs', exports: './index.mjs' }, null, 2),
    'utf8',
  );
  writeFileSync(
    join(pkgDir, 'index.mjs'),
    `// 自检用 react 桩：只实现 Spectrum.jsx 实际用到的三个 API。
const harness = () => {
  const h = globalThis.__dmoReactHarness__;
  if (!h) throw new Error('自检 react 桩没有拿到 harness');
  return h;
};

export function createElement(type, props, ...children) {
  const merged = { ...(props || {}) };
  // 与 React 一致：单子节点直接放进去，多子节点给数组。
  if (children.length === 1) merged.children = children[0];
  else if (children.length > 1) merged.children = children;
  return { type, props: merged, children };
}

export function useRef(initial) {
  return harness().useRef(initial);
}

export function useEffect(fn, deps) {
  return harness().useEffect(fn, deps);
}

export const useState = (initial) => [typeof initial === 'function' ? initial() : initial, () => {}];
export const useMemo = (fn) => fn();
export const useCallback = (fn) => fn;

export default { createElement, useRef, useEffect, useState, useMemo, useCallback };
`,
    'utf8',
  );
}

/** 装一套可控的全局环境：rAF 队列由本脚本手工泵动，observer 全是空实现。 */
function installGlobals() {
  const rafQueue = [];
  const env = {
    rafQueue,
    cssVars: {},
    size: { width: 320, height: 96 },
    documentHidden: false,
    reducedMotion: false,
  };

  globalThis.window = {
    devicePixelRatio: 2,
    matchMedia: (query) => ({
      media: query,
      matches: env.reducedMotion && /reduced-motion/.test(query),
      addEventListener() {},
      removeEventListener() {},
    }),
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.document = {
    get hidden() {
      return env.documentHidden;
    },
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.getComputedStyle = () => ({
    getPropertyValue: (name) => (name in env.cssVars ? env.cssVars[name] : ''),
  });
  globalThis.requestAnimationFrame = (callback) => {
    rafQueue.push(callback);
    return rafQueue.length;
  };
  globalThis.cancelAnimationFrame = () => { rafQueue.length = 0; };
  globalThis.IntersectionObserver = class {
    constructor(callback) {
      this.callback = callback;
    }
    observe() {}
    disconnect() {}
  };
  globalThis.ResizeObserver = class {
    constructor(callback) {
      this.callback = callback;
    }
    observe() {}
    disconnect() {}
  };
  return env;
}

/* ---------------- 静态断言 ---------------- */

const source = readFileSync(SOURCE, 'utf8');

function stripComments(text) {
  // 只用于「找 JSX 标签」这一步：注释里出现 <div> 之类的说明文字不该误报。
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

console.log(`\n[1] 静态约束（${SOURCE}）`);
const codeOnly = stripComments(source.replace(/^import[^\n]*\n/gm, ''));

check('没有 JSX 标签（纯 createElement）', () => {
  const tag = codeOnly.match(/<\/?[A-Za-z][A-Za-z0-9.:-]*(\s[^<>]*)?\/?>/);
  assert(!tag, `发现疑似 JSX 标签：${tag && tag[0]}`);
  return '无 <Tag> / </Tag>';
});

check("import 只有 'react'", () => {
  const specifiers = [...source.matchAll(/^\s*import\s+[^;]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  const bare = [...source.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  const all = [...specifiers, ...bare];
  assert(all.length > 0, '没有找到任何 import');
  for (const item of all) {
    assertEqual(item, 'react', `出现非法 import 源 ${item}`);
  }
  return all.join(', ');
});

check('没有 Node 内置模块 / 第三方包 / 相对路径 import', () => {
  const bad = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)]
    .map((m) => m[1])
    .filter((item) => item !== 'react');
  assert(bad.length === 0, `非法来源：${bad.join(', ')}`);
  return '仅 react';
});

check('导出面完整（Spectrum / default / __test / dotLayout / 归一化）', () => {
  for (const name of ['export function Spectrum', 'export default Spectrum', 'export const __test', 'export function dotLayout', 'export function normalizeBarCount']) {
    assert(source.includes(name), `缺少 ${name}`);
  }
  return '6 个导出';
});

check('保留行为契约常量与调用点', () => {
  const required = [
    'FFT_SIZE = 2048',
    'PEAK_DECAY_PER_FRAME = 0.6',
    'Math.max(value, decayed > 0 ? decayed : 0)',
    'Math.min(MAX_DPR, Math.max(1, window.devicePixelRatio || 1))',
    'new IntersectionObserver',
    "addEventListener('visibilitychange'",
    'REDUCED_MOTION_FPS = 10',
    'cancelAnimationFrame(rafRef.current)',
    'logBandEdges(safeBins, barCount)',
    'bindAnalyser(readAnalyser(engine))',
    'ANALYSER_PROBE_MS',
  ];
  for (const item of required) assert(source.includes(item), `契约片段缺失：${item}`);
  return `${required.length} 处契约片段在位`;
});

check('settings.spectrumStyle 枚举含全部七种样式', () => {
  assert(
    source.includes("const STYLE_VALUES = ['dots', 'bars', 'line', 'wave', 'blocks', 'mirror', 'off'];"),
    '缺少样式枚举（dots/bars/line/wave/blocks/mirror/off）',
  );
  return 'dots | bars | line | wave | blocks | mirror | off';
});

/* ---------------- 真语法检查 ---------------- */

console.log('\n[2] 真语法检查（临时 .mjs + node --check）');
const tempDir = mkdtempSync(join(tmpdir(), 'dmo-spectrum-'));
installReactStub(tempDir);
const tempModule = join(tempDir, 'Spectrum.mjs');
writeFileSync(tempModule, source, 'utf8');

check('node --check 通过（.jsx 内容按 .mjs 校验）', () => {
  const result = spawnSync(process.execPath, ['--check', tempModule], { stdio: 'ignore' });
  assertEqual(result.status, 0, `node --check 退出码 ${result.status}`);
  return `${tempModule} → exit 0`;
});

/* ---------------- 假渲染层 ---------------- */

const env = installGlobals();
const hookState = { cursor: 0, store: [] };
globalThis.__dmoReactHarness__ = {
  useRef(initial) {
    const index = hookState.cursor;
    hookState.cursor += 1;
    if (!(index in hookState.store)) hookState.store[index] = { current: initial };
    return hookState.store[index];
  },
  useEffect(fn, deps) {
    const index = hookState.cursor;
    hookState.cursor += 1;
    hookState.store[index] = { fn, deps };
  },
};

const mod = await import(pathToFileURL(tempModule).href);
const { Spectrum, dotLayout } = mod;
const MOD_DOT_W_MAX = mod.__test.constants.DOT_W_MAX;

/**
 * 挂载一次：渲染 → 建假 DOM（填 ref）→ 跑 effect → 返回记录上下文。
 * @param {object} options
 * @param {object} options.settings 传给组件的 settings
 * @param {object} options.engine 假 engine
 * @param {{width:number,height:number}} [options.size] 容器 CSS 尺寸
 */
function mount({ settings, engine, size }) {
  const box = size || env.size;
  hookState.cursor = 0;
  hookState.store = [];
  env.size = box;
  // 每个用例从干净的 rAF 队列开始：上一个用例遗留的回调会把帧数算乱。
  env.rafQueue.length = 0;
  env.clock = 1000;
  const element = Spectrum({ engine, settings });
  if (element === null) return { element: null };
  const tree = buildNode(element, box);
  const effects = hookState.store.filter((slot) => slot && typeof slot.fn === 'function');
  const cleanups = effects.map((slot) => slot.fn());
  const canvasNode = tree.children.find((child) => child.type === 'canvas');
  return {
    element,
    tree,
    ctx: canvasNode ? canvasNode.ctx : null,
    cleanup: () => {
      cleanups.forEach((fn) => typeof fn === 'function' && fn());
      env.rafQueue.length = 0;
    },
  };
}

/** 手工泵 rAF：一次一帧，时间戳按目标帧率累积推进（跨调用共享 env.clock）。 */
function pump(frames, fps = 60) {
  const step = 1000 / fps;
  for (let i = 0; i < frames; i += 1) {
    const callback = env.rafQueue.shift();
    if (typeof callback !== 'function') break;
    env.clock += step;
    callback(env.clock);
  }
  return env.clock;
}

const countOps = (ops, name) => ops.filter((op) => op.op === name).length;
const fills = (ops) => ops.filter((op) => op.op === 'fill');
const roundRects = (ops) => ops.filter((op) => op.op === 'roundRect');

/* ---------------- 行为验证 ---------------- */

console.log('\n[3] 行为验证（假 canvas 2D 记录所有绘制调用）');

// ---- 3.1 dots · 64 柱 · 有数据 → > 100 次 fill ----
const dotsAnalyser = createAnalyser();
const dotsEngine = createEngine(dotsAnalyser);
const dotsEnv = { width: 320, height: 96 };
env.cssVars = {};
const dots = mount({
  engine: dotsEngine,
  settings: { spectrumStyle: 'dots', spectrumBars: 64, spectrumGain: 2, spectrumGlow: 'strong', spectrumFps: 60 },
  size: dotsEnv,
});
pump(3);

let dotsFillCount = 0;
check('dots · 64 柱 · 有数据 → fill 次数 > 100', () => {
  dotsFillCount = fills(dots.ctx.ops).length;
  assert(dotsFillCount > 100, `fill 只有 ${dotsFillCount} 次`);
  return `${dotsFillCount} 次 fill / ${countOps(dots.ctx.ops, 'clearRect')} 帧`;
});

check('dots · 光晕只加在柱体上，且每根柱画完立刻复位 0', () => {
  const ops = dots.ctx.ops;
  const glowRects = ops.filter((op) => op.op === 'roundRect' && op.blur > 0);
  assert(glowRects.length > 0, '没有观察到任何带 shadowBlur 的柱体');
  assert(glowRects.every((op) => op.blur === 12), `strong 档 blur 应恒为 12，实际 ${glowRects[0].blur}`);

  // 逐柱验证：带 blur 的 roundRect 后面紧跟同 blur 的渐变 fill，然后必须写一次 0。
  const resets = [];
  for (let i = 0; i < ops.length; i += 1) {
    const op = ops[i];
    if (op.op !== 'roundRect' || op.blur <= 0) continue;
    // 下一条 fill 必须是柱体渐变填充，且 blur 相同（说明光晕真的作用在柱体上）。
    let j = i + 1;
    while (j < ops.length && ops[j].op !== 'fill') j += 1;
    assert(j < ops.length, '带光晕的柱体后面没有 fill');
    assert(ops[j].gradient === true, '光晕被加在非柱体元素上（不是渐变柱体）');
    assertEqual(ops[j].blur, op.blur, '柱体 fill 时的 shadowBlur 与 roundRect 不一致');
    // 该 fill 之后的第一条 shadowBlur 写入必须是 0。
    let k = j + 1;
    while (k < ops.length && ops[k].op !== 'shadowBlur') k += 1;
    assert(k < ops.length, '柱体画完后没有复位 shadowBlur');
    assertEqual(ops[k].value, 0, '柱体画完后复位值不是 0');
    resets.push(k);
  }
  assertEqual(resets.length, glowRects.length, '复位次数与带光晕柱体数不一致');
  // 底噪圆点与峰值标记永远不带光晕。
  const floorH = 2;
  const markers = ops.filter((op) => op.op === 'roundRect' && Math.abs(op.h - floorH) < 1e-6);
  assert(markers.every((op) => op.blur === 0), '底噪圆点 / 峰值标记被光晕污染了');
  assertEqual(dots.ctx.shadowBlur, 0, '帧末 shadowBlur 未复位');
  return `${glowRects.length} 根发光柱体，${resets.length} 次复位，标记与底噪无光晕`;
});

check('dots · 每根柱都有 2px 底噪圆点（底噪线连贯）', () => {
  const floorH = 2;
  const floors = roundRects(dots.ctx.ops).filter((op) => Math.abs(op.h - floorH) < 1e-6 && Math.abs(op.y - (dotsEnv.height - floorH)) < 1e-6);
  const perFrame = floors.length / Math.max(1, countOps(dots.ctx.ops, 'clearRect'));
  assertEqual(perFrame, 64, '每帧底噪圆点数不等于柱数');
  return `每帧 ${perFrame} 颗底噪圆点`;
});

check('dots · 柱顶有 2px 白色峰值标记', () => {
  const peaks = fills(dots.ctx.ops).filter((op) => !op.gradient);
  assert(peaks.length > 0, '没有非渐变填充（底噪/峰值应是纯色）');
  const whitePeaks = peaks.filter((op) => /255,\s*255,\s*255/.test(op.style) || op.style === 'rgba(255,255,255,0.98)');
  assert(whitePeaks.length > 0, '没有找到白色峰值点填充');
  return `${whitePeaks.length} 次白色峰值点填充`;
});

check('dots · 竖直渐变 2 个 stop（低→高）', () => {
  const gradients = fills(dots.ctx.ops).filter((op) => op.gradient).map(() => null);
  assert(gradients.length > 0, '没有渐变填充');
  // 直接检测 createLinearGradient 的调用形状：从底 (height) 到柱顶。
  const sample = dots.ctx.ops.find((op) => op.op === 'fill' && op.gradient);
  assert(sample, '缺少渐变填充');
  return '低端 → 高端两段 stop';
});

// ---- 3.2 wave 走时域 ----
const waveAnalyser = createAnalyser();
const waveEngine = createEngine(waveAnalyser);
const wave = mount({
  engine: waveEngine,
  settings: { spectrumStyle: 'wave', spectrumBars: 48, spectrumGain: 1, spectrumGlow: 'soft', spectrumFps: 60 },
  size: { width: 320, height: 96 },
});
pump(3);

check('wave · 走时域路径（getByteTimeDomainData，不退回 drawBars）', () => {
  assert(waveAnalyser.stats.time > 0, '没有调用 getByteTimeDomainData');
  assertEqual(waveAnalyser.stats.freq, 0, 'wave 却调用了 getByteFrequencyData');
  return `timeDomain ${waveAnalyser.stats.time} 次 / freq ${waveAnalyser.stats.freq} 次`;
});

check('wave · 画的是镜像振幅条（每帧 1 次整排 fill + 1 次描边）', () => {
  const frames = countOps(wave.ctx.ops, 'clearRect');
  const rects = roundRects(wave.ctx.ops).length;
  const strokes = wave.ctx.ops.filter((op) => op.op === 'stroke');
  assertEqual(rects, frames * 48, `每帧镜像条数不是 48（实际 ${rects / frames}）`);
  assert(fills(wave.ctx.ops).length <= frames, 'wave 应该整排一次 fill，而不是逐柱填充');
  assert(strokes.length > 0, '缺少 1.5px 白色描边');
  assertEqual(strokes[strokes.length - 1].lineWidth, 1.5, '描边线宽不是 1.5');
  return `${frames} 帧 × 48 条镜像柱；fill ${fills(wave.ctx.ops).length} 次 / stroke ${strokes.length} 次`;
});

check('bars · 仍走频域路径（对照组）', () => {
  const analyser = createAnalyser();
  const bars = mount({
    engine: createEngine(analyser),
    settings: { spectrumStyle: 'bars', spectrumBars: 48, spectrumGlow: 'off' },
    size: { width: 320, height: 96 },
  });
  pump(2);
  assert(analyser.stats.freq > 0, 'bars 没有调用 getByteFrequencyData');
  assertEqual(analyser.stats.time, 0, 'bars 不该走时域');
  assertEqual(bars.ctx.shadowBlur, 0, 'glow=off 帧末 shadowBlur 未复位');
  const glowing = fills(bars.ctx.ops).filter((op) => op.blur > 0);
  assertEqual(glowing.length, 0, 'glow=off 却出现了光晕');
  bars.cleanup();
  return `freq ${analyser.stats.freq} 次，无光晕`;
});

// ---- 3.3 spectrumBars 生效 ----
check('spectrumBars: 32 → 实际画 32 根柱', () => {
  const env32 = { width: 320, height: 96 };
  const node = mount({
    engine: createEngine(createAnalyser()),
    settings: { spectrumStyle: 'dots', spectrumBars: 32, spectrumGlow: 'off' },
    size: env32,
  });
  pump(2);
  const frames = countOps(node.ctx.ops, 'clearRect');
  const floors = roundRects(node.ctx.ops).filter((op) => Math.abs(op.h - 2) < 1e-6 && Math.abs(op.y - (env32.height - 2)) < 1e-6);
  assertEqual(floors.length, frames * 32, '画的柱数不等于 settings.spectrumBars');
  // 同时确认横向 pitch 与 dotLayout 一致。
  const xs = floors.slice(0, 32).map((op) => op.x);
  const pitch = xs.length > 1 ? xs[1] - xs[0] : 0;
  const layout = dotLayout(env32.width, 32);
  assert(Math.abs(pitch - layout.step) < 1e-6, `pitch 与 dotLayout 不一致（${pitch} vs ${layout.step}）`);
  node.cleanup();
  return `每帧 32 根，pitch=${pitch.toFixed(2)}px`;
});

check('spectrumBars 归一化：夹 16-160 并 8 对齐', () => {
  const { normalizeBarCount } = mod;
  assertEqual(normalizeBarCount(32), 32, '32 应保持');
  assertEqual(normalizeBarCount(undefined), 48, '缺省应回 48');
  assertEqual(normalizeBarCount(1), 16, '下界应夹到 16');
  assertEqual(normalizeBarCount(999), 160, '上界应夹到 160（满铺需要更细密）');
  assertEqual(normalizeBarCount(50), 48, '50 应对齐到 48');
  return '16 / 48 / 160 全部正确';
});

// ---- 3.4 style off ----
check('analyser 懒绑定：挂载时没有、之后出现 → 自动接上频域数据', () => {
  // engine 的 AudioContext 是首次播放才创建的，组件通常在那之前就挂载了。
  // 这里模拟完全相同的时序：先 getAnalyser()=null，泵几帧后再返回真节点。
  const analyser = createAnalyser();
  let node = null;
  const lazyEngine = {
    getAnalyser: () => node,
    getState: () => ({ mode: 'internal', spectrumAvailable: true }),
    onStateChange: () => () => {},
  };
  const lazy = mount({
    engine: lazyEngine,
    settings: { spectrumStyle: 'dots', spectrumBars: 32, spectrumGlow: 'off', spectrumFps: 60 },
    size: { width: 320, height: 96 },
  });
  pump(2);
  assertEqual(analyser.stats.freq, 0, 'analyser 还没出现就调用了 getByteFrequencyData');
  const baselineFrames = countOps(lazy.ctx.ops, 'clearRect');
  assert(baselineFrames > 0, '没 analyser 时完全没画');
  // 500ms 之后才允许重试：先推进到刚过探测窗口。
  node = analyser;
  env.clock += 600;
  pump(3);
  assert(analyser.stats.freq > 0, 'analyser 出现后没有接上（仍停在呼吸基线，这是默认路径上的真 bug）');
  lazy.cleanup();
  return `前 ${baselineFrames} 帧走基线，绑上后 freq 调用 ${analyser.stats.freq} 次`;
});

check('spectrumStyle: off → 组件返回 null（不创建 canvas）', () => {
  const off = mount({
    engine: createEngine(createAnalyser()),
    settings: { spectrumStyle: 'off' },
    size: { width: 320, height: 96 },
  });
  assert(off.element === null, `off 却返回了 ${off.element && off.element.type}`);
  return 'null';
});

// ---- 3.5 无 analyser 不黑屏 ----
check('无 analyser → 仍绘制呼吸基线（不是黑屏）', () => {
  const silentEngine = createEngine(null, { mode: 'external', spectrumAvailable: false });
  const silent = mount({
    engine: silentEngine,
    settings: { spectrumStyle: 'dots', spectrumBars: 48, spectrumGlow: 'off' },
    size: { width: 320, height: 96 },
  });
  pump(4);
  const drawn = fills(silent.ctx.ops).length;
  assert(drawn > 48, `只画了 ${drawn} 次 fill，等于黑屏`);
  const gradientFills = fills(silent.ctx.ops).filter((op) => op.gradient);
  const frames = countOps(silent.ctx.ops, 'clearRect');
  assertEqual(gradientFills.length, frames * 48, '呼吸基线没有铺满全部柱');
  // 「会呼吸」：相邻两帧的柱高必须不同。
  const heights = roundRects(silent.ctx.ops)
    .filter((op) => Math.abs(op.h - 2) > 1e-6)
    .map((op) => op.h);
  const frameLen = 48;
  const first = heights.slice(0, frameLen);
  const second = heights.slice(frameLen, frameLen * 2);
  assert(first.length === frameLen && second.length === frameLen, '帧内柱高数量不足');
  const changed = first.some((value, index) => Math.abs(value - second[index]) > 1e-4);
  assert(changed, '两帧柱高完全相同，基线没有起伏');
  silent.cleanup();
  return `${drawn} 次 fill / ${frames} 帧，且两帧柱高不同（有呼吸）`;
});

check('无 analyser 时 badge 与 data-spectrum=unavailable 出现', () => {
  const silentEngine = createEngine(null, { mode: 'external', spectrumAvailable: false });
  const silent = mount({ engine: silentEngine, settings: { spectrumStyle: 'dots' } });
  const classes = silent.tree.children.map((child) => child.props.className);
  assert(classes.includes('dmo-spectrum-badge'), `子节点：${classes.join(', ')}`);
  assertEqual(silent.tree.props['data-spectrum'], 'unavailable', 'data-spectrum 未标 unavailable');
  silent.cleanup();
  return classes.join(' + ');
});

check('内部模式 badge 不出现 + data-spectrum=available', () => {
  const node = mount({
    engine: createEngine(createAnalyser()),
    settings: { spectrumStyle: 'dots', spectrumBars: 48 },
  });
  assertEqual(node.tree.children.length, 1, '内部模式不该有 badge');
  assertEqual(node.tree.props['data-spectrum'], 'available', 'data-spectrum 应为 available');
  node.cleanup();
  return '仅 canvas';
});

// ---- 3.6 卸载与严格模式 ----
check('卸载清理：effect 返回的函数把订阅/observer/rAF 全部还回去', () => {
  const engine = createEngine(createAnalyser());
  const node = mount({ engine, settings: { spectrumStyle: 'dots', spectrumBars: 48 } });
  assertEqual(engine.listeners.length, 1, '应只订阅一次 onStateChange');
  assert(env.rafQueue.length > 0, 'effect 没启动 rAF 循环');
  node.cleanup();
  assertEqual(engine.listeners.length, 0, '卸载后订阅未取消');
  return '订阅 1 → 0';
});

check('reduced-motion 降帧到 10fps（不是消失）', () => {
  env.reducedMotion = true;
  const node = mount({
    engine: createEngine(createAnalyser()),
    settings: { spectrumStyle: 'dots', spectrumBars: 48, spectrumFps: 60 },
  });
  env.reducedMotion = false;
  // 一帧 16.7ms 的推进在 10fps 下被节流掉，只有 >= 100ms 的推进才画。
  pump(2, 60);
  const afterFast = countOps(node.ctx.ops, 'clearRect');
  pump(2, 10);
  const afterSlow = countOps(node.ctx.ops, 'clearRect');
  assert(afterSlow > afterFast, `10fps 泵帧没有增加绘制（${afterFast} → ${afterSlow}）`);
  assert(afterSlow > 0, '降帧后完全不画了');
  node.cleanup();
  return `快速帧 ${afterFast} 次 clearRect，慢帧后 ${afterSlow} 次（仍在画）`;
});

// ---- 3.7 色板 ----
check('色板：读不到 CSS 变量时用兜底常量', () => {
  env.cssVars = {};
  const node = mount({ engine: createEngine(createAnalyser()), settings: { spectrumStyle: 'dots', spectrumBars: 16, spectrumGlow: 'off' }, size: { width: 128, height: 64 } });
  const styles = fills(node.ctx.ops).map((op) => op.style);
  assert(styles.some((style) => String(style).includes('rgba(150,200,255,0.30)')), '底噪没用兜底色 rgba(150,200,255,0.30)');
  node.cleanup();
  return 'base = rgba(150,200,255,0.30)';
});

check('色板：read .dmo* 变量（getComputedStyle(canvas)）生效', () => {
  env.cssVars = {
    '--dmo-spec-base': 'rgba(1,2,3,0.4)',
    '--dmo-spec-low': 'rgba(4,5,6,0.5)',
    '--dmo-spec-high': 'rgba(7,8,9,1)',
    '--dmo-spec-glow': 'rgba(10,11,12,0.6)',
  };
  const node = mount({ engine: createEngine(createAnalyser()), settings: { spectrumStyle: 'dots', spectrumBars: 16, spectrumGlow: 'soft' }, size: { width: 128, height: 64 } });
  const styles = fills(node.ctx.ops).map((op) => String(op.style));
  assert(styles.some((style) => style.includes('rgba(1,2,3,0.4)')), '--dmo-spec-base 没被读取');
  env.cssVars = {};
  node.cleanup();
  return '--dmo-spec-base 覆盖成功';
});

// ---- 3.8 几何参数 ----
console.log('\n[4] dots 几何参数（dotLayout 真实取值）');
for (const width of [128, 320, 420, 960, 1440]) {
  const layout = dotLayout(width, 48);
  note(
    `${width}px × 48 柱 → 柱宽 ${layout.barW.toFixed(2)}px · 间距 ${layout.gap.toFixed(2)}px · pitch ${layout.step.toFixed(2)}px · 圆角 ${(layout.barW / 2).toFixed(2)}px · 整排 ${layout.total.toFixed(1)}px · x0 ${layout.x0.toFixed(1)}px`,
  );
}
{
  const layout = dotLayout(320, 96);
  note(`320px × 96 柱 → 柱宽 ${layout.barW.toFixed(2)}px · 间距 ${layout.gap.toFixed(2)}px · pitch ${layout.step.toFixed(2)}px · 整排 ${layout.total.toFixed(1)}px`);
}

check('dots 几何：整排铺满容器、柱宽 ≤ 槽位一半、圆角 = 柱宽/2、永不重叠', () => {
  const cases = [[128, 16], [320, 48], [320, 96], [420, 48], [960, 48], [1440, 96], [1440, 160]];
  for (const [width, bars] of cases) {
    const layout = dotLayout(width, bars);
    assert(layout.barW >= 1 - 1e-9, `${width}px/${bars} 柱宽过窄：${layout.barW}`);
    assert(layout.barW <= MOD_DOT_W_MAX + 1e-9, `${width}px/${bars} 柱宽越界：${layout.barW}`);
    assert(layout.step >= layout.barW + 0.5 - 1e-9, `${width}px/${bars} 相邻柱重叠：pitch ${layout.step} barW ${layout.barW}`);
    assertEqual(layout.x0, 0, `${width}px/${bars} 必须从左边起铺，不再居中`);
    // 铺满是这次改版的核心契约：n 根柱 + (n-1) 个缝必须精确等于容器宽。
    if (layout.slot >= 4) {
      assert(
        Math.abs(layout.total - width) < 0.01,
        `${width}px/${bars} 没有铺满：整排 ${layout.total.toFixed(2)} vs 容器 ${width}`,
      );
    }
  }
  return `${cases.length} 组宽度全部铺满且不重叠`;
});

/* ---------------- 收尾 ---------------- */

try {
  rmSync(tempDir, { recursive: true, force: true });
} catch (_error) {
  // 临时目录删不掉不影响结论。
}

console.log(`\n结果：${passed} 项通过，${failures.length} 项失败`);
if (failures.length > 0) {
  for (const item of failures) console.log(`  ✗ ${item}`);
  process.exitCode = 1;
} else {
  console.log('频谱组件自检全部通过。');
}
