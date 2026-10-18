/**
 * 拖动定位、三档尺寸、黑胶封面的回归断言。
 *
 * 这三样都容易「看着像做了、其实没接上」，因此这里检查三件事：
 *   1. 设置层真的持久化了 dockX/dockY，且脏值/半残坐标被整体作废；
 *   2. 组件真的把 pointer 事件挂在拖动句柄上，而且**没有**挂到胶囊正文按钮上
 *      （挂上去就会吞掉点击展开）；
 *   3. 封面字段从解析层一路流到 UI，并且 http: 被挡掉。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/**
 * Windows 盘符路径（J:\...）不能直接喂给 ESM loader —— 它只认 file:// URL。
 * 之前用 path.join 传进去，报 ERR_UNSUPPORTED_ESM_URL_SCHEME: protocol 'j:'。
 */
const load = (relative) => import(pathToFileURL(path.join(ROOT, relative)).href);

const SETTINGS_SRC = read('src/client/settings.js');
const DOCK_SRC = read('src/client/ui/ShellDock.js');
const STYLES_SRC = read('src/client/styles.js');
const SOURCES_SRC = read('src/client/sources.js');
const INTAKE_SRC = read('src/client/linkintake.js');

test('设置层：默认坐标为 null，表示走 CSS 的右下角', async () => {
  const mod = await load('src/client/settings.js');
  const d = mod.normalizeSettings({});
  assert.equal(d.dockX, null);
  assert.equal(d.dockY, null);
});

test('设置层：有效坐标保留，脏值与半残坐标整体作废', async () => {
  const mod = await load('src/client/settings.js');
  const ok = mod.normalizeSettings({ dockX: 120, dockY: 340 });
  assert.deepEqual([ok.dockX, ok.dockY], [120, 340]);

  // 只要一个是脏值就整体回落 —— 否则会算出半残坐标把胶囊钉到视口外
  const half = mod.normalizeSettings({ dockX: 'abc', dockY: 340 });
  assert.deepEqual([half.dockX, half.dockY], [null, null]);

  const absurd = mod.normalizeSettings({ dockX: 1e9, dockY: 5 });
  assert.deepEqual([absurd.dockX, absurd.dockY], [null, null]);
});

test('设置层：三档尺寸枚举与默认值齐备', async () => {
  const mod = await load('src/client/settings.js');
  assert.deepEqual(mod.DOCK_SIZES, ['compact', 'normal', 'wide']);
  assert.equal(mod.normalizeSettings({}).dockSize, 'normal');
  assert.equal(mod.normalizeSettings({ dockSize: 'wide' }).dockSize, 'wide');
  assert.equal(mod.normalizeSettings({ dockSize: 'giant' }).dockSize, 'normal');
});

test('组件：pointer 事件挂在拖动句柄上，不挂在胶囊正文按钮上', () => {
  assert.match(DOCK_SRC, /className: 'dmo-drag-handle'/, '缺少胶囊拖动句柄');
  assert.match(DOCK_SRC, /className: 'dmo-drag-handle dmo-drag-handle--stage'/, '缺少卡片拖动句柄');
  assert.match(DOCK_SRC, /onPointerDown: onDragStart/);

  // 关键防回归：正文按钮内部绝不能出现 onPointerDown，
  // 否则 pointer capture 会吃掉 click，点胶囊再也展不开。
  const mainStart = DOCK_SRC.indexOf("className: 'dmo-capsule-main'");
  assert.ok(mainStart > 0, '找不到胶囊正文按钮');
  const mainEnd = DOCK_SRC.indexOf("className: 'dmo-capsule-spectrum'", mainStart);
  assert.ok(mainEnd > mainStart);
  const mainBlock = DOCK_SRC.slice(mainStart, mainEnd);
  assert.equal(/onPointer(Down|Move|Up|Cancel)/.test(mainBlock), false,
    '胶囊正文按钮里出现了 pointer 事件，会吞掉点击展开');
});

