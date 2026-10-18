/**
 * 拖动定位的**行为**回归。
 *
 * 为什么需要这一个文件（真实事故）：上一版把拖动做成「等 React 重渲染推进位置」，
 * 所有静态断言都过（句柄上有 onPointerDown、clampToViewport 存在、store.patch 存在），
 * 但真机上按下去什么都不动 —— 原因有两个静态检查看不到的：
 *   1. 盒子静止时用 `right/bottom` 贴角，pos 为 null 时 style 返回 null，
 *      于是第一步 move 改的是 pos，而 pos 从未被应用过（dockPositionStyle(null) = null）；
 *   2. 参照物取的是手柄，手柄在盒子里被 padding / flex 推到内侧，
 *      按它算偏移会让盒子起手跳一个内边距。
 *
 * 这里用假 DOM 真跑一遍 onDragStart → onDragMove → onDragEnd 的函数体，
 * 断言 DOM 上的 left/top 真的按指针位移走了。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SRC = path.join(ROOT, 'src/client/ui/ShellDock.js');
const source = fs.readFileSync(SRC, 'utf8');

/**
 * 去掉注释后的源码。
 *
 * 必须做这一步：`onDragStart` 的注释里逐字写着「之前按下就 applyPos + setDragging(true)」，
 * 用来记录为什么改成现在这样。直接拿原文做「不许出现 applyPos」的断言会被这段注释
 * 判成违规 —— 断言必须只看代码，不看解释代码的文字。
 */
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

test('拖动实现：位置写 DOM（imperative），不依赖重渲染节奏', () => {
  assert.match(source, /const applyPos = useCallback/, '缺少 applyPos');
  assert.match(source, /el\.style\.left = `\$\{point\.x\}px`/, 'applyPos 必须直接写 style.left');
  assert.match(source, /el\.style\.top = `\$\{point\.y\}px`/, 'applyPos 必须直接写 style.top');
  // style.right / bottom 必须被清成 auto，否则 right/bottom 与 left/top 同时生效，
  // 浏览器按「两套都满足」去解，盒子会被拉宽而不是移动。
  assert.match(source, /el\.style\.right = 'auto'/, 'applyPos 必须清 right 为 auto');
  assert.match(source, /el\.style\.bottom = 'auto'/, 'applyPos 必须清 bottom 为 auto');
  // 写了 DOM 还不够：React 重渲染会整份覆盖 style，所以必须同时写 liveRef，
  // 让渲染期读到的也是同一个位置源。缺这一条就是「拖不动」的复发点。
  assert.match(source, /liveRef\.current = point/, 'applyPos 必须同时写 liveRef');
});

