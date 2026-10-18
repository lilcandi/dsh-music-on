/**
 * 收藏 / 历史 UI 结构与接线回归。
 *
 * 存在理由（本插件踩过两次的同类事故）：
 *  1) Settings.jsx 产出了 `dmo-setting-*` 类名，styles.js 里却一条规则都没有，
 *     设置页在界面上变成「一堆文字堆叠」。类名与 CSS 分居两个文件，改名不报错。
 *  2) 收藏表里的行是 div 不是 button —— 行内有播放与删除两个按钮，
 *     button 套 button 在 HTML 里非法，浏览器会把内层按钮拆到外层之外，
 *     点删除会误触发播放。这条已在播放列表里真实发生过。
 *
 * 本组断言把「结构 ↔ 样式」与「行不能是 button」两边绑死。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const libSrc = fs.readFileSync(path.join(ROOT, 'src/client/ui/LibrarySection.jsx'), 'utf8');
const settingsSrc = fs.readFileSync(path.join(ROOT, 'src/client/ui/Settings.jsx'), 'utf8');
const dockSrc = fs.readFileSync(path.join(ROOT, 'src/client/ui/ShellDock.js'), 'utf8');
const stylesSrc = fs.readFileSync(path.join(ROOT, 'src/client/styles.js'), 'utf8');
const registerSrc = fs.readFileSync(path.join(ROOT, 'src/client/register.js'), 'utf8');
const linkSrc = fs.readFileSync(path.join(ROOT, 'src/client/linkintake.js'), 'utf8');
const localeSrc = fs.readFileSync(path.join(ROOT, 'src/client/locale.js'), 'utf8');
const sourcesSrc = fs.readFileSync(path.join(ROOT, 'src/client/sources.js'), 'utf8');

/** 从源码里抽出所有字面量 className: '...' 的 dmo-* 类名。 */
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

/** 模板串里的类名（className: `dmo-...${x}`）也要算上，否则绑定会漏。 */
function templateClassNamesIn(source) {
  const found = new Set();
  const re = /className:\s*`([^`]+)`/g;
  let match = re.exec(source);
  while (match !== null) {
    for (const token of match[1].split(/[\s$]+/)) {
      if (token.startsWith('dmo-')) found.add(token);
    }
    match = re.exec(source);
  }
  return found;
}

const libClasses = new Set([...classNamesIn(libSrc), ...templateClassNamesIn(libSrc)]);

test('LibrarySection.jsx 至少产出预期的结构类名', () => {
  for (const name of [
    'dmo-lib',
    'dmo-lib-group',
    'dmo-lib-head',
    'dmo-lib-title',
    'dmo-lib-count',
    'dmo-lib-toggle',
    'dmo-lib-clear',
    'dmo-lib-help',
    'dmo-lib-list',
    'dmo-lib-row',
    'dmo-lib-chip',
    'dmo-lib-main',
    'dmo-lib-name',
    'dmo-lib-meta',
    'dmo-lib-actions',
    'dmo-lib-btn',
    'dmo-lib-empty',
  ]) {
    assert.ok(libClasses.has(name), `LibrarySection.jsx 里找不到 className: '${name}'`);
  }
});

test('LibrarySection.jsx 用到的每个 dmo-* 类名都在 styles.js 里有规则', () => {
  const missing = [];
  for (const name of libClasses) {
    // 动态拼接的平台色标签（dmo-lib-chip--bilibili 等）在模板串里，
    // 这里只要求基类 dmo-lib-chip 有规则，色变体单独断言。
    if (!stylesSrc.includes(`.${name}`)) missing.push(name);
  }
  assert.deepEqual(missing, [], `styles.js 里缺这些类名的规则：${missing.join(', ')}`);
});

test('平台标签的三个色变体都有规则（B站 / 网易云 / QQ音乐）', () => {
  for (const platform of ['bilibili', 'netease', 'qqmusic']) {
    assert.ok(
      stylesSrc.includes(`.dmo-lib-chip--${platform}`),
      `styles.js 缺 .dmo-lib-chip--${platform}，该平台标签会与「其他」同色`,
    );
  }
});

test('收藏/历史的行必须是 div，不能是 button（button 套 button 会拆节点）', () => {
  // 定位行渲染那一句：行内同时有播放键与删除键，外层必须是 div。
  const rowAt = libSrc.indexOf("className: 'dmo-lib-row'");
  assert.ok(rowAt > 0, '找不到 dmo-lib-row 的渲染点');
  // 往回找最近的 h( 调用，看它开的是哪个标签
  const before = libSrc.slice(0, rowAt);
  const openAt = before.lastIndexOf("h(\n");
  const openTag = libSrc.slice(openAt, openAt + 20);
  assert.ok(openTag.includes("'div'"), `行容器开的是 ${openTag.trim()}，必须是 'div'`);
});

test('收藏按钮必须挂在卡片头部（用户要能在播放时就地收藏）', () => {
  assert.ok(dockSrc.includes("className: `dmo-icon dmo-icon--fav"), '卡片头部缺收藏星标');
  assert.ok(dockSrc.includes('toggleFav'), '缺收藏切换处理函数');
  // 星标两态用同一枚字符位（☆/★），靠 is-on 改色 —— 换字符会让头部按钮左右跳。
  assert.ok(dockSrc.includes("favOn ? '★' : '☆'"), '星标两态字符不对');
});