test('组件：坐标在写入前被夹进视口，且窗口缩放时重夹', () => {
  assert.match(DOCK_SRC, /const clampToViewport = useCallback/);
  assert.match(DOCK_SRC, /window\.addEventListener\('resize'/);
  assert.match(DOCK_SRC, /store\.patch\('dockX'/);
  assert.match(DOCK_SRC, /store\.patch\('dockY'/);
});

test('组件：三档尺寸有快捷切换，且接到设置项', () => {
  assert.match(DOCK_SRC, /const SIZE_ORDER = \['compact', 'normal', 'wide'\]/);
  assert.match(DOCK_SRC, /const cycleSize = useCallback/);
  assert.match(DOCK_SRC, /store\.patch\('dockSize', next\)/);
});

test('组件：黑胶在有封面时渲染 img，无封面时退回图形', () => {
  assert.match(DOCK_SRC, /className: 'dmo-vinyl-cover'/);
  assert.match(DOCK_SRC, /className: 'dmo-vinyl-label'/);
  assert.match(DOCK_SRC, /function trackCover\(state\)/);
  // http: 必须被挡掉：混合内容会被浏览器静默拦截，表现为「封面空白」
  assert.match(DOCK_SRC, /\^https:\\\/\\\/\/i\.test\(url\)/);
});

test('样式：黑胶、句柄、三档尺寸、深色卡片都有规则', () => {
  for (const cls of ['.dmo-vinyl {', '.dmo-vinyl--lg {', '.dmo-vinyl-cover {', '.dmo-drag-handle {', '.dmo-vinyl-stage {']) {
    assert.ok(STYLES_SRC.includes(cls), `styles.js 缺 ${cls}`);
  }
  assert.match(STYLES_SRC, /\.dmo-dock--size-compact \.dmo-capsule/);
  assert.match(STYLES_SRC, /\.dmo-dock--size-wide \.dmo-capsule/);
  // 卡片改成蓝白玻璃（鲸蓝描边 + 冷白渐变底），深色主题另有翻转
  assert.match(STYLES_SRC, /\.dmo-card \{[\s\S]*?border: 1px solid var\(--dmo-edge-strong/);
  assert.match(STYLES_SRC, /\.dmo-card \{[\s\S]*?--dmo-glass/);
  assert.match(STYLES_SRC, /data-theme='dark'[\s\S]{0,200}\.dmo-card/);
  // 旧的黑白贴纸配色必须彻底消失，否则蓝白改版会出现「黑白补丁」
  assert.equal(/14161a|ff5d3b|ffb703|9b5cf6/.test(STYLES_SRC), false, '旧配色残留');
});

test('封面字段：从解析层经 sources 流到 describeTrack', () => {
  assert.match(INTAKE_SRC, /cover: track\.cover \|\| result\.cover \|\| null/, 'resolveBilibili 必须透出封面');
  assert.match(INTAKE_SRC, /const cover = resolved\.ok/, 'intakeLinks 必须把封面传给 addBilibili');
  assert.match(SOURCES_SRC, /track\.cover = typeof input\.cover === 'string'/, 'createBilibiliTrack 必须收封面');
  assert.match(SOURCES_SRC, /cover: parts\.cover \?\? null/, 'baseTrack 必须带 cover 槽');
  assert.match(SOURCES_SRC, /cover: track\.cover,/, 'describeTrack 必须暴露 cover');
});

test('locale：新增的拖动/尺寸/徽标文案中英齐全', async () => {
  const mod = await load('src/client/locale.js');
  const zh = Object.keys(mod.DICTS.zh);
  const en = Object.keys(mod.DICTS.en);
  assert.deepEqual(zh.filter((k) => !en.includes(k)), []);
  assert.deepEqual(en.filter((k) => !zh.includes(k)), []);
  for (const key of ['dock.dragHint', 'dock.sizeCycle', 'dock.sizeNow', 'dock.externalBadge', 'dock.localBadge']) {
    assert.ok(zh.includes(key), `缺 ${key}`);
  }
});
