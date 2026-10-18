/**
 * 预置音景接入层的回归测试（无浏览器、无 jsdom）。
 *
 * 【为什么这里要做源码改写这一步】
 * Node 的原生 ESM 加载器不认 `.jsx` 后缀，直接 `import('…/PresetsSection.jsx')`
 * 会抛 `ERR_UNKNOWN_FILE_EXTENSION: Unknown file extension ".jsx"`。
 * 而本插件的组件文件刻意叫 `.jsx` 却写的是纯 createElement（客户端 bundle
 * 零转译，浏览器里没有 JSX 编译器）。两者叠起来的后果是：组件根本进不了
 * 任何 Node 测试。
 *
 * 破解办法沿用 `.verify-components.mjs` 早就踩出来的路子：
 * 把源码读成字符串，把 `import … from 'react'` 换成从注入的假 React 取值，
 * 把 `require('./X.jsx')` 的相对导入改写掉，落成一个临时 `.mjs` 再动态 import。
 * 临时文件用完即删，不污染仓库。
 *
 * 覆盖四组：
 *   1. 两侧路由前缀一致（漂移的症状是「所有音景 404」且无报错）。
 *   2. ensurePresets 单例语义（并发只建一次、失败降级 null、dispose 可重建）。
 *   3. PresetsSection 的 vdom 结构（加载态 / 分类渲染 / 无频谱标注）。
 *   4. 接线是否真的连上（面板传 presets、register 预热与释放）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* ------------------------------------------------------------------ */
/* 假 React：够用即可，不需要真 hook 调度                              */
/* ------------------------------------------------------------------ */

/**
 * 极简 React 替身。createElement 返回可断言的纯对象；hooks 返回稳定初值。
 * 组件在本测试里只被直接调用一次，不走 React 的调度器，所以 effect 不执行。
 */
const fakeReact = {
  createElement(type, props, ...children) {
    return { type, props: props || {}, children: children.flat(Infinity).filter((c) => c !== null && c !== undefined) };
  },
  Fragment: Symbol.for('react.fragment'),
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: () => undefined,
  useCallback: (fn) => fn,
  useMemo: (fn) => fn(),
  useRef: (value) => ({ current: value }),
};

/**
 * 把 .jsx 源码改成可在 Node 里动态 import 的 .mjs，求值后返回模块。
 *
 * 临时文件必须落在**本测试文件同目录**（test/），因为动态 import 用的是
 * `./xxx.mjs` 这样的相对说明符，它相对的是**本模块**的 URL，不是 cwd。
 * 这个临时文件在 finally 里删除，跑完不留痕。
 *
 * @param {string} relativePath 相对仓库根的源文件路径。
 * @returns {Promise<object>} 模块命名空间。
 */
async function loadComponent(relativePath) {
  const source = readFileSync(resolve(root, relativePath), 'utf8');
  const stem = relativePath.split('/').pop().replace(/\.jsx?$/, '');
  const tmpName = `.tmp-${stem}-${process.pid}-${Math.random().toString(36).slice(2, 8)}.mjs`;
  const tmpPath = resolve(root, 'test', tmpName);

  let code = source;
  // import React, { a, b } from 'react'  →  从注入的假 React 取值
  code = code.replace(
    /import\s+React\s*,\s*\{([^}]*)\}\s*from\s*'react';/,
    (m, names) => {
      const bindings = names
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean)
        .map((n) => `const ${n} = __fakeReact.${n};`)
        .join('\n');
      return `const React = __fakeReact;\n${bindings}`;
    },
  );
  code = code.replace(/import\s+React\s+from\s*'react';/, 'const React = __fakeReact;');
  // 其余顶层 import 对本测试无用（sources.js 里的 toEmbedUrl 等），整体抹掉。
  code = code.replace(/^import\s+[^;]*;\s*$/gm, '');
  code = `const __fakeReact = globalThis.__fakeReact;\n${code}`;

  writeFileSync(tmpPath, code, 'utf8');
  try {
    return await import(`./${tmpName}?v=${Date.now()}`);
  } finally {
    try {
      unlinkSync(tmpPath);
    } catch {
      /* 清理失败不影响断言 */
    }
  }
}

