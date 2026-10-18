/**
 * 拖动行为的真实执行验证。
 *
 * 存在理由：连着五轮"修好了"但用户一直拖不动，而每一轮的静态断言全过 ——
 * 它们只证明"代码里写了什么"，不证明"跑起来真的动了"。
 * 这个脚本用假 React（真 hooks 语义）+ 假 DOM，把 client.js 装进 vm，
 * 真正触发 onPointerDown → onPointerMove → onPointerUp，然后读节点上的样式。
 *
 * 跑法：node scripts\simulate-drag.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const source = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
const problems = [];
const log = [];

/* ---------------- 假 React：带真实重渲染 ---------------- */
function makeReact() {
  let cursor = 0;
  let slots = [];
  let forceRender = null;
  // 真 React 的批处理语义：渲染过程中触发的 setState 不会立刻递归渲染，
  // 而是标记 pending，等本轮渲染结束后再统一跑一轮。缺了这层守卫，
  // 渲染期 setState 会直接同步递归 → RangeError: Maximum call stack size exceeded。
  let rendering = false;
  let pending = false;

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
      return [s.value, (next) => {
        s.value = typeof next === 'function' ? next(s.value) : next;
        if (rendering) pending = true;
        else if (forceRender) forceRender();
      }];
    },
    useRef(initial) {
      const s = slot(initial);
      if (!('ref' in s)) s.ref = { current: initial };
      return s.ref;
    },
    useMemo(fn) { return fn(); },
    useCallback(fn) { return fn; },
    useEffect() {},
    useLayoutEffect() {},
    // 测试钩子
    /** 开始一轮渲染：hooks 从头按序重读，槽位按索引复用。 */
    __arm(renderFn) { cursor = 0; forceRender = renderFn; pending = false; rendering = true; },
    /** 结束一轮渲染，返回是否还有排队中的更新。 */
    __settle() { rendering = false; return pending; },
    __reset() { cursor = 0; slots = []; rendering = false; pending = false; },
  };
  return React;
}

const React = makeReact();
const seed = new Map([
  ['react', React],
  ['react/jsx-runtime', { jsx: React.createElement, jsxs: React.createElement, Fragment: 'Fragment' }],
  ['react-dom', {}],
  ['react-dom/client', {}],
]);

/* ---------------- 假 DOM ---------------- */
function makeNode(tag) {
  const node = {
    tagName: tag,
    style: {},
    dataset: {},
    children: [],
    className: '',
    textContent: '',
    offsetWidth: 320,
    offsetHeight: 64,
    _rect: { left: 1000, top: 700, width: 320, height: 64 },
    getBoundingClientRect() { return { ...this._rect, right: this._rect.left + this._rect.width, bottom: this._rect.top + this._rect.height }; },
    setPointerCapture() { node._captured = true; },
    releasePointerCapture() { node._captured = false; },
    appendChild(child) { node.children.push(child); return child; },
    setAttribute() {},
    addEventListener() {},
    removeEventListener() {},
    focus() {},
    querySelector() { return null; },
  };
  return node;
}

const storage = new Map();
/**
 * window 上的监听必须**真的记录并派发**。
 *
 * 插件把 pointermove/pointerup 挂在 window 上，就是为了指针移出胶囊后拖动不断。
 * 若这里写成空函数，那条通道永远不会被触发，模拟器只会跑通 React 那一半，
 * 给出「已通过」的假信号 —— 而这恰恰是用户实测无效的那一半。
 */
const winListeners = new Map();
const win = {
  innerWidth: 1440,
  innerHeight: 900,
  devicePixelRatio: 1,
  localStorage: {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  },
  setTimeout: () => 0,
  clearTimeout: () => {},
  addEventListener(type, fn) {
    if (!winListeners.has(type)) winListeners.set(type, []);
    winListeners.get(type).push(fn);
  },
  removeEventListener(type, fn) {
    const list = winListeners.get(type);
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  },
  matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: () => {},
};

