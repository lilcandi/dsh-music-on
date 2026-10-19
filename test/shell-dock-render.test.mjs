/**
 * ShellDock 渲染期回归。
 *
 * 存在理由（真实事故）：`useCallback` 的依赖数组在**渲染期**就被读取。
 * 一次改动把 `autoFiles` 写进了 addFiles 的依赖，而它的声明在下方 200 行处，
 * 于是每次渲染都抛 `ReferenceError: Cannot access 'autoFiles' before initialization`。
 * React 把整棵子树卸载 —— 右下角什么都不显示，而：
 *   - 服务端路由 200（证明宿主半边正常）
 *   - bundle 里有 dmo-capsule 字面量（证明构建正常）
 *   - 安装自检 13 项全过（证明文件对）
 * 三套证据全部指向「没问题」。所以这条链必须有一条断言直接跑组件体。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SRC = path.join(ROOT, 'src/client/ui/ShellDock.js');

test('胶囊里的按钮不能互相嵌套（点频谱却展开卡片就是这来的）', () => {
  const source = fs.readFileSync(SRC, 'utf8');
  // 只截到「收起态」这一段：从 collapsed 分支开始到展开态之前
  const start = source.indexOf("if (collapsed) {");
  assert.ok(start > 0, '找不到收起态分支');
  const end = source.indexOf("// ---- 展开态", start);
  const block = source.slice(start, end > start ? end : start + 4000);

  // 数一数这一段里出现了几种按钮开启标签
  const opens = block.match(/h\('(button|span|div)', \{[^}]*className: '(dmo-capsule|dmo-capsule-main|dmo-capsule-spectrum|dmo-capsule-btn)'/g) || [];
  assert.ok(opens.length >= 3, `收起态至少有胶囊容器 + 展开键 + 频谱键 + 播放键，实际识别 ${opens.length} 个`);

  // 真正的判据：dmo-capsule-main 的 button 必须自闭合到「曲名 span 结束」为止，
  // 其后出现的 dmo-capsule-spectrum 不能处于它内部。用出现顺序做粗判 —
  // 频谱键必须排在胶囊正文按钮的闭合之后。
  const mainAt = block.indexOf("className: 'dmo-capsule-main'");
  const spectrumAt = block.indexOf("className: 'dmo-capsule-spectrum'");
  assert.ok(mainAt > 0 && spectrumAt > mainAt, '频谱键必须在展开键之后声明');

  // 关键结构断言：dmo-capsule 这一层是 div，不是 button。
  // 只要它是 div，内部多个 button 就是合法的兄弟关系。
  const capsuleOpen = block.slice(0, mainAt);
  assert.ok(/h\('div', \{ className: 'dmo-capsule' \}/.test(capsuleOpen),
    '胶囊容器必须是 div；写成 button 会让 HTML 把内层按钮拆出去，点击落回外层');

  // 收起态必须有可见的提示位，否则切频谱在折叠态没有任何反馈
  assert.ok(block.includes('dmo-capsule-note'), '收起态必须有 note 提示位');
});

test('外部播放器必须有属于本插件的关闭出口', () => {
  const source = fs.readFileSync(SRC, 'utf8');
  assert.ok(source.includes("className: 'dmo-embed-close'"), 'iframe 上必须有 ✕ 关闭按钮');
  assert.ok(source.includes('embedDismissed'), '必须有收起状态变量');
  assert.ok(source.includes('closeEmbed'), '必须有关闭处理函数');
  // 关闭后不能再按 embedUrl 无脑渲染，否则点了没反应
  assert.ok(/surface\.external && !embedDismissed/.test(source),
    '渲染条件必须带上 !embedDismissed');
});

/**
 * 音景功能已整体移除（用户 m07999：「删除『音景』功能区」）。
 *
 * 这条断言锁的是「删干净」，而不是「删过」。半个删除最糟：残留的
 * playSoundscape / 清单拉取 effect 会继续发一次 `/presets/manifest.json` 请求，
 * 界面上却没有入口 —— 用户看到的是一个只在网络面板里存在的功能。
 */
