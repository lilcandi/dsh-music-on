/**
 * linkintake 单测：只验纯逻辑（不联网、不建 AudioContext）。
 *
 * 覆盖的核心事实：
 *   - 用户粘贴的 B站页面地址绝对不能落到 audio-direct（那正是
 *     `Failed to load because no supported source was found` 的来源）
 *   - 网易云 / QQ / YouTube 一律 platform 通道，不许进 stream 代理
 *   - 一段文本里的多条链接要全部抠出来
 *   - bvid 只有 10 位合法时才生成 embed 地址
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractUrls,
  classifyUrl,
  buildBilibiliEmbedUrl,
  platformLabel,
  summarizeReport,
  intakeLinks,
} from '../src/client/linkintake.js';

const BILI = 'https://www.bilibili.com/video/BV1Lyw7zPEeo/?spm_id_from=333.337.search-card.all.click';
const NETEASE_PLAYLIST = 'https://music.163.com/playlist?id=2884035';
const QQ_PLAYLIST = 'https://y.qq.com/n/ryqq/playlist/8560738291';

test('extractUrls：纯链接原样返回', () => {
  assert.deepEqual(extractUrls(BILI), [BILI]);
});

test('extractUrls：从一段话里抠出多条并去重', () => {
  const text = `看看这个 ${BILI} 还有 ${NETEASE_PLAYLIST} 和 ${BILI}`;
  const urls = extractUrls(text);
  assert.equal(urls.length, 2);
  assert.ok(urls.includes(BILI));
  assert.ok(urls.includes(NETEASE_PLAYLIST));
});

test('extractUrls：裸 BV 号补成完整地址', () => {
  assert.deepEqual(extractUrls('BV1Lyw7zPEeo'), ['https://www.bilibili.com/video/BV1Lyw7zPEeo']);
});

test('extractUrls：丢了协议的域名也能认', () => {
  assert.deepEqual(extractUrls('music.163.com/playlist?id=1'), ['https://music.163.com/playlist?id=1']);
});

test('extractUrls：无链接返回空数组', () => {
  assert.deepEqual(extractUrls('随便说点什么'), []);
  assert.deepEqual(extractUrls(''), []);
});

test('classifyUrl：B站视频走 bilibili 通道并抽出 bvid', () => {
  const verdict = classifyUrl(BILI);
  assert.equal(verdict.route, 'bilibili');
  assert.equal(verdict.ids.bvid, 'BV1Lyw7zPEeo');
});

test('classifyUrl：B站页面地址绝不进 audio-direct', () => {
  assert.notEqual(classifyUrl(BILI).route, 'audio-direct');
});

test('classifyUrl：网易云歌单与单曲都是 platform', () => {
  assert.equal(classifyUrl(NETEASE_PLAYLIST).route, 'platform');
  assert.equal(classifyUrl('https://music.163.com/song?id=123').route, 'platform');
  assert.equal(classifyUrl('https://music.163.com/#/playlist?id=2884035').route, 'platform');
});

test('classifyUrl：QQ 音乐歌单与单曲都是 platform', () => {
  assert.equal(classifyUrl(QQ_PLAYLIST).route, 'platform');
  assert.equal(classifyUrl('https://y.qq.com/n/ryqq/songDetail/000Mk2Zx3rHsRk').route, 'platform');
});

test('classifyUrl：QQ 单曲页 id 形状不准则退化到 platform，不进 stream', () => {
  const verdict = classifyUrl('https://y.qq.com/n/ryqq/songDetail/001');
  assert.equal(verdict.route, 'platform');
});

test('classifyUrl：YouTube 走 platform', () => {
  assert.equal(classifyUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ').route, 'platform');
  assert.equal(classifyUrl('https://youtu.be/dQw4w9WgXcQ').route, 'platform');
});

test('classifyUrl：音频直链走 audio-direct', () => {
  for (const url of [
    'https://cdn.example.com/a.mp3',
    'https://cdn.example.com/a.m4a?token=1',
    'https://cdn.example.com/a.flac',
    'https://cdn.example.com/a.ogg#t=10',
  ]) {
    assert.equal(classifyUrl(url).route, 'audio-direct', url);
  }
});

test('classifyUrl：无关域名 unsupported', () => {
  assert.equal(classifyUrl('https://example.com/foo').route, 'unsupported');
});

test('classifyUrl：非法字符串 unsupported 且带原因', () => {
  const verdict = classifyUrl('not a url at all');
  assert.equal(verdict.route, 'unsupported');
  assert.ok(typeof verdict.reason === 'string' && verdict.reason.length > 0);
});

test('buildBilibiliEmbedUrl：合法 bvid 生成播放器地址', () => {
  const url = buildBilibiliEmbedUrl({ bvid: 'BV1Lyw7zPEeo' });
  assert.ok(url.startsWith('https://player.bilibili.com/player.html?bvid=BV1Lyw7zPEeo'));
  assert.ok(url.includes('autoplay=1'));
});

test('buildBilibiliEmbedUrl：非法 bvid 与空对象返回 null', () => {
  assert.equal(buildBilibiliEmbedUrl({ bvid: 'BV123' }), null);
  assert.equal(buildBilibiliEmbedUrl({}), null);
  assert.equal(buildBilibiliEmbedUrl(null), null);
});

test('buildBilibiliEmbedUrl：aid 兜底路径', () => {
  const url = buildBilibiliEmbedUrl({ aid: '170001' });
  assert.ok(url.includes('aid=170001'));
});

test('platformLabel：已知平台给中文名', () => {
  assert.equal(platformLabel('netease-playlist'), '网易云歌单');
  assert.equal(platformLabel('qq-playlist'), 'QQ音乐歌单');
  assert.equal(platformLabel('unknown'), null);
});

test('summarizeReport：汇总加入与跳过', () => {
  const text = summarizeReport({ added: 2, skipped: 1, errors: ['x 不受支持'] });
  assert.ok(text.includes('2'));
  assert.ok(text.includes('1'));
});

/* ---------------- intakeLinks：用假引擎跑通分流 ---------------- */

