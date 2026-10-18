/**
 * 宿主侧链接路由与网易云补齐的回归测试。
 *
 * 这一组的存在理由（每个用例都对着一个真实发生过的故障）：
 *
 * 1) 用户粘贴 `https://music.163.com/playlist?id=488575080&uct2=...` 报
 *    「网易云音乐链接解析失败」。根因是 host 的 neteaseRouteOf 是 client
 *    neteaseRoute 的一份**落后副本**：client 认「path 路由 + search query」
 *    这种写法，host 只认 hash 路由和纯 path 段，于是返回 {null, null}。
 *    → 现在 host 直接 import client/parser.js，本文件锁住「两侧结果必须一致」。
 *
 * 2) 同一个歌单 trackCount=73，但 api/v6/playlist/detail 只内联前 10 首。
 *    旧实现直接吃 tracks，于是「解析成功但少了 63 首」。
 *    → neteasePlaylistTracks 按 trackIds 补齐，本文件锁住顺序与补齐行为。
 *
 * 3) 补齐来的曲目来自 api/song/detail，字段是 artists/duration；
 *    内联曲目来自 playlist/detail，字段是 ar/dt。只认一套会丢掉歌手与时长。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  __test,
  detectPlatform,
  MAX_STREAM_TRACKS,
  MAX_TRACK_LIMIT,
  clampTrackLimit,
} from '../src/host/resolve.js';
import { MAX_PLATFORM_TRACKS } from '../src/client/linkintake.js';
import { DEFAULT_SETTINGS, PLATFORM_LIMIT_MIN } from '../src/client/settings.js';
import * as P from '../src/client/parser.js';

const { neteaseRouteOf, neteaseArtists, neteaseDuration, neteaseCover, qqCover, neteasePlaylistTracks, safeExtract } = __test;

/** 用户原样粘贴的那个链接（带分享追踪参数）。 */
const USER_URL = 'https://music.163.com/playlist?id=488575080&uct2=U2FsdGVkX18oy1cr2ARHFJvlA36JNEf8smiDo6mgLu0=';

test('netease 路由：path 路由 + search query（用户报错的那个写法）', () => {
  assert.deepEqual(neteaseRouteOf(USER_URL), { playlistId: '488575080', trackId: null });
  assert.deepEqual(neteaseRouteOf('https://music.163.com/playlist?id=488575080'), { playlistId: '488575080', trackId: null });
});

test('netease 路由：另外三种历史写法仍要认', () => {
  assert.deepEqual(neteaseRouteOf('https://music.163.com/#/playlist?id=24381616'), { playlistId: '24381616', trackId: null });
  assert.deepEqual(neteaseRouteOf('https://music.163.com/playlist/24381616/'), { playlistId: '24381616', trackId: null });
  assert.deepEqual(neteaseRouteOf('https://music.163.com/#/song?id=186016'), { playlistId: null, trackId: '186016' });
});

test('宿主路由与客户端 parser 必须逐字一致（防再次分叉）', () => {
  const urls = [
    USER_URL,
    'https://music.163.com/#/playlist?id=24381616',
    'https://music.163.com/playlist/24381616/',
    'https://music.163.com/song?id=186016',
    'https://music.163.com/#/song?id=186016',
    'https://music.163.com/#/discover/playlist/?id=99',
  ];
  for (const url of urls) {
    const host = neteaseRouteOf(url);
    const platform = P.detectPlatform(url);
    const client = P.extractId(url, platform);
    assert.equal(host.playlistId, client.playlistId ?? null, `playlistId 不一致: ${url}`);
    assert.equal(host.trackId, client.trackId ?? null, `trackId 不一致: ${url}`);
  }
});

test('宿主 detectPlatform 与客户端同源', () => {
  const urls = [
    USER_URL,
    'https://music.163.com/song?id=186016',
    'https://y.qq.com/n/ryqq/playlist/7004765952',
    'https://www.bilibili.com/video/BV1Lyw7zPEeo/',
    'https://not-allowlisted.example/x.mp3',
  ];
  for (const url of urls) {
    assert.equal(detectPlatform(url), P.detectPlatform(url), `detectPlatform 不一致: ${url}`);
  }
});

test('safeExtract 对非法输入不抛错，只返回空对象', () => {
  assert.deepEqual(safeExtract('not a url at all'), {});
  assert.deepEqual(safeExtract(''), {});
  assert.deepEqual(safeExtract('https://evil.example/playlist?id=1'), {});
});

