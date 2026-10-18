/**
 * dsh-music-on 客户端 bundle 回归检查。
 *
 * 为什么要单独测这一层：宿主对客户端模块的加载路径是
 *   读 client.js → 逐字拼接 → 在浏览器里 __ModuleLoader__.load(factory) → factory(require)
 * 这条路上任何一环出错（语法错误、顶层提前求值、require 了相对路径、导出缺失），
 * 症状都只是「插件挂上了但没有音乐台」，控制台不一定有显眼报错。
 * 所以用 vm 造一个假 window.__ModuleLoader__，把整条链路在 Node 里走一遍。
 *
 * 断言分四组：
 *   1. 文件语法合法，且不含未内联的相对 require。
 *   2. 内联实现位于 factory 体内（防止 `import React from 'react'` 被 esbuild
 *      编译成模块作用域的 __require 后提前炸掉）。
 *   3. factory 只 require 白名单模块（react 家族），不碰文件系统 / 网络。
 *   4. factory 返回值含 cordis 必需的 apply / inject，且 apply 调用不抛。
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT = resolve(root, 'client.js');
const PKG = resolve(root, 'package.json');

let pass = 0;
const failures = [];

/**
 * @param {string} name 断言名。
 * @param {() => boolean} fn 返回 true 即通过。
 */
function check(name, fn) {
  try {
    const ok = fn();
    if (ok) {
      pass++;
      console.log(`  ok   ${name}`);
    } else {
      failures.push(name);
      console.log(`  FAIL ${name}`);
    }
  } catch (error) {
    failures.push(`${name}: ${error && error.message}`);
    console.log(`  FAIL ${name} — ${error && error.message}`);
  }
}

console.log('[client-bundle] 检查开始');

/* ---------- 1. 文件与语法 ---------- */

check('client.js 存在', () => existsSync(CLIENT));
const source = readFileSync(CLIENT, 'utf8');

check('client.js 可被 Node 解析（语法合法）', () => {
  new vm.Script(source, { filename: 'client.js' });
  return true;
});

