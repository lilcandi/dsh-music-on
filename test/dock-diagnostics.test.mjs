/**
 * 右下音乐库的「静音诊断」回归。
 *
 * 存在理由（真实踩过的坑）：用户粘贴 B站链接后，界面上是一条漂亮的绿色
 * 「已加入 1 条」，耳朵里却一片安静。原因是 summarizeReport 只在 added>0 时
 * 拼成功文案，把 item.note 里的解析失败原因全吞掉了 —— 诊断信息被自己的
 * 成功文案掩盖，导致「无法播放」这件事反复说不清、只能靠猜。
 *
 * 这组断言钉死三件事：
 *   1. 降级入队时，小结里必须出现失败原因；
 *   2. 降级入队时，hasDegradedItem 必须为真（UI 据此改成失败语气）；
 *   3. ShellDock 里出现的 dmo-diag* 类名，styles.js 必须有对应规则。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { summarizeReport, hasDegradedItem } from '../src/client/linkintake.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const okReport = {
  added: 1,
  skipped: 0,
  errors: [],
  items: [{ url: 'https://www.bilibili.com/video/BV1Lyw7zPEeo/', route: 'bilibili', added: true, cid: '1', note: null }],
};

const degradedReport = {
  added: 1,
  skipped: 0,
  errors: [],
  items: [{
    url: 'https://www.bilibili.com/video/BV1Lyw7zPEeo/',
    route: 'bilibili',
    added: true,
    cid: null,
    note: '解析服务返回 HTTP 401：dsh web authentication required',
  }],
};

test('成功入队：小结只说加入了，不冒充失败', () => {
  const text = summarizeReport(okReport);
  assert.ok(text.includes('已加入 1 条'));
  assert.ok(!text.includes('但：'));
  assert.equal(hasDegradedItem(okReport), false);
});

test('降级入队：小结必须把失败原因说出来', () => {
  const text = summarizeReport(degradedReport);
  assert.ok(text.includes('已加入 1 条'), '成功的事实仍要保留');
  assert.ok(text.includes('但：'), '必须出现转折，不能只报喜');
  assert.ok(text.includes('HTTP 401'), `失败原因必须透出，实际是：${text}`);
});

test('降级入队：hasDegradedItem 为真，UI 才能把提示改成失败语气', () => {
  assert.equal(hasDegradedItem(degradedReport), true);
});

test('全部失败时：报错优先于成功文案', () => {
  const text = summarizeReport({
    added: 0,
    skipped: 1,
    items: [{ url: 'x', route: 'unsupported', added: false, note: '不受支持' }],
    errors: ['x：不受支持'],
  });
  assert.ok(text.includes('跳过 1 条'));
  assert.ok(text.includes('不受支持'));
});

test('空报告与 null 不抛错', () => {
  assert.equal(summarizeReport(null), '');
  assert.equal(hasDegradedItem(null), false);
  assert.equal(hasDegradedItem({}), false);
});

/* ---------------- 类名与 CSS 的双向绑定 ---------------- */

const dockSrc = fs.readFileSync(path.join(ROOT, 'src/client/ui/ShellDock.js'), 'utf8');
const stylesSrc = fs.readFileSync(path.join(ROOT, 'src/client/styles.js'), 'utf8');

test('ShellDock 的诊断行类名，styles.js 全部有对应规则', () => {
  for (const name of ['dmo-diag', 'dmo-diag-label', 'dmo-diag-value']) {
    assert.ok(dockSrc.includes(name), `ShellDock.js 应产出 ${name}`);
    assert.ok(stylesSrc.includes(`.${name}`), `styles.js 缺少 .${name} 的规则（会退化成纯文字堆叠）`);
  }
});

/* ---------------- 平台曲目的「不可播」标记 ---------------- */

test('队列里必须标出「无直链」的条目，否则每行看起来都一样', () => {
  // 网易云 / QQ 的会员曲拿不到直链：入队成功、曲名正常、卡片毫无异样，
  // 点下去却必然报错。不标出来，用户只会以为是随机的「点了没反应」。
  for (const name of ['dmo-queue-badge', 'dmo-queue-row--blocked']) {
    assert.ok(dockSrc.includes(name), `ShellDock.js 应产出 ${name}`);
    assert.ok(stylesSrc.includes(`.${name}`), `styles.js 缺少 .${name}（标记会退化成裸文字）`);
  }
  assert.ok(
    /unavailableReason === 'string' && item\.unavailableReason !== ''/.test(dockSrc),
    'blocked 判定必须读 item.unavailableReason，而不是靠 kind 猜',
  );
  assert.ok(dockSrc.includes("t('dock.vipBadge'"), '徽标文案必须走 locale，不能写死中文');
});

test('当前曲目不可播时，诊断行必须把原因抬到界面上', () => {
  assert.ok(
    /const blockedReason = state && state\.track && typeof state\.track\.unavailableReason === 'string'/.test(dockSrc),
    'ShellDock 必须从 state.track 取 blockedReason',
  );
  assert.ok(dockSrc.includes('dmo-diag--blocked'), '不可播的诊断行要有独立类名');
  assert.ok(stylesSrc.includes('.dmo-diag--blocked'), 'styles.js 缺少 .dmo-diag--blocked');
});

test('平台徽标与不可播诊断的文案，zh/en 必须成对', () => {
  const localeSrc = fs.readFileSync(path.join(ROOT, 'src/client/locale.js'), 'utf8');
  const zh = localeSrc.slice(localeSrc.indexOf('zh:'), localeSrc.indexOf('en:'));
  const en = localeSrc.slice(localeSrc.indexOf('en:'));
  for (const key of ["'dock.vipBadge'"]) {
    assert.ok(zh.includes(key), `zh 字典缺少 ${key}`);
    assert.ok(en.includes(key), `en 字典缺少 ${key}`);
  }
});

test('iframe 渲染面与嵌入舱位的类名，styles.js 全部有对应规则', () => {
  for (const name of ['dmo-embed', 'dmo-embed-frame', 'dmo-embed-note', 'dmo-embed-missing']) {
    assert.ok(stylesSrc.includes(`.${name}`), `styles.js 缺少 .${name}`);
  }
  assert.ok(dockSrc.includes("h('iframe'"), 'ShellDock 必须真的挂出 iframe，否则外部模式下用户只看到「播放中」却没有声音');
});

test('提示条时长：失败提示必须比成功提示留得久', () => {
  assert.ok(
    /note\.tone === 'bad' \? 15000 : 4000/.test(dockSrc),
    '失败提示若和成功一样 4 秒消失，长句原因根本读不完，等于没提示',
  );
});
