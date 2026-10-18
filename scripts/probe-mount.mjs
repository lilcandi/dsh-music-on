/**
 * 探针：在 happy-dom 里**真挂载**插件 UI（react-dom/client），带真 canvas/AudioContext 桩。
 *
 * 为什么必须挂载而不是 SSR：
 *  - SSR 不执行 useEffect，频谱的 canvas 只在 effect 里创建，SSR 永远看不到它；
 *  - SSR 不跑 requestAnimationFrame，看不出「画了但是没有像素」；
 *  - 用户报的「频谱消失」「音乐库空白」都是运行期现象，只有真挂载能复现。
 *
 * 用法：
 *   node scripts/probe-mount.mjs
 *   $env:SEED_LIBRARY='1'; node scripts/probe-mount.mjs
 *   $env:EXPAND='1'; node scripts/probe-mount.mjs
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const source = readFileSync(path.join(root, 'client.js'), 'utf8');

const probeRequire = createRequire('J:\\plugin\\.probe-react\\package.json');
const React = probeRequire('react');
const { Window } = probeRequire('happy-dom');

const window = new Window({ url: 'http://127.0.0.1:3080/' });
const document = window.document;

// react-dom/client 在模块求值时就抓 globalThis.window / document，
// 必须先装好这些全局再动态 import 它，否则报 ReferenceError: window is not defined。
// 注意：navigator 在 Node 里是只读 getter，直接赋值会抛 TypeError，用 defineProperty 覆盖。
const boundFns = new Set(['getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'matchMedia']);
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLCanvasElement', 'HTMLMediaElement', 'Element', 'Node', 'MouseEvent', 'Event', 'getComputedStyle', 'ResizeObserver', 'IntersectionObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'localStorage', 'matchMedia']) {
  if (!(key in window)) continue;
  const value = boundFns.has(key) && typeof window[key] === 'function' ? window[key].bind(window) : window[key];
  try {
    globalThis[key] = value;
  } catch (_error) {
    Object.defineProperty(globalThis, key, { configurable: true, get: () => value });
  }
}
globalThis.window = window;
globalThis.document = document;

const ReactDOMClient = await import('file:///J:/plugin/.probe-react/node_modules/react-dom/client.js');

/* ---------------- canvas 2d 桩：记录每一条绘制指令 ---------------- */
const drawCalls = [];
function makeContext2d(canvas) {
  const rec = (op) => (...args) => {
    drawCalls.push({ op, args, canvas });
    return undefined;
  };
  const ctx = {
    canvas,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    globalAlpha: 1,
    lineCap: 'butt',
    shadowBlur: 0,
    shadowColor: 'transparent',
    save: rec('save'),
    restore: rec('restore'),
    clearRect: rec('clearRect'),
    fillRect: rec('fillRect'),
    strokeRect: rec('strokeRect'),
    beginPath: rec('beginPath'),
    closePath: rec('closePath'),
    rect: rec('rect'),
    roundRect: rec('roundRect'),
    moveTo: rec('moveTo'),
    lineTo: rec('lineTo'),
    arc: rec('arc'),
    arcTo: rec('arcTo'),
    quadraticCurveTo: rec('quadraticCurveTo'),
    bezierCurveTo: rec('bezierCurveTo'),
    fill: rec('fill'),
    stroke: rec('stroke'),
    fillText: rec('fillText'),
    translate: rec('translate'),
    scale: rec('scale'),
    rotate: rec('rotate'),
    setTransform: rec('setTransform'),
    createLinearGradient: () => ({ addColorStop: rec('addColorStop') }),
    createRadialGradient: () => ({ addColorStop: rec('addColorStop') }),
    measureText: () => ({ width: 10 }),
  };
  return ctx;
}
const contexts = new WeakMap();
window.HTMLCanvasElement.prototype.getContext = function getContext(kind) {
  if (kind !== '2d') return null;
  if (!contexts.has(this)) contexts.set(this, makeContext2d(this));
  return contexts.get(this);
};
// jsdom/happy-dom 里 canvas 默认尺寸是 0，Spectrum 依赖 offsetWidth/clientWidth 决定画布大小。
for (const [prop, value] of [['offsetWidth', 320], ['offsetHeight', 64], ['clientWidth', 320], ['clientHeight', 64]]) {
  Object.defineProperty(window.HTMLElement.prototype, prop, {
    configurable: true,
    get() { return value; },
  });
}
window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
  return { x: 1000, y: 700, left: 1000, top: 700, right: 1320, bottom: 764, width: 320, height: 64, toJSON() { return this; } };
};