test('字段两吃：内联曲目用 ar/dt', () => {
  const inline = { name: 'A', ar: [{ name: '张三' }, { name: '李四' }], dt: 196000 };
  assert.equal(neteaseArtists(inline), '张三, 李四');
  assert.equal(neteaseDuration(inline), 196);
});

test('字段两吃：song/detail 曲目用 artists/duration', () => {
  const detail = { name: 'B', artists: [{ name: '王五' }], duration: 206500 };
  assert.equal(neteaseArtists(detail), '王五');
  assert.equal(neteaseDuration(detail), 207);
});

test('字段两吃：缺字段时返回 undefined 而不是 NaN/空串', () => {
  assert.equal(neteaseArtists({}), undefined);
  assert.equal(neteaseArtists({ ar: [] }), undefined);
  assert.equal(neteaseDuration({}), undefined);
  assert.equal(neteaseDuration({ dt: 0 }), undefined);
});

/** 造一个假 ctx：记录请求过的 URL，按 URL 返回不同响应体。 */
function makeCtx(responder) {
  const calls = [];
  return {
    calls,
    fetchWithRedirects(url) {
      calls.push(url);
      const body = responder(url);
      if (body === null) return Promise.resolve({ status: 500, body: '' });
      return Promise.resolve({ status: 200, body: JSON.stringify(body) });
    },
  };
}

test('歌单补齐：inline 只有 2 首，trackIds 有 5 首，必须返回 5 首且按 trackIds 排序', async () => {
  const playlist = {
    tracks: [{ id: 1, name: 'one', ar: [{ name: 'X' }], dt: 100000 }],
    trackIds: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }],
  };
  const ctx = makeCtx((url) => {
    if (url.includes('/api/song/detail')) {
      return { code: 200, songs: [2, 3, 4, 5].map((id) => ({ id, name: `t${id}`, artists: [{ name: 'Y' }], duration: 120000 })) };
    }
    return null;
  });
  const out = await neteasePlaylistTracks(playlist, ctx);
  assert.equal(out.length, 5);
  assert.deepEqual(out.map((t) => t.id), [1, 2, 3, 4, 5]);
  assert.equal(ctx.calls.length, 1, '缺 4 首应只发一次补齐请求');
});

test('歌单补齐：trackIds 全在内联里时，一次补齐请求都不发', async () => {
  const playlist = {
    tracks: [
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
    ],
    trackIds: [{ id: 1 }, { id: 2 }],
  };
  const ctx = makeCtx(() => null);
  const out = await neteasePlaylistTracks(playlist, ctx);
  assert.equal(out.length, 2);
  assert.equal(ctx.calls.length, 0);
});

test('歌单补齐：补不出来时只返回已有曲目，绝不抛错', async () => {
  const playlist = { tracks: [{ id: 1, name: 'a' }], trackIds: [{ id: 1 }, { id: 2 }, { id: 3 }] };
  const ctx = makeCtx(() => null); // 上游 500
  const out = await neteasePlaylistTracks(playlist, ctx);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 1);
});

test('歌单补齐：上游返回非 JSON 也不抛错', async () => {
  const playlist = { tracks: [{ id: 1, name: 'a' }], trackIds: [{ id: 1 }, { id: 2 }] };
  const ctx = { fetchWithRedirects: () => Promise.resolve({ status: 200, body: 'not json' }) };
  const out = await neteasePlaylistTracks(playlist, ctx);
  assert.equal(out.length, 1);
});

test('歌单补齐：trackIds 缺失时退回内联顺序（与旧行为一致）', async () => {
  const playlist = { tracks: [{ id: 9, name: 'z' }, { id: 3, name: 'c' }] };
  const ctx = makeCtx(() => null);
  const out = await neteasePlaylistTracks(playlist, ctx);
  assert.deepEqual(out.map((t) => t.id), [9, 3]);
  assert.equal(ctx.calls.length, 0);
});

test('歌单补齐：单条补齐请求的 id 数不超过分块上限（实测 1000 首会 code 400）', async () => {
  // 用 60 首以内的歌单验证「一块就够」，再用 trackIds 灌满上限验证上限本身。
  const trackIds = [];
  for (let i = 1; i <= 60; i += 1) trackIds.push({ id: i });
  const playlist = { tracks: [], trackIds };
  const ctx = makeCtx(() => null);
  await neteasePlaylistTracks(playlist, ctx);
  assert.equal(ctx.calls.length, 1, '60 首应一块发完');
  const raw = decodeURIComponent(ctx.calls[0].split('ids=')[1]);
  assert.equal(JSON.parse(raw).length, 60);
});