/** 派发一个 window 级事件，返回实际被调用的监听器个数。 */
function dispatchWin(type, event) {
  const list = (winListeners.get(type) || []).slice();
  for (const fn of list) fn(event);
  return list.length;
}

/* ---------------- 假槽位 ---------------- */
const registered = [];
const slots = {
  inject(name, run) { return run(); },
  register(definition, Component) { registered.push({ definition, Component }); return () => {}; },
};

const ctx = {
  slots,
  locale: { register: () => () => {}, bind: () => (key, fallback) => (typeof fallback === 'string' ? fallback : key) },
  sidebarRight: { openTab: () => true },
  sidebarRightTabs: { register: () => () => {} },
  effect(factory) { const d = factory(); return d; },
  logger: { warn: (...a) => problems.push(`[warn] ${a.map(String).join(' ')}`), debug: () => {} },
  require: (id) => { if (seed.has(id)) return seed.get(id); throw new Error(`miss ${id}`); },
};

const sandbox = {
  console: { warn: () => {}, error: (...a) => problems.push(`[err] ${a.map(String).join(' ')}`), log: () => {}, debug: () => {} },
  navigator: { userAgent: 'sim', language: 'zh-CN' },
  location: { href: 'http://127.0.0.1:3080/' },
  document: {
    head: { appendChild: () => {} },
    body: { appendChild: () => {}, style: {} },
    createElement: (tag) => makeNode(tag),
    querySelector: () => null,
    addEventListener: () => {},
    visibilityState: 'visible',
  },
  localStorage: win.localStorage,
  setTimeout: () => 0,
  clearTimeout: () => {},
  setInterval: () => 0,
  clearInterval: () => {},
  queueMicrotask: (fn) => fn(),
  fetch: () => Promise.reject(new Error('no net')),
  URL, URLSearchParams, TextEncoder, TextDecoder, AbortController, Blob, FormData, Promise, Date, Math, JSON,
};
sandbox.window = Object.assign(sandbox, win, { window: sandbox });
sandbox.globalThis = sandbox;
sandbox.self = sandbox;

let captured = null;
sandbox.__ModuleLoader__ = { load(entry) { captured = entry; } };

vm.createContext(sandbox);
try {
  new vm.Script(source, { filename: 'client.js' }).runInContext(sandbox);
} catch (error) {
  problems.push(`[bundle 求值失败] ${error.message}`);
}

const exportsObj = captured && captured.factory((id) => {
  if (seed.has(id)) return seed.get(id);
  throw new Error(`client-modules: require("${id}") missed the module table`);
});

exportsObj.apply(ctx);

/* ---------------- 记录 store.patch 调用 ---------------- */
/**
 * 拖动落手后必须把坐标写进设置（dockX / dockY），否则刷新就回默认角。
 * 真 store 是模块级单例、挂在 window.__dsh_music_on_runtime__ 上，
 * 这里把它包一层，只记录不改行为。
 */
const patched = [];
function armStoreRecorder() {
  const runtime = sandbox.window && sandbox.window.__dsh_music_on_runtime__;
  if (!runtime || !runtime.store || typeof runtime.store.patch !== 'function') return false;
  if (runtime.store.__recorderArmed) return true;
  const original = runtime.store.patch.bind(runtime.store);
  runtime.store.patch = (key, value) => {
    patched.push({ key, value });
    return original(key, value);
  };
  runtime.store.__recorderArmed = true;
  return true;
}

/* ---------------- 找到 ShellDock 注册并渲染 ---------------- */
const dockReg = registered.find((r) => r.definition.name === 'shell.overlay');
if (!dockReg) {
  problems.push('[致命] 没有 shell.overlay 注册');
  report();
}

const SeatComponent = dockReg.Component;
const seatProps = typeof dockReg.definition.inject === 'function' ? dockReg.definition.inject() : {};
// SeatComponent 返回 createElement(Dock, null)，元素的 type 就是 ShellDock 组件函数本身。
const seatEl = SeatComponent(seatProps || {});
if (!seatEl || !seatEl.$$el || typeof seatEl.type !== 'function') {
  problems.push(`[致命] seat 组件没返回元素：${JSON.stringify(seatEl && Object.keys(seatEl))}`);
  report();
}
const ShellDockComponent = seatEl.type;