/** 把 vdom 树拍平成一个字符串，便于断言文案与类名。 */
function flatten(node) {
  return JSON.stringify(node, (key, value) => (typeof value === 'function' ? '[fn]' : value));
}

/**
 * 把树里所有「组件型节点」就地求值成它自己的 vdom。
 *
 * 为什么需要：`PresetsSection` 里写的是 `h(PresetChip, {...})`，没有 React
 * 调度器就不会被调用，产出的树里只有一个 `type` 是函数的壳，chip 的类名
 * （`dmo-chip` / `dmo-chip-off` / 「无频谱」标签）全在壳里面，直接 flatten
 * 只会看到 `"type":"[fn]"`，断言必然落空 —— 这不是产品 bug，是测试没往下走。
 *
 * 这里手动做一次浅求值：对 type 是函数的节点调用它并递归展开 children。
 * 只展开一层就够本测试用（chip 是叶子组件），但写成递归以便将来嵌套。
 *
 * @param {any} node vdom 节点。
 * @returns {any} 展开后的纯数据结构。
 */
function expand(node) {
  if (node === null || node === undefined || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(expand);
  // 组件节点：调用它，拿它返回的 vdom 再展开。
  if (typeof node.type === 'function') {
    const rendered = node.type({ ...node.props, children: node.children });
    return expand(rendered);
  }
  return {
    type: node.type,
    props: node.props,
    children: Array.isArray(node.children) ? node.children.map(expand) : [],
  };
}

/* ------------------------- 1. 路由前缀一致性 ------------------------- */

test('客户端 PRESETS_BASE 与宿主 PRESETS_PATH 指向同一处', () => {
  const clientSrc = readFileSync(resolve(root, 'src/client/ui/PresetsSection.jsx'), 'utf8');
  const hostSrc = readFileSync(resolve(root, 'src/host/presets-static.js'), 'utf8');
  const sharedSrc = readFileSync(resolve(root, 'src/shared.js'), 'utf8');

  const clientBase = /export const PRESETS_BASE = '([^']+)'/.exec(clientSrc);
  const hostPath = /export const PRESETS_PATH = '([^']+)'/.exec(hostSrc);
  assert.ok(clientBase, 'PresetsSection.jsx 必须导出具名字面量 PRESETS_BASE');
  assert.ok(hostPath, 'presets-static.js 必须导出具名字面量 PRESETS_PATH');

  assert.equal(clientBase[1].replace(/\/$/, ''), hostPath[1], '两侧前缀漂移了，音景会全部 404');
  assert.ok(clientBase[1].endsWith('/'), 'PRESETS_BASE 必须以斜杠结尾，否则 URL 解析会吃掉最后一段');

  const sharedPath = /export const PRESETS_PATH = `\$\{API_PREFIX\}\/([a-z-]+)`/.exec(sharedSrc);
  assert.ok(sharedPath, 'shared.js 必须定义 PRESETS_PATH');
  assert.equal(`/api/dsh-music-on/${sharedPath[1]}`, hostPath[1], 'shared.js 与 presets-static.js 不一致');
});

