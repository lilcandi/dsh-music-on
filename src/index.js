/**
 * dsh-music-on 宿主半边入口。
 *
 * 这里只做两件事，全部围绕「浏览器拿不到的能力」：
 *   1) 平台链接解析路由（/api/dsh-music-on/resolve）—— 受同源策略限制，
 *      浏览器直连 bilibili / 网易云 / QQ 音乐 必然被拦，必须宿主代取。
 *   2) 音频流转发路由（/api/dsh-music-on/stream）—— 让外部音频能进
 *      AudioContext，从而拿到频谱数据；平台直链还靠它验签不透明票据。
 *
 * 【挂法：两条都走 `ctx.connection.fetch.register`】
 *   它们返回 `Response`，且天然继承 `/api` 前缀的 owner 校验
 *   （`dsh-client-connection/lib/index.js:1044-1058` 整体挂载 `/api`，
 *   `:822-836` 强制 `peer.principal.kind === 'owner'`）。
 *   原先第三条「预置音景静态资源」走 `ctx.webServer.register({ kind: 'prefix' })`
 *   以便自己写 `ServerResponse` 支持 `Range`；音景功能已按用户要求整体移除，
 *   这条 prefix 与 `webServer` 依赖同时退场。
 */
import { PLUGIN_ID, RESOLVE_PATH, STREAM_PATH } from './shared.js';
import { createMediaTokenStore } from './host/mediatoken.js';
import { registerResolveRoute } from './host/resolve.js';
import { registerStreamRoute } from './host/stream.js';

/** 宿主侧依赖：两条路由都只需要 connection。 */
export const inject = ['connection'];

/** 插件名，与 package.json 的 name 一致。 */
export const name = PLUGIN_ID;

/**
 * 媒体票据表的单例。
 *
 * **必须两条路由共用同一个 store**：resolve 用私钥签发，stream 用同一把私钥验签，
 * 各建一个等于两把不同的密钥 —— 解析出来的票据在流路由上必然验签失败，
 * 表现是「解析成功但一取流就 403」。
 *
 * 缓存到模块级而不是每次 apply 新建：插件热重载会再跑一次 apply，
 * 若每次新建，重载前签发的票据会全部失效。
 */
let mediaTokenStore = null;

function sharedMediaTokens() {
  if (mediaTokenStore === null) mediaTokenStore = createMediaTokenStore();
  return mediaTokenStore;
}

/**
 * 宿主插件体。
 *
 * 用 `ctx.inject([...], inner => …)` 而不是直接读 `ctx.connection`：
 * 服务可能晚于本插件就绪，直接读会拿到 undefined 并在注册时抛错。
 * 包一层 inject 后，宿主会等服务可用再执行回调。
 *
 * 三条路由共用一个 inject 回调：它们同生共死。分开 inject 只会让
 * 「resolve 起来了但 stream 没起来」这种半残状态更难排查。
 *
 * @param {object} ctx 宿主 cordis 上下文。
 */
export function apply(ctx) {
  const mediaTokens = sharedMediaTokens();

  ctx.inject(['connection'], (inner) => {
    inner.effect(
      () => registerResolveRoute(inner, { mediaTokens }),
      'dsh-music-on: resolve route',
    );
    inner.effect(
      () => registerStreamRoute(inner, { mediaTokens }),
      'dsh-music-on: stream route',
    );
  });
}

/** 供测试与后续扩展引用，避免路径字面量在多处漂移。 */
export const routes = Object.freeze({
  resolve: RESOLVE_PATH,
  stream: STREAM_PATH,
});

export const __test = { routes };

export default { name, inject, apply };