test('收藏地址一律取 track.pageUrl，绝不直接存 track.url', () => {
  // track.url 可能是 blob: / 相对路径（预置音景）/ 播放器壳，存进收藏重启必然打不开。
  assert.ok(dockSrc.includes('function currentPageUrl'), '缺 currentPageUrl 取值函数');
  assert.ok(/currentPageUrl\(engine\)/.test(dockSrc), '收藏状态没走 currentPageUrl');
  assert.ok(sourcesSrc.includes('export function trackPageUrl'), 'sources.js 缺 trackPageUrl');
  assert.ok(/pageUrl: trackPageUrl\(track\)/.test(sourcesSrc), 'describeTrack 没带出 pageUrl');
  // B 站必须由 bvid 反推成 www.bilibili.com 的页面地址，而不是播放器壳
  assert.ok(
    sourcesSrc.includes('https://www.bilibili.com/video/'),
    'trackPageUrl 没把 bvid 反推成可收藏的页面地址',
  );
});

test('历史只在入队成功后写一次，不许两处各写一遍', () => {
  // linkintake 内部统一写一次（批量，只广播一次）
  assert.ok(linkSrc.includes('recordHistoryMany'), 'linkintake 没记历史');
  assert.ok(linkSrc.includes("from './library.js'"), 'linkintake 没接 library 数据层');
  // LibrarySection 从收藏里再播时不得自己再写一次，否则「播放 N 次」会翻倍
  assert.ok(
    !/recordHistory\(/.test(libSrc),
    'LibrarySection 里又写了一次 recordHistory —— 同一次播放会累加两次次数',
  );
});

test('设置分区把 engine 与 t 一起交给 Settings（否则收藏表的播放键是装饰）', () => {
  assert.ok(/engine: runtime\.engine, t/.test(registerSrc), 'Settings 没拿到 engine / t');
  assert.ok(/inject: \(\) => \(\{ runtime, t \}\)/.test(registerSrc), '设置槽位没注入 t');
  assert.ok(settingsSrc.includes("from './LibrarySection.jsx'"), 'Settings.jsx 没挂 LibrarySection');
  assert.ok(/h\(LibrarySection, \{ key: 'library', engine, t \}\)/.test(settingsSrc),
    'Settings.jsx 没把 engine / t 透传给 LibrarySection');
});

test('收藏与历史用两把独立的键（清空历史不该顺手清掉收藏）', () => {
  const dataSrc = fs.readFileSync(path.join(ROOT, 'src/client/library.js'), 'utf8');
  assert.ok(dataSrc.includes("FAV_KEY = 'dsh-music-on:favorites.v1'"), '收藏键不对');
  assert.ok(dataSrc.includes("HIST_KEY = 'dsh-music-on:history.v1'"), '历史键不对');
});

test('新增的 lib.* 文案在 zh 与 en 里成对存在（漏一条界面就漏 key）', () => {
  // 从 LibrarySection.jsx 抽出所有 tr('lib.xxx', ...) 的 key
  const keys = new Set();
  const re = /tr\('(lib\.[A-Za-z0-9_]+)'/g;
  let match = re.exec(libSrc);
  while (match !== null) {
    keys.add(match[1]);
    match = re.exec(libSrc);
  }
  assert.ok(keys.size >= 12, `只抽到 ${keys.size} 个 lib.* key，看起来抽取规则失效了`);

  // 切出 zh 段与 en 段
  const zhAt = localeSrc.indexOf('zh: {');
  const enAt = localeSrc.indexOf('en: {');
  assert.ok(zhAt > 0 && enAt > zhAt, 'locale.js 的 zh / en 段定位失败');
  const zhBlock = localeSrc.slice(zhAt, enAt);
  const enBlock = localeSrc.slice(enAt);

  const missingZh = [...keys].filter((key) => !zhBlock.includes(`'${key}'`));
  const missingEn = [...keys].filter((key) => !enBlock.includes(`'${key}'`));
  assert.deepEqual(missingZh, [], `zh 字典缺：${missingZh.join(', ')}`);
  assert.deepEqual(missingEn, [], `en 字典缺：${missingEn.join(', ')}`);
});

test('dock 新增的收藏文案也在两套字典里', () => {
  for (const key of ['dock.favorite', 'dock.favorited', 'dock.unfavorited', 'dock.favNoUrl']) {
    const hits = localeSrc.split(`'${key}'`).length - 1;
    assert.ok(hits >= 2, `locale.js 里 '${key}' 只出现 ${hits} 次，zh / en 没成对`);
  }
});
