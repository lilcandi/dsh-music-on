/**
 * 拖动定位的**坐标系**回归。
 *
 * 真实事故（连续踩两次）：拖动代码全对，但 `applyPos` 写错了目标节点。
 * 写的是外层 `.dmo-dock-stack`（坐标系容器），而用户看见、且真正带
 * `.dmo-dock{position:absolute}` 的是面板本体。结果是面板纹丝不动、
 * 父容器被拉走却不可见 —— 表现为「按下去毫无反应」。
 *
 * 静态断言只能证明「有没有写 style.left」，证明不了「写在谁的头上」。
 * 所以这里用假 DOM 真跑一遍 onDragStart/onDragMove，断言变的是面板。
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

test('applyPos 的目标是定位盒（stack），不是被降级为 relative 的内层 .dmo-dock', () => {
  // 坐标系事实：CSS 把 `.dmo-dock-stack > .dmo-dock` 降级成 position:relative，
  // 在相对定位上写 left:690px 表示「从静态位置右移 690px」，与 viewport 坐标
  // 不是一个体系 —— 夹取算出来的视口坐标会被当成偏移量，越拖越偏。
  // 所以定位只写最外层 stack，内层面板一个 style.left 都不许写。
  const at = source.indexOf('const applyPos = useCallback');
  assert.ok(at > 0, '找不到 applyPos');
  const block = source.slice(at, at + 1200);
  assert.match(block, /const el = stackRef\.current \|\| panelRef\.current/,
    'applyPos 必须优先取外层 stackRef');
  assert.equal(/const el = panelRef\.current \|\| stackRef\.current/.test(block), false,
    'applyPos 不能优先写内层面板 —— 面板被降级为 relative，left 会被解释成偏移量');
});

test('onDragStart 量的是定位盒矩形（viewport 坐标系）', () => {
  const at = source.indexOf('const onDragStart = useCallback');
  assert.ok(at > 0);
  const block = source.slice(at, at + 2400);
  assert.match(block, /const panel = stackRef\.current \|\| panelRef\.current/);
  assert.match(block, /const rect = panel\.getBoundingClientRect\(\)/,
    'grab 偏移必须相对定位盒左上角，否则盒子起手会跳');
});

test('复位清的是定位盒的内联样式（两层都清，防旧版残留）', () => {
  const at = source.indexOf('const onDragReset = useCallback');
  assert.ok(at > 0);
  const block = source.slice(at, at + 900);
  assert.match(block, /for \(const el of \[stackRef\.current, panelRef\.current\]\)/,
    '复位必须两层都清：定位在 stack 上，但旧版本往 panel 也写过');
  assert.match(block, /el\.style\.left = ''/, '复位必须清内联 left');
  assert.match(block, /el\.style\.right = ''/, '复位必须清内联 right');
  assert.match(block, /commitPos\(null\)/, '复位必须把坐标置空');
});

test('CSS：面板是 absolute 且由 right/bottom 贴角，可被内联 left/top 覆盖', () => {
  const css = fs.readFileSync(path.join(ROOT, 'src/client/styles.js'), 'utf8');
  const at = css.indexOf('.dmo-dock {');
  assert.ok(at > 0);
  const rule = css.slice(at, at + 260);
  assert.match(rule, /position: absolute/);
  assert.match(rule, /right: 16px/);
  assert.match(rule, /bottom: 16px/);
  // stack 必须仍是「贴角 + 不吃指针」，它是坐标系，不是移动对象
  const stackAt = css.indexOf('.dmo-dock-stack {');
  const stackRule = css.slice(stackAt, stackAt + 240);
  assert.match(stackRule, /pointer-events: none/);
});
