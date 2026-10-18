/**
 * library.js 单测 —— 收藏与历史的数据层。
 *
 * 重点覆盖三类容易静默出错的边界：
 *  1) 规范化：分享追踪参数要剥掉，但网易云 hash 路由里的业务 id 绝不能剥。
 *  2) 去重：同一条链接反复粘，列表里只能有一行。
 *  3) 脏数据：非 http 地址（blob/file/空串）必须被拒，否则重启后留下死链。
 *
 * localStorage 用内存桩注入到 globalThis —— library.js 里的裸标识符
 * `localStorage` 会沿作用域链落到全局，所以直接赋值即可生效。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

/* ---------------- localStorage 桩 ---------------- */

const memory = new Map();
const store = {
  getItem: (key) => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => { memory.set(key, String(value)); },
  removeItem: (key) => { memory.delete(key); },
  clear: () => { memory.clear(); },
};
globalThis.localStorage = store;

const lib = await import('../src/client/library.js');
const {
  canonicalUrl, platformOf, platformLabel, normalizeEntry, relativeTime,
  loadFavorites, addFavorite, removeFavorite, isFavorite, toggleFavorite, clearFavorites,
  loadHistory, recordHistory, recordHistoryMany, removeHistory, clearHistory,
  subscribeLibrary, FAV_KEY, HIST_KEY, FAV_MAX, HIST_MAX,
} = lib;

/** 每个用例前清空存储，避免用例间互相污染。 */
function reset() {
  memory.clear();
}

/* ---------------- canonicalUrl ---------------- */

test('canonicalUrl：剥掉 B站的分享追踪参数，保留 bvid', () => {
  const got = canonicalUrl(
    'https://www.bilibili.com/video/BV1Lyw7zPEeo/?spm_id_from=333.337.search-card.all.click&vd_source=abc123',
  );
  assert.equal(got, 'https://www.bilibili.com/video/BV1Lyw7zPEeo/');
});

test('canonicalUrl：网易云 hash 路由的业务 id 必须保留', () => {
  const got = canonicalUrl('https://music.163.com/#/playlist?id=24381616');
  // 这是本模块最危险的一处：早期实现直接 `parsed.hash = ''`，会把 id 抹掉，
  // 结果所有网易云歌单共用一个 id。断言到具体 id 才能防住回归。
  assert.match(got, /24381616/);
  assert.notEqual(got, 'https://music.163.com/');
});

test('canonicalUrl：两条不同网易云歌单不会塌缩成同一条', () => {
  const a = canonicalUrl('https://music.163.com/#/playlist?id=24381616');
  const b = canonicalUrl('https://music.163.com/#/playlist?id=99999999');
  assert.notEqual(a, b);
});

test('canonicalUrl：网易云 hash 里的追踪参数被剥掉', () => {
  const got = canonicalUrl('https://music.163.com/#/playlist?id=24381616&from=outchain&utm_source=x');
  assert.match(got, /24381616/);
  assert.doesNotMatch(got, /utm_source/);
});

test('canonicalUrl：纯锚点 hash 丢弃，路径 hash 保留', () => {
  assert.equal(canonicalUrl('https://y.qq.com/n/ryqq/songDetail/001#'), 'https://y.qq.com/n/ryqq/songDetail/001');
  assert.equal(canonicalUrl('https://y.qq.com/n/ryqq/playlist/123#/detail'), 'https://y.qq.com/n/ryqq/playlist/123#/detail');
});

test('canonicalUrl：QQ 音乐的 disstid 这类业务参数不被误删', () => {
  // 黑名单是按精确名判定的，`id`/`t`/`p` 这类短参数必须活着。
  const got = canonicalUrl('https://y.qq.com/n/ryqq/playlist/123?disstid=456&id=789');
  assert.match(got, /disstid=456/);
  assert.match(got, /id=789/);
});

test('canonicalUrl：非法输入不抛错，原样去空格返回', () => {
  assert.equal(canonicalUrl('  不是链接  '), '不是链接');
  assert.equal(canonicalUrl(null), '');
  assert.equal(canonicalUrl(undefined), '');
  assert.equal(canonicalUrl(12345), '12345');
});