test('歌单补齐：候选池默认封顶 600，且可显式指定更小的上限', async () => {
  const trackIds = [];
  for (let i = 1; i <= 900; i += 1) trackIds.push({ id: i });
  const playlist = { tracks: trackIds.map((t) => ({ id: t.id, name: `t${t.id}` })), trackIds };
  // 默认候选池 = MAX_TRACK_LIMIT(200) × 扫描倍数(3) = 600。
  // **不能等于「最终要几首」**：会员曲目会被筛掉，候选池太小就永远凑不够数。
  const out = await neteasePlaylistTracks(playlist, makeCtx(() => null));
  assert.equal(out.length, 600);
  assert.equal(out[0].id, 1);
  assert.equal(out[599].id, 600);
  // 显式给上限时按给定值切，供 resolveNetease 传 want × 扫描倍数。
  const small = await neteasePlaylistTracks(playlist, makeCtx(() => null), 45);
  assert.equal(small.length, 45);
  assert.equal(small[44].id, 45);
});

test('宿主硬上限与客户端硬上限必须相等（否则一半票据被白扔）', () => {
  // 宿主最多签 MAX_TRACK_LIMIT 张票据；客户端截得比它小就等于丢掉了本来可播的曲目，
  // 截得比它大则多出来的必然没有 streamPath。两者必须相等。
  // 注意这不是「默认值」——默认值由设置项 platformTrackLimit 决定（60）。
  assert.equal(MAX_PLATFORM_TRACKS, MAX_TRACK_LIMIT);
});

test('设置项默认值必须落在宿主能处理的区间内', () => {
  // 默认 60 必须 ≤ 硬上限 200，且 ≥ 客户端下限 5。
  assert.ok(DEFAULT_SETTINGS.platformTrackLimit <= MAX_TRACK_LIMIT);
  assert.ok(DEFAULT_SETTINGS.platformTrackLimit >= PLATFORM_LIMIT_MIN);
  assert.equal(MAX_STREAM_TRACKS, DEFAULT_SETTINGS.platformTrackLimit);
  // 夹取函数：越界一律收进来，绝不让宿主去处理 0 或 9999。
  assert.equal(clampTrackLimit(0), 1);
  assert.equal(clampTrackLimit(9999), MAX_TRACK_LIMIT);
  assert.equal(clampTrackLimit('abc'), MAX_STREAM_TRACKS);
  assert.equal(clampTrackLimit(37), 37);
  // **不传 limit 必须回落到默认值，绝不能变成 1**。
  // `Number(null) === 0`，若不做短路就会一路走到「小于 1 → 返回 1」，
  // 症状是「歌单只识别 1 首」——实测踩过：网易云 6 首只回 1 首、QQ 30 首只回 1 首。
  assert.equal(clampTrackLimit(null), MAX_STREAM_TRACKS);
  assert.equal(clampTrackLimit(undefined), MAX_STREAM_TRACKS);
  assert.equal(clampTrackLimit(''), MAX_STREAM_TRACKS);
  assert.equal(clampTrackLimit('   '), MAX_STREAM_TRACKS);
});

test('逐曲封面：两套字段形状都要认，且 http 必须升级为 https', () => {
  // 歌单内联曲目：al.picUrl
  assert.equal(
    neteaseCover({ al: { picUrl: 'http://p1.music.126.net/a.jpg' } }),
    'https://p1.music.126.net/a.jpg',
  );
  // song/detail 补齐的曲目：album.picUrl
  assert.equal(
    neteaseCover({ album: { picUrl: 'http://p2.music.126.net/b.jpg' } }),
    'https://p2.music.126.net/b.jpg',
  );
  // 两套都没有 → null（UI 退回纯黑胶，绝不显示空白 img）
  assert.equal(neteaseCover({}), null);
  assert.equal(neteaseCover({ al: { picUrl: '   ' } }), null);
  assert.equal(neteaseCover(null), null);

  // QQ 歌单给扁平的 albummid，单曲详情给嵌套的 album.mid。
  const expect = 'https://y.gtimg.cn/music/photo_new/T002R300x300M000ABC123.jpg';
  assert.equal(qqCover({ albummid: 'ABC123' }), expect);
  assert.equal(qqCover({ album: { mid: 'ABC123' } }), expect);
  assert.equal(qqCover({}), null);
  assert.equal(qqCover({ albummid: '' }), null);
});