test('卡片里不再有音景功能区，且不留下半截清单拉取', () => {
  const source = fs.readFileSync(SRC, 'utf8');

  for (const dead of [
    "className: 'dmo-soundscapes'",
    'playSoundscape',
    'soundscapeOpen',
    "'data-preset-id'",
  ]) {
    assert.equal(source.includes(dead), false, `ShellDock.js 仍残留 ${dead}`);
  }
  assert.equal(source.includes('manifest.json'), false,
    '清单拉取 effect 必须一并删掉，否则会继续发一次没人用的请求');
  assert.equal(/\bsoundscapes\b/.test(source), false, '不得残留 soundscapes 状态');
});

test('音景相关的样式与文案也要一并清掉', () => {
  const styles = fs.readFileSync(path.join(ROOT, 'src/client/styles.js'), 'utf8');
  assert.equal(styles.includes('.dmo-soundscapes'), false, 'styles.js 仍残留 .dmo-soundscapes');

  const locale = fs.readFileSync(path.join(ROOT, 'src/client/locale.js'), 'utf8');
  for (const key of ['dock.soundscapes', 'dock.soundscapeHint', 'dock.soundscapeOn']) {
    assert.equal(locale.includes(`'${key}'`), false, `locale.js 仍残留 ${key}`);
  }
  assert.equal(locale.includes('预置音景'), false, 'locale.js 仍残留「预置音景」文案');
});

/**
 * 音景不只是界面层，库里曾整套躺着播放器（控制器 / boot / 分区组件 / 静态路由）。
 * 只删界面会留下「死模块 + 死路由 + 死资源」：体积照旧、自检照旧、还多发请求。
 * 下面按模块逐个锁死，任何一块被加回来都会立刻红。
 */
test('音景的源码模块与资源目录都已不存在', () => {
  const gone = [
    'src/client/presets.js',
    'src/client/presets-boot.js',
    'src/client/ui/PresetsSection.jsx',
    'src/host/presets-static.js',
    'presets',
  ];
  for (const rel of gone) {
    assert.equal(fs.existsSync(path.join(ROOT, rel)), false, `${rel} 仍存在`);
  }
});

test('sources.js / engine.js 不再导出音景构造函数与路由判断', () => {
  const sources = fs.readFileSync(path.join(ROOT, 'src/client/sources.js'), 'utf8');
  for (const dead of ['createPresetTrack', 'resolvePresetRoute', 'tracksFromManifest', 'presetId', 'presetMode']) {
    assert.equal(sources.includes(dead), false, `sources.js 仍残留 ${dead}`);
  }

  const engine = fs.readFileSync(path.join(ROOT, 'src/client/engine.js'), 'utf8');
  for (const dead of ['addPresetPlay', 'addManifest', 'createPresetTrack', 'resolvePresetRoute']) {
    assert.equal(engine.includes(dead), false, `engine.js 仍残留 ${dead}`);
  }
});

test('register.js / index.js 不再接线音景', () => {
  const register = fs.readFileSync(path.join(ROOT, 'src/client/register.js'), 'utf8');
  for (const dead of ['presets-boot', 'ensurePresets', 'disposePresets', 'getPresetsSync']) {
    assert.equal(register.includes(dead), false, `register.js 仍残留 ${dead}`);
  }

  const host = fs.readFileSync(path.join(ROOT, 'src/index.js'), 'utf8');
  assert.equal(host.includes('presets-static'), false, 'index.js 仍 import 音景静态路由');
  assert.equal(host.includes('registerPresetsRoute'), false, 'index.js 仍注册音景路由');
  assert.equal(host.includes('PRESETS_PATH'), false, 'index.js 仍引用 PRESETS_PATH');
  // 音景是唯一需要 webServer 的地方，它退场后 webServer 依赖也必须退场，
  // 否则宿主会一直等一个本插件根本用不到的服务。
  // 断言真实的 inject 声明而不是全文出现次数 —— 文件顶部的注释记录了这段历史，
  // 全文搜索会把注释误判成残留（第一次就踩了这个）。
  assert.equal(/export const inject = \[[^\]]*webServer/.test(host), false,
    'index.js 的 inject 仍声明 webServer');
});

test('shared.js 不再导出 PRESETS_PATH', () => {
  const shared = fs.readFileSync(path.join(ROOT, 'src/shared.js'), 'utf8');
  assert.equal(shared.includes('PRESETS_PATH'), false, 'shared.js 仍残留 PRESETS_PATH');
});

