/**
 * 播放列表持久化与频谱层级的回归测试。
 *
 * 两件事都必须脱离浏览器断言，否则只能靠人肉刷新页面才发现：
 *   1. 队列落盘 —— 用户要「保留不消失、可多次使用」。刷新后列表没了就是 bug。
 *   2. 频谱层级 —— 「浮在前面」与「藏进页面里」是两套层叠语义，
 *      藏起来依赖负 z-index + 祖先隔离层，任何一处漏了就变成「浮在正文之上」的反效果。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const DOCK = readFileSync(join(ROOT, 'src/client/ui/ShellDock.js'), 'utf8');
const CSS = readFileSync(join(ROOT, 'src/client/styles.js'), 'utf8');
const SETTINGS = readFileSync(join(ROOT, 'src/client/settings.js'), 'utf8');

test('队列落盘：键名、上限、写入与读取都在', () => {
  assert.match(DOCK, /const QUEUE_KEY = `\$\{PLUGIN_ID\}:queue\.v1`;/, '队列存储键必须带插件前缀，避免与其他插件撞 key');
  assert.match(DOCK, /const QUEUE_MAX = 200;/, '必须有上限，否则 localStorage 会被长歌单塞爆');
  assert.match(DOCK, /function saveQueue\(queue\)/, 'saveQueue 缺失');
  assert.match(DOCK, /function loadQueue\(\)/, 'loadQueue 缺失');
  assert.match(DOCK, /function clearSavedQueue\(\)/, 'clearSavedQueue 缺失');
});

test('队列落盘：绝不序列化 Blob / objectURL', () => {
  const body = DOCK.slice(DOCK.indexOf('function serializeTrack'), DOCK.indexOf('function saveQueue'));
  assert.doesNotMatch(body, /objectURL/i, 'objectURL 刷新即失效，不能落盘');
  assert.doesNotMatch(body, /blobUrl|createObjectURL/i, '同上');
  assert.match(body, /missing = true/, '没有可重建地址的条目（本地文件）必须标 missing，而不是静默丢弃');
});

test('队列落盘：首帧不写，避免抹掉上次保存的列表', () => {
  assert.match(DOCK, /queueReadyRef/, '缺少首帧守卫');
  const seg = DOCK.slice(DOCK.indexOf('const queueReadyRef'), DOCK.indexOf('从磁盘恢复队列'));
  assert.match(seg, /if \(!queueReadyRef\.current\) \{/, '首帧必须直接返回，不下笔');
});

test('队列恢复：只在引擎队列为空时执行，且不自动出声', () => {
  const seg = DOCK.slice(DOCK.indexOf('const restoredRef'), DOCK.indexOf('const restoredRef') + 2600);
  assert.match(seg, /if \(currentCount > 0\) return;/, '已有队列时不得重复恢复');
  assert.match(seg, /playFirst: false/, '恢复必须禁止自动播放，刷新页面不该突然出声');
  assert.match(seg, /item\.missing/, 'missing 条目应跳过而不是当作失败');
});

test('队列恢复：依赖声明在 flash 之后（前向引用会让整棵子树被卸载）', () => {
  const flashAt = DOCK.indexOf('const flash = useCallback');
  const restoreAt = DOCK.indexOf('从磁盘恢复队列');
  assert.ok(flashAt > 0 && restoreAt > 0, '定位失败');
  assert.ok(restoreAt > flashAt, '恢复 effect 必须在 flash 之后声明，否则渲染期 ReferenceError');
});

test('清空按钮必须同时清磁盘', () => {
  const seg = DOCK.slice(DOCK.indexOf('播放列表已清空') - 400, DOCK.indexOf('播放列表已清空') + 200);
  assert.match(seg, /clearSavedQueue\(\)/, '清空队列却不删磁盘，下次刷新会「复活」整份列表');
});

test('频谱层级：front / back / peek 三态都有样式，且 back 用负 z-index', () => {
  assert.match(CSS, /\.dmo-barspectrum\[data-depth='front'\]/, '缺 front 规则');
  assert.match(CSS, /\.dmo-barspectrum\[data-depth='back'\]/, '缺 back 规则');
  assert.match(CSS, /\.dmo-barspectrum\[data-depth='peek'\]/, '缺 peek 规则');
  const backBlock = CSS.slice(CSS.indexOf("[data-depth='back']"), CSS.indexOf("[data-depth='peek']"));
  assert.match(backBlock, /z-index: -1/, 'back 必须是负 z-index，否则沉不到正文之下');
});

test('频谱层级：隔离层建立了自己的层叠上下文（否则负 z-index 不生效）', () => {
  const stackBlock = CSS.slice(CSS.indexOf('.dmo-dock-stack {'), CSS.indexOf('.dmo-dock-stack > .dmo-dock'));
  assert.match(stackBlock, /isolation: isolate/, '缺 isolation:isolate，负 z-index 只会沉到 overlay 内部底部');
  assert.doesNotMatch(stackBlock, /inset:\s*0/, '隔离层绝不能撑满视口，会变成吃点击的透明遮罩');
  assert.doesNotMatch(stackBlock, /width:\s*100%/, '同上');
  assert.match(stackBlock, /pointer-events: none/, '隔离层本身必须放click-through，只有子节点可点');
});

test('频谱层级：设置项 spectrumDepth 在 schema、默认值与归一化里都存在', () => {
  assert.match(SETTINGS, /export const SPECTRUM_DEPTHS = \['front', 'back'\]/, '缺枚举常量');
  assert.match(SETTINGS, /key: 'spectrumDepth'/, '缺 schema 项');
  assert.match(SETTINGS, /spectrumDepth: 'front'/, '缺默认值');
  assert.match(SETTINGS, /const spectrumDepth = SPECTRUM_DEPTHS\.includes/, '缺归一化');
  assert.match(SETTINGS, /^\s+spectrumDepth,$/m, '归一化返回值里漏了 spectrumDepth');
});

test('频谱层级：back 模式下卡片头必须给出「提上来看一眼」的入口', () => {
  assert.match(DOCK, /spectrumDepth === 'back'/, '缺 back 分支');
  assert.match(DOCK, /dmo-icon--peek/, '缺 peek 按钮');
  assert.match(DOCK, /setTimeout\(\(\) => setPeekSpectrum\(false\), 3000\)/, 'peek 必须自动沉回去');
});
