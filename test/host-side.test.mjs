/**
 * dsh-music-on 宿主半边回归检查。
 *
 * 检查的是「插件能不能被宿主装起来」，不是业务逻辑（业务逻辑在
 * stream-api.test.mjs / resolve-api.test.mjs）。这一层挂掉的特征是：
 * 插件出现在列表里、日志无报错、但 /api 路由 404。
 *
 * 关键约束（每条都有本机实测依据，改动前先看注释里的出处）：
 *   1. 路由只能挂 `ctx.connection.fetch.register`。宿主把整个 "/api" 前缀
 *      挂在 dsh-client-connection 的 fetch 服务上（lib/index.js:1044-1058），
 *      exact route 还强制 principal.kind === "owner"（同文件 :822-836）。
 *   2. path 每段必须匹配 ENDPOINT_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/。
 *      所以路径里不能有中文、空格、斜杠以外的怪异字符。
 *   3. 宿主半边必须零第三方依赖：package.json 没有 dependencies，
 *      任何 import 了外部包的语句都会在 require 阶段直接炸。
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0;
const failures = [];
/**
 * @param {string} name 断言名。
 * @param {() => boolean} fn 返回 true 即通过。
 */
function check(name, fn) {
  try {
    if (fn()) {
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

console.log('[host-side] 检查开始');

/* ---------- 1. 包清单契约 ---------- */

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

check('package.json 无第三方 dependencies', () => {
  const deps = Object.keys(pkg.dependencies || {});
  if (deps.length) throw new Error(`宿主半边必须零依赖，实际有: ${deps.join(',')}`);
  return true;
});

check('dsh.bundle.patch 指向的文件存在', () => {
  const rel = pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch;
  if (!rel) throw new Error('package.json 缺 dsh.bundle.patch');
  if (!existsSync(resolve(root, rel))) throw new Error(`声明的 patch 文件不存在: ${rel}`);
  return true;
});

check('dsh.client 声明了 web 平台且立即加载', () => {
  const client = pkg.dsh && pkg.dsh.client;
  if (!client) throw new Error('缺 dsh.client');
  if (client.platform !== 'web') throw new Error(`platform=${client.platform}`);
  return client.immediately === true;
});

check('exports["./client"] 指向的文件存在', () => {
  const rel = pkg.exports && pkg.exports['./client'];
  if (!rel) throw new Error('缺 exports["./client"]');
  return existsSync(resolve(root, rel));
});

check('files 字段覆盖 client.js 与 src', () => {
  const files = pkg.files || [];
  return files.includes('client.js') && files.includes('src');
});

/* ---------- 2. cordis 装配契约 ---------- */

const host = await import(pathToFileURL(resolve(root, 'index.js')).href);

check('宿主入口可 import（ESM 无缺失相对依赖）', () => typeof host.apply === 'function');
check('导出 name 与包名一致', () => host.name === pkg.name);
check('inject 声明了 connection', () => Array.isArray(host.inject) && host.inject.includes('connection'));
check('default 导出带 name/apply', () => host.default && typeof host.default.apply === 'function');

/* ---------- 3. apply 干跑：三条路由都要挂上 ---------- */

/** connection.fetch 注册到的路由（resolve / stream）。 */
/** @type {Array<{path: string, methods: string[], requestBody: string}>} */
const routes = [];
/** webServer 注册到的路由（presets 静态资源），契约与上者不同。 */
/** @type {Array<{kind: string, path: string, handler: Function}>} */
const webRoutes = [];

const fakeCtx = {
  inject(_deps, cb) {
    cb(fakeCtx);
    return () => {};
  },
  effect(fn, _label) {
    const dispose = fn();
    return typeof dispose === 'function' ? dispose : () => {};
  },
  connection: {
    fetch: {
      register(route) {
        routes.push(route);
        return () => {};
      },
    },
  },
  // presets 走 webServer 而不是 connection.fetch：它要自己写 ServerResponse
  // 才能支持 Range（WAV 由 <audio> 拉取，Chrome 先发 Range: bytes=0-）。
  webServer: {
    register(route) {
      webRoutes.push(route);
      return () => {};
    },
  },
};

check('apply 在假 ctx 上执行不抛错', () => {
  host.apply(fakeCtx);
  return true;
});

check('connection.fetch 注册了且仅注册了两条路由', () => routes.length === 2);
check('webServer 注册了一条预置资源路由', () => webRoutes.length === 1);
check('预置路由是 prefix 且路径正确', () => {
  const [route] = webRoutes;
  if (route.kind !== 'prefix') throw new Error(`kind 应为 prefix，实际 ${route.kind}`);
  if (route.path !== '/api/dsh-music-on/presets') throw new Error(`路径错: ${route.path}`);
  return true;
});
check('预置路由带 handler 且是函数', () => typeof webRoutes[0].handler === 'function');
check('两条路由路径正确', () => {
  const want = ['/api/dsh-music-on/resolve', '/api/dsh-music-on/stream'];
  const got = routes.map((r) => r.path).sort();
  if (JSON.stringify(got) !== JSON.stringify([...want].sort())) {
    throw new Error(`实际: ${got.join(', ')}`);
  }
  return true;
});

check('路径每段匹配 ENDPOINT_SEGMENT_PATTERN', () => {
  const seg = /^[A-Za-z0-9_$.-]+$/;
  for (const r of routes) {
    for (const part of r.path.split('/').filter(Boolean)) {
      if (!seg.test(part)) throw new Error(`${r.path} 的段 "${part}" 不合规`);
    }
  }
  return true;
});

check('每条路由都带 fetch 处理函数', () => routes.every((r) => typeof r.fetch === 'function'));
check('requestBody 声明为 buffered（宿主默认值）', () => routes.every((r) => r.requestBody === 'buffered'));

/* ---------- 4. shared 常量与路由一致性 ---------- */

const shared = await import(pathToFileURL(resolve(root, 'src/shared.js')).href);

check('shared 的路径常量与实挂路径一致', () => {
  const got = routes.map((r) => r.path).sort();
  const want = [shared.RESOLVE_PATH, shared.STREAM_PATH].sort();
  return JSON.stringify(got) === JSON.stringify(want);
});

check('TAB_ID 与槽位 key 同源（同一常量导出）', () => shared.TAB_ID === 'dsh-music-on.music');

/* ---------- 汇总 ---------- */

console.log(`[host-side] ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exitCode = 1;
}