function createFakeEngine() {
  const calls = [];
  return {
    calls,
    async addUrl(url) { calls.push({ op: 'addUrl', url }); return 0; },
    async addBilibili(spec) { calls.push({ op: 'addBilibili', spec }); return 0; },
    async addEmbed(url, opts) { calls.push({ op: 'addEmbed', url, opts }); return 0; },
    async addPlatform(spec, opts) { calls.push({ op: 'addPlatform', spec, opts }); return 0; },
  };
}

/**
 * 造一个**与 src/host/resolve.js 真实返回同形**的响应体。
 *
 * 这一条是本次回归的关键：旧测试桩写的是 `{ track: {...} }`，而宿主实际返回
 * `{ ok, result: { platform, title, tracks: [...] }, ms, cached }`。
 * 桩与真实契约不一致 → 274 项单测全绿，真实链路却拿不到 cid，
 * 表现就是「提示已加入，但没声音」。
 */
function resolveBody({ cid = '36737517327', title = '测试曲目', duration = 10865 } = {}) {
  return {
    ok: true,
    ms: 120,
    cached: false,
    result: {
      platform: 'bilibili-video',
      title,
      pageUrl: 'https://www.bilibili.com/video/BV1Lyw7zPEeo/',
      tracks: [{ title, artist: 'LofiGirl', bvid: 'BV1Lyw7zPEeo', cid, duration, streamOnly: true }],
    },
  };
}

const okFetch = (payload) => async () => ({ ok: true, status: 200, json: async () => payload });

/**
 * 平台解析的桩，**与 src/host/resolve.js 的真实返回同形**。
 *
 * 旧桩把平台当成「只跳转」，于是断言锁的是 `addEmbed`。现在宿主会批量取
 * 直链并给每首签发 `streamPath`（`/api/dsh-music-on/stream?mt=<token>`），
 * 客户端据此走 addPlatform —— 有了它频谱才是真的。
 */
function platformBody({
  platform = 'netease-playlist',
  title = '测试歌单',
  count = 2,
  streamPath = '/api/dsh-music-on/stream?mt=AAA.BBB',
} = {}) {
  const tracks = [];
  for (let i = 0; i < count; i += 1) {
    tracks.push({
      id: `t${i}`,
      title: `曲目 ${i}`,
      artist: '歌手',
      pageUrl: `https://music.163.com/song?id=${1000 + i}`,
      duration: 180,
      streamOnly: false,
      streamPath,
    });
  }
  return { ok: true, ms: 90, cached: false, result: { platform, title, pageUrl: NETEASE_PLAYLIST, tracks } };
}