/* ---------------- platformOf ---------------- */

test('platformOf：五个平台各自识别正确', () => {
  assert.equal(platformOf('https://www.bilibili.com/video/BV1Lyw7zPEeo/'), 'bilibili');
  assert.equal(platformOf('https://b23.tv/abc'), 'bilibili');
  assert.equal(platformOf('https://music.163.com/#/playlist?id=1'), 'netease');
  assert.equal(platformOf('https://y.qq.com/n/ryqq/playlist/1'), 'qqmusic');
  assert.equal(platformOf('https://www.youtube.com/watch?v=abc'), 'youtube');
  assert.equal(platformOf('https://youtu.be/abc'), 'youtube');
  assert.equal(platformOf('https://cdn.example.com/a.mp3'), 'direct');
  assert.equal(platformOf('https://example.com/page'), 'other');
});

test('platformOf：后缀判定，不让伪造域名混进来', () => {
  // evilbilibili.com 与 bilibili.com.evil.tld 都只是「包含」目标域，不是子域。
  assert.equal(platformOf('https://evilbilibili.com/video/BV1Lyw7zPEeo/'), 'other');
  assert.equal(platformOf('https://bilibili.com.evil.tld/x'), 'other');
});

test('platformOf：解析失败落到 other，不抛错', () => {
  assert.equal(platformOf(''), 'other');
  assert.equal(platformOf('not a url'), 'other');
});

test('platformLabel：每个平台都有中文标签，未知回落「链接」', () => {
  assert.equal(platformLabel('bilibili'), 'B站');
  assert.equal(platformLabel('netease'), '网易云');
  assert.equal(platformLabel('qqmusic'), 'QQ音乐');
  assert.equal(platformLabel('youtube'), 'YouTube');
  assert.equal(platformLabel('direct'), '直链');
  assert.equal(platformLabel('完全没见过的值'), '链接');
});

/* ---------------- normalizeEntry ---------------- */

test('normalizeEntry：非 http 地址一律拒绝', () => {
  // 这三类是本地拖入文件与临时对象地址，重启后必然失效，存进去就是死链。
  assert.equal(normalizeEntry({ url: 'blob:http://localhost/abc' }), null);
  assert.equal(normalizeEntry({ url: 'file:///C:/music/a.mp3' }), null);
  assert.equal(normalizeEntry({ url: '' }), null);
  assert.equal(normalizeEntry(null), null);
  assert.equal(normalizeEntry('不是对象'), null);
});

test('normalizeEntry：补全缺失字段且 id 等于规范化 url', () => {
  const entry = normalizeEntry({ url: 'https://www.bilibili.com/video/BV1Lyw7zPEeo/?spm_id_from=x' });
  assert.equal(entry.id, entry.url);
  assert.equal(entry.platform, 'bilibili');
  assert.equal(entry.title, '');
  assert.equal(entry.plays, 1);
  assert.ok(Number.isFinite(entry.addedAt));
  assert.ok(Number.isFinite(entry.playedAt));
});

test('normalizeEntry：标题超长被截断', () => {
  const long = 'x'.repeat(500);
  const entry = normalizeEntry({ url: 'https://y.qq.com/n/ryqq/songDetail/001', title: long });
  assert.equal(entry.title.length, lib.__test.TITLE_MAX);
});

/* ---------------- 收藏 ---------------- */

test('收藏：加入 / 查询 / 移除', () => {
  reset();
  assert.deepEqual(loadFavorites(), []);
  addFavorite({ url: 'https://www.bilibili.com/video/BV1Lyw7zPEeo/', title: '第一首' });
  assert.equal(loadFavorites().length, 1);
  assert.equal(isFavorite('https://www.bilibili.com/video/BV1Lyw7zPEeo/'), true);
  removeFavorite('https://www.bilibili.com/video/BV1Lyw7zPEeo/');
  assert.equal(loadFavorites().length, 0);
});