/**
 * 把 vdom 树变成带父链的真实节点对象，并记录每个节点的 handlers。
 */
function build(vnode, parent = null) {
  if (vnode === null || vnode === undefined || vnode === false) return null;
  if (Array.isArray(vnode)) return vnode.map((v) => build(v, parent)).filter(Boolean);
  if (typeof vnode === 'string' || typeof vnode === 'number') {
    const text = makeNode('#text');
    text.textContent = String(vnode);
    text.parent = parent;
    return text;
  }
  if (!vnode.$$el) return null;
  const node = makeNode(typeof vnode.type === 'string' ? vnode.type : 'component');
  node.type = vnode.type;
  node.parent = parent;
  const props = vnode.props || {};
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith('on') && typeof value === 'function') node[key] = value;
    if (key === 'className') node.className = value;
    if (key === 'style' && value && typeof value === 'object') node.propsStyle = value;
    if (key === 'ref' && value && typeof value === 'object') value.current = node;
    if (key === 'data-dragging') node.dataset.dragging = value;
  }
  const kids = props.children;
  const list = Array.isArray(kids) ? kids : (kids === undefined || kids === null ? [] : [kids]);
  node.children = list.map((k) => build(k, node)).flat().filter(Boolean);
  return node;
}

function find(node, predicate) {
  if (!node) return null;
  if (predicate(node)) return node;
  for (const child of node.children || []) {
    const hit = find(child, predicate);
    if (hit) return hit;
  }
  return null;
}

let tree = null;
/**
 * 一次真实重渲染 = hooks 按顺序从头重读，槽位按索引复用。
 * cursor 不归零的话第二次渲染每个 useState/useRef 都拿到新槽位，
 * 表现就是「移动时写进去了、重渲染后又没了」—— 纯属模拟器造假。
 * 渲染期触发的 setState 由假 React 排队，这里循环 flush 到收敛（真 React 同语义）。
 */
function render() {
  let rounds = 0;
  do {
    React.__arm(render);
    tree = build(ShellDockComponent());
    rounds += 1;
  } while (React.__settle() && rounds < 20);
  // store 是 getRuntime() 里惰性建的，首次渲染后才存在，所以每次渲染后补挂一次。
  armStoreRecorder();
}

function cls(node) { return node ? node.className : '(null)'; }

/** 树是空的还是结构搭错了 —— 光看断言命中不到，必须把真实节点打出来。 */
function dump(node, depth = 0, out = []) {
  if (!node) return out;
  if (node.className) out.push(`${'  '.repeat(depth)}${node.className}  style=${JSON.stringify(node.propsStyle || null)}`);
  for (const c of node.children || []) dump(c, depth + 1, out);
  return out;
}

/* ---------------- 场景一：收起态拖动 ---------------- */
render();
const capsule = find(tree, (n) => typeof n.className === 'string' && n.className.includes('dmo-dock') && n.className.includes('collapsed'));
if (!capsule) {
  problems.push(`[致命] 找不到收起态胶囊，根是 ${cls(tree)}`);
  report();
}
log.push(`收起态根节点 class=${cls(capsule)}  onPointerDown=${typeof capsule.onPointerDown}`);
log.push('--- 收起态树 ---');
for (const line of dump(tree)) log.push(line);

if (typeof capsule.onPointerDown !== 'function') {
  problems.push('[致命] 收起态根节点上没有 onPointerDown —— 事件根本没挂上');
  report();
}

capsule._rect = { left: 1000, top: 700, width: 320, height: 64 };

/**
 * 读一个节点最终会被浏览器看到的定位。
 *
 * 真实浏览器里，`style` prop 与 `el.style.left = x` 是同一份 CSSStyleDeclaration，
 * 谁后写谁生效。这里把 propsStyle 与手工写的 style 合并看，优先取 propsStyle ——
 * 因为它代表「React 最后一次渲染写进去的值」，也就是重渲染会不会把位置打回去。
 */