test('真实磁盘布局与路由拼接对得上', () => {
  // 路由 /api/dsh-music-on/presets 映射到包内 presets/ 目录
  assert.ok(existsSync(resolve(root, 'presets/manifest.json')), '清单必须在包内 presets/ 下');
  const manifest = JSON.parse(readFileSync(resolve(root, 'presets/manifest.json'), 'utf8'));
  for (const item of manifest.items) {
    if (item.source !== 'embedded') continue;
    // item.url 形如 presets/xxx.wav，去掉前缀后应是 presets/ 下的真实文件
    const name = item.url.replace(/^presets\//, '');
    assert.ok(existsSync(resolve(root, 'presets', name)), `${item.id} 指向的文件不存在`);
  }
});

/* ------------------------- 2. ensurePresets 单例 ------------------------- */

test('ensurePresets：并发调用收敛到同一个 promise', async () => {
  globalThis.window = {};
  const boot = await import('../src/client/presets-boot.js');
  boot.disposePresets();
  const [a, b] = await Promise.all([boot.ensurePresets({}), boot.ensurePresets({})]);
  assert.equal(a, b, '两次并发必须拿到同一个结果');
});

test('ensurePresets：初始化失败降级为 null，不把异常抛给调用方', async () => {
  globalThis.window = {};
  const boot = await import('../src/client/presets-boot.js');
  boot.disposePresets();
  // 无 fetch / 无 location，createPresets 必然失败；音景是附加能力，
  // 失败不能让整个音乐台白屏。
  const result = await boot.ensurePresets({});
  assert.equal(result, null);
});

test('ensurePresets：dispose 清掉单例后可重建', async () => {
  globalThis.window = {};
  const boot = await import('../src/client/presets-boot.js');
  boot.disposePresets();
  await boot.ensurePresets({});
  boot.disposePresets();
  assert.equal(boot.getPresetsSync(), null, 'dispose 必须清掉单例');
  await boot.ensurePresets({}); // 重建不抛
});

test('ensurePresets：没有 window 时安全返回 null', async () => {
  const saved = globalThis.window;
  delete globalThis.window;
  try {
    const boot = await import('../src/client/presets-boot.js');
    assert.equal(await boot.ensurePresets({}), null);
    assert.equal(boot.getPresetsSync(), null);
    boot.disposePresets(); // 不应抛
  } finally {
    globalThis.window = saved;
  }
});

/* ------------------------- 3. PresetsSection 渲染 ------------------------- */

test('PresetsSection：无 controller 时渲染加载态而不是抛错', async () => {
  globalThis.window = {};
  globalThis.__fakeReact = fakeReact;
  const mod = await loadComponent('src/client/ui/PresetsSection.jsx');
  const element = mod.PresetsSection({ presets: null });
  assert.ok(element, '必须返回元素');
  assert.equal(element.type, 'section');
  assert.match(String(element.props.className), /dmo-presets/);
  assert.match(flatten(element), /加载中/, '要明确告诉用户是在加载，不是坏了');
});

test('PresetsSection：按分类渲染条目并统计未就绪数', async () => {
  globalThis.window = {};
  globalThis.__fakeReact = fakeReact;
  const mod = await loadComponent('src/client/ui/PresetsSection.jsx');
  const item = (id, category, extra = {}) => ({
    id,
    name: id,
    category,
    source: 'embedded',
    status: 'ready',
    playable: true,
    spectrumAvailable: true,
    ...extra,
  });
  const controller = {
    categories: () => [
      {
        id: 'rain',
        name: '雨声',
        items: [item('rain', 'rain')],
        counts: { ready: 1, needsConfig: 0, unavailable: 0 },
      },
      {
        id: 'jazz',
        name: '爵士',
        items: [item('jazz', 'jazz'), item('jazz-bili', 'jazz', { source: 'bilibili-embed', status: 'needs-config', playable: false, spectrumAvailable: false })],
        counts: { ready: 1, needsConfig: 1, unavailable: 0 },
      },
    ],
    unavailableReport: () => [{ id: 'jazz-bili', name: 'jazz-bili', reason: '未配置 bvid', hint: '填 bvid' }],
    onChange: () => () => {},
    play: async () => ({ mode: 'audio' }),
  };
  const tree = flatten(expand(mod.PresetsSection({ presets: controller })));
  assert.match(tree, /rain/);
  assert.match(tree, /jazz/);
  assert.match(tree, /1 项未就绪/, '未就绪计数必须出现在头部');
  assert.match(tree, /dmo-chip/, '条目应渲染成 chip 按钮');
});

test('PresetsSection：bilibili-embed 条目明示「无频谱」', async () => {
  globalThis.window = {};
  globalThis.__fakeReact = fakeReact;
  const mod = await loadComponent('src/client/ui/PresetsSection.jsx');
  const controller = {
    categories: () => [
      {
        id: 'jazz',
        name: '爵士',
        items: [
          {
            id: 'jazz-lofi-mix-bili',
            name: '爵士 Lo-Fi',
            category: 'jazz',
            source: 'bilibili-embed',
            status: 'ready',
            playable: true,
            spectrumAvailable: false,
          },
        ],
        counts: { ready: 1, needsConfig: 0, unavailable: 0 },
      },
    ],
    unavailableReport: () => [],
    onChange: () => () => {},
    play: async () => ({ mode: 'iframe' }),
  };
  const tree = flatten(expand(mod.PresetsSection({ presets: controller })));
  assert.match(tree, /无频谱/, 'iframe 拿不到音频样本，必须明示而不是假装有');
});

test('PresetsSection：不可就绪条目被禁用且带原因', async () => {
  globalThis.window = {};
  globalThis.__fakeReact = fakeReact;
  const mod = await loadComponent('src/client/ui/PresetsSection.jsx');
  const controller = {
    categories: () => [
      {
        id: 'jazz',
        name: '爵士',
        items: [
          {
            id: 'needs-bvid',
            name: '待配置',
            category: 'jazz',
            source: 'bilibili-embed',
            status: 'needs-config',
            playable: false,
            unavailableReason: '需填 bvid',
          },
        ],
        counts: { ready: 0, needsConfig: 1, unavailable: 0 },
      },
    ],
    unavailableReport: () => [{ id: 'needs-bvid', name: '待配置', reason: '需填 bvid' }],
    onChange: () => () => {},
    play: async () => ({ mode: 'iframe' }),
  };
  const tree = flatten(expand(mod.PresetsSection({ presets: controller })));
  assert.match(tree, /dmo-chip-off/, '不可用条目应有独立视觉态');
  assert.match(tree, /bvid/, 'title 里要写清楚缺什么，不能只变灰');
});

/* ------------------------- 4. 接线是否连上 ------------------------- */

test('PlayerPanel 导入并向下传 presets', () => {
  const src = readFileSync(resolve(root, 'src/client/ui/PlayerPanel.jsx'), 'utf8');
  assert.match(src, /from '\.\/PresetsSection\.jsx'/, '必须导入音景分区');
  assert.match(src, /props\.presets/, '必须从 props 取 presets');
  assert.match(src, /h\(PresetsSection, \{ presets/, '必须把 presets 传给分区组件');
});

test('register.js 在座位上创建、预热并在卸载时释放 presets', () => {
  const src = readFileSync(resolve(root, 'src/client/register.js'), 'utf8');
  assert.match(src, /from '\.\/presets-boot\.js'/, '必须引入 presets-boot');
  assert.match(src, /ensurePresets\(/, 'apply 里必须预热清单');
  assert.match(src, /disposePresets\(\)/, '卸载路径必须释放缓存与引擎');
  // 座位改用 createElement 形态后，断言要对准真实调用，而不是旧的 create() 写法。
  assert.match(
    src,
    /createElement\(PlayerPanel, \{ engine, settings, presets, t \}\)/,
    '侧边栏座位必须把 presets 传给面板',
  );
  assert.match(src, /useStateSafe/, 'presets 的异步落地必须走安全的 hook 包装');
});

test('右下角音乐库挂在 shell.overlay 且不占用侧边栏槽位', () => {
  const src = readFileSync(resolve(root, 'src/client/register.js'), 'utf8');
  assert.match(src, /OVERLAY_SLOT = 'shell\.overlay'/, '主入口槽位必须是 shell.overlay');
  assert.match(src, /registerShellDock\(ctx, deps\)/, 'apply 必须调用 registerShellDock');
  assert.match(src, /createShellDock\(/, '必须引入右下角音乐库组件');
  // 关键回归点：一旦有人把主入口改回右侧栏，这条会立刻红。
  assert.match(
    src,
    /inject = \['slots', 'locale', 'sidebarRight', 'sidebarRightTabs'\]/,
    'inject 不得声明不存在的 shell 服务，否则宿主 boot 永久 pending',
  );
  assert.doesNotMatch(
    src,
    /inject = \[[^\]]*'shell'/,
    "inject 里不允许出现 'shell'：它不是 cordis 服务，只会让插件 pending",
  );
});

test('PresetsSection 用显式 baseUrl 而非默认 ./', () => {
  const src = readFileSync(resolve(root, 'src/client/presets-boot.js'), 'utf8');
  assert.match(src, /baseUrl: PRESETS_BASE/, '必须显式传宿主路由前缀');
  assert.doesNotMatch(src, /baseUrl: '\.\/'/, '默认 ./ 在深层路径下会 404');
});