test('收藏：同一条链接重复加入只有一行，且提到最前', () => {
  reset();
  addFavorite({ url: 'https://www.bilibili.com/video/BV1Lyw7zPEeo/', title: 'A' });
  addFavorite({ url: 'https://music.163.com/#/playlist?id=24381616', title: 'B' });
  addFavorite({ url: 'https://www.bilibili.com/video/BV1Lyw7zPEeo/?spm_id_from=zzz', title: 'A' });
  const list = loadFavorites();
  assert.equal(list.length, 2, '追踪参数不同的同一链接必须去重');
  assert.equal(list[0].title, 'A', '重复加入应提到最前');
});

test('收藏：toggleFavorite 双向切换', () => {
  reset();
  const url = 'https://www.bilibili.com/video/BV1Lyw7zPEeo/';
  const on = toggleFavorite(url);
  assert.equal(on.favorited, true);
  assert.equal(on.list.length, 1);
  const off = toggleFavorite(url);
  assert.equal(off.favorited, false);
  assert.equal(off.list.length, 0);
});

test('收藏：脏数据被拒且不改变已有列表', () => {
  reset();
  addFavorite({ url: 'https://www.bilibili.com/video/BV1Lyw7zPEeo/', title: 'A' });
  const before = loadFavorites();
  const after = addFavorite({ url: 'blob:http://localhost/x' });
  assert.deepEqual(after, before);
});

test('收藏：清空', () => {
  reset();
  addFavorite({ url: 'https://www.bilibili.com/video/BV1Lyw7zPEeo/' });
  clearFavorites();
  assert.deepEqual(loadFavorites(), []);
});

test('收藏：超过上限时截断到 FAV_MAX', () => {
  reset();
  const many = [];
  for (let i = 0; i < FAV_MAX + 30; i += 1) {
    many.push({ url: `https://www.bilibili.com/video/BV1Lyw7zPE${String(i).padStart(2, '0')}/` });
  }
  const list = lib.__test.writeList(FAV_KEY, many, FAV_MAX);
  assert.equal(list.length, FAV_MAX);
});

/* ---------------- 历史 ---------------- */

test('历史：记录一条，字段补齐', () => {
  reset();
  recordHistory({ url: 'https://www.bilibili.com/video/BV1Lyw7zPEeo/', title: 'Lofi Girl' });
  const list = loadHistory();
  assert.equal(list.length, 1);
  assert.equal(list[0].title, 'Lofi Girl');
  assert.equal(list[0].plays, 1);
});

test('历史：重复记录不新增行，播放次数累加且时间提前', () => {
  reset();
  const url = 'https://www.bilibili.com/video/BV1Lyw7zPEeo/';
  recordHistory({ url, title: 'A' });
  recordHistory({ url: 'https://music.163.com/#/playlist?id=24381616', title: 'B' });
  recordHistory({ url, title: 'A' });
  const list = loadHistory();
  assert.equal(list.length, 2);
  assert.equal(list[0].title, 'A', '重复播放应提到最前');
  assert.equal(list[0].plays, 2);
});

test('历史：新标题为空时保留旧标题，不被空串抹掉', () => {
  reset();
  const url = 'https://www.bilibili.com/video/BV1Lyw7zPEeo/';
  recordHistory({ url, title: '原始标题' });
  // 第二次解析失败没拿到标题，此时若用空串覆盖，用户看到的就是一条无名记录。
  recordHistory({ url, title: '' });
  assert.equal(loadHistory()[0].title, '原始标题');
});

test('历史：批量记录只写一次存储，去重正确', () => {
  reset();
  recordHistoryMany([
    { url: 'https://www.bilibili.com/video/BV1Lyw7zPEeo/', title: 'A' },
    { url: 'https://music.163.com/#/playlist?id=24381616', title: 'B' },
    { url: 'https://www.bilibili.com/video/BV1Lyw7zPEeo/', title: 'A' },
  ]);
  const list = loadHistory();
  assert.equal(list.length, 2);
  assert.equal(list[0].plays, 2);
});

