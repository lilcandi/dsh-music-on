/**
 * 设置页结构回归：结构与文案必须成对存在。
 *
 * 存在理由（真实踩过的坑）：Settings.jsx 只产出了 `dmo-setting-row` 等类名，
 * 而 styles.js 里一条对应规则都没有，设置页就变成「一堆文字堆叠」。
 * 类名与 CSS 分居两个文件，任何一边改名都不会报错——只会在界面上崩坏。
 * 这组断言把两边绑死。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const settingsSrc = fs.readFileSync(path.join(ROOT, 'src/client/ui/Settings.jsx'), 'utf8');
const stylesSrc = fs.readFileSync(path.join(ROOT, 'src/client/styles.js'), 'utf8');

/** Settings.jsx 里实际用到的 dmo-* 类名。 */
function classNamesIn(source) {
  const found = new Set();
  const re = /className:\s*'([^']+)'/g;
  let match = re.exec(source);
  while (match !== null) {
    for (const token of match[1].split(/\s+/)) {
      if (token.startsWith('dmo-')) found.add(token);
    }
    match = re.exec(source);
  }
  return found;
}

const used = classNamesIn(settingsSrc);

test('Settings.jsx 至少产出预期的结构类名', () => {
  for (const name of [
    'dmo-settings',
    'dmo-settings-head',
    'dmo-settings-body',
    'dmo-settings-group',
    'dmo-settings-group-title',
    'dmo-setting-row',
    'dmo-setting-text',
    'dmo-setting-label',
    'dmo-setting-help',
    'dmo-setting-control',
    'dmo-settings-actions',
  ]) {
    assert.ok(used.has(name), `Settings.jsx 里找不到 className: '${name}'`);
  }
});

test('Settings.jsx 用到的每个 dmo-* 类名都在 styles.js 里有规则', () => {
  // textBlock 里拼出来的类名是模板串，单独列出。
  const dynamic = new Set(['dmo-setting-label', 'dmo-setting-help', 'dmo-setting-text']);
  const missing = [];
  for (const name of used) {
    if (dynamic.has(name)) continue;
    if (!stylesSrc.includes(`.${name}`)) missing.push(name);
  }
  assert.deepEqual(missing, [], `这些类名有结构没样式：${missing.join(', ')}`);
});

test('textBlock 用到的三个类名也在 styles.js 里', () => {
  for (const name of ['dmo-setting-label', 'dmo-setting-help', 'dmo-setting-text']) {
    assert.ok(settingsSrc.includes(name), `Settings.jsx 没用到 ${name}`);
    assert.ok(stylesSrc.includes(`.${name}`), `styles.js 缺 .${name} 规则`);
  }
});

test('设置行是网格布局，不是行内文字流', () => {
  assert.match(
    stylesSrc,
    /\.dmo-setting-row\s*\{[^}]*display:\s*grid/,
    '.dmo-setting-row 必须是 grid，否则标签与控件会挤成一行文字',
  );
  assert.match(stylesSrc, /\.dmo-setting-row\s*\{[^}]*grid-template-columns/);
});

test('控件类各有独立样式（滑杆 / 下拉 / 开关）', () => {
  assert.ok(stylesSrc.includes('.dmo-range'), '缺 .dmo-range');
  assert.ok(stylesSrc.includes('.dmo-range-value'), '缺 .dmo-range-value');
  assert.ok(stylesSrc.includes('.dmo-select'), '缺 .dmo-select');
  assert.ok(stylesSrc.includes('.dmo-switch'), '缺 .dmo-switch');
  assert.ok(stylesSrc.includes('.dmo-switch:checked'), '开关缺选中态');
});

test('设置项被分组渲染（不是 19 行平铺）', () => {
  assert.match(settingsSrc, /const GROUPS = \[/, '缺少 GROUPS 分组表');
  assert.ok(
    settingsSrc.includes("className: 'dmo-settings-body' }, groups)"),
    'body 必须渲染 groups，而不是原始 rows',
  );
});

test('分组覆盖 SETTINGS_SCHEMA 的全部 key（不许有看不见的设置项）', async () => {
  const { SETTINGS_SCHEMA } = await import('../src/client/settings.js');
  const groupBlock = settingsSrc.slice(
    settingsSrc.indexOf('const GROUPS = ['),
    settingsSrc.indexOf('const groupedKeys'),
  );
  const listed = new Set();
  for (const match of groupBlock.matchAll(/'([A-Za-z][A-Za-z0-9_]*)'/g)) listed.add(match[1]);
  const missing = SETTINGS_SCHEMA.map((spec) => spec.key).filter((key) => !listed.has(key));
  // 运行期有 ungrouped 兜底，所以这里只要求「没有项被两边同时漏掉」。
  assert.ok(
    missing.length === 0 || settingsSrc.includes('ungrouped'),
    `这些设置项既不在分组里也没有兜底：${missing.join(', ')}`,
  );
});

test('按钮不再是 label 包裹（label 包 button 会吞掉点击并继承 label 语义）', () => {
  assert.doesNotMatch(
    settingsSrc,
    /h\(\s*'label',\s*\{\s*key: spec\.key/,
    '设置行外层应为 div，不能是 label',
  );
});