/* ---------------- AudioContext / ResizeObserver / rAF 桩 ---------------- */
let rafCallbacks = [];
let rafId = 0;
window.requestAnimationFrame = (cb) => { rafId += 1; rafCallbacks.push({ id: rafId, cb }); return rafId; };
window.cancelAnimationFrame = (id) => { rafCallbacks = rafCallbacks.filter((r) => r.id !== id); };
/** 推进若干帧，返回实际执行的帧数。 */
function pumpFrames(count, dtMs = 16) {
  let now = 0;
  let ran = 0;
  for (let i = 0; i < count; i += 1) {
    now += dtMs;
    const batch = rafCallbacks;
    rafCallbacks = [];
    for (const item of batch) {
      ran += 1;
      try {
        item.cb(now);
      } catch (error) {
        console.error(`[rAF 抛错] ${error && error.message}`);
      }
    }
  }
  return ran;
}

const analyserStub = {
  fftSize: 2048,
  frequencyBinCount: 1024,
  smoothingTimeConstant: 0.8,
  minDecibels: -100,
  maxDecibels: -30,
  connect() {},
  disconnect() {},
  getByteFrequencyData(target) {
    for (let i = 0; i < target.length; i += 1) target[i] = Math.floor(60 + 180 * Math.abs(Math.sin(i / 12)));
  },
  getByteTimeDomainData(target) {
    for (let i = 0; i < target.length; i += 1) target[i] = 128;
  },
  getFloatFrequencyData(target) {
    for (let i = 0; i < target.length; i += 1) target[i] = -60;
  },
};

class FakeAudioContext {
  constructor() {
    this.state = 'running';
    this.sampleRate = 44100;
    this.currentTime = 0;
    this.destination = { connect() {}, disconnect() {} };
  }
  createGain() { return { gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} }, connect() {}, disconnect() {} }; }
  createAnalyser() { return { ...analyserStub }; }
  createMediaElementSource() { return { connect() {}, disconnect() {} }; }
  createBufferSource() { return { buffer: null, connect() {}, disconnect() {}, start() {}, stop() {} }; }
  createBuffer(channels, length, rate) { return { numberOfChannels: channels, length, sampleRate: rate, duration: length / rate, getChannelData: () => new Float32Array(length) }; }
  decodeAudioData() { return Promise.resolve(this.createBuffer(1, 1024, 44100)); }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { return Promise.resolve(); }
  close() { return Promise.resolve(); }
}
window.AudioContext = FakeAudioContext;
window.webkitAudioContext = FakeAudioContext;

class FakeResizeObserver {
  constructor(cb) { this.cb = cb; }
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = FakeResizeObserver;
window.IntersectionObserver = class { constructor(cb) { this.cb = cb; } observe() {} unobserve() {} disconnect() {} };

// HTMLMediaElement 的 play/pause 在 happy-dom 里不完整，补成可控桩。
window.HTMLMediaElement.prototype.play = function play() { this.paused = false; return Promise.resolve(); };
window.HTMLMediaElement.prototype.pause = function pause() { this.paused = true; };

/* ---------------- localStorage ---------------- */
const storage = new Map();
const localStorageStub = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
  clear: () => storage.clear(),
  key: (i) => [...storage.keys()][i] ?? null,
  get length() { return storage.size; },
};
Object.defineProperty(window, 'localStorage', { configurable: true, value: localStorageStub });

if (process.env.SEED_LIBRARY === '1') {
  const now = Date.now();
  const mk = (i) => ({
    url: `https://www.bilibili.com/video/BV1Lyw7zPEeo/?p=${i}`,
    title: `一小时陈粒音乐合集 第 ${i} 集`,
    platform: ['bilibili', 'netease', 'qqmusic', 'unknown', undefined][i % 5],
    kind: 'platform',
    addedAt: now - i * 3600000,
    playedAt: now - i * 600000,
    plays: i + 1,
  });
  storage.set('dsh-music-on:favorites.v1', JSON.stringify([mk(1), mk(2), mk(3)]));
  storage.set('dsh-music-on:history.v1', JSON.stringify(Array.from({ length: 13 }, (_, i) => mk(i))));
  console.log('[探针] 已预填 3 条收藏 + 13 条历史');
}
if (process.env.SEED_SPECTRUM) {
  storage.set('dsh-music-on:settings', JSON.stringify({ spectrumStyle: process.env.SEED_SPECTRUM }));
  console.log('[探针] spectrumStyle =', process.env.SEED_SPECTRUM);
}
if (process.env.SEED_EXPANDED === '1') {
  storage.set('dsh-music-on:dock.collapsed', 'false');
  console.log('[探针] 强制展开');
}