test('历史：删除一条与清空', () => {
  reset();
  recordHistory({ url: 'https://www.bilibili.com/video/BV1Lyw7zPEeo/' });
  recordHistory({ url: 'https://music.163.com/#/playlist?id=24381616' });
  removeHistory('https://www.bilibili.com/video/BV1Lyw7zPEeo/');
  assert.equal(loadHistory().length, 1);
  clearHistory();
  assert.deepEqual(loadHistory(), []);
});

test('历史：上限截断', () => {
  reset();
  const many = [];
  for (let i = 0; i < HIST_MAX + 20; i += 1) {
    many.push({ url: `https://www.bilibili.com/video/BV1Lyw7zPE${String(i).padStart(2, '0')}/` });
  }
  const list = lib.__test.writeList(HIST_KEY, many, HIST_MAX);
  assert.equal(list.length, HIST_MAX);
});

test('收藏与历史互不干扰：清历史不动收藏', () => {
  reset();
  addFavorite({ url: 'https://www.bilibili.com/video/BV1Lyw7zPEeo/', title: 'A' });
  recordHistory({ url: 'https://music.163.com/#/playlist?id=24381616', title: 'B' });
  clearHistory();
  assert.equal(loadFavorites().length, 1, '清空历史不应连带清掉收藏');
});

/* ---------------- 存储异常 ---------------- */

test('存储损坏：读到坏 JSON 时返回空列表而不抛错', () => {
  reset();
  memory.set(FAV_KEY, '{ 这不是 JSON');
  assert.deepEqual(loadFavorites(), []);
  memory.set(HIST_KEY, '{"not":"array"}');
  assert.deepEqual(loadHistory(), []);
});

test('存储不可用：localStorage 抛错时读写降级但不崩', () => {
  reset();
  const original = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: () => { throw new Error('隐私模式'); },
    setItem: () => { throw new Error('隐私模式'); },
    removeItem: () => { throw new Error('隐私模式'); },
  };
  try {
    assert.deepEqual(loadFavorites(), []);
    // 写入失败也要返回新列表，UI 才能如实显示「加了但没落盘」而不是假装无事。
    const list = addFavorite({ url: 'https://www.bilibili.com/video/BV1Lyw7zPEeo/' });
    assert.equal(list.length, 1);
  } finally {
    globalThis.localStorage = original;
  }
});

/* ---------------- 订阅 ---------------- */

test('订阅：写入时被通知，取消后不再收到', () => {
  reset();
  let hits = 0;
  const off = subscribeLibrary(() => { hits += 1; });
  addFavorite({ url: 'https://www.bilibili.com/video/BV1Lyw7zPEeo/' });
  assert.equal(hits, 1);
  off();
  addFavorite({ url: 'https://music.163.com/#/playlist?id=24381616' });
  assert.equal(hits, 1);
});

test('订阅：单个订阅者抛错不影响其余订阅者', () => {
  reset();
  let ok = 0;
  const off1 = subscribeLibrary(() => { throw new Error('坏订阅者'); });
  const off2 = subscribeLibrary(() => { ok += 1; });
  addFavorite({ url: 'https://www.bilibili.com/video/BV1Lyw7zPEeo/' });
  assert.equal(ok, 1);
  off1();
  off2();
});

/* ---------------- relativeTime ---------------- */

test('relativeTime：各档位文案', () => {
  const now = 1_700_000_000_000;
  assert.equal(relativeTime(now, now), '刚刚');
  assert.equal(relativeTime(now - 30_000, now), '刚刚');
  assert.equal(relativeTime(now - 5 * 60_000, now), '5 分钟前');
  assert.equal(relativeTime(now - 3 * 3_600_000, now), '3 小时前');
  assert.equal(relativeTime(now - 2 * 86_400_000, now), '2 天前');
});

test('relativeTime：时钟回拨不产出负数文案', () => {
  const now = 1_700_000_000_000;
  // 用户改系统时间 / 存储里的时间戳来自未来时，绝不能显示「-3 小时前」。
  assert.equal(relativeTime(now + 3_600_000, now), '刚刚');
});
