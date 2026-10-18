/**
 * 模拟宿主浏览器运行期：把 client.js 当一个普通 CJS 脚本喂进 vm，
 * 用假的 __ModuleLoader__ / require / 槽位服务把整条装载链跑通。
 *
 * 存在理由：服务端 200、bundle 里有实现、安装自检全过 —— 胶囊还是不显示。
 * 这三条只证明「文件对」，不证明「运行期跑得通」。这个脚本补的就是那段证据：
 * 如果 apply 抛错或槽位注册没发生，这里会当场显形，不必靠用户刷新页面碰运气。
 *
 * 跑法：node scripts/simulate-browser.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const BUNDLE = path.join(ROOT, 'client.js');

const source = fs.readFileSync(BUNDLE, 'utf8');
const log = [];
const problems = [];

/* ---------------- 假 react：只要能建元素、能跑 hooks ---------------- */
let hookIndex = 0;
const hookState = [];
function makeReact() {
  const createElement = (type, props, ...children) => ({
    $$el: true, type, props: { ...(props || {}), children: children.length ? children : props && props.children },
  });
  const useState = (initial) => {
    const i = hookIndex++;
    if (!(i in hookState)) hookState[i] = typeof initial === 'function' ? initial() : initial;
    return [hookState[i], (next) => { hookState[i] = typeof next === 'function' ? next(hookState[i]) : next; }];
  };
  const useEffect = () => {};
  const useMemo = (fn) => fn();
  const useCallback = (fn) => fn;
  const useRef = (initial) => {
    const i = hookIndex++;
    if (!(i in hookState)) hookState[i] = { current: initial };
    return hookState[i];
  };
  return { createElement, useState, useEffect, useMemo, useCallback, useRef, Fragment: 'Fragment' };
}

const react = makeReact();
const seed = new Map([
  ['react', react],
  ['react/jsx-runtime', { jsx: react.createElement, jsxs: react.createElement, Fragment: 'Fragment' }],
  ['react-dom', {}],
  ['react-dom/client', {}],
]);

/* ---------------- 假 localStorage / window ---------------- */
const storage = new Map();
const win = {
  localStorage: {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  },
  setTimeout: (fn) => { /* 测试里不跑定时器 */ return 0; },
  clearTimeout: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
  AudioContext: undefined,
  devicePixelRatio: 1,
};

/* ---------------- 假槽位服务 ---------------- */
const registered = [];
const slots = {
  inject(name, run) {
    // 真宿主：inject 通知依赖就绪后立刻执行 run。
    return run();
  },
  register(definition, Component) {
    registered.push({ definition, Component });
    return () => {};
  },
};

const effects = [];
const ctx = {
  slots,
  locale: {
    register: () => () => {},
    bind: () => (key, fallback) => (typeof fallback === 'string' ? fallback : key),
  },
  sidebarRight: { openTab: () => true },
  sidebarRightTabs: { register: () => () => {} },
  effect(factory, label) {
    const dispose = factory();
    effects.push({ label, dispose });
    return dispose;
  },
  logger: { warn: (...args) => { problems.push(`[logger.warn] ${args.map(String).join(' ')}`); }, debug: () => {} },
  require: (id) => {
    if (seed.has(id)) return seed.get(id);
    throw new Error(`client-modules: require("${id}") missed the module table`);
  },
};

/* ---------------- 造一个最小的浏览器全局 ---------------- */
const sandbox = {
  window: win,
  self: win,
  globalThis: undefined,
  document: {
    head: { appendChild: () => {} },
    createElement: () => ({ dataset: {}, style: {}, setAttribute: () => {}, appendChild: () => {} }),
    querySelector: () => null,
    addEventListener: () => {},
    visibilityState: 'visible',
  },
  navigator: { userAgent: 'node-sim', language: 'zh-CN' },
  console: { warn: (...a) => problems.push(`[console.warn] ${a.map(String).join(' ')}`), error: (...a) => problems.push(`[console.error] ${a.map(String).join(' ')}`), log: () => {}, debug: () => {} },
  localStorage: win.localStorage,
  setTimeout: (fn, ms) => { void fn; void ms; return 0; },
  clearTimeout: () => {},
  setInterval: () => 0,
  clearInterval: () => {},
  queueMicrotask: (fn) => fn(),
  fetch: () => Promise.reject(new Error('sim: 无网络')),
  URL, URLSearchParams, TextEncoder, TextDecoder, AbortController, Blob, FormData,
};
sandbox.globalThis = sandbox;
sandbox.window = Object.assign(sandbox, win, { window: sandbox });

let captured = null;
const moduleLoader = {
  load(entry) {
    captured = entry;
  },
};

sandbox.__ModuleLoader__ = moduleLoader;

/* ---------------- 执行 bundle ---------------- */
try {
  vm.createContext(sandbox);
  new vm.Script(source, { filename: 'client.js' }).runInContext(sandbox);
} catch (error) {
  problems.push(`[bundle 求值失败] ${error && error.stack ? error.stack.split('\n')[0] : error}`);
}

if (!captured) {
  problems.push('[致命] __ModuleLoader__.load 从未被调用');
} else {
  log.push(`ModuleLoader.load 已调用，id=${captured.id}`);
}