/* ---------------- 加载 client.js ---------------- */
const registrations = [];
const fakeCtx = {
  slots: {
    inject(name, cb) { return cb(); },
    register(entry, Comp) { registrations.push({ name: entry.name, entry, Comp }); return () => {}; },
  },
  locale: {
    register() {},
    bind() { return (key, fallback) => (typeof fallback === 'string' ? fallback : key); },
  },
  effect(fn) { try { const off = fn(); return typeof off === 'function' ? off : () => {}; } catch (error) { console.error('[effect 抛错]', error && error.message); return () => {}; } },
  sidebarRight: { openTab() {} },
  sidebarRightTabs: { register() { return () => {}; } },
};

const sandbox = {
  console,
  setTimeout: window.setTimeout.bind(window),
  clearTimeout: window.clearTimeout.bind(window),
  setInterval: window.setInterval.bind(window),
  clearInterval: window.clearInterval.bind(window),
  queueMicrotask,
  Promise,
  Date,
  Math,
  JSON,
  Object,
  Array,
  String,
  Number,
  Boolean,
  Error,
  TypeError,
  Map,
  Set,
  WeakMap,
  WeakSet,
  Symbol,
  URL,
  URLSearchParams,
  encodeURIComponent,
  decodeURIComponent,
  TextEncoder,
  TextDecoder,
  document: window.document,
  navigator: window.navigator,
  localStorage: localStorageStub,
  AudioContext: FakeAudioContext,
  webkitAudioContext: FakeAudioContext,
  requestAnimationFrame: window.requestAnimationFrame,
  cancelAnimationFrame: window.cancelAnimationFrame,
  ResizeObserver: FakeResizeObserver,
  IntersectionObserver: window.IntersectionObserver,
  getComputedStyle: window.getComputedStyle.bind(window),
  fetch: () => Promise.reject(new Error('探针不联网')),
  addEventListener: () => {},
  removeEventListener: () => {},
  matchMedia: (query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
sandbox.self = sandbox;

sandbox.__ModuleLoader__ = {
  load({ factory }) {
    sandbox.__impl = factory((name) => {
      if (name === 'react' || name === 'react/jsx-runtime') return React;
      throw new Error(`unexpected require: ${name}`);
    });
  },
};

vm.createContext(sandbox);
new vm.Script(source, { filename: 'client.js' }).runInContext(sandbox);

const impl = sandbox.__impl;
if (!impl || typeof impl.apply !== 'function') {
  console.error('[致命] impl.apply 不存在');
  process.exit(1);
}
impl.apply(fakeCtx, () => React);
console.log('注册的槽位：', registrations.map((r) => r.name).join(', '));

/* ---------------- 真挂载 ---------------- */
const errors = [];
const origError = console.error;
console.error = (...args) => { errors.push(args.map(String).join(' ')); origError(...args); };

function mount(Component, injected, containerId) {
  const host = document.createElement('div');
  host.id = containerId;
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  root.render(React.createElement(Component, injected || {}));
  return { host, root };
}

const results = [];

function summarize(label, host) {
  const html = host.innerHTML;
  const q = (sel) => host.querySelectorAll(sel).length;
  const canvases = [...host.querySelectorAll('canvas')];
  const canvasInfo = canvases.map((c) => `${c.width}x${c.height}`);
  console.log(`\n===== ${label} =====`);
  console.log(`HTML 长度 ${html.length}`);
  for (const sel of ['.dmo-settings', '.dmo-setting-row', '.dmo-lib', '.dmo-lib-row', '.dmo-lib-empty', '.dmo-dock-stack', '.dmo-capsule', '.dmo-card', '.dmo-barspectrum', 'canvas', '.dmo-vinyl', '.dmo-progress', '.dmo-seek', '.dmo-knob', '.dmo-knob-pointer', '.dmo-transport-tail', '.dmo-mixer', '.dmo-volume']) {
    const n = q(sel);
    console.log(`${n > 0 ? '✓' : '✗'} ${sel}  ×${n}`);
  }
  if (canvases.length) console.log('canvas 尺寸：', canvasInfo.join(', '));
  results.push({ label, html: html.length, canvas: canvases.length });
}

// 设置分区
const section = registrations.find((r) => r.name === 'settings.section');
const sectionHost = mount(section.Comp, section.entry.inject ? section.entry.inject() : {}, 'settings-host');

// 右下角音乐库
const dock = registrations.find((r) => r.name === 'shell.overlay');
const dockHost = mount(dock.Comp, dock.entry.inject ? dock.entry.inject() : {}, 'dock-host');

// 让 effect 跑完
await new Promise((r) => setTimeout(r, 50));
pumpFrames(3);
await new Promise((r) => setTimeout(r, 50));

summarize('设置分区', sectionHost.host);
summarize('右下角音乐库', dockHost.host);

/* ---------------- 展开卡片：点一下胶囊主体 ---------------- */
const mainBtn = dockHost.host.querySelector('.dmo-capsule-main');
if (mainBtn) {
  mainBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 50));
  pumpFrames(3);
  summarize('音乐库（展开后）', dockHost.host);
  // 展开后频谱应该在，看看有没有真的画出东西
  const before = drawCalls.length;
  pumpFrames(30);
  console.log(`\n展开态 30 帧绘制指令增量 = ${drawCalls.length - before}`);
  if (drawCalls.length > 0) {
    const ops = new Map();
    for (const call of drawCalls) ops.set(call.op, (ops.get(call.op) || 0) + 1);
    console.log('绘制指令分布：', [...ops].map(([k, v]) => `${k}×${v}`).join(' '));
  }
} else {
  console.log('\n[注意] 找不到 .dmo-capsule-main，无法展开');
}

