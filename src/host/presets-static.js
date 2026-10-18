/**
 * dsh-music-on —— 预置音景的静态资源路由。
 *
 * 【为什么必须有这个文件】
 * 插件装好之后我核对过宿主的资源通道，结论很硬：
 *   - `dsh-client-modules` 只服务 `/plugins/**` 下的 **client.js combo**，
 *     它按插件清单拼 `client.js`，不读任意文件，`presets/*.wav` 不在它的射程里。
 *   - `dsh-host-webserver` 的文档第一句就写着 "It knows no harness concepts
 *     and serves no files"，它只接受 `exact` / `prefix` 两种具名路由。
 *   - 浏览器侧 `presets.js` 用 `new URL(item.url, baseUrl)` 去 fetch，`item.url`
 *     是 `presets/white-noise.wav` 这类相对路径，落到页面上就是
 *     `http://127.0.0.1:3080/presets/white-noise.wav` —— 没有这个路由就是 404，
 *     表现为「音景全部不可用」。
 *
 * 所以这里挂一条 prefix 路由 `/api/dsh-music-on/presets`，把包内的 presets 目录
 * 按白名单方式暴露出去。
 *
 * 【安全边界，改之前先读】
 * 1. 只放行 `.wav` 与 `manifest.json`，其余一律 404 —— 不给「顺手读整个包」留口子。
 * 2. 文件名先经过严格字符白名单（不含 `/`、不含 `..`、不含 `%`），再拼绝对路径，
 *    拼完还要用 `path.relative` 反查是否仍在 presets 根内。两道闸门都在，是因为
 *    URL 解码发生在 webserver 之前，单靠一层字符串检查挡不住 `%2e%2e%2f`。
 * 3. 走的是 `/api` 前缀，因此天然继承 `dsh-client-connection` 的 owner 校验
 *    （`dsh-client-connection/lib/index.js:1044-1058` 把 `/api` 整体挂在该 prefix 上，
 *    `:822-836` 强制 `peer.principal.kind === 'owner'`，非 owner 直接 403）。
 *    也就是说这条路由不会对局域网暴露。
 * 4. 只读、不写、不列目录：请求目录本身（以 `/` 结尾）直接 404。
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 路由前缀。与 shared.js 的 API_PREFIX 同源，但这里保持字面量便于单测直接比对。 */
export const PRESETS_PATH = '/api/dsh-music-on/presets';

/** 允许对外暴露的扩展名（白名单，不是黑名单）。 */
const ALLOWED_EXTENSIONS = new Set(['.wav']);

/** 允许对外暴露的单文件（无扩展名的清单）。 */
const ALLOWED_BARE_NAMES = new Set(['manifest.json']);

/** 文件名白名单：只允许这些字符，从根上排掉 `/`、`..`、`%`、`\`、`:`。 */
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

/** 本包 presets 目录的绝对路径。 */
export const PRESETS_ROOT = fileURLToPath(new URL('../../presets/', import.meta.url));

/**
 * 把请求路径解析成磁盘上的安全绝对路径。
 *
 * @param {string} pathname 完整请求 pathname（含前缀）。
 * @param {string} [root] 预置目录根，单测可注入。
 * @returns {{ ok: true, filePath: string, name: string } | { ok: false, code: number, message: string }}
 *   解析结果；失败时给出 HTTP 状态码与说明。
 */
export function resolvePresetFile(pathname, root = PRESETS_ROOT) {
  if (typeof pathname !== 'string' || !pathname.startsWith(`${PRESETS_PATH}/`)) {
    return { ok: false, code: 404, message: 'not found' };
  }
  // 取前缀之后的部分。注意：webserver 传进来的 pathname 已经过 URL 解码，
  // 所以这里看到的就是解码后的真实字符串，`%2e%2e%2f` 此时已变成 `../`。
  const rest = pathname.slice(PRESETS_PATH.length + 1);

  // 只允许一级文件名：出现多层路径直接拒绝（预置目录是平的）。
  if (rest.length === 0 || rest.includes('/') || rest.includes('\\')) {
    return { ok: false, code: 404, message: 'not found' };
  }
  if (!SAFE_SEGMENT.test(rest)) {
    return { ok: false, code: 400, message: 'bad name' };
  }
  // 白名单校验：`..` 单段本身也会被 SAFE_SEGMENT 放行，单独拦掉。
  if (rest === '.' || rest === '..') {
    return { ok: false, code: 400, message: 'bad name' };
  }

  const isBare = ALLOWED_BARE_NAMES.has(rest);
  const extension = extname(rest).toLowerCase();
  if (!isBare && !ALLOWED_EXTENSIONS.has(extension)) {
    return { ok: false, code: 404, message: 'not found' };
  }

  const filePath = normalize(join(root, rest));
  // 第二道闸门：即便前面都过了，也再确认落点没跑出根目录。
  const rel = relative(root, filePath);
  if (rel === '' || rel.startsWith('..') || rel.includes(`..${sep}`)) {
    return { ok: false, code: 403, message: 'forbidden' };
  }
  const topSegment = rel.split(sep)[0];
  if (topSegment !== rest) {
    return { ok: false, code: 403, message: 'forbidden' };
  }
  return { ok: true, filePath, name: rest };
}