function readPos(node) {
  const st = Object.assign({}, node.style || {}, node.propsStyle || {});
  return `left=${JSON.stringify(st.left)} top=${JSON.stringify(st.top)} right=${JSON.stringify(st.right)} bottom=${JSON.stringify(st.bottom)}`;
}

const down = { button: 0, pointerId: 1, clientX: 1010, clientY: 710, currentTarget: capsule };
try {
  capsule.onPointerDown(down);
} catch (error) {
  problems.push(`[onPointerDown 抛错] ${error.stack.split('\n').slice(0, 3).join(' | ')}`);
}

// 看按下的瞬间：定位盒自己的 propsStyle 是否接管了定位，且不动（视觉零位移）。
// 定位写在**外层 .dmo-dock-stack**（position:absolute 的那个盒），内层
// .dmo-dock 被 CSS 降级成 position:relative，读它永远读不到真实落点。
const pickStack = () => find(tree, (n) => n.className === 'dmo-dock-stack');
const stackAtDown = pickStack();
if (!stackAtDown) {
  problems.push('[致命] 找不到 .dmo-dock-stack 定位盒 —— 收起态没有渲染外层容器');
  report();
}
log.push(`按下后 定位盒最终定位 ${readPos(stackAtDown)}`);

// 按下之后 window 上必须已经挂好 pointermove / pointerup。
// 这是「指针移出胶囊仍能拖」的唯一保障：React 的 onPointerMove 只在指针位于
// 胶囊上方时才派发，胶囊才几十像素宽，一拖就出界，那条路必然断。
const winMoveCount = (winListeners.get('pointermove') || []).length;
const winUpCount = (winListeners.get('pointerup') || []).length;
if (winMoveCount === 0) {
  problems.push('[致命] 按下后 window 上没有 pointermove 监听 —— 指针一离开胶囊拖动就断');
}
if (winUpCount === 0) {
  problems.push('[致命] 按下后 window 上没有 pointerup 监听 —— 指针在胶囊外松手会卡在拖动态');
}
log.push(`按下后 window 监听 pointermove=${winMoveCount} pointerup=${winUpCount}`);

// 关键一步：**只走 window 通道**，不碰 capsule.onPointerMove。
// 真浏览器里指针此时已在胶囊之外，React 那条路收不到事件，只有 window 能救。
const moved = { button: 0, pointerId: 1, clientX: 700, clientY: 400, currentTarget: capsule };
let winHits = 0;
try {
  winHits = dispatchWin('pointermove', moved);
} catch (error) {
  problems.push(`[window pointermove 抛错] ${error.stack.split('\n').slice(0, 3).join(' | ')}`);
}
if (winHits === 0) {
  problems.push('[致命] window 派发 pointermove 时没有任何监听器被调用');
}
// 越过死区会 setHolding(true) → 同步触发一轮重渲染 → 整棵树被重建。
// 按下前取到的 stackAtDown 已经是旧对象，必须重新取当前树里的定位盒。
const stackAfterMove = pickStack() || stackAtDown;
log.push(`移动后 定位盒最终定位 ${readPos(stackAfterMove)}  window 命中=${winHits}`);
if (stackAfterMove !== stackAtDown) {
  const st = Object.assign({}, stackAfterMove.style || {}, stackAfterMove.propsStyle || {});
  if (st.left !== '690px' || st.top !== '390px') {
    problems.push(`[致命] 移动后定位没落到盒子上（left=${st.left} top=${st.top}，期望 690px/390px）`);
  }
}

/**
 * 真浏览器在 pointermove 里 setState 后会重渲染。
 * 这一轮重渲染会用渲染期样式去写 DOM，必须确认它写出的是新位置而不是原点。
 */
render();
const stackAfter = pickStack();
log.push(`重渲染后 定位盒定位 ${readPos(stackAfter || stackAtDown)}`);