test('intakeLinks：网易云链接走 addPlatform 并带上票据路径，不再塞 iframe', async () => {
  const engine = createFakeEngine();
  const report = await intakeLinks(engine, NETEASE_PLAYLIST, { fetchImpl: okFetch(platformBody()) });
  assert.equal(report.added, 2);
  assert.equal(engine.calls[0].op, 'addPlatform');
  assert.equal(engine.calls[0].spec.streamPath, '/api/dsh-music-on/stream?mt=AAA.BBB');
  assert.equal(engine.calls[0].spec.platform, 'netease');
  // 平台页面被 iframe 嵌套必然白屏（两站都设了 X-Frame-Options），绝不能回到 addEmbed。
  assert.equal(engine.calls.filter((c) => c.op === 'addEmbed').length, 0);
});

test('intakeLinks：没有票据的曲目直接跳过，不进队列（不给用户一排点了就报错的灰条）', async () => {
  const engine = createFakeEngine();
  // 三首里两首没有 streamPath（会员曲），只有第二首能播。
  const body = platformBody({ count: 3 });
  delete body.result.tracks[0].streamPath;
  delete body.result.tracks[2].streamPath;
  const report = await intakeLinks(engine, NETEASE_PLAYLIST, { fetchImpl: okFetch(body) });
  // 只入队一条，且必须是拿到票据的那条。
  assert.equal(report.added, 1);
  assert.equal(engine.calls.length, 1);
  assert.equal(engine.calls[0].op, 'addPlatform');
  assert.equal(engine.calls[0].spec.streamPath, '/api/dsh-music-on/stream?mt=AAA.BBB');
  assert.equal(engine.calls[0].spec.id, 't1');
  // reason 恒为 null：进队的都是能播的，不需要「为什么播不了」的说明。
  assert.equal(engine.calls[0].spec.reason, null);
  // 提示里要如实说出跳过了几首，否则用户会以为歌单只有一首。
  const note = report.items[0].note || '';
  assert.ok(note.includes('跳过 2 首会员曲目'), `提示应写明跳过数，实得：${note}`);
});

test('intakeLinks：整张歌单都拿不到票据时跳过并报原因，一条都不入队', async () => {
  const engine = createFakeEngine();
  const body = platformBody({ count: 2 });
  delete body.result.tracks[0].streamPath;
  delete body.result.tracks[1].streamPath;
  const report = await intakeLinks(engine, NETEASE_PLAYLIST, { fetchImpl: okFetch(body) });
  assert.equal(report.added, 0);
  assert.equal(report.skipped, 1);
  assert.equal(engine.calls.length, 0);
  // 错误文案要说出根因是会员限制，而不是含糊的「解析失败」。
  assert.ok(report.errors[0].includes('会员'), report.errors[0]);
});

test('intakeLinks：平台解析失败时跳过并给出原因，不静默入队', async () => {
  const engine = createFakeEngine();
  const report = await intakeLinks(engine, NETEASE_PLAYLIST, {
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ ok: false, code: 'E_NO_STREAM', message: '上游不给直链' }) }),
  });
  assert.equal(report.added, 0);
  assert.equal(report.skipped, 1);
  assert.ok(report.errors[0].includes('上游不给直链'));
});

test('intakeLinks：一条文本里混两类链接会分别入队', async () => {
  const engine = createFakeEngine();
  const report = await intakeLinks(engine, `${BILI} ${QQ_PLAYLIST}`, {
    fetchImpl: (target) => {
      const url = String(target);
      const payload = url.includes('y.qq.com') || url.includes('qq') ? platformBody({ platform: 'qq-playlist', count: 1 }) : resolveBody({ cid: '1', title: 't' });
      return Promise.resolve({ ok: true, status: 200, json: async () => payload });
    },
  });
  assert.equal(report.added, 2);
  assert.deepEqual(engine.calls.map((c) => c.op), ['addBilibili', 'addPlatform']);
});