test('设置页不再有只服务于音景的缓存项', () => {
  const settings = fs.readFileSync(path.join(ROOT, 'src/client/settings.js'), 'utf8');
  for (const dead of ['cacheLimitMB', 'CACHE_LIMIT_MIN_MB', 'CACHE_LIMIT_MAX_MB', 'proxyEnabled']) {
    assert.equal(settings.includes(dead), false, `settings.js 仍残留 ${dead}`);
  }

  const ui = fs.readFileSync(path.join(ROOT, 'src/client/ui/Settings.jsx'), 'utf8');
  for (const dead of ['cacheLimitMB', 'proxyEnabled', 'measureCache', 'clearCache', '音景播放器']) {
    assert.equal(ui.includes(dead), false, `Settings.jsx 仍残留 ${dead}`);
  }
});

test('ShellDock.js 里没有 useCallback 依赖的前向引用', () => {
  const lines = fs.readFileSync(SRC, 'utf8').split('\n');
  const declLine = new Map();
  lines.forEach((line, index) => {
    const match = line.match(/^\s{4}const ([A-Za-z_$][\w$]*) = /);
    if (match && !declLine.has(match[1])) declLine.set(match[1], index + 1);
  });
  const offenders = [];
  lines.forEach((line, index) => {
    const match = line.match(/\}, \[([^\]]*)\]\);/);
    if (!match) return;
    for (const raw of match[1].split(',')) {
      const name = raw.trim();
      if (!name) continue;
      const declaredAt = declLine.get(name);
      if (declaredAt !== undefined && declaredAt > index + 1) {
        offenders.push(`${name} 在第 ${index + 1} 行被依赖，却声明在第 ${declaredAt} 行`);
      }
    }
  });
  assert.deepEqual(offenders, []);
});

test('关键派生值在第一个 useCallback 之前声明', () => {
  const source = fs.readFileSync(SRC, 'utf8');
  const firstCallback = source.indexOf('const guard = useCallback(');
  assert.ok(firstCallback > 0, '找不到 guard 的定义');
  for (const name of ['autoLinks', 'autoFiles', 'spectrumCfg', 'dockSize', 'showTitles']) {
    const at = source.indexOf(`const ${name} =`);
    assert.ok(at > 0, `找不到 const ${name}`);
    assert.ok(at < firstCallback, `${name} 必须声明在第一个 useCallback 之前`);
  }
});

test('组件体能真渲染出 dmo-dock 根节点（不是空树）', async () => {
  const hooks = { i: 0, state: [] };
  const React = {
    createElement: (type, props, ...children) => ({ $$el: true, type, props: { ...(props || {}), children } }),
    useState: (initial) => {
      const at = hooks.i++;
      if (!(at in hooks.state)) hooks.state[at] = typeof initial === 'function' ? initial() : initial;
      return [hooks.state[at], () => {}];
    },
    useEffect: () => {},
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
    useRef: (initial) => {
      const at = hooks.i++;
      hooks.state[at] = hooks.state[at] || { current: initial };
      return hooks.state[at];
    },
  };

  const storage = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
    },
    setTimeout: () => 0,
    clearTimeout: () => {},
  };

  const { createShellDock } = await import('../src/client/ui/ShellDock.js');
  const engine = {
    getState: () => ({}),
    getQueue: () => [],
    onStateChange: () => () => {},
    onTrackChange: () => () => {},
    onQueueChange: () => () => {},
    onError: () => () => {},
    toggle: async () => {},
  };
  const store = { get: () => ({ volume: 0.8, startCollapsed: true }), subscribe: () => () => {}, patch: () => {} };
  const t = (key, fallback) => (typeof fallback === 'string' ? fallback : key);

  const Dock = createShellDock({ React, engine, store, t, Spectrum: null });
  hooks.i = 0;
  const element = Dock({});
  const className = element && element.props && element.props.className;
  assert.equal(typeof className, 'string', '首渲染根节点必须有 className');
  assert.ok(className.includes('dmo-dock'), `根节点类名不含 dmo-dock：${className}`);

  // 展开态：换一个全新的组件实例，用「启动即展开」的设置渲染。
  // 不能复用同一个 Dock —— 它的 useState 初值在首帧就被冻结了。
  // 注意：hooks.i 必须保留累加值，不能归零。假 useState 的状态槽按调用序号
  // 复用，归零会让上一个实例的槽位（collapsed=true）串到新实例上，
  // 测出来的就是假失败。
  const storage2 = new Map();
  globalThis.window.localStorage = {
    getItem: (k) => (storage2.has(k) ? storage2.get(k) : null),
    setItem: (k, v) => storage2.set(k, String(v)),
  };
  const DockExpanded = createShellDock({
    React,
    engine,
    store: { get: () => ({ volume: 0.8, startCollapsed: false }), subscribe: () => () => {}, patch: () => {} },
    t,
    Spectrum: null,
  });
  const expanded = DockExpanded({});
  const expandedClass = expanded && expanded.props && expanded.props.className;
  // 根节点是隔离层 .dmo-dock-stack（频谱的负 z-index 需要它提供层叠上下文），
  // 卡片是第一个子节点。两条都断言：外层丢了等于没建隔离层，
  // 内层丢了等于展开后一片空白。
  assert.ok(String(expandedClass).includes('dmo-dock-stack'), `展开态根节点不对：${expandedClass}`);
  const kids = (expanded && expanded.props && expanded.props.children) || [];
  const panel = Array.isArray(kids) ? kids[0] : kids;
  const panelClass = panel && panel.props && panel.props.className;
  assert.ok(String(panelClass).includes('dmo-dock--expanded'), `展开态面板类名不对：${panelClass}`);
});

