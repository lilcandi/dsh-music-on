/**
 * 探针：在 vm 里加载 client.js，真正调用 settings.section 注册的组件，
 * 看它渲染得出来还是抛错（设置页空白 = 组件体抛错导致 React 卸载整棵子树）。
 *
 * 用法：node scripts/probe-settings-render.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const source = readFileSync(path.join(root, 'client.js'), 'utf8');

// ---- 极简假 react：createElement 返回普通对象，hooks 用固定槽位 ----
// 关键：真实 React 每个组件实例有独立的 fiber hook 链表，所以槽位必须**按组件类型隔离**。
// 早期版本所有组件共用一个 slots 数组，LibrarySection 会读到 Settings 的槽位，
// 于是 useState(() => loadFavorites()) 拿到的是 Settings 的 store 对象，
// 抛出「list.map is not a function」—— 那是探针的假象，不是产品 bug。
function makeReact() {
  const byType = new Map();
  let currentType = '<root>';
  let cursor = 0;

  function slotFor(initial) {
    const i = cursor++;
    if (!byType.has(currentType)) byType.set(currentType, []);
    const slots = byType.get(currentType);
    if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
    return { slots, i };
  }

  return {
    createElement(type, props, ...children) {
      return { $$el: true, type, props: { ...(props || {}), children: children.length ? children : undefined } };
    },
    Fragment: 'Fragment',
    useState(initial) {
      const { slots, i } = slotFor(initial);
      const set = (next) => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; };
      return [slots[i], set];
    },
    useRef(initial) {
      const { slots, i } = slotFor({ current: initial });
      return slots[i];
    },
    useMemo(fn) { cursor++; return fn(); },
    useCallback(fn) { cursor++; return fn; },
    useEffect() { cursor++; },
    useLayoutEffect() { cursor++; },
    /** 进入某个组件的作用域：切槽位归属并归零游标。 */
    __enter(type) { currentType = type; cursor = 0; },
    __reset() { cursor = 0; },
    __typeCount() { return byType.size; },
  };
}

const registrations = [];
const React = makeReact();

const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
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
  URL,
  URLSearchParams,
  encodeURIComponent,
  decodeURIComponent,
  TextEncoder,
  TextDecoder,
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
sandbox.self = sandbox;

const storage = new Map();
sandbox.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
  clear: () => storage.clear(),
};

/**
 * 预填存储。真实浏览器里用户已经攒了收藏和历史，空列表永远复现不出
 * 「有数据时渲染崩溃」这类问题 —— 空数组是最安全的输入，不是最真实的。
 */
if (process.env.SEED_LIBRARY === '1') {
  const now = Date.now();
  const mk = (i, extra) => ({
    url: `https://www.bilibili.com/video/BV1Lyw7zPEeo/?p=${i}`,
    title: `一小时陈粒音乐合集 第 ${i} 集`,
    platform: ['bilibili', 'netease', 'qqmusic', 'unknown', undefined][i % 5],
    kind: 'platform',
    addedAt: now - i * 3600000,
    playedAt: now - i * 600000,
    plays: i + 1,
    ...extra,
  });
  storage.set('dsh-music-on:favorites.v1', JSON.stringify([mk(1), mk(2), mk(3)]));
  storage.set('dsh-music-on:history.v1', JSON.stringify(Array.from({ length: 13 }, (_, i) => mk(i))));
  console.log('[探针] 已预填 3 条收藏 + 13 条历史');
}

const fakeCtx = {
  slots: {
    inject(name, cb) { return cb(); },
    register(entry, Comp) { registrations.push({ name: entry.name, entry, Comp }); return () => {}; },
  },
  locale: {
    register() {},
    bind() { return (key, fallback) => (typeof fallback === 'string' ? fallback : key); },
  },
  effect(fn) { try { const off = fn(); return typeof off === 'function' ? off : () => {}; } catch (e) { console.error('[effect 抛错]', e); return () => {}; } },
  sidebarRight: { openTab() {} },
};

sandbox.__ModuleLoader__ = {
  load({ factory }) {
    const impl = factory((name) => {
      if (name === 'react' || name === 'react/jsx-runtime') return React;
      throw new Error(`unexpected require: ${name}`);
    });
    sandbox.__impl = impl;
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

const section = registrations.find((r) => r.name === 'settings.section');
if (!section) {
  console.error('[致命] 没有注册 settings.section');
  process.exit(1);
}

// 宿主渲染设置分区时会调 Component(props)，props 来自 inject 表面。
const injected = typeof section.entry.inject === 'function' ? section.entry.inject() : {};
console.log('注入表面 keys =', Object.keys(injected || {}));

// 递归展开函数组件：只看根元素不够，Settings 本身是个函数组件，
// 它的子组件（LibrarySection 等）要递归调用才看得到真实类名。
const found = new Set();
const errors = [];

function flatten(node, depth) {
  if (node === null || node === undefined || typeof node === 'boolean') return;
  if (typeof node === 'string' || typeof node === 'number') return;
  if (Array.isArray(node)) { node.forEach((child) => flatten(child, depth)); return; }
  if (!node || typeof node !== 'object' || !node.$$el) return;
  if (depth > 40) { errors.push('渲染深度超过 40，疑似死循环'); return; }

  const { type, props } = node;
  const cn = props && props.className;
  if (typeof cn === 'string') cn.split(/\s+/).filter(Boolean).forEach((c) => found.add(c));

  if (typeof type === 'function') {
    // 每个组件实例有独立 hook 链表：进入前切归属并归零游标。
    React.__enter(type);
    let out;
    try {
      out = type(props || {});
    } catch (error) {
      errors.push(`组件 ${type.name || '<匿名>'} 抛错: ${error && error.message ? error.message : error}`);
      console.error(`[组件抛错] ${type.name || '<匿名>'}`);
      console.error(error && error.stack ? error.stack : String(error));
      return;
    }
    flatten(out, depth + 1);
    return;
  }
  flatten(props && props.children, depth + 1);
}

try {
  React.__reset();
  flatten(section.Comp(injected || {}), 0);
} catch (error) {
  console.error('[致命] 设置分区组件体抛错：');
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
}

if (errors.length) {
  console.error('\n--- 渲染期错误 ---');
  errors.forEach((e) => console.error('✗ ' + e));
}

const wanted = ['dmo-settings', 'dmo-settings-group', 'dmo-lib', 'dmo-lib-row', 'dmo-lib-empty'];
console.log('\n--- 关键类名 ---');
for (const w of wanted) {
  const hit = [...found].filter((c) => c === w || c.startsWith(w));
  console.log(`${hit.length ? '✓' : '✗'} ${w}  ${hit.length ? '(' + hit.join(', ') + ')' : ''}`);
}
console.log('\n全部类名：', [...found].sort().join(' '));
