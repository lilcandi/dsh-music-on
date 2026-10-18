/**
 * 拖动链路的插桩追踪。
 *
 * 存在理由：simulate-drag 报「位置从未进入 vdom」，但面板与 stack 两类节点都在
 * 断言里查过。分不清是「handler 没跑」「早退」「还是样式没落到目标节点」。
 * 这个脚本在 client.js 里按行号注入探针，把每一环的真实取值打出来。
 *
 * 跑法：node scripts\trace-drag.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
const lines = SOURCE.split('\n');
const traces = [];
const hits = [];

/** 在源码里找唯一锚点并插桩，找不到就记一笔，绝不静默。 */
function patch(anchor, replacer, label) {
  const idx = lines.findIndex((line) => line.includes(anchor));
  if (idx < 0) { hits.push(`[插桩失败] 找不到锚点 ${label}: ${anchor}`); return; }
  lines[idx] = replacer(lines[idx], idx);
  hits.push(`[插桩] ${label} @ 行 ${idx + 1}`);
}

patch('const stack = stackRef.current;', (line) => `${line} __trace('onDragStart:stack', stackRef.current ? 'node' : 'NULL');`, 'dragStart stack');
patch('if (!stack) return;', (line) => `if (!stack) { __trace('onDragStart:早退', 'stack 为空'); return; }`, 'dragStart 早退');
patch('applyPos(clampToViewport(rect.left, rect.top));', (line) => `__trace('onDragStart:rect', JSON.stringify({l:rect.left,t:rect.top})); applyPos(clampToViewport(rect.left, rect.top)); __trace('onDragStart:applyPos后', JSON.stringify({live:liveRef.current,h:holdingRef.current}));`, 'dragStart applyPos');
patch('const el = panelRef.current || stackRef.current;', (line) => `${line} __trace('applyPos:目标', (panelRef.current?'panel':'stack')+' style='+(el&&el.style?'有':'无'));`, 'applyPos 目标');
patch('liveRef.current = point;', (line) => `${line} __trace('applyPos:point', JSON.stringify(point));`, 'applyPos point');
patch("const stackStyle = liveRef.current", (line) => `__trace('渲染期', JSON.stringify({live:liveRef.current,holding:holding,pos:pos})); ${line}`, '渲染期 live/pos');
patch("return h('div', { className: 'dmo-dock-stack'", (line) => `__trace('stackStyle', JSON.stringify(stackStyle)); ${line}`, 'stackStyle 值');

const instrumented = lines.join('\n');

/* ---------- 假 React ---------- */
function makeReact() {
  let cursor = 0;
  let slots = [];
  let rerender = null;
  const createElement = (type, props, ...children) => ({
    $$el: true,
    type,
    props: { ...(props || {}), children: children.length === 1 ? children[0] : (children.length ? children : (props && props.children)) },
  });
  function slot(init) {
    const i = cursor++;
    if (!(i in slots)) slots[i] = { value: typeof init === 'function' ? init() : init };
    return slots[i];
  }
  const React = {
    createElement,
    Fragment: 'Fragment',
    useState(initial) {
      const s = slot(initial);
      return [s.value, (next) => { s.value = typeof next === 'function' ? next(s.value) : next; if (rerender) rerender(); }];
    },
    useRef(initial) { const s = slot(initial); if (!('ref' in s)) s.ref = { current: initial }; return s.ref; },
    useMemo(fn) { return fn(); },
    useCallback(fn) { return fn; },
    useEffect() {}, useLayoutEffect() {},
    __reset() { cursor = 0; slots = []; },
  };
  React.__setRerender = (fn) => { rerender = fn; };
  return React;
}

const React = makeReact();
const seed = new Map([
  ['react', React],
  ['react/jsx-runtime', { jsx: React.createElement, jsxs: React.createElement, Fragment: 'Fragment' }],
  ['react-dom', {}],
  ['react-dom/client', {}],
]);

/* ---------- 假 DOM ---------- */
function makeNode(tag) {
  const node = {
    tagName: tag, style: {}, dataset: {}, children: [], className: '', textContent: '',
    offsetWidth: 320, offsetHeight: 64,
    _rect: { left: 1000, top: 700, width: 320, height: 64 },
    getBoundingClientRect() { return { left: this._rect.left, top: this._rect.top, width: this._rect.width, height: this._rect.height, right: this._rect.left + this._rect.width, bottom: this._rect.top + this._rect.height }; },
    setPointerCapture() { node._captured = true; },
    releasePointerCapture() { node._captured = false; },
    appendChild(c) { node.children.push(c); return c; },
    setAttribute() {}, addEventListener() {}, removeEventListener() {}, focus() {}, querySelector() { return null; },
  };
  return node;
}

const storage = new Map();
const win = {
  innerWidth: 1440, innerHeight: 900, devicePixelRatio: 1,
  localStorage: { getItem: (k) => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) },
  setTimeout: () => 0, clearTimeout: () => {}, addEventListener: () => {}, removeEventListener: () => {},
  matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
  requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
};

