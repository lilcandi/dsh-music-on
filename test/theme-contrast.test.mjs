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

test('卡片、嵌入窗与设置分区共享同一支配色锚点作用域', () => {
  // 历史：.dmo-settings 曾自带一整套硬编码令牌（--dmo-brand: #4d6bfe 等），
  // 而它排在 7 个主题块之后 → 设置页永远显示鲸鱼蓝，换主题只改播放器不改设置页。
  // 现在四者共用文件上方那一段锚点，选择器列表里必须同时出现。
  const anchorRule = /\.dmo-dock-stack,\s*\n\.dmo-card,\s*\n\.dmo-embed,\s*\n\.dmo-settings\s*\{/;
  assert.ok(anchorRule.test(CSS), '配色锚点选择器列表必须同时包含 .dmo-dock-stack/.dmo-card/.dmo-embed/.dmo-settings');

  const anchorAt = CSS.search(anchorRule);
  const cardScope = CSS.slice(anchorAt, anchorAt + 1500);
  assert.ok(cardScope.includes('--dmo-fg:'), '锚点作用域必须定义 --dmo-fg');
  assert.ok(cardScope.includes('--dmo-brand:'), '锚点作用域必须定义 --dmo-brand');

  // 设置分区本体（顶层规则）只该有布局属性，不得再定义颜色令牌。
  // 三个必须区分开的 `.dmo-settings {`：
  //   1) 共享锚点块 —— 它的选择器列表末行就是 `.dmo-settings {`（行首无缩进，会被匹配到）；
  //   2) 本体布局规则（行首无缩进）；
  //   3) @media 里的深色覆盖（有缩进，必须保留）。
  // 所以取**最后**一条行首无缩进的，才是本体。
  const topLevel = [...CSS.matchAll(/^\.dmo-settings \{/gm)].map((m) => m.index);
  assert.equal(topLevel.length, 2,
    `.dmo-settings 行首规则应为「锚点块 + 本体」共 2 条，实际 ${topLevel.length} 条`);
  const bodyAt = topLevel[topLevel.length - 1];
  const settingsBlock = CSS.slice(bodyAt, CSS.indexOf('}', bodyAt) + 1);
  for (const token of ['--dmo-fg:', '--dmo-brand:', '--dmo-glass:']) {
    assert.ok(!settingsBlock.includes(token),
      `.dmo-settings 不得重复定义 ${token}，否则会盖掉主题（这正是设置页不跟随主题的根因）`);
  }
});

test('设置分区必须自带底色，不得把文字浮在宿主的半透明面板上', () => {
  // 真实事故：.dmo-settings 早前只有布局属性、没有 background，于是 --dmo-fg-faint
  // 直接落在宿主设置弹窗的 rgba(132,122,98,0.5) 面板上。真机实测对比度只有 2.0:1，
  // 11.5px 的「长期保留的链接…」那行几乎和背景同色，人眼读不出来。
  // 这类问题 bundle 有字面量、自检全过、服务端 200，唯独看不见，必须钉成断言。
  const topLevel = [...CSS.matchAll(/^\.dmo-settings \{/gm)].map((m) => m.index);
  const bodyAt = topLevel[topLevel.length - 1];
  const settingsBlock = CSS.slice(bodyAt, CSS.indexOf('}', bodyAt) + 1);
  assert.ok(/background\s*:/.test(settingsBlock),
    '.dmo-settings 必须自带 background（否则淡色说明文字落在宿主半透明面板上，对比度不足）');

  // 底色必须来自本子树令牌，不能写死某个颜色 —— 深色模式下要能跟着翻转。
  const bgLine = settingsBlock.split('\n').find((line) => /background\s*:/.test(line)) || '';
  assert.ok(/var\(--dmo-glass/.test(bgLine),
    `设置分区的底色必须取 --dmo-glass 系列令牌，实际：${bgLine.trim()}`);
});

test('七套配色主题必须用真选择器，不得被 :where() 归零权重', () => {
  // 真机实测复现过的 bug：写成 :where([data-dmo-theme='x']) 后权重为 0，
  // 永远输给权重 (0,1,0) 的默认锚点块，七套主题算出来的计算样式完全一致。
  const themes = ['whale', 'aurora', 'mint', 'sunset', 'rose', 'neon', 'mono'];
  for (const name of themes) {
    const wrapped = `:where([data-dmo-theme='${name}'])`;
    assert.equal(CSS.includes(wrapped), false,
      `${wrapped} 权重为 0，会被默认块覆盖；请写成 [data-dmo-theme='${name}']`);
  }

  // 每条主题块都要真的给出不同的 --dmo-brand
  const brands = themes.map((name) => {
    const at = CSS.indexOf(`[data-dmo-theme='${name}'] {`);
    assert.ok(at > 0, `缺少主题块 ${name}`);
    const end = CSS.indexOf('}', at);
    const block = CSS.slice(at, end);
    const m = block.match(/--dmo-brand:\s*(#[0-9a-fA-F]{3,8})/);
    assert.ok(m, `主题 ${name} 必须定义 --dmo-brand`);
    return m[1].toLowerCase();
  });
  assert.equal(new Set(brands).size, themes.length,
    `七套主题的 --dmo-brand 必须互不相同，实际 ${new Set(brands).size} 种：${brands.join(', ')}`);

  // 主题块必须排在默认锚点块之后才能靠顺序胜出
  const anchorAt = CSS.search(/\.dmo-dock-stack,\s*\n\.dmo-card,/);
  const firstThemeAt = CSS.indexOf("[data-dmo-theme='whale'] {");
  assert.ok(firstThemeAt > anchorAt, '主题块必须排在默认锚点块之后');
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
