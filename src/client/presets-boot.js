/**
 * dsh-music-on —— 预置音景控制器的装配点。
 *
 * 【为什么单独一层而不是在面板里直接建】
 * `createPresets()` 会做四件有副作用的事：读设置、选缓存后端（IndexedDB 或
 * 内存）、拉清单、建自己的引擎实例。它必须**每个页面生命周期只建一次**，
 * 并且要能被卸载干净。塞进 `PlayerPanel` 的 useEffect 里会因为面板重挂载
 * 反复重建（切标签页就重来一遍，缓存对象全丢）。所以放在 register 这一层，
 * 跟 engine / settings 一样走 window 单例。
 *
 * 【baseUrl 必须显式给】
 * `loadManifest` 内部是 `new URL('presets/manifest.json', new URL(baseUrl, location.href))`。
 * 面板挂在 `http://127.0.0.1:3080/sidebar/music-on` 这类深层路径上，
 * 默认的 `'./'` 会解析成 `/sidebar/presets/manifest.json` → 404 → 所有音景变灰。
 * 正确值是宿主静态路由前缀，见 `PRESETS_BASE`。
 */
import { PLUGIN_ID } from '../shared.js';
import { createPresets } from './presets.js';

/**
 * 宿主侧预置路由前缀，末尾斜杠是 URL 语义的一部分。
 *
 * 这里刻意**不**从 `ui/PresetsSection.jsx` 导入，虽然那里也导出了同名常量，
 * 而且那是唯一的「真相源」。原因是类型后缀：`.jsx` 是组件文件，Node 的原生
 * ESM 加载器不认它（`ERR_UNKNOWN_FILE_EXTENSION`），一旦本模块顶层 import 它，
 * 任何在 Node 里 import `presets-boot.js` 的测试都会连带失败。
 * 所以两份常量并存，由 `test/presets-wiring.test.mjs` 断言它们逐字相等来兜住漂移。
 */
export const PRESETS_BASE = '/api/dsh-music-on/presets/';

/** window 上的单例槽位，理由同 engine：HMR 或双份 bundle 会造出两个实例。 */
const SLOT = '__dsh_music_on_presets__';

/**
 * 取得（必要时创建）预置控制器。
 *
 * 失败不抛：音景是面板的附加能力，清单拉不到不应该让整个音乐台白屏。
 * 失败时返回 null，`PresetsSection` 会显示加载态与原因。
 *
 * @param {{ settings?: object, store?: object }} deps 设置快照来源。
 * @returns {Promise<object | null>} createPresets() 的返回值，或 null。
 */
export async function ensurePresets(deps = {}) {
  if (typeof window === 'undefined') return null;
  if (window[SLOT]) return window[SLOT];
  // 并发保护：面板挂载与设置页可能同时触发，用同一个 promise 收敛。
  if (window[`${SLOT}promise`]) return window[`${SLOT}promise`];

  const promise = (async () => {
    try {
      const settings = deps.settings || (deps.store ? deps.store.get() : undefined);
      const controller = await createPresets({
        settings,
        // 末尾斜杠是 URL 语义的一部分：少了它 'presets/manifest.json'
        // 会把最后一段当文件名替换掉，路径直接错位。
        baseUrl: PRESETS_BASE,
      });
      window[SLOT] = controller;
      return controller;
    } catch (error) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn(`[${PLUGIN_ID}] 预置音景初始化失败：`, error);
      }
      return null;
    } finally {
      delete window[`${SLOT}promise`];
    }
  })();

  window[`${SLOT}promise`] = promise;
  return promise;
}

/**
 * 同步读取已建好的控制器，没有就返回 null。
 * 组件首帧用它，避免为了拿一个对象而写成异步渲染。
 * @returns {object | null}
 */
export function getPresetsSync() {
  if (typeof window === 'undefined') return null;
  return window[SLOT] || null;
}

/**
 * 卸载时释放。缓存后端可能是 IndexedDB 连接，不关会拖住重载。
 * @returns {void}
 */
export function disposePresets() {
  if (typeof window === 'undefined') return;
  const controller = window[SLOT];
  if (!controller) return;
  try {
    if (typeof controller.stop === 'function') controller.stop();
    if (controller.cache && typeof controller.cache.close === 'function') controller.cache.close();
  } catch (error) {
    void error;
  }
  delete window[SLOT];
}

export default ensurePresets;