test('hidden 标记为真时退化为召唤按钮而非空白', async () => {
  const hooks = { i: 0, state: [] };
  const React = {
    createElement: (type, props, ...children) => ({ $$el: true, type, props: { ...(props || {}), children } }),
    useState: (initial) => {
      const at = hooks.i++;
      if (!(at in hooks.state)) hooks.state[at] = typeof initial === 'function' ? initial() : initial;
      return [hooks.state[at], () => {}];
    },
    useEffect: () => {},
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
    useRef: (initial) => {
      const at = hooks.i++;
      hooks.state[at] = hooks.state[at] || { current: initial };
      return hooks.state[at];
    },
  };
  const storage = new Map([['dsh-music-on:dock.hidden', '1']]);
  globalThis.window = {
    localStorage: { getItem: (k) => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)) },
    setTimeout: () => 0,
    clearTimeout: () => {},
  };
  const { createShellDock } = await import('../src/client/ui/ShellDock.js');
  const engine = { getState: () => ({}), getQueue: () => [], onStateChange: () => () => {} };
  const Dock = createShellDock({
    React,
    engine,
    store: { get: () => ({}) },
    t: (k, f) => (typeof f === 'string' ? f : k),
    Spectrum: null,
  });
  hooks.i = 0;
  const element = Dock({});
  // hidden 态现在包在定位层里（.dmo-dock-stack），召唤按钮是它的子节点。
  // 频谱是常驻装饰，所以这里同时断言它没有被丢掉。
  assert.equal(element.type, 'div');
  assert.ok(String(element.props.className).includes('dmo-dock-stack'), '隐藏态也必须经过定位层');
  const revive = (element.props.children || []).find(
    (child) => child && String((child.props || {}).className || '').includes('dmo-dock-revive'),
  );
  assert.ok(revive, 'hidden 标记为真时必须渲染召唤按钮，不能是一片空白');
  assert.equal(revive.type, 'button');
});

/*
 * 状态归一化是「在播却显示未播放、进度条不动」的唯一防线。
 *
 * 引擎给的是 status='playing' / currentTime / currentTrack，UI 早期读的是
 * playing / position / track —— 三个字段全部落空，布尔恒 undefined、时间恒 0。
 * 这里直接把 normalizeState 的契约钉死：任何一侧改名都必须经过它。
 */
