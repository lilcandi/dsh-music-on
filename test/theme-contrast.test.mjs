/**
 * 主题对比度回归。
 *
 * 存在理由（真实事故）：某些主题把 --dsw-alias-label-primary 解析成接近 #fff 的白，
 * 而插件卡片的背景取自 --dsw-alias-bg-elevated（几乎总是浅色）。
 * 两组变量互不保证，结果就是白字白底 —— 标题、走带、播放列表全部看不见。
 *
 * 这类问题的特点是：服务端 200、bundle 有字面量、安装自检全过，
 * 唯独人眼看不见。所以必须把它钉成断言：
 *   1) 卡片子树里不允许直接消费宿主的 label/border 族变量（那是对比度事故的源头）；
 *   2) 必须存在自洽的配色锚点 --dmo-fg 及其配套；
 *   3) 深色主题反转必须同时覆盖显式主题与系统偏好两路。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const CSS_FILE = path.join(ROOT, 'src/client/styles.js');

/** 取出 CSS_TEXT 模板字符串的正文（去掉注释，注释里提到变量名不算数）。 */
function readCss() {
  const source = fs.readFileSync(CSS_FILE, 'utf8');
  const start = source.indexOf('`');
  const body = source.slice(start + 1, source.lastIndexOf('`'));
  return body.replace(/\/\*[\s\S]*?\*\//g, '');
}

const CSS = readCss();

test('卡片子树不得直接消费宿主的 label 族变量', () => {
  const offenders = [];
  for (const name of ['--dsw-alias-label-primary', '--dsw-alias-label-secondary', '--dsw-alias-label-tertiary']) {
    const index = CSS.indexOf(name);
    if (index >= 0) {
      const line = CSS.slice(0, index).split('\n').length;
      offenders.push(`${name} 出现在第 ${line} 行`);
    }
  }
  assert.deepEqual(offenders, [], `宿主题的 label 变量必须换成本子树的 --dmo-fg 系列：\n${offenders.join('\n')}`);
});

test('必须定义自洽的配色锚点，且前景/背景成对翻转', () => {
  for (const token of ['--dmo-fg:', '--dmo-fg-dim:', '--dmo-fg-faint:', '--dmo-line:']) {
    assert.ok(CSS.includes(token), `缺少配色锚点 ${token}`);
  }
  // 至少两处定义 --dmo-fg：默认一套 + 深色反转一套
  const defs = CSS.match(/--dmo-fg:\s*#[0-9a-fA-F]{3,6}/g) || [];
  assert.ok(defs.length >= 2, `--dmo-fg 至少要有默认与深色两套取值，实际 ${defs.length} 处`);

  // 默认必须是深色字（浅底深字），不能是白色
  const first = defs[0];
  assert.ok(!/#fff|#ffffff/i.test(first), `默认前景色不能是白色，实际 ${first}`);
});

test('深色反转必须同时覆盖显式主题与系统偏好', () => {
  assert.ok(/prefers-color-scheme:\s*dark/.test(CSS), '缺少系统深色兜底');
  assert.ok(/data-theme=['"]?dark/.test(CSS), '缺少宿主显式深色主题选择器');
  // 显式主题必须排在系统偏好之后（同权重后者胜出），否则宿主主题会被系统偏好覆盖
  const mediaAt = CSS.indexOf('prefers-color-scheme: dark');
  const themeAt = CSS.indexOf("data-theme='dark'");
  assert.ok(themeAt > mediaAt, '显式主题规则必须排在 @media 之后，才能压过系统偏好');
});

test('卡片与设置分区都必须落在配色锚点作用域内', () => {
  // .dmo-card / .dmo-embed 共用一套；.dmo-settings 渲染在宿主设置页里，需自带一套。
  //
  // 注意：这里**不能**用 indexOf('.dmo-card {') 去取结束位置 —— 文件里 .dmo-card 本体
  // 规则（曾排在配色锚点之前）会让 end < start，slice 返回空串，测试误报「缺 --dmo-fg」。
  // 正确做法是从锚点那个选择器往后取固定窗口。
  const anchors = ['.dmo-card,\n.dmo-embed {'];
  const anchorAt = CSS.indexOf(anchors[0]);
  assert.ok(anchorAt > 0, '缺少 .dmo-card / .dmo-embed 配色锚点规则');
  const cardScope = CSS.slice(anchorAt, anchorAt + 400);
  assert.ok(cardScope.includes('--dmo-fg:'), '卡片作用域必须定义 --dmo-fg');

  const settingsAt = CSS.indexOf('.dmo-settings {');
  assert.ok(settingsAt > 0, '缺少 .dmo-settings 规则');
  const settingsBlock = CSS.slice(settingsAt, settingsAt + 700);
  assert.ok(settingsBlock.includes('--dmo-fg:'), '设置分区必须自带 --dmo-fg');
});

test('纯白文字只能出现在有实色底的按钮上', () => {
  // 白字本身没错，前提是它所在的元素有不透明背景。
  // 这里做一项粗校验：每个 color: #fff 之前 12 行内必须能找到 background。
  const lines = CSS.split('\n');
  const offenders = [];
  lines.forEach((line, index) => {
    if (!/color:\s*#fff\b/.test(line)) return;
    const blockStart = (() => {
      for (let i = index; i >= 0; i -= 1) {
        if (/^\S.*\{\s*$/.test(lines[i])) return i;
      }
      return -1;
    })();
    if (blockStart < 0) return;
    const block = lines.slice(blockStart, index + 1).join('\n');
    if (!/background/.test(block)) {
      offenders.push(`第 ${index + 1} 行：${line.trim()}（所属规则无 background）`);
    }
  });
  assert.deepEqual(offenders, [], `白字必须落在有实色底的规则里：\n${offenders.join('\n')}`);
});
