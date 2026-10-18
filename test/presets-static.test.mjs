/**
 * 预置资源静态路由的回归测试。
 *
 * 这一层为什么必须测：`presets/*.wav` 从包目录到浏览器中间没有任何现成通道，
 * 全靠 `presets-static.js` 自己提供服务与安全边界。这里覆盖四类：
 *   1. 正常取文件：200 / audio/wav / content-length 正确。
 *   2. Range：206 + content-range，含 `bytes=0-`、尾段、越界、多区间。
 *   3. 安全边界：路径穿越、多层路径、非白名单扩展名、`.` / `..` 段。
 *   4. 真实磁盘：直接对着本包的 presets 目录跑，确认 7 个 WAV 全都取得到。
 *
 * 用真实的 `node:http` 起一个临时服务器，不 mock —— 这一层的关键就在于
 * 「真实的 ServerResponse 头与流」，mock 掉就什么都没测到。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Readable } from 'node:stream';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PRESETS_PATH,
  PRESETS_ROOT,
  parseRange,
  resolvePresetFile,
  handlePresetRequest,
} from '../src/host/presets-static.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 起一个只挂预置路由的临时服务器。
 * @returns {Promise<{ origin: string, close: () => Promise<void>, received: string[] }>}
 */
async function startServer() {
  const received = [];
  const server = http.createServer((req, res) => {
    received.push(req.url || '');
    handlePresetRequest(req, res).catch(() => {
      res.writeHead(500);
      res.end();
    });
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    received,
    close: () => new Promise((done) => server.close(() => done())),
  };
}

/* ------------------------- parseRange ------------------------- */

test('parseRange：标准区间', () => {
  assert.deepEqual(parseRange('bytes=0-99', 1000), { start: 0, end: 99 });
  assert.deepEqual(parseRange('bytes=990-999', 1000), { start: 990, end: 999 });
});

test('parseRange：开放结尾补到 total-1', () => {
  assert.deepEqual(parseRange('bytes=0-', 1000), { start: 0, end: 999 });
  assert.deepEqual(parseRange('bytes=500-', 1000), { start: 500, end: 999 });
});

test('parseRange：尾段语法', () => {
  assert.deepEqual(parseRange('bytes=-100', 1000), { start: 900, end: 999 });
  // 超过总长的尾段应从 0 开始
  assert.deepEqual(parseRange('bytes=-5000', 1000), { start: 0, end: 999 });
});

test('parseRange：end 超长被截到 total-1', () => {
  assert.deepEqual(parseRange('bytes=0-99999', 1000), { start: 0, end: 999 });
});

test('parseRange：非法输入一律 invalid', () => {
  assert.equal(parseRange('bytes=0-1,5-6', 1000), 'invalid', '多区间不支持');
  assert.equal(parseRange('bytes=-', 1000), 'invalid');
  assert.equal(parseRange('items=0-10', 1000), 'invalid', '单位必须是 bytes');
  assert.equal(parseRange('bytes=100-50', 1000), 'invalid', 'start > end');
  assert.equal(parseRange('bytes=1000-', 1000), 'invalid', 'start 越界');
  assert.equal(parseRange('bytes=-0', 1000), 'invalid');
});

/* ------------------------- resolvePresetFile ------------------------- */

test('resolvePresetFile：正常文件名解析到 presets 根内', () => {
  const result = resolvePresetFile(`${PRESETS_PATH}/rain.wav`);
  assert.equal(result.ok, true);
  assert.equal(result.name, 'rain.wav');
  assert.equal(result.filePath, resolve(PRESETS_ROOT, 'rain.wav'));
});

test('resolvePresetFile：manifest.json 在白名单里', () => {
  const result = resolvePresetFile(`${PRESETS_PATH}/manifest.json`);
  assert.equal(result.ok, true);
  assert.equal(result.name, 'manifest.json');
});

test('resolvePresetFile：路径穿越全部拒绝', () => {
  // webserver 传进来的是已解码的 pathname，所以这里用解码后的形态测。
  const attacks = [
    `${PRESETS_PATH}/../package.json`,
    `${PRESETS_PATH}/../../etc/passwd`,
    `${PRESETS_PATH}/..%2fpackage.json`,
    `${PRESETS_PATH}/sub/rain.wav`,
    `${PRESETS_PATH}/..`,
    `${PRESETS_PATH}/.`,
    `${PRESETS_PATH}/`,
  ];
  for (const attack of attacks) {
    const result = resolvePresetFile(attack);
    assert.equal(result.ok, false, `${attack} 应被拒绝`);
  }
});

test('resolvePresetFile：非白名单扩展名拒绝', () => {
  for (const name of ['index.js', 'package.json.bak', 'rain.mp3', 'rain.wav.sh', '.env']) {
    const result = resolvePresetFile(`${PRESETS_PATH}/${name}`);
    assert.equal(result.ok, false, `${name} 应被拒绝`);
  }
});

test('resolvePresetFile：不含前缀一律 404', () => {
  assert.equal(resolvePresetFile('/presets/rain.wav').ok, false);
  assert.equal(resolvePresetFile('/api/dsh-music-on/rain.wav').ok, false);
  assert.equal(resolvePresetFile('').ok, false);
});

test('resolvePresetFile：反斜杠拒绝（Windows 路径分隔符）', () => {
  assert.equal(resolvePresetFile(`${PRESETS_PATH}\\rain.wav`).ok, false);
  assert.equal(resolvePresetFile(`${PRESETS_PATH}/sub\\rain.wav`).ok, false);
});

/* ------------------------- 真实 HTTP ------------------------- */

test('HTTP：整取 WAV 返回 200 + audio/wav + 正确长度', async () => {
  const server = await startServer();
  try {
    const response = await fetch(`${server.origin}${PRESETS_PATH}/rain.wav`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'audio/wav');
    assert.equal(response.headers.get('accept-ranges'), 'bytes');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    const body = Buffer.from(await response.arrayBuffer());
    assert.equal(String(body.length), response.headers.get('content-length'));
    // 真 WAV 头：RIFF....WAVE
    assert.equal(body.subarray(0, 4).toString('ascii'), 'RIFF');
    assert.equal(body.subarray(8, 12).toString('ascii'), 'WAVE');
  } finally {
    await server.close();
  }
});

test('HTTP：Range 返回 206 + content-range，字节内容对齐', async () => {
  const server = await startServer();
  try {
    const full = Buffer.from(
      await (await fetch(`${server.origin}${PRESETS_PATH}/rain.wav`)).arrayBuffer(),
    );
    const partial = await fetch(`${server.origin}${PRESETS_PATH}/rain.wav`, {
      headers: { range: 'bytes=0-99' },
    });
    assert.equal(partial.status, 206);
    assert.equal(partial.headers.get('content-range'), `bytes 0-99/${full.length}`);
    assert.equal(partial.headers.get('content-length'), '100');
    const chunk = Buffer.from(await partial.arrayBuffer());
    assert.equal(chunk.length, 100);
    assert.equal(chunk.toString('hex'), full.subarray(0, 100).toString('hex'), '分片内容必须与整取一致');
  } finally {
    await server.close();
  }
});

test('HTTP：Range 尾段返回最后 N 字节', async () => {
  const server = await startServer();
  try {
    const full = Buffer.from(
      await (await fetch(`${server.origin}${PRESETS_PATH}/lofi.wav`)).arrayBuffer(),
    );
    const tail = await fetch(`${server.origin}${PRESETS_PATH}/lofi.wav`, {
      headers: { range: 'bytes=-64' },
    });
    assert.equal(tail.status, 206);
    const chunk = Buffer.from(await tail.arrayBuffer());
    assert.equal(chunk.length, 64);
    assert.equal(chunk.toString('hex'), full.subarray(-64).toString('hex'));
  } finally {
    await server.close();
  }
});

test('HTTP：非法 Range 返回 416 且带 content-range: bytes */total', async () => {
  const server = await startServer();
  try {
    const response = await fetch(`${server.origin}${PRESETS_PATH}/rain.wav`, {
      headers: { range: 'bytes=999999999-' },
    });
    assert.equal(response.status, 416);
    assert.match(response.headers.get('content-range') || '', /^bytes \*\/\d+$/);
  } finally {
    await server.close();
  }
});

test('HTTP：HEAD 不带 body 但给出长度', async () => {
  const server = await startServer();
  try {
    const response = await fetch(`${server.origin}${PRESETS_PATH}/manifest.json`, { method: 'HEAD' });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.text();
    assert.equal(body, '');
  } finally {
    await server.close();
  }
});

test('HTTP：manifest.json 是合法 JSON 且 no-store', async () => {
  const server = await startServer();
  try {
    const response = await fetch(`${server.origin}${PRESETS_PATH}/manifest.json`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const data = JSON.parse(await response.text());
    assert.ok(Array.isArray(data.items), 'manifest.items 必须是数组');
  } finally {
    await server.close();
  }
});

test('HTTP：不存在的文件 404', async () => {
  const server = await startServer();
  try {
    for (const path of ['/nope.wav', '/../package.json', '/rain.mp3', '/sub/rain.wav']) {
      const response = await fetch(`${server.origin}${PRESETS_PATH}${path}`);
      assert.ok(response.status === 404 || response.status === 400, `${path} → ${response.status}`);
    }
  } finally {
    await server.close();
  }
});

test('HTTP：非 GET/HEAD 方法 405', async () => {
  const server = await startServer();
  try {
    const response = await fetch(`${server.origin}${PRESETS_PATH}/rain.wav`, { method: 'POST' });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET, HEAD');
  } finally {
    await server.close();
  }
});

/* ------------------------- 真实清单一致性 ------------------------- */

test('清单里每个 embedded 条目的 url 都能被本路由取到', async () => {
  const manifestPath = resolve(root, 'presets/manifest.json');
  assert.ok(existsSync(manifestPath), 'manifest.json 必须存在');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const embedded = manifest.items.filter((item) => item.source === 'embedded');
  assert.equal(embedded.length, 7, '应有 7 条自研合成音');

  const server = await startServer();
  try {
    for (const item of embedded) {
      // item.url 形如 presets/white-noise.wav；路由挂在 /api/dsh-music-on/presets 下。
      const name = item.url.replace(/^presets\//, '');
      const response = await fetch(`${server.origin}${PRESETS_PATH}/${name}`);
      assert.equal(response.status, 200, `${item.id} 取不到`);
      const body = Buffer.from(await response.arrayBuffer());
      assert.equal(body.length, item.sizeBytes, `${item.id} 大小不符`);
      // 关键：sha256 必须在传输后仍然成立，证明没有截断或编码损坏。
      const { createHash } = await import('node:crypto');
      const sha = createHash('sha256').update(body).digest('hex');
      assert.equal(sha, item.sha256, `${item.id} sha256 不符`);
    }
  } finally {
    await server.close();
  }
});

test('PRESETS_ROOT 指向本包的 presets 目录', () => {
  assert.ok(existsSync(resolve(PRESETS_ROOT, 'manifest.json')));
  assert.ok(existsSync(resolve(PRESETS_ROOT, 'rain.wav')));
});
