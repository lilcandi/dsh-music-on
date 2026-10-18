/**
 * 拖动位置的「唯一来源」回归。
 *
 * 真实事故（第四次报「无法拖动」后定位）：拖动逻辑本身没错，错在**位置被写了两遍**。
 * applyPos 往面板的 `style.left/top` 写了值，但组件每次重渲染都会
 * `...dockPositionStyle(holding, pos)` 整份覆盖 style —— `pos` 是 React state，
 * 拖动过程中从不更新。于是每帧顺序是「handler 写 left → React 覆盖回起点」，
 * 盒子纹丝不动，用户看到的就是「按下去毫无反应」。
 *
 * 静态断言查不出这类竞态：所有 handler 都在、所有状态都在、内联样式也真的写了。
 * 所以这里直接检查「重渲染路径读的是哪个位置源」。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const DOCK = read('src/client/ui/ShellDock.js');

test('位置单一来源：定位只求值一次，且读 liveRef', () => {
  // 注释里也写着 dockPositionStyle(...)，先剔掉反引号注释片段再统计真正的调用。
  const code = DOCK.replace(/`[^`]*`/g, '``');
  const calls = [...code.matchAll(/dockPositionStyle\(holding, pos, liveRef\.current\)/g)];
  // 新架构把两条渲染分支的定位收敛成**一个**求值点（喂给 wrapStack），
  // 而不是各自展开一次 —— 两处各写一份正是「一处改了另一处忘了」的来源。
  assert.equal(calls.length, 1, `定位只允许有一个求值点，实际 ${calls.length}`);
  const seg = code.slice(calls[0].index, calls[0].index + 240);
  assert.match(seg, /wrapStack/, '这个求值点必须直接喂给 wrapStack（定位盒）');
});

test('位置单一来源：收起态与展开态都必须经过 wrapStack', () => {
  // 真实事故：收起态曾经直接 return 自己的 div，从不渲染 .dmo-dock-stack，
  // 于是 stackRef 在收起态恒为 null —— 拖动拿不到参照物，定位样式也落不到盒子上。
  assert.match(DOCK, /if \(collapsed\) \{\s*return wrapStack\(/, '收起态必须走 wrapStack');
  assert.match(DOCK, /return wrapStack\(panel, spectrumBar\);/, '展开态必须走 wrapStack');
  // 反向断言：两条分支都不许再自己拼 .dmo-dock-stack 节点
  assert.equal(
    (DOCK.match(/className: 'dmo-dock-stack'/g) || []).length,
    1,
    '只允许在 wrapStack 里出现一次 dmo-dock-stack，分支内不许各拼一份',
  );
});

test('位置单一来源：dockPositionStyle 优先用 live', () => {
  const at = DOCK.indexOf('function dockPositionStyle');
  assert.ok(at > 0, '找不到 dockPositionStyle');
  const block = DOCK.slice(at, at + 420);
  assert.match(block, /function dockPositionStyle\(pick, pos, live\)/, '签名必须有第三个参数 live');
  assert.match(block, /const point = live \|\| pos/, 'live 必须优先于 pos');
});

test('位置单一来源：applyPos 同时写 liveRef 并接管 holding', () => {
  const at = DOCK.indexOf('const applyPos = useCallback');
  assert.ok(at > 0);
  const block = DOCK.slice(at, at + 1200);
  assert.match(block, /liveRef\.current = point/, 'applyPos 必须写 liveRef');
  assert.match(block, /holdingRef\.current = true/, 'applyPos 必须打开 holdingRef');
  assert.match(block, /setHolding\(true\)/, 'applyPos 必须触发 holding 状态');
  // 仍然要写 DOM：不等 React 才有当帧手感
  assert.match(block, /el\.style\.left = `\$\{point\.x\}px`/);
});

test('位置单一来源：liveRef / holdingRef 必须先声明再用', () => {
  const declAt = DOCK.indexOf('const liveRef = useRef(null)');
  assert.ok(declAt > 0, '缺少 liveRef 声明');
  const useAt = DOCK.indexOf('const applyPos = useCallback');
  assert.ok(useAt > declAt, 'liveRef 必须声明在 applyPos 之前（否则渲染期 ReferenceError）');
  const holdAt = DOCK.indexOf('const holdingRef = useRef(false)');
  assert.ok(holdAt > 0 && holdAt < useAt, 'holdingRef 必须声明在 applyPos 之前');
});

test('位置单一来源：落手后 liveRef 收敛、取消后清空', () => {
  // 落手逻辑现在收在 finishDrag（window 与 React 两条通道共用同一个核心）。
  const at = DOCK.indexOf('const finishDrag = useCallback');
  assert.ok(at > 0, '找不到 finishDrag');
  const block = DOCK.slice(at, at + 1400);
  assert.match(block, /liveRef\.current = \{ x: drag\.last\.x, y: drag\.last\.y \}/, '落手必须把 liveRef 收敛到落点');
  assert.match(block, /liveRef\.current = null/, '未拖动时必须清空 liveRef 回到贴角体系');
  assert.match(block, /holdingRef\.current = false/, '未拖动时必须关掉 holdingRef');
  // onDragEnd 退化成薄包装，不再自己实现一套（两套实现必然漂移）
  const endAt = DOCK.indexOf('const onDragEnd = useCallback');
  assert.ok(endAt > 0, '找不到 onDragEnd');
  const endBlock = DOCK.slice(endAt, endAt + 200);
  assert.match(endBlock, /finishDrag\(event\)/, 'onDragEnd 必须转发给 finishDrag');
});

test('位置单一来源：双击复位清空 liveRef 与 holdingRef', () => {
  const at = DOCK.indexOf('const onDragReset = useCallback');
  assert.ok(at > 0);
  const block = DOCK.slice(at, at + 900);
  assert.match(block, /liveRef\.current = null/);
  assert.match(block, /holdingRef\.current = false/);
});

test('刷新恢复：holding 初值由已保存坐标决定，不能写死 false', () => {
  // 否则刷新后 pos 有值、holding=false → dockPositionStyle 返回 null
  // → CSS 的 right/bottom 又把胶囊拉回右下角，表现为「拖完刷新就回去了」。
  assert.equal(
    /const \[holding, setHolding\] = useState\(false\)/.test(DOCK),
    false,
    'holding 初值不能写死 false',
  );
  const at = DOCK.indexOf('const [holding, setHolding] = useState(() =>');
  assert.ok(at > 0, 'holding 必须用惰性初值');
  const block = DOCK.slice(at, at + 260);
  assert.match(block, /settings\.dockX/, '初值必须读 settings.dockX');
  assert.match(block, /settings\.dockY/, '初值必须读 settings.dockY');
});

test('结构：拖动事件挂在整枚胶囊与整个舞台，不只挂小黑胶', () => {
  // 收起态：胶囊容器（不是只 68px 的黑胶）承接 pointerdown
  const capsAt = DOCK.indexOf("if (collapsed) {");
  assert.ok(capsAt > 0);
  const capsBlock = DOCK.slice(capsAt, capsAt + 1400);
  assert.match(capsBlock, /onPointerDown: onDragStart/, '收起态必须挂 pointerdown');
  assert.equal(
    (capsBlock.match(/onPointerDown: onDragStart/g) || []).length,
    1,
    '收起态只能挂一次，重复挂会让同一次按下触发两遍 onDragStart',
  );
  // 展开态：舞台承接
  const cardAt = DOCK.indexOf("className: 'dmo-vinyl-stage'");
  assert.ok(cardAt > 0, '找不到黑胶舞台');
  const stageBlock = DOCK.slice(cardAt, cardAt + 700);
  assert.match(stageBlock, /onPointerDown: onDragStart/, '展开态舞台必须挂 pointerdown');
});

test('CSS：拖动面必须禁掉文字选中并给出 grab 光标', () => {
  const css = read('src/client/styles.js');
  for (const cls of ['.dmo-capsule {', '.dmo-vinyl-stage {']) {
    const at = css.indexOf(cls);
    assert.ok(at > 0, `缺少 ${cls}`);
    const block = css.slice(at, at + 900);
    assert.match(block, /user-select: none/, `${cls} 必须禁掉文字选中，否则拖动变成拉选区`);
    assert.match(block, /cursor: grab/, `${cls} 必须给 grab 光标`);
    assert.match(block, /touch-action: none/, `${cls} 必须禁掉浏览器手势接管`);
  }
});