test('normalizeState：引擎字段映射成 UI 字段，且在播态可判', async () => {
  const mod = await import('../src/client/ui/ShellDock.js');
  const { normalizeState } = mod.__test;
  assert.equal(typeof normalizeState, 'function', 'ShellDock 必须导出 __test.normalizeState');

  const playing = normalizeState({
    status: 'playing',
    currentTime: 42.5,
    duration: 200,
    currentTrack: { id: 't1', title: 'X', duration: 200 },
  });
  assert.equal(playing.playing, true, 'status=playing 必须映射成 playing=true');
  assert.equal(playing.position, 42.5);
  assert.equal(playing.currentTime, 42.5);
  assert.equal(playing.duration, 200);
  assert.equal(playing.track.id, 't1');

  const paused = normalizeState({ status: 'paused', currentTime: 10, currentTrack: { id: 't1' } });
  assert.equal(paused.playing, false);

  // 空快照绝不能抛：胶囊首帧 getState() 可能返回 {}。
  const empty = normalizeState({});
  assert.equal(empty.playing, false);
  assert.equal(empty.track, null);
  assert.equal(Number.isFinite(empty.position), true);

  // 外部播放器（B站 embed）的假时长必须被压成 NaN，不许透到进度条。
  const external = normalizeState({
    status: 'playing',
    mode: 'external',
    duration: 10865,
    currentTrack: { id: 'b1', duration: 10865 },
  });
  assert.ok(Number.isNaN(external.duration), 'external 态的 duration 必须是 NaN');
});

test('normalizeState：track 为 null 时不崩（模拟器实测过的坑）', async () => {
  const mod = await import('../src/client/ui/ShellDock.js');
  const { normalizeState } = mod.__test;
  assert.doesNotThrow(() => normalizeState({ status: 'idle', currentTrack: null }));
  assert.doesNotThrow(() => normalizeState({ duration: 12, track: null }));
});

test('队列形状两种都吃：数组与 {items}', async () => {
  const source = fs.readFileSync(SRC, 'utf8');
  // getQueue() 返回数组，onQueueChange 推 {items}。两条路径形状不同，
  // 少认一种就会让播放列表恒空。
  assert.ok(/Array\.isArray\(next\)/.test(source), '必须兼容 onQueueChange 推数组');
  assert.ok(/next\.items/.test(source), '必须兼容 onQueueChange 推 {items}');
  assert.ok(source.includes("engine.onTimeUpdate"), '必须订阅 onTimeUpdate，否则进度条不动');
});

test('播放列表行不能是 button 套 button', () => {
  const source = fs.readFileSync(SRC, 'utf8');
  const anchor = source.indexOf('dmo-queue-row');
  assert.ok(anchor > 0, '找不到队列行声明');
  // 向前找这一行所属的 h(...) 调用，确认是 div 而不是 button。
  // 行内含删除按钮，button 嵌套 button 在 HTML 里非法，浏览器会把内层拆出去，
  // 点删除会误触发播放。
  const before = source.slice(Math.max(0, anchor - 80), anchor);
  assert.ok(before.includes("h('div', {"),
    `队列行必须是 div，实际前置：${JSON.stringify(before.slice(-50))}`);
  assert.ok(source.includes('dmo-queue-del'), '必须有逐条移除按钮');
  assert.ok(source.includes('dmo-queue-head'), '必须有播放列表表头');
});

test('拖完落手的那次 click 必须被吃掉（否则一拖就把卡片拖开了）', () => {
  const source = fs.readFileSync(SRC, 'utf8');
  // 收起态整枚胶囊都是拖动面，里面却嵌着展开键与频谱键。用户拖完松手时，
  // 只要指针还停在按钮上，浏览器就会照常合成一次 click 派给那个按钮。
  // 这是原生合成行为，不是 React 逻辑，模拟器测不到，只能靠结构断言守住。
  assert.ok(source.includes('suppressClickRef'), '必须有「抑制下一次点击」的标志位');
  assert.ok(source.includes('onClickCapture: swallowClickAfterDrag'),
    '抑制钩子必须挂在捕获阶段，才能一次拦住所有子按钮');

  // 两态都要挂：收起态的拖动面是整枚胶囊，展开态的拖动面是卡片顶部的黑胶舞台，
  // 而卡片里全是按钮。只挂一处，另一态的拖动就会顺手触发某个按钮。
  const hits = source.match(/onClickCapture: swallowClickAfterDrag/g) || [];
  assert.ok(hits.length >= 2,
    `收起态与展开态都必须挂抑制器，实际挂了 ${hits.length} 处`);
  assert.ok(source.includes('swallowClickAfterDrag'), '必须有对应处理函数');

  // 标志位只能在「真拖动过」时置起，不能按下就置，否则普通点击会被吞。
  const stepAt = source.indexOf('const stepDrag = useCallback');
  const setAt = source.indexOf('suppressClickRef.current = true');
  assert.ok(stepAt > 0 && setAt > stepAt, '标志位必须写在 stepDrag 内（越过死区之后）');

  // 必须有一次兜底复位：指针拖离胶囊时那次 click 不会派发到这里，
  // 标志位会残留，把用户下一次真心点击一起吞掉。
  assert.ok(/setTimeout\(\(\) => \{ suppressClickRef\.current = false; \}, 0\)/.test(source),
    '必须有 0ms 兜底复位，避免标志位残留');

  // 抑制器必须真的拦下事件，只是读标志位不改状态没有意义。
  const swallowAt = source.indexOf('const swallowClickAfterDrag');
  const body = source.slice(swallowAt, swallowAt + 400);
  assert.ok(body.includes('preventDefault') && body.includes('stopPropagation'),
    '抑制器必须同时 preventDefault 与 stopPropagation');
});