const after = stackAfter && stackAfter.propsStyle ? stackAfter.propsStyle : null;
if (!after || !after.left || after.left === '1000px') {
  problems.push(`[致命] 重渲染后位置没变（left=${after && after.left}）—— 盒子会被拉回原点`);
}
if (after && (after.right === '16px' || after.bottom === '16px')) {
  problems.push(`[致命] 重渲染后 right/bottom 仍在（right=${after.right} bottom=${after.bottom}）—— left/top 与右下角偏移会互相拉扯`);
}

/* ---------------- 场景一续：落手 ---------------- */
//
// 「拖完一松手就弹回右下角」是这类实现的经典症状，必须单独断言。
// 落手要同时满足三件事：位置留在落点、window 监听摘干净、坐标写进设置。
const upEvent = { button: 0, pointerId: 1, clientX: 700, clientY: 400, currentTarget: capsule };
try {
  dispatchWin('pointerup', upEvent);
} catch (error) {
  problems.push(`[window pointerup 抛错] ${error.stack.split('\n').slice(0, 3).join(' | ')}`);
}

const leftMove = (winListeners.get('pointermove') || []).length;
const leftUp = (winListeners.get('pointerup') || []).length;
const leftCancel = (winListeners.get('pointercancel') || []).length;
if (leftMove || leftUp || leftCancel) {
  problems.push(`[致命] 落手后 window 监听没摘干净：pointermove=${leftMove} pointerup=${leftUp} pointercancel=${leftCancel}`);
}
log.push(`落手后 window 监听 pointermove=${leftMove} pointerup=${leftUp} pointercancel=${leftCancel}`);

// 落手会 setPos(drag.last) 触发重渲染，位置此时由 state 承载 —— 必须仍是落点。
render();
const stackAtRest = pickStack();
const rest = stackAtRest && stackAtRest.propsStyle ? stackAtRest.propsStyle : null;
log.push(`落手重渲染后 定位盒定位 ${readPos(stackAtRest || stackAtDown)}`);
if (!rest || rest.left !== '690px' || rest.top !== '390px') {
  problems.push(`[致命] 落手后位置没保持住（left=${rest && rest.left} top=${rest && rest.top}，期望 690px/390px）—— 松手就弹回原位`);
}
if (rest && (rest.right === '16px' || rest.bottom === '16px')) {
  problems.push(`[致命] 落手后 right/bottom 回来了（right=${rest.right} bottom=${rest.bottom}）—— 下次渲染会被拉回右下角`);
}

if (!patched.some((p) => p.key === 'dockX' && typeof p.value === 'number')) {
  problems.push(`[致命] 落手后没有把 dockX 写进设置 —— 刷新会丢掉位置（收到 ${JSON.stringify(patched)}）`);
}
if (!patched.some((p) => p.key === 'dockY' && typeof p.value === 'number')) {
  problems.push(`[致命] 落手后没有把 dockY 写进设置（收到 ${JSON.stringify(patched)}）`);
}

/* ---------------- 场景二：展开态拖动 ---------------- */
storage.set('dsh-music-on:dock.collapsed', '0');
React.__reset();
render();
const expandedRoot = tree;
const stage = find(expandedRoot, (n) => typeof n.className === 'string' && n.className.includes('dmo-vinyl-stage'));
if (!stage) {
  problems.push(`[致命] 展开态找不到黑胶舞台，根是 ${cls(expandedRoot)}`);
} else {
  log.push(`展开态舞台 onPointerDown=${typeof stage.onPointerDown}`);
  if (typeof stage.onPointerDown !== 'function') problems.push('[致命] 黑胶舞台没有 onPointerDown');
}

report();

function report() {
  console.log('--- 轨迹 ---');
  for (const line of log) console.log('  ' + line);
  console.log('--- 结论 ---');
  if (problems.length === 0) {
    console.log('  拖动行为验证通过：按下 → 移动 → 重渲染后位置确实改变');
    process.exit(0);
  }
  for (const p of problems) console.log('  ✗ ' + p);
  process.exit(1);
}
