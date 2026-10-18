/**
 * 探针：用**真的 react + react-dom/server** 渲染设置分区。
 *
 * 为什么必须真 React：手写的假 react 会漏掉 hooks 规则、key 冲突、
 * 服务端/客户端渲染差异这类只在真实调度器里才炸的问题。曾经用假 react
 * 得出的「一切正常」结论与用户在浏览器里看到的整块空白完全矛盾。
 *
 * 用法：
 *   node scripts/probe-settings-ssr.mjs
 *   $env:SEED_LIBRARY='1'; node scripts/probe-settings-ssr.mjs
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const source = readFileSync(path.join(root, 'client.js'), 'utf8');

// react 装在 J:\plugin\.probe-react（宿主前端把 react 内联进 dist bundle 了，
// 磁盘上没有可 require 的 react 包）。这是探针专用目录，不属于插件产物。
const probeBase = 'J:\\plugin\\.probe-react';
let React;
let ReactDOMServer;
{
  const req = createRequire(path.join(probeBase, 'package.json'));
  React = req('react');
  ReactDOMServer = req('react-dom/server');
  console.log(`[探针] react 来自 ${probeBase}  版本 ${React.version}`);
}
if (!React || !ReactDOMServer) {
  console.error('[致命] 找不到可用的 react');
  process.exit(1);
}

const registrations = [];

const storage = new Map();
const localStorageStub = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
  clear: () => storage.clear(),
};

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

if (process.env.SEED_SETTINGS === '1') {
  storage.set('dsh-music-on:settings', process.env.SEED_SETTINGS);
  console.log('[探针] 已预填原始设置串：', process.env.SEED_SETTINGS);
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
  effect(fn) { try { const off = fn(); return typeof off === 'function' ? off : () => {}; } catch (error) { console.error('[effect 抛错]', error && error.message); return () => {}; } },
  sidebarRight: { openTab() {} },
  sidebarRightTabs: { register() { return () => {}; } },
};

const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
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
  fetch: () => Promise.reject(new Error('探针不联网')),
  localStorage: localStorageStub,
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.addEventListener = () => {};
sandbox.removeEventListener = () => {};

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

const section = registrations.find((r) => r.name === 'settings.section');
if (!section) {
  console.error('[致命] 没有注册 settings.section');
  process.exit(1);
}
console.log('注册的槽位：', registrations.map((r) => r.name).join(', '));

const injected = typeof section.entry.inject === 'function' ? section.entry.inject() : {};
const props = { ...(injected || {}), close: () => {} };

let html;
try {
  html = ReactDOMServer.renderToStaticMarkup(React.createElement(section.Comp, props));
} catch (error) {
  console.error('\n[致命] 真 React 渲染抛错：');
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
}

console.log(`\nHTML 长度 = ${html.length}`);
const checks = ['dmo-settings', 'dmo-settings-group', 'dmo-setting-row', 'dmo-lib', 'dmo-lib-row', 'dmo-lib-empty', 'dmo-lib-group'];
for (const c of checks) {
  console.log(`${html.includes(c) ? '✓' : '✗'} ${c}`);
}
console.log('\n--- 前 600 字符 ---');
console.log(html.slice(0, 600));

/* ---------------- 第二段：渲染右下角音乐库（收起态与展开态） ---------------- */

const dock = registrations.find((r) => r.name === 'shell.overlay');
if (!dock) {
  console.error('\n[致命] 没有注册 shell.overlay');
  process.exit(1);
}
const dockInjected = typeof dock.entry.inject === 'function' ? dock.entry.inject() : {};

/** 用真 React 渲染任意组件，返回 HTML 或抛错信息。 */
function renderToHtml(Component, props) {
  try {
    return { ok: true, html: ReactDOMServer.renderToStaticMarkup(React.createElement(Component, props || {})) };
  } catch (error) {
    return { ok: false, error };
  }
}

console.log('\n=========== 右下角音乐库 ===========');
const dockResult = renderToHtml(dock.Comp, dockInjected);
if (!dockResult.ok) {
  console.error('[致命] 音乐库渲染抛错：');
  console.error(dockResult.error && dockResult.error.stack ? dockResult.error.stack : String(dockResult.error));
  process.exit(1);
}
const dockHtml = dockResult.html;
console.log(`HTML 长度 = ${dockHtml.length}`);
for (const c of ['dmo-dock-stack', 'dmo-capsule', 'dmo-card', 'dmo-barspectrum', 'dmo-vinyl', 'canvas']) {
  console.log(`${dockHtml.includes(c) ? '✓' : '✗'} ${c}`);
}
console.log('\n--- 前 400 字符 ---');
console.log(dockHtml.slice(0, 400));

/* ---------------- 第三段：单独渲染 Spectrum，看它在各种设置下的输出 ---------------- */

const SpectrumComp = impl.__test && impl.__test.Spectrum;
console.log('\n=========== Spectrum 单独渲染 ===========');
if (typeof SpectrumComp !== 'function') {
  console.log('impl.__test.Spectrum 不存在，跳过');
} else {
  for (const style of ['bars', 'line', 'wave', 'off']) {
    for (const spectr of [true, false]) {
      const engineStub = {
        getAnalyser: () => (spectr ? { fftSize: 2048, frequencyBinCount: 1024, getByteFrequencyData() {}, getByteTimeDomainData() {} } : null),
        get spectrumAvailable() { return spectr; },
      };
      const out = renderToHtml(SpectrumComp, { engine: engineStub, settings: { spectrumStyle: style, spectrumBars: 48, spectrumFps: 60 } });
      const label = `style=${style.padEnd(5)} analyser=${spectr ? '有' : '无'}`;
      if (!out.ok) {
        console.log(`✗ ${label} 抛错 ${out.error && out.error.message}`);
      } else {
        const hasCanvas = out.html.includes('<canvas');
        console.log(`${hasCanvas ? '✓' : '✗'} ${label} html=${out.html.length} ${hasCanvas ? 'canvas' : out.html.slice(0, 120)}`);
      }
    }
  }
}