/* ---------------- 音量旋钮：滚轮与拖动 ---------------- */
//
// 存在理由：滚轮监听是手挂在真实 DOM 上的（React 的 onWheel 是 passive 委托，
// preventDefault 拦不住卡片滚动），这一段只能靠真挂载验证 —— 结构断言看不见
// 「监听到底挂上没挂上」。
const knob = dockHost.host.querySelector('.dmo-knob');
if (knob) {
  const readNow = () => knob.getAttribute('aria-valuenow');
  console.log(`\n旋钮初始 aria-valuenow = ${readNow()}`);

  // 1) 滚轮向上 = 变响
  knob.dispatchEvent(new window.WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 30));
  pumpFrames(2);
  const afterWheel = readNow();
  console.log(`滚轮向上后 aria-valuenow = ${afterWheel}`);
  if (!(Number(afterWheel) > Number(readNow() === afterWheel ? afterWheel - 1 : 0))) {
    // 只做提示，不做硬断言：静音态下起点是 0，向上滚必然 >0
    console.log('  [提示] 滚轮后读数未增大，检查监听是否挂上');
  }

  // 2) 滚轮向下 = 变轻
  knob.dispatchEvent(new window.WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 30));
  pumpFrames(2);
  console.log(`滚轮向下后 aria-valuenow = ${readNow()}`);

  // 3) 旋钮指针的旋转角度必须随值变化（视觉层真的动了吗）
  const pointer = dockHost.host.querySelector('.dmo-knob-pointer');
  if (pointer) {
    const inline = pointer.getAttribute('style') || '';
    const parentStyle = (knob.getAttribute('style') || '');
    console.log(`旋钮 style = ${parentStyle.slice(0, 120)}`);
    console.log(`指针 style = ${inline.slice(0, 80)}`);
  }

  // 4) 进度条与音量条不能是同一个元素：用户要求长条是进度
  const seek = dockHost.host.querySelector('.dmo-progress .dmo-seek');
  console.log(`进度条在 .dmo-progress 内 = ${seek ? '是' : '否'}`);
  console.log(`仍存在横条音量 .dmo-volume = ${dockHost.host.querySelector('.dmo-mixer .dmo-volume') ? '是（不该有）' : '否'}`);
} else {
  console.log('\n[注意] 找不到 .dmo-knob，音量旋钮没渲染出来');
}

console.log('\n=========== 控制台错误汇总 ===========');
if (errors.length === 0) console.log('无');
else errors.forEach((e) => console.log('✗ ' + e.slice(0, 400)));

console.log('\n=========== 结果 ===========');
console.log(JSON.stringify(results, null, 2));
process.exit(0);