test('拖动起点取的是定位盒而不是内层面板', () => {
  const source = fs.readFileSync(SRC, 'utf8');
  // 内层 .dmo-dock 被 CSS 降级为 position:relative，对它读 getBoundingClientRect
  // 得到的虽是屏幕坐标，但写回 left/top 时解释基准不同，盒子会越拖越偏。
  const startAt = source.indexOf('const onDragStart = useCallback');
  const body = source.slice(startAt, startAt + 400);
  assert.ok(/stackRef\.current \|\| panelRef\.current/.test(body),
    '取 rect 必须优先用 stackRef（真正承载 absolute 定位的那只盒子）');
});

test('旋钮拖动必须走 window 通道（只看 onPointerMove 会在指针移出 30px 时断掉）', () => {
  const source = fs.readFileSync(SRC, 'utf8');
  const downAt = source.indexOf('const onKnobDown = useCallback');
  assert.ok(downAt > 0, '找不到 onKnobDown');
  const body = source.slice(downAt, downAt + 1200);
  // 这是胶囊拖动踩过的同一个坑：元素太小时 pointermove 一离开就不再派发。
  assert.ok(body.includes("window.addEventListener('pointermove'"),
    '旋钮按下时必须把 pointermove 挂到 window，否则指针一移出旋钮拖动就断');
  assert.ok(body.includes("window.addEventListener('pointerup'"),
    '旋钮按下时必须把 pointerup 挂到 window，否则松手后旋钮会卡在拖动态');
  // 配套：卸载与落手都要摘监听，否则整页残留吃 pointermove 的幽灵。
  assert.ok(/detachKnobListeners/.test(source), '必须有 detachKnobListeners 负责摘监听');
  const upAt = source.indexOf('const onKnobUp = useCallback');
  const upBody = source.slice(upAt, upAt + 500);
  assert.ok(upBody.includes('detachKnobListeners()'), '落手必须摘掉 window 监听');
});

test('滚轮调音量必须手挂非 passive 监听（React onWheel 拦不住卡片滚动）', () => {
  const source = fs.readFileSync(SRC, 'utf8');
  assert.ok(source.includes("addEventListener('wheel', onWheel, { passive: false })"),
    '滚轮调音量必须 passive:false 手挂，否则音量与卡片滚动同时发生');
  // 旋钮必须有 ARIA 音量语义，键盘可达。
  assert.ok(source.includes("'aria-valuenow': Math.round(knobValue * 100)"),
    '旋钮必须暴露 aria-valuenow');
  assert.ok(source.includes('role: '), '旋钮必须有 role');
});

test('长条是音乐进度、音量不是横条', () => {
  const source = fs.readFileSync(SRC, 'utf8');
  // 进度条必须在 .dmo-progress 容器里，且是 .dmo-seek。
  const progressAt = source.indexOf("className: 'dmo-progress'");
  assert.ok(progressAt > 0, '缺少 .dmo-progress 进度行');
  const progressBody = source.slice(progressAt, progressAt + 900);
  assert.ok(progressBody.includes("className: 'dmo-seek'"), '进度行里必须是 .dmo-seek');
  // 音量横条不许再出现（已被旋钮取代）。
  assert.equal(/className: 'dmo-mixer'/.test(source), false,
    '音量不能再是 .dmo-mixer 横条，已改为旋钮');
  assert.ok(source.includes("className: 'dmo-knob'") || source.includes("'dmo-knob '"),
    '必须有旋钮节点');
});