test('拖动实现：按下零 setState，越过死区才接管（holding）', () => {
  // 按下即 applyPos + setDragging(true) 会形成「渲染 → setState → 渲染」的自激环，
  // 实测报 Maximum call stack size exceeded。所以按下阶段只登记起点，不动状态。
  //
  // 断言一律针对 code（去注释版）：onDragStart 的注释里逐字记录着「之前按下就
  // applyPos + setDragging(true)」，拿原文断言会被这段说明判成违规。
  const startAt = code.indexOf('const onDragStart = useCallback');
  assert.ok(startAt > 0, '找不到 onDragStart');
  // 切片到下一个 useCallback 声明为止，绝不按固定长度截 —— 固定长度会切进后面的函数
  const nextAt = code.indexOf('const onDragMove = useCallback', startAt);
  const startBlock = code.slice(startAt, nextAt > startAt ? nextAt : startAt + 2400);
  assert.equal(/applyPos\(/.test(startBlock), false, 'onDragStart 里不许调 applyPos');
  assert.equal(/setDragging\(true\)/.test(startBlock), false, 'onDragStart 里不许 setDragging');
  assert.equal(/setHolding\(true\)/.test(startBlock), false, 'onDragStart 里不许 setHolding');

  // 接管发生在 stepDrag：越过 4px 死区之后才进入 holding。
  const stepAt = code.indexOf('const stepDrag = useCallback');
  assert.ok(stepAt > 0, '找不到 stepDrag');
  const stepBlock = code.slice(stepAt, stepAt + 900);
  assert.match(stepBlock, /Math\.abs\(event\.clientX - drag\.startX\) < 4/, '必须有 4px 死区，否则单击展开会被抖成拖动');
  assert.match(stepBlock, /setDragging\(true\)/, '越过死区必须进入拖动态');
  assert.match(stepBlock, /holdingRef\.current = true/, '越过死区必须打开 holdingRef');
  assert.match(stepBlock, /applyPos\(next\)/, '越过死区后必须立刻应用位置');

  // applyPos 自身仍要负责打开 holding 状态（刷新恢复后第一次移动也走它）
  const applyAt = code.indexOf('const applyPos = useCallback');
  const applyBlock = code.slice(applyAt, applyAt + 1200);
  assert.match(applyBlock, /holdingRef\.current = true/, 'applyPos 必须打开 holdingRef');
  assert.match(applyBlock, /setHolding\(true\)/, 'applyPos 必须进入 holding');
});

test('拖动实现：参照物是定位盒（stack），且 grab 偏移按它算', () => {
  const startAt = source.indexOf('const onDragStart = useCallback');
  const startBlock = source.slice(startAt, startAt + 2400);
  // 参照物必须是承载绝对定位的那只盒子。内层 .dmo-dock 被 CSS 降级成
  // position:relative，拿它当参照物时 left/top 会被解释成「相对静态位置的偏移」，
  // 与 viewport 坐标不是一个体系 —— 越拖越偏。
  assert.match(startBlock, /const panel = stackRef\.current \|\| panelRef\.current/,
    '参照物必须优先取定位盒 stackRef');
  assert.match(startBlock, /const rect = panel\.getBoundingClientRect\(\)/, '必须量参照物矩形');
  // grabX/grabY 必须按盒子左上角算
  assert.match(startBlock, /grabX: event\.clientX - rect\.left/);
  assert.match(startBlock, /grabY: event\.clientY - rect\.top/);
});

test('拖动实现：move 用 grab 偏移换算，end 才落盘', () => {
  const stepAt = source.indexOf('const stepDrag = useCallback');
  assert.ok(stepAt > 0, '找不到 stepDrag');
  const stepBlock = source.slice(stepAt, stepAt + 900);
  assert.match(stepBlock, /event\.clientX - drag\.grabX/, 'move 必须减 grabX');
  assert.match(stepBlock, /applyPos\(next\)/, 'move 必须立刻应用位置');
  // 关键：move 里绝不能出现 commitPos / store.patch，否则每帧一次存储写入
  assert.equal(/commitPos|store\.patch/.test(stepBlock), false, 'move 里不许落盘');

  const finishAt = source.indexOf('const finishDrag = useCallback');
  assert.ok(finishAt > 0, '找不到 finishDrag');
  const finishBlock = source.slice(finishAt, finishAt + 1400);
  assert.match(finishBlock, /commitPos\(drag\.last\)/, 'end 才落盘');
});

test('拖动实现：双击复位会清掉内联样式，回到 CSS 的右下角', () => {
  const resetAt = source.indexOf('const onDragReset = useCallback');
  assert.ok(resetAt > 0);
  const resetBlock = source.slice(resetAt, resetAt + 700);
  assert.match(resetBlock, /el\.style\.left = ''/, '复位必须清内联 left');
  assert.match(resetBlock, /el\.style\.right = ''/, '复位必须清内联 right');
  assert.match(resetBlock, /commitPos\(null\)/, '复位必须把坐标置空');
});

test('拖动实现：CSS 变量接管后不再被 .dmo-dock 的 right/bottom 拉回', () => {
  // 面板是 .dmo-dock，它在 CSS 里写死了 right:16px;bottom:16px。
  // 拖动时内联 left/top + right:auto/bottom:auto 必须能压过它 ——
  // 内联样式优先级天然更高，这条断言只是防有人把定位改回 !important。
  const css = fs.readFileSync(path.join(ROOT, 'src/client/styles.js'), 'utf8');
  const dockRule = css.slice(css.indexOf('.dmo-dock {'), css.indexOf('.dmo-dock {') + 300);
  assert.match(dockRule, /position: absolute/, '.dmo-dock 必须 absolute');
  assert.equal(/!important/.test(dockRule), false, '.dmo-dock 的定位不许用 !important，否则内联拖不动');
});
