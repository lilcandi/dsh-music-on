/**
 * dsh-music-on 浏览器半边的构建器。
 *
 * 为什么必须有这一步（不是工程洁癖，是宿主协议决定的）：
 *   `dsh-client-modules/lib/client.js:833-841` 的模块表 require 只认三种东西 ——
 *   平台种子词、已 materialize 的模块、已注册的 package factory。任意相对路径 /
 *   子路径都直接抛
 *     `require("x") missed the module table — not a platform seed word, …`
 *   而客户端 bundle 又是 `readFileSync` 原样投递、零转译（`lib/index.js:834`）。
 *   所以浏览器侧只能是一个把所有源码内联完毕的单文件 CJS 壳，宿主自带插件
 *   （如 dsh-client-ui-agent-preset/lib/client.js）正是这个形态。
 *
 * 本脚本做两件事：
 *   1) esbuild 把 `src/client/register.js`（含全部相对依赖与 .jsx）打成一个
 *      IIFE，`react` 保持 external（运行期从宿主模块表 require）。
 *   2) 把 IIFE 的返回值包进 `window.__ModuleLoader__.load({ id, factory })`，
 *      拼出最终 `client.js`。
 *
 * 产物直接写进插件根目录的 `client.js`，`files` 字段与 `exports["./client"]`
 * 都指向它 —— 构建产物即发布物，不存在「源码改了但忘记重新打包」的第二份真相。
 *
 * 用法：node scripts/build-client.mjs [--watch]
 */
import { build } from 'esbuild';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = resolve(root, 'src/client/register.js');
const OUTPUT = resolve(root, 'client.js');

/** 插件 id：必须与 package.json 的 dsh.client 图行 id 一致，否则 factory 挂错位置。 */
const PLUGIN_ID = 'dsh-music-on';

/**
 * 生成 CJS 壳。
 *
 * 有一条比「语法能不能过」更硬的约束决定了这里的结构：
 * esbuild 把 external 的 `import React from 'react'` 编译成模块作用域的
 *   var import_react = __toESM(__require("react"), 1);
 * 而 `__require` 的实现是 `typeof require !== "undefined" ? require : …抛错`。
 * 所以**内联体必须在 factory 被调用之后才求值** —— 那时 `require` 才是宿主
 * 模块表的那个函数；提前求值拿到的是打包器自带的 CJS shim，本包没有 react
 * 依赖，直接 `Dynamic require of "react" is not supported`。
 * 宿主自带插件（dsh-client-ui-agent-preset/lib/client.js:1553 附近）同样把
 * 全部初始化放在 factory 内。
 *
 * @param {string} body esbuild 打出的语句串（含 globalName 声明与 footer 赋值）。
 * @returns {string} 完整 client.js 文本。
 */
function shell(body) {
  return `/**
 * dsh-music-on 浏览器半边 bundle —— 本文件由 scripts/build-client.mjs 生成，请勿手改。
 *
 * 形态说明：宿主 dsh-client-modules 只做 readFileSync + 拼接，零转译；
 * 模块表 require 也不解析相对路径。因此客户端实现必须全部内联在这一个
 * 文件里，react 走宿主模块表（平台种子词），其余源码由 esbuild 内联。
 *
 * 手改本文件会在下次构建时被覆盖；改实现请改 src/client/**。
 */
(() => {
  if (typeof window === 'undefined' || !window.__ModuleLoader__) return;
  try {
    window.__ModuleLoader__.load({
      id: ${JSON.stringify(PLUGIN_ID)},
      factory: (require) => {
        var module$ = { exports: {} };
        var exported = module$.exports;
        Object.defineProperty(exported, Symbol.toStringTag, { value: 'Module' });

// ---- 内联实现开始（此处的 require 已是宿主模块表函数）----
${body}
// ---- 内联实现结束 ----

        var impl = globalThis.__dshMusicOnImpl__;
        try { delete globalThis.__dshMusicOnImpl__; } catch (_e) { globalThis.__dshMusicOnImpl__ = void 0; }
        if (!impl) throw new Error('[dsh-music-on] 内联实现未求值');

        // 组件树共用同一份 react 实例：桥接必须在挂载任何组件之前完成。
        if (typeof impl.setReactBridge === 'function') impl.setReactBridge(require('react'));

        Object.assign(exported, impl);
        exported.__test = Object.assign({}, impl.__test, { react: require('react') });
        return module$.exports;
      },
    });
  } catch (error) {
    console.warn('[dsh-music-on] client bundle 注册失败：', error);
  }
})();
`;
}

/** 执行一次构建。 */
async function run() {
  if (!existsSync(ENTRY)) throw new Error(`入口不存在：${ENTRY}`);

  const result = await build({
    entryPoints: [ENTRY],
    bundle: true,
    format: 'iife',
    // 关键：给 globalName 时 esbuild 会产出 `var X = (() => {…})();` 语句，
    // 直接嵌进 `var impl = (…)` 就是语法错误。改用 footer 把赋值挂成一条语句。
    globalName: '__dshMusicOnImpl__',
    footer: { js: 'globalThis.__dshMusicOnImpl__ = __dshMusicOnImpl__;' },
    platform: 'browser',
    target: ['es2022'],
    // react 必须留在模块表里：内联一份会和宿主渲染树里的 hook 实例对不上，
    // 表现为「invalid hook call」。
    external: ['react', 'react-dom', 'react/jsx-runtime'],
    loader: { '.jsx': 'jsx' },
    // 源码里刻意写成 h() 而不是 JSX，esbuild 只需原样转译，不开自动注入。
    jsx: 'transform',
    write: false,
    logLevel: 'silent',
    charset: 'utf8',
  });

  const body = result.outputFiles[0].text
    // esbuild 的 IIFE 尾部会带 sourceMappingURL 注释，去掉避免宿主二次拼装。
    .replace(/\/\/# sourceMappingURL=.*$/m, '')
    .trim();

  const text = shell(body);
  writeFileSync(OUTPUT, text, 'utf8');

  const kb = (Buffer.byteLength(text, 'utf8') / 1024).toFixed(1);
  console.log(`[build-client] ${OUTPUT}  ${kb} KB`);
  return text;
}

run().catch((error) => {
  console.error('[build-client] 失败：', error && error.message ? error.message : error);
  process.exitCode = 1;
});