test('intakeLinks：没认出链接时给中文提示，不抛错', async () => {
  const engine = createFakeEngine();
  const report = await intakeLinks(engine, '你好');
  assert.equal(report.added, 0);
  assert.equal(engine.calls.length, 0);
  assert.ok(report.errors[0].includes('没认出链接'));
});

test('intakeLinks：B站链接走 addBilibili，绝不走 addUrl', async () => {
  const engine = createFakeEngine();
  const report = await intakeLinks(engine, BILI, { fetchImpl: okFetch(resolveBody()) });
  assert.equal(report.added, 1);
  assert.equal(engine.calls.length, 1);
  assert.equal(engine.calls[0].op, 'addBilibili');
  assert.equal(engine.calls[0].spec.bvid, 'BV1Lyw7zPEeo');
  assert.equal(engine.calls[0].spec.cid, '36737517327');
  assert.ok(engine.calls[0].spec.embedUrl.includes('player.bilibili.com'));
});

test('契约回归：按宿主真实结构（result.tracks）能取到 cid 与标题', async () => {
  const engine = createFakeEngine();
  const report = await intakeLinks(engine, BILI, { fetchImpl: okFetch(resolveBody({ cid: '999', title: '真实标题' })) });
  assert.equal(report.items[0].cid, '999');
  assert.equal(engine.calls[0].spec.cid, '999');
  assert.equal(engine.calls[0].spec.title, '真实标题');
  assert.equal(engine.calls[0].spec.duration, 10865);
  // 解析成功就不该有 unavailableReason，否则 UI 会误标「不可用」
  assert.equal(engine.calls[0].spec.unavailableReason, null);
});

test('契约回归：宿主返回 ok:false 时不塞 cid，但仍落 embed', async () => {
  const engine = createFakeEngine();
  const report = await intakeLinks(engine, BILI, {
    fetchImpl: okFetch({ ok: false, code: 'E_RESOLVE_TIMEOUT', message: '上游超时' }),
  });
  assert.equal(report.added, 1);
  assert.equal(engine.calls[0].spec.cid, undefined);
  assert.ok(engine.calls[0].spec.embedUrl.includes('player.bilibili.com'));
  assert.equal(engine.calls[0].spec.unavailableReason, '上游超时');
});

test('cid 规整：0 / 非数字 / 空串一律丢弃，不拼进查询串', async () => {
  for (const bad of ['0', 0, '', null, 'abc', '-1', '  ', '0x1f']) {
    const engine = createFakeEngine();
    await intakeLinks(engine, BILI, { fetchImpl: okFetch(resolveBody({ cid: bad })) });
    assert.equal(engine.calls[0].spec.cid, undefined, `cid=${String(bad)} 不该透传`);
  }
  // 字段整个缺失（宿主没解出 cid）也必须落在 undefined 上
  {
    const engine = createFakeEngine();
    const body = resolveBody();
    delete body.result.tracks[0].cid;
    await intakeLinks(engine, BILI, { fetchImpl: okFetch(body) });
    assert.equal(engine.calls[0].spec.cid, undefined, 'cid 字段缺失时不该凭空造一个');
  }
  // 合法值必须留下，数字型要转成字符串
  const engine = createFakeEngine();
  await intakeLinks(engine, BILI, { fetchImpl: okFetch(resolveBody({ cid: 123456 })) });
  assert.equal(engine.calls[0].spec.cid, '123456');
});

test('intakeLinks：解析服务失败时仍入队并落 embed', async () => {
  const engine = createFakeEngine();
  const report = await intakeLinks(engine, BILI, {
    fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({}) }),
  });
  assert.equal(report.added, 1);
  assert.equal(engine.calls[0].op, 'addBilibili');
  assert.ok(engine.calls[0].spec.embedUrl.includes('player.bilibili.com'));
  assert.ok(typeof engine.calls[0].spec.unavailableReason === 'string');
});

test('intakeLinks：音频直链走 addUrl 原样', async () => {
  const engine = createFakeEngine();
  const report = await intakeLinks(engine, 'https://cdn.example.com/a.mp3');
  assert.equal(report.added, 1);
  assert.deepEqual(engine.calls[0], { op: 'addUrl', url: 'https://cdn.example.com/a.mp3' });
});