const registered = [];
const sandbox = {
  console: { warn: () => {}, error: (...a) => traces.push('[console.error] ' + a.map(String).join(' ')), log: () => {}, debug: () => {} },
  navigator: { userAgent: 'trace', language: 'zh-CN' },
  location: { href: 'http://127.0.0.1:3080/' },
  document: {
    head: { appendChild: () => {} }, body: { appendChild: () => {}, style: {} },
    createElement: (t) => makeNode(t), querySelector: () => null, addEventListener: () => {}, visibilityState: 'visible',
  },
  localStorage: win.localStorage,
  setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  queueMicrotask: (fn) => fn(),
  fetch: () => Promise.reject(new Error('no net')),
  URL, URLSearchParams, TextEncoder, TextDecoder, AbortController, Blob, FormData, Promise, Date, Math, JSON, Object, Array, String, Number, Boolean,
  __trace: (tag, value) => traces.push(`${tag} = ${value}`),
};
sandbox.window = Object.assign(sandbox, win, { window: sandbox });
sandbox.globalThis = sandbox;
sandbox.self = sandbox;

let captured = null;
sandbox.__ModuleLoader__ = { load(e) { captured = e; } };

vm.createContext(sandbox);
try {
  new vm.Script(instrumented, { filename: 'client.js' }).runInContext(sandbox);
} catch (e) {
  console.log('bundle 求值失败:', e.message);
  process.exit(1);
}

const ctx = {
  slots: { inject: (n, run) => run(), register: (def, C) => { registered.push({ def, C }); return () => {}; } },
  locale: { register: () => () => {}, bind: () => (k, f) => (typeof f === 'string' ? f : k) },
  sidebarRight: { openTab: () => true }, sidebarRightTabs: { register: () => () => {} },
  effect(f) { return f(); },
  logger: { warn: () => {}, debug: () => {} },
  require: (id) => { if (seed.has(id)) return seed.get(id); throw new Error('miss ' + id); },
};

const mod = captured.factory((id) => {
  if (seed.has(id)) return seed.get(id);
  throw new Error('client-modules: require("' + id + '") missed the module table');
});
mod.apply(ctx);

const dockReg = registered.find((r) => r.def.name === 'shell.overlay');
if (!dockReg) { console.log('没有 shell.overlay 注册'); process.exit(1); }
const seatProps = typeof dockReg.def.inject === 'function' ? dockReg.def.inject() : {};
const seatEl = dockReg.C(seatProps || {});
const ShellDock = seatEl.type;

function build(vnode, parent = null) {
  if (vnode === null || vnode === undefined || vnode === false) return null;
  if (Array.isArray(vnode)) return vnode.map((v) => build(v, parent)).filter(Boolean);
  if (typeof vnode === 'string' || typeof vnode === 'number') return null;
  if (!vnode.$$el) return null;
  const node = makeNode(typeof vnode.type === 'string' ? vnode.type : 'component');
  node.type = vnode.type; node.parent = parent;
  const props = vnode.props || {};
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('on') && typeof v === 'function') node[k] = v;
    if (k === 'className') node.className = v;
    if (k === 'style' && v && typeof v === 'object') node.propsStyle = v;
    if (k === 'ref' && v && typeof v === 'object') v.current = node;
  }
  const kids = props.children;
  const list = Array.isArray(kids) ? kids : (kids === undefined || kids === null ? [] : [kids]);
  node.children = list.map((k) => build(k, node)).flat().filter(Boolean);
  return node;
}

function find(node, pred) {
  if (!node) return null;
  if (pred(node)) return node;
  for (const c of node.children || []) { const hit = find(c, pred); if (hit) return hit; }
  return null;
}

let tree = null;
let depth = 0;
function render() {
  // 重入保护：setState 会同步触发重渲染，重渲染里再 setState 就是死循环。
  // 真 React 靠调度把这件事变成异步，假 React 必须自己挡一层，否则只会看到
  // RangeError: Maximum call stack size exceeded，掩盖真正的业务错误。
  if (depth > 0) { depth += 1; return tree; }
  depth = 1;
  try {
    tree = build(ShellDock());
  } finally {
    depth = 0;
  }
  return tree;
}

render();
React.__setRerender(() => { render(); });

const capsule = find(tree, (n) => typeof n.className === 'string' && n.className.includes('dmo-dock--collapsed'));
if (!capsule) { console.log('找不到胶囊'); process.exit(1); }
const stackNode = find(tree, (n) => typeof n.className === 'string' && n.className.includes('dmo-dock-stack'));
console.log('stack 节点:', stackNode ? stackNode.className : '(无)');
console.log('胶囊 onPointerDown:', typeof capsule.onPointerDown);

traces.push('=== 开始 pointerdown ===');
try {
  capsule.onPointerDown({ button: 0, pointerId: 1, clientX: 1010, clientY: 710, currentTarget: capsule });
} catch (e) {
  traces.push('[onPointerDown 抛错] ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e));
}
traces.push('=== pointerdown 结束 ===');
traces.push('=== 开始 pointermove ===');
try {
  if (typeof capsule.onPointerMove === 'function') capsule.onPointerMove({ button: 0, pointerId: 1, clientX: 700, clientY: 400, currentTarget: capsule });
  else traces.push('胶囊没有 onPointerMove');
} catch (e) {
  traces.push('[onPointerMove 抛错] ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e));
}
traces.push('=== pointermove 结束 ===');

const stackAfter = find(tree, (n) => typeof n.className === 'string' && n.className.includes('dmo-dock-stack'));
traces.push('重渲染后 stack.style = ' + JSON.stringify(stackAfter && stackAfter.propsStyle));

console.log('\n--- 插桩 ---');
for (const h of hits) console.log('  ' + h);
console.log('\n--- 追踪 ---');
for (const t of traces) console.log('  ' + t);