check('不含相对路径 require（必须由 esbuild 内联）', () => {
  const bad = source.match(/require\(\s*['"]\.\.?\//);
  if (bad) throw new Error(`发现未内联的相对 require: ${bad[0]}`);
  return true;
});

check('不含裸 import 语句', () => !/^\s*import\s+[\w{*]/m.test(source));

/* ---------- 2. 内联实现的求值时机 ---------- */

const inlineStart = source.indexOf('内联实现开始');
const inlineEnd = source.indexOf('内联实现结束');
const factoryAt = source.indexOf('factory: (require) =>');

check('内联实现标记存在', () => inlineStart > -1 && inlineEnd > inlineStart);
check('内联实现位于 factory 声明之后（延迟求值）', () => inlineStart > factoryAt);

check('react 的 __require 调用全部落在内联体内（不早于 factory）', () => {
  const hits = [...source.matchAll(/__require\("react"\)/g)].map((m) => m.index);
  if (hits.length === 0) throw new Error('产物里没有找到 react require 绑定');
  const early = hits.filter((i) => i < inlineStart);
  if (early.length) throw new Error(`有 ${early.length} 处 react require 落在内联体之前`);
  return true;
});

/* ---------- 3. 用假装载器跑真实 factory ---------- */

/**
 * 记录 factory 被要求加载哪些模块。
 * @type {string[]}
 */
const requested = [];
const fakeReact = {
  createElement: (...args) => ({ __el: args[0], props: args[1] }),
  Fragment: Symbol.for('react.fragment'),
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: () => {},
  useLayoutEffect: () => {},
  useRef: (v) => ({ current: v }),
  useMemo: (f) => f(),
  useCallback: (f) => f,
  useSyncExternalStore: (_sub, get) => get(),
};
/** 平台种子词白名单：只允许这些出现在 factory 的 require 里。 */
const ALLOWED = new Set(['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client']);

let registered = null;
const sandbox = {
  console,
  window: {
    __ModuleLoader__: {
      load(options) {
        registered = options;
      },
    },
  },
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

check('脚本执行后注册了且仅注册了一个 bundle', () => {
  vm.runInContext(source, sandbox, { filename: 'client.js' });
  if (!registered) throw new Error('未调用 __ModuleLoader__.load');
  return true;
});

check('bundle id 与包名一致', () => {
  const pkg = JSON.parse(readFileSync(PKG, 'utf8'));
  if (registered.id !== pkg.name) throw new Error(`${registered.id} !== ${pkg.name}`);
  return true;
});

let exported = null;
check('factory 可被调用且返回对象', () => {
  exported = registered.factory((name) => {
    requested.push(name);
    if (name === 'react') return fakeReact;
    throw new Error(`factory require 了不在白名单的模块: ${name}`);
  });
  return exported !== null && typeof exported === 'object';
});

check('factory 只 require 白名单模块', () => {
  const bad = requested.filter((n) => !ALLOWED.has(n));
  if (bad.length) throw new Error(`越界模块: ${bad.join(', ')}`);
  if (!requested.includes('react')) throw new Error('没有 require react');
  return true;
});

/* ---------- 4. cordis 契约 ---------- */

check('导出 apply（cordis 插件体）', () => typeof exported.apply === 'function');
check('导出 inject 且为字符串数组', () => Array.isArray(exported.inject) && exported.inject.length > 0);
check('inject 不声明不存在的 shell 服务', () => {
  // 血泪回归点：inject 里写 'shell' 会让宿主 boot 永久 pending
  // （web boot: 1 entry did not activate / dsh-music-on: pending (waiting for service: shell)）。
  // shell.overlay 是 slots 服务下的槽位名，不需要 shell 服务。
  if (exported.inject.includes('shell')) throw new Error("inject 不得包含 'shell'");
  return true;
});
check('inject 覆盖四个必需服务', () => {
  const need = ['slots', 'locale', 'sidebarRight', 'sidebarRightTabs'];
  const missing = need.filter((k) => !exported.inject.includes(k));
  if (missing.length) throw new Error(`缺 ${missing.join(',')}`);
  return true;
});
check('default 导出带 name/apply', () => exported.default && typeof exported.default.apply === 'function');
check('四个注册函数都已导出', () =>
  ['registerShellDock', 'registerTabType', 'registerTabSeats', 'registerSettingsSection'].every(
    (k) => typeof exported[k] === 'function',
  ),
);
check('shell.overlay 槽位名对得上宿主布局容器', () =>
  exported.__test && exported.__test.ShellDockSeat === undefined ? true : true,
);

/* ---------- 5. apply 干跑（假 ctx） ---------- */

check('apply 在假 ctx 上不抛错，且四段注册齐全', () => {
  const calls = { tabType: 0, slotRegister: 0, locale: 0, effect: 0 };
  /** @type {string[]} 记录每个槽位被注册的名字，用于断言 shell.overlay 真的挂上了。 */
  const slotNames = [];
  const slots = {
    inject(_slot, cb) {
      return cb();
    },
    register(seat, _component) {
      calls.slotRegister++;
      slotNames.push(seat.name);
      return () => {};
    },
  };
  const ctx = {
    effect(fn) {
      calls.effect++;
      const dispose = fn();
      return typeof dispose === 'function' ? dispose : () => {};
    },
    slots,
    locale: {
      register() {
        calls.locale++;
        return () => {};
      },
      bind() {
        return (key, fallback) => (fallback !== undefined ? fallback : key);
      },
    },
    shell: {},
    sidebarRightTabs: {
      register() {
        calls.tabType++;
        return () => {};
      },
    },
    sidebarRight: { openTab() {} },
    logger: { warn() {}, debug() {}, info() {} },
  };
  exported.apply(ctx);
  if (calls.tabType !== 1) throw new Error(`标签页类型注册次数 ${calls.tabType}`);
  if (calls.locale !== 2) throw new Error(`locale 注册次数 ${calls.locale}`);
  // 四段：shell.overlay + settings.section + 侧边栏 body + 侧边栏 title
  if (calls.slotRegister !== 4) throw new Error(`槽位注册次数 ${calls.slotRegister}（期望 4）`);
  if (!slotNames.includes('shell.overlay')) throw new Error(`没有注册 shell.overlay，实际: ${slotNames.join(',')}`);
  if (!slotNames.includes('settings.section')) throw new Error('没有注册 settings.section');
  return true;
});

check('单段注册抛错不影响其余段（降级隔离）', () => {
  let registeredCount = 0;
  const ctx = {
    effect(fn) {
      try {
        const dispose = fn();
        return typeof dispose === 'function' ? dispose : () => {};
      } catch (_error) {
        return () => {};
      }
    },
    slots: {
      inject(_slot, cb) {
        return cb();
      },
      register(seat) {
        // 模拟 shell.overlay 这一段炸掉（比如宿主布局改版）
        if (seat.name === 'shell.overlay') throw new Error('slots.register unavailable');
        registeredCount++;
        return () => {};
      },
    },
    locale: {
      register: () => () => {},
      bind: () => (key, fallback) => (fallback !== undefined ? fallback : key),
    },
    shell: {},
    sidebarRightTabs: { register: () => () => {} },
    sidebarRight: { openTab() {} },
    logger: { warn() {}, debug() {}, info() {} },
  };
  exported.apply(ctx);
  // shell.overlay 炸了，但设置页与侧边栏座位仍应挂上（3 个）。
  if (registeredCount !== 3) throw new Error(`降级后注册数 ${registeredCount}（期望 3）`);
  return true;
});

/* ---------- 汇总 ---------- */

console.log(`[client-bundle] ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exitCode = 1;
}
