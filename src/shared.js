/**
 * 插件共享常量：宿主半边与浏览器半边都从这里取，避免字面量漂移。
 *
 * 为什么单独一个文件：register.js（浏览器）需要 TAB_ID 等标识，
 * host 侧路由也需要同一套 id；两边各写一遍必然对不上，
 * 而 keyed 槽位的 key 必须与标签页类型 id 完全相等，否则宿主渲染
 * 「nothing can view this」占位。
 */

/** 插件标识：与 package.json 的 name 一致。 */
export const PLUGIN_ID = 'dsh-music-on';

/** 右侧栏标签页类型 id，同时也是槽位 key。 */
export const TAB_ID = 'dsh-music-on.music';

/** 标签页 kind：宿主按键（kind）打开页面，不按 id。 */
export const TAB_KIND = 'music-on';

/** 外部扩展类型优先级。 */
export const TAB_PRIORITY = 'extension';

/** 引导条目 id 与排序。 */
export const TAB_GUIDE_ID = 'dsh-music-on.guide';
export const TAB_GUIDE_ORDER = 100;

/** host 侧路由前缀，connection 是唯一出口，必须以 /api/ 开头。 */
export const API_PREFIX = '/api/dsh-music-on';
export const RESOLVE_PATH = `${API_PREFIX}/resolve`;
export const STREAM_PATH = `${API_PREFIX}/stream`;

/** 设置界面在宿主设置页里的分区 id。 */
export const SETTINGS_SECTION_ID = 'dsh-music-on.settings';