/* ---------------- 走一遍宿主会走的 factory ---------------- */
let exportsObj = null;
if (captured && typeof captured.factory === 'function') {
  try {
    const moduleBox = { exports: {} };
    exportsObj = captured.factory((id) => {
      if (seed.has(id)) return seed.get(id);
      throw new Error(`client-modules: require("${id}") missed the module table`);
    });
    log.push('factory 调用成功');
  } catch (error) {
    problems.push(`[factory 抛错] ${error && error.message ? error.message : error}`);
  }
} else {
  problems.push('[致命] captured.factory 不是函数');
}

if (exportsObj) {
  if (typeof exportsObj.apply !== 'function') problems.push('[致命] exports.apply 不是函数');
  if (!Array.isArray(exportsObj.inject)) problems.push('[致命] exports.inject 不是数组');
  else log.push(`inject = ${JSON.stringify(exportsObj.inject)}`);

  if (typeof exportsObj.apply === 'function') {
    try {
      exportsObj.apply(ctx);
      log.push('apply(ctx) 执行完毕');
    } catch (error) {
      problems.push(`[apply 抛错] ${error && error.stack ? error.stack.split('\n').slice(0, 3).join(' | ') : error}`);
    }
  }
}

/* ---------------- 检查槽位注册结果 ---------------- */
const names = registered.map((r) => r.definition.name);
log.push(`注册槽位 ${registered.length} 个: ${JSON.stringify(names)}`);

if (!names.includes('shell.overlay')) {
  problems.push('[致命] 没有注册 shell.overlay —— 右下胶囊不会出现');
}

const dockReg = registered.find((r) => r.definition.name === 'shell.overlay');
if (dockReg) {
  const d = dockReg.definition;
  if (typeof d.locale !== 'string') problems.push('shell.overlay 注册缺 locale');
  if (typeof d.order !== 'number') problems.push('shell.overlay 注册缺 order');
  // 渲染一次：这才是「胶囊出不出来」的真判据。
  hookIndex = 0;
  try {
    const props = typeof d.inject === 'function' ? d.inject() : {};
    const element = dockReg.Component(props || {});
    if (!element || element.$$el !== true) problems.push('[致命] ShellDockSeat 没有返回元素');
    else {
      // 真正判据：ShellDock 组件体内的首次渲染结果，而不是座位组件本身。
      hookIndex = 0;
      const inner = element.type(element.props);
      const cls = inner && inner.props && inner.props.className;
      log.push(`ShellDock 首渲染 → ${inner && inner.type} className=${JSON.stringify(cls)}`);
      if (typeof cls !== 'string' || !cls.includes('dmo-dock')) {
        problems.push(`[致命] 首渲染根节点没有 dmo-dock 类名（实际 ${JSON.stringify(cls)}），胶囊不可见`);
      }
      if (inner && inner.type === 'button' && !cls.includes('dmo-dock')) {
        problems.push('[致命] 落到了 revive 分支：localStorage 里 hidden 标记为真');
      }
      // 展开态也走一遍：用户点开卡片必须能拿到 dmo-card。
      storage.set('dsh-music-on:dock.collapsed', '0');
      hookState.length = 0;
      hookIndex = 0;
      const expanded = element.type(element.props);
      const exCls = expanded && expanded.props && expanded.props.className;
      log.push(`展开态首渲染 className=${JSON.stringify(exCls)}`);
      // 根节点是 .dmo-dock-stack（隔离层，负责层叠上下文），卡片是它的第一个子节点。
      // 两条都要查：只查内层会漏掉「隔离层没建起来 → 频谱藏不到页面下」，
      // 只查外层会漏掉「卡片没渲染 → 展开后一片空白」。
      if (typeof exCls !== 'string' || !exCls.includes('dmo-dock-stack')) {
        problems.push('[致命] 展开态根节点不是 dmo-dock-stack');
      }
      const exChildren = (expanded && expanded.props && expanded.props.children) || [];
      const cardChild = Array.isArray(exChildren) ? exChildren[0] : exChildren;
      const cardCls = cardChild && cardChild.props && cardChild.props.className;
      log.push(`展开态面板 className=${JSON.stringify(cardCls)}`);
      if (typeof cardCls !== 'string' || !cardCls.includes('dmo-dock--expanded')) {
        problems.push('[致命] 展开态面板缺 dmo-dock--expanded');
      }
      storage.delete('dsh-music-on:dock.collapsed');
    }
  } catch (error) {
    problems.push(`[渲染抛错] ${error && error.stack ? error.stack.split('\n').slice(0, 4).join(' | ') : error}`);
  }
}

/* ---------------- 输出 ---------------- */
console.log('--- 轨迹 ---');
for (const line of log) console.log('  ' + line);
console.log('--- 注册清单 ---');
for (const r of registered) {
  console.log(`  ${r.definition.name}  id=${r.definition.id}  order=${r.definition.order}  key=${r.definition.key || '-'}`);
}
console.log('--- 结论 ---');
if (problems.length === 0) {
  console.log('  运行期模拟全部通过，胶囊应当显示');
  process.exit(0);
}
for (const p of problems) console.log('  ✗ ' + p);
process.exit(1);