/**
 * 统一的 JSON 错误响应。与宿主既有的 `{ok:false, code, message}` 形态保持一致。
 * @param {import('node:http').ServerResponse} res 响应对象。
 * @param {number} status HTTP 状态码。
 * @param {string} message 说明。
 */
function sendError(res, status, message) {
  const body = JSON.stringify({ ok: false, message });
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

/**
 * 处理一次预置资源请求。
 *
 * 支持 `Range`，因为 WAV 是由浏览器 `<audio>` 拉取的，Chrome 会先发
 * `Range: bytes=0-` 试探；不回 206 的话部分版本会把文件当整体下载，
 * 循环播放时每次都要重下 482KB。
 *
 * @param {import('node:http').IncomingMessage} req 请求。
 * @param {import('node:http').ServerResponse} res 响应。
 * @param {string} [root] 预置根目录，单测可注入。
 * @returns {Promise<void>}
 */
export async function handlePresetRequest(req, res, root = PRESETS_ROOT) {
  const method = (req.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' });
    res.end();
    return;
  }

  // req.url 是 pathname + search，这里只要 pathname。
  const rawUrl = req.url || '/';
  const pathname = rawUrl.split('?')[0].split('#')[0];
  const resolved = resolvePresetFile(pathname, root);
  if (!resolved.ok) {
    sendError(res, resolved.code, resolved.message);
    return;
  }

  let info;
  try {
    info = await stat(resolved.filePath);
  } catch {
    sendError(res, 404, 'not found');
    return;
  }
  if (!info.isFile()) {
    sendError(res, 404, 'not found');
    return;
  }

  const isManifest = resolved.name === 'manifest.json';
  const contentType = isManifest ? 'application/json; charset=utf-8' : 'audio/wav';
  const total = info.size;

  // 清单短且会随预置更新，禁止缓存；WAV 带 sha256 校验，可以放心长缓存。
  const cacheControl = isManifest ? 'no-store' : 'public, max-age=31536000, immutable';

  /** @type {Record<string, string>} */
  const headers = {
    'content-type': contentType,
    'accept-ranges': 'bytes',
    'cache-control': cacheControl,
    'x-content-type-options': 'nosniff',
  };

  const rangeHeader = req.headers && req.headers.range;
  const range = typeof rangeHeader === 'string' ? parseRange(rangeHeader, total) : null;

  if (range === 'invalid') {
    res.writeHead(416, { 'content-range': `bytes */${total}` });
    res.end();
    return;
  }

  if (range !== null) {
    const { start, end } = range;
    const length = end - start + 1;
    headers['content-range'] = `bytes ${start}-${end}/${total}`;
    headers['content-length'] = String(length);
    res.writeHead(206, headers);
    if (method === 'HEAD') {
      res.end();
      return;
    }
    const stream = createReadStream(resolved.filePath, { start, end });
    stream.on('error', () => res.destroy());
    stream.pipe(res);
    return;
  }

  headers['content-length'] = String(total);
  res.writeHead(200, headers);
  if (method === 'HEAD') {
    res.end();
    return;
  }
  const stream = createReadStream(resolved.filePath);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

/**
 * 解析 `Range: bytes=a-b` 头。
 *
 * 只支持单区间：多区间（`bytes=0-1,5-6`）返回 'invalid'，因为音频拉取用不到，
 * 而 multipart/byteranges 的构造复杂度不值得——直接 416 让客户端退回整取。
 *
 * @param {string} header Range 头原文。
 * @param {number} total 资源总字节数。
 * @returns {{ start: number, end: number } | 'invalid' | null} 区间、非法、或未请求。
 */
export function parseRange(header, total) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return 'invalid';
  const [, rawStart, rawEnd] = match;
  if (rawStart === '' && rawEnd === '') return 'invalid';

  let start;
  let end;
  if (rawStart === '') {
    // `bytes=-500`：最后 500 字节。
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return 'invalid';
    start = Math.max(0, total - suffix);
    end = total - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? total - 1 : Number(rawEnd);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'invalid';
  if (start > end || start < 0 || start >= total) return 'invalid';
  return { start, end: Math.min(end, total - 1) };
}

/**
 * 把静态资源路由挂到宿主。
 *
 * 走 `ctx.webServer.register({ kind: 'prefix', … })`，不是 connection 的
 * fetch 注册 —— 后者要求返回 `Response` 对象，而这里要带 Range 语意地
 * 直接写 `ServerResponse`（webserver 的契约原话："Route handlers retain
 * direct response ownership"）。
 *
 * @param {object} ctx cordis 上下文（需有 webServer 服务）。
 * @returns {() => void} disposer。
 */
export function registerPresetsRoute(ctx) {
  const webServer = ctx && Reflect.get(ctx, 'webServer');
  if (!webServer || typeof webServer.register !== 'function') {
    throw new Error('dsh-music-on: ctx.webServer.register unavailable');
  }
  return webServer.register({
    kind: 'prefix',
    path: PRESETS_PATH,
    handler: (req, res) => handlePresetRequest(req, res),
  });
}

/** 单测入口。 */
export const __test = { resolvePresetFile, parseRange, PRESETS_ROOT, PRESETS_PATH };
