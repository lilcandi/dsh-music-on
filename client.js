/**
 * dsh-music-on 浏览器半边 bundle —— 本文件由 scripts/build-client.mjs 生成，请勿手改。
 *
 * 形态说明：宿主 dsh-client-modules 只做 readFileSync + 拼接，零转译；
 * 模块表 require 也不解析相对路径。因此客户端实现必须全部内联在这一个
 * 文件里，react 走宿主模块表（平台种子词），其余源码由 esbuild 内联。
 *
 * 手改本文件会在下次构建时被覆盖；改实现请改 src/client/**。
 */
(() => {
  if (typeof window === 'undefined' || !window.__ModuleLoader__) return;
  try {
    window.__ModuleLoader__.load({
      id: "dsh-music-on",
      factory: (require) => {
        var module$ = { exports: {} };
        var exported = module$.exports;
        Object.defineProperty(exported, Symbol.toStringTag, { value: 'Module' });

// ---- 内联实现开始（此处的 require 已是宿主模块表函数）----
var __dshMusicOnImpl__ = (() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/client/register.js
  var register_exports = {};
  __export(register_exports, {
    OVERLAY_SLOT: () => OVERLAY_SLOT,
    PANE_TAB_SLOT: () => PANE_TAB_SLOT,
    PANE_TAB_TITLE_SLOT: () => PANE_TAB_TITLE_SLOT,
    PLUGIN_ID: () => PLUGIN_ID,
    SETTINGS_SLOT: () => SETTINGS_SLOT,
    TAB_ID: () => TAB_ID,
    TAB_KIND: () => TAB_KIND,
    TAB_PRIORITY: () => TAB_PRIORITY,
    __test: () => __test,
    apply: () => apply,
    default: () => register_default,
    getRuntime: () => getRuntime,
    inject: () => inject,
    openMusicTab: () => openMusicTab,
    registerSettingsSection: () => registerSettingsSection,
    registerShellDock: () => registerShellDock,
    registerTabSeats: () => registerTabSeats,
    registerTabType: () => registerTabType,
    setReactBridge: () => setReactBridge
  });

  // src/shared.js
  var PLUGIN_ID = "dsh-music-on";
  var TAB_ID = "dsh-music-on.music";
  var TAB_KIND = "music-on";
  var TAB_PRIORITY = "extension";
  var TAB_GUIDE_ID = "dsh-music-on.guide";
  var TAB_GUIDE_ORDER = 100;
  var API_PREFIX = "/api/dsh-music-on";
  var RESOLVE_PATH = `${API_PREFIX}/resolve`;
  var STREAM_PATH = `${API_PREFIX}/stream`;
  var PRESETS_PATH = `${API_PREFIX}/presets`;

  // src/client/locale.js
  var DICTS = {
    zh: {
      "tab.title": "音乐台",
      "settings.title": "音乐库",
      "guide.title": "音乐台",
      "guide.description": "播放本地音频、平台歌单与预置音景",
      "panel.drop": "把音频文件拖到这里",
      "panel.empty": "暂无播放内容",
      "panel.queue": "播放队列",
      /* ---- 右下角音乐库（ShellDock）----
         宿主 t 的签名是 t(key, params)：第二参是**插值对象**，不是兜底文案。
         所以这里每个 key 都必须在 zh 里有一条，否则界面直接漏出 key 本身。 */
      "dock.title": "音乐库",
      "dock.idle": "未播放",
      "dock.untitled": "未命名",
      "dock.play": "播放",
      "dock.pause": "暂停",
      "dock.prev": "上一首",
      "dock.next": "下一首",
      "dock.seek": "进度",
      "dock.volume": "音量",
      "dock.volumeHint": "滚轮或拖动调节，单击静音",
      "dock.loop": "循环模式",
      "dock.add": "加入",
      "dock.added": "已加入并开始播放",
      "dock.parsed": "已解析并加入队列",
      "dock.notAudio": "只接受音频文件",
      "dock.dropHere": "松手即播放",
      "dock.expand": "展开音乐库",
      "dock.collapse": "收起",
      "dock.hide": "隐藏",
      "dock.show": "显示音乐库",
      "dock.linkPlaceholder": "粘贴 B站 / 网易云 / QQ音乐 链接或歌单",
      "dock.queued": "已加入队列，按播放键开始",
      "dock.queueEmpty": "拖入音频，或粘贴链接，或从预置里挑一首",
      "dock.cleared": "播放列表已清空",
      "dock.queueRestored": "已恢复上次的播放列表",
      "dock.queueRestoredPartial": "，另有 {count} 条已失效",
      "dock.queueRestoreFailed": "上次的平台曲目需要重新解析，请重新粘贴歌单链接",
      "dock.spectrumPeek": "把频谱提上来看看",
      "dock.spectrumSink": "让频谱沉回页面下",
      "dock.dragHint": "拖动移动位置，双击复位",
      "dock.sizeCycle": "切换大小",
      "dock.sizeNow": "大小",
      "dock.externalBadge": "外部播放器",
      "dock.localBadge": "本地播放",
      "dock.autoplayBlocked": "已就绪，点一下播放键出声",
      "dock.noEmbed": "这条音源没有可嵌入的地址",
      "dock.embedNote": "外部播放器：进度与音量由播放器自身控制，频谱不可用",
      "dock.diagTitle": "播放通道",
      "dock.diagExternal": "内嵌播放器（频谱不可用）",
      "dock.diagNoEmbed": "没有可用的播放地址",
      "dock.vipBadge": "无直链",
      "dock.selfCheck": "自检",
      "dock.playlist": "播放列表",
      "dock.clear": "清空",
      "dock.remove": "移除",
      "dock.spectrumOn": "打开频谱",
      "dock.spectrumOff": "关闭频谱",
      "dock.spectrumTurnedOn": "频谱已打开",
      "dock.spectrumTurnedOff": "频谱已关闭",
      "dock.embedClose": "关闭外部播放器",
      "dock.embedClosed": "外部播放器已关闭，可在播放列表里重新打开",
      "dock.noStore": "设置存储不可用，频谱开关不能落盘",
      "dock.batchHint": "一次粘贴多条链接即可批量加进播放列表",
      "dock.favorite": "收藏当前曲目",
      "dock.favorited": "已收藏",
      "dock.unfavorited": "已取消收藏",
      "dock.favNoUrl": "当前曲目没有可收藏的链接地址",
      /* ---- 设置页的收藏 / 历史列表 ----
         注意 `{count}` 是宿主插值占位符，不是模板串，不要手改成别的写法。 */
      "lib.favTitle": "收藏播放链接",
      "lib.favHelp": "长期保留的链接。点击「播放」直接入队开播，刷新与重启都不会丢。",
      "lib.histTitle": "历史播放链接",
      "lib.histHelp": "凡粘贴进来解析过的链接自动记一笔，最多保留最近 100 条，重复播放只累加次数。",
      "lib.favEmpty": "还没有收藏。播放时点卡片右上角的 ☆ 就能收藏当前这条。",
      "lib.histEmpty": "还没有历史。粘贴过的链接会自动记在这里。",
      "lib.play": "播放",
      "lib.del": "删除",
      "lib.clearAll": "清空",
      "lib.playsCount": "播放 {count} 次",
      "lib.noEngine": "播放器还没就绪，稍后再点",
      "lib.favCleared": "收藏已清空",
      "lib.histCleared": "历史已清空",
      "lib.playing": "已加入播放列表",
      "lib.failed": "这条链接现在解析不了",
      "lib.collapse": "收起列表",
      "lib.expand": "展开列表"
    },
    en: {
      "tab.title": "Music",
      "settings.title": "Music library",
      "guide.title": "Music",
      "guide.description": "Local audio, platform playlists, and preset soundscapes",
      "panel.drop": "Drop audio files here",
      "panel.empty": "Nothing playing",
      "panel.queue": "Queue",
      "dock.title": "Music library",
      "dock.idle": "Not playing",
      "dock.untitled": "Untitled",
      "dock.play": "Play",
      "dock.pause": "Pause",
      "dock.prev": "Previous",
      "dock.next": "Next",
      "dock.seek": "Seek",
      "dock.volume": "Volume",
      "dock.volumeHint": "Scroll or drag to adjust, click to mute",
      "dock.loop": "Loop mode",
      "dock.add": "Add",
      "dock.added": "Added to the queue",
      "dock.parsed": "Resolved and queued",
      "dock.notAudio": "Audio files only",
      "dock.dropHere": "Release to play",
      "dock.expand": "Expand music library",
      "dock.collapse": "Collapse",
      "dock.hide": "Hide",
      "dock.show": "Show music library",
      "dock.linkPlaceholder": "Paste a Bilibili / NetEase / QQ Music link or playlist",
      "dock.queued": "Queued — press play to start",
      "dock.queueEmpty": "Drop audio, paste a link, or pick a preset",
      "dock.cleared": "Playlist cleared",
      "dock.queueRestored": "Playlist restored from last time",
      "dock.queueRestoredPartial": " ({count} entries expired)",
      "dock.queueRestoreFailed": "Saved platform tracks need re-resolving — paste the playlist link again",
      "dock.spectrumPeek": "Lift the spectrum up",
      "dock.spectrumSink": "Sink the spectrum back",
      "dock.dragHint": "Drag to move, double-click to reset",
      "dock.sizeCycle": "Switch size",
      "dock.sizeNow": "Size",
      "dock.externalBadge": "External player",
      "dock.localBadge": "Local playback",
      "dock.autoplayBlocked": "Ready — press play to unmute",
      "dock.noEmbed": "This source has no embeddable address",
      "dock.embedNote": "External player: seek and volume are handled inside it; spectrum unavailable",
      "dock.diagTitle": "Output path",
      "dock.diagExternal": "Embedded player (spectrum unavailable)",
      "dock.diagNoEmbed": "No playable address",
      "dock.vipBadge": "No direct link",
      "dock.selfCheck": "Check",
      "dock.playlist": "Playlist",
      "dock.clear": "Clear",
      "dock.remove": "Remove",
      "dock.spectrumOn": "Show spectrum",
      "dock.spectrumOff": "Hide spectrum",
      "dock.spectrumTurnedOn": "Spectrum on",
      "dock.spectrumTurnedOff": "Spectrum off",
      "dock.embedClose": "Close external player",
      "dock.embedClosed": "External player closed — reopen it from the playlist",
      "dock.noStore": "Settings storage unavailable — spectrum toggle cannot persist",
      "dock.batchHint": "Paste several links at once to build the playlist",
      "dock.favorite": "Favorite this track",
      "dock.favorited": "Favorited",
      "dock.unfavorited": "Removed from favorites",
      "dock.favNoUrl": "This track has no link worth saving",
      "lib.favTitle": "Favorite links",
      "lib.favHelp": "Links kept for good. Press Play to queue and start it; survives refresh and restart.",
      "lib.favEmpty": "No favorites yet. Press ☆ in the dock header while playing to save the current track.",
      "lib.histTitle": "Play history",
      "lib.histHelp": "Every pasted and resolved link is recorded here, newest first, up to 100. Replaying only bumps the count.",
      "lib.histEmpty": "No history yet. Links you paste will show up here.",
      "lib.playsCount": "played {count} times",
      "lib.play": "Play",
      "lib.del": "Remove",
      "lib.clearAll": "Clear all",
      "lib.expand": "Expand list",
      "lib.collapse": "Collapse list",
      "lib.playing": "Added to the playlist",
      "lib.failed": "This link cannot be resolved right now",
      "lib.noEngine": "Player not ready yet — try again in a moment",
      "lib.favCleared": "Favorites cleared",
      "lib.histCleared": "History cleared"
    }
  };

  // src/client/styles.js
  var STYLE_TAG_ID = `${PLUGIN_ID}/client.css`;
  var CSS_TEXT = `
.dmo-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: 10px;
  padding: 12px 14px 14px;
  box-sizing: border-box;
  color: var(--dmo-fg);
  font-size: 13px;
  line-height: 1.45;
}

/* ---------- 顶部：标题 + 状态 + 主控 ---------- */
.dmo-head {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.dmo-title {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dmo-title-sub {
  font-size: 11.5px;
  color: var(--dmo-fg-faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dmo-head-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
}

/* ---------- 频谱 ---------- */
/* 只做容器：底色透明，颜色全部交给 canvas 自己画（它读 --dmo-spec-*）。
 * 这里绝不能再给不透明底，否则通栏形态下会变成一条白/灰板块。 */
.dmo-spectrum {
  position: relative;
  flex: none;
  height: 96px;
  border-radius: 10px;
  overflow: hidden;
  background: transparent;
}

.dmo-spectrum-canvas {
  display: block;
  width: 100%;
  height: 100%;
}

/* 外部播放器模式（B 站 iframe）没有 analyser，频谱只能画呼吸基线。
 * 必须明说，否则用户会以为频谱坏了 —— 之前正是这条缺失造成的误判。 */
.dmo-spectrum-badge {
  position: absolute;
  right: 8px;
  bottom: 6px;
  padding: 1px 7px;
  border: 1px solid var(--dmo-edge, rgba(77, 107, 254, 0.28));
  border-radius: 999px;
  background: var(--dmo-glass, rgba(255, 255, 255, 0.94));
  color: var(--dmo-fg-dim, #45557a);
  font-size: 10px;
  line-height: 1.6;
  pointer-events: none;
  white-space: nowrap;
}

.dmo-spectrum[data-spectrum='unavailable'] .dmo-spectrum-canvas {
  opacity: 0.55;
}

.dmo-spectrum-idle {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11.5px;
  color: var(--dmo-fg-faint);
  pointer-events: none;
}

/* ---------- 走带中的电平条 ---------- */
.dmo-meter {
  flex: none;
  height: 3px;
  border-radius: 2px;
  background: var(--dsw-alias-border-l3, rgba(127, 127, 127, .18));
  overflow: hidden;
}
.dmo-meter-fill {
  height: 100%;
  width: 0;
  border-radius: 2px;
  background: var(--dsw-alias-button-info-fill, #4d6bfe);
  transition: width 120ms linear;
}
.dmo-meter-fill.dmo-clip { background: var(--dsw-alias-label-dangerous, #d54941); }

/* ---------- 预设列表 ---------- */
.dmo-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-right: 2px;
}
.dmo-group {
  margin: 8px 2px 2px;
  font-size: 11px;
  letter-spacing: .04em;
  text-transform: uppercase;
  color: var(--dmo-fg-faint);
}
.dmo-group:first-child { margin-top: 2px; }
.dmo-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 9px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  min-width: 0;
}
.dmo-row:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, .12)); }
.dmo-row.dmo-active {
  background: var(--dsw-alias-interactive-bg-selected, rgba(77, 107, 254, .14));
  border-color: var(--dmo-line);
}
.dmo-row-glyph {
  flex: none;
  width: 14px;
  text-align: center;
  font-size: 11px;
  opacity: .7;
  font-variant-numeric: tabular-nums;
}
.dmo-row.dmo-active .dmo-row-glyph {
  opacity: 1;
  color: var(--dsw-alias-button-info-fill, #4d6bfe);
  animation: dmo-pulse 1.6s ease-in-out infinite;
}
.dmo-row-main { min-width: 0; flex: 1 1 auto; display: flex; flex-direction: column; gap: 1px; }
.dmo-row-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12.5px;
}
.dmo-row-meta {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  color: var(--dmo-fg-faint);
  font-variant-numeric: tabular-nums;
}
.dmo-row-loop {
  flex: none;
  font-size: 10.5px;
  color: var(--dmo-fg-dim);
  border: 1px solid var(--dsw-alias-border-l3, rgba(127, 127, 127, .18));
  border-radius: 999px;
  padding: 1px 7px;
}
.dmo-empty {
  padding: 24px 8px;
  text-align: center;
  font-size: 12px;
  color: var(--dmo-fg-faint);
}
@keyframes dmo-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }

/* ---------- 底部：音源状态 ---------- */
.dmo-foot {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 6px;
  border-top: 1px solid var(--dsw-alias-border-l3, rgba(127, 127, 127, .18));
  font-size: 11px;
  color: var(--dmo-fg-faint);
}
.dmo-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--dmo-fg-faint);
  flex: none;
}
.dmo-dot.dmo-ok { background: var(--dsw-alias-label-success, #2a9d5c); }
.dmo-dot.dmo-bad { background: var(--dsw-alias-label-dangerous, #d54941); }

/* ---------- 按钮（紧凑型，跟宿主同一套变量） ---------- */
.dmo-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-width: 28px;
  height: 26px;
  padding: 0 9px;
  border-radius: 6px;
  border: 1px solid var(--dmo-line);
  background: transparent;
  color: var(--dmo-fg);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.dmo-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, .12)); }
.dmo-btn:disabled { opacity: .45; cursor: default; }
.dmo-btn.dmo-primary {
  background: var(--dsw-alias-button-info-fill, #4d6bfe);
  border-color: transparent;
  color: #fff;
}
.dmo-btn.dmo-primary:hover:not(:disabled) { filter: brightness(1.08); }

@media (prefers-reduced-motion: reduce) {
  .dmo-row.dmo-active .dmo-row-glyph { animation: none; }
  .dmo-meter-fill { transition: none; }
}

/* ================= 右下角音乐库（shell.overlay 槽位） =================

   宿主 .AppFrame_overlayLayer 是 position:absolute; inset:0; z-index:20;
   pointer-events:none。直接子元素自动恢复可点。所以这块只做「右下角定位」，
   绝不给根节点设 inset:0 / 宽高 100%，否则整屏变成吃点击的透明遮罩。 */

/* ---------- 隔离层：右下角坐标 + 自己的层叠上下文 ----------
 *
 * 频谱的「藏进页面里」用负 z-index 实现，而负值只能沉到**最近的层叠上下文**底部。
 * 宿主 .overlayLayer 本身就是 z-index:20 的独立上下文，如果这里不再垫一层，
 * 负 z-index 只会沉到 overlay 内部底部 —— 整体仍浮在正文之上，效果正好相反。
 *
 * isolation:isolate 建立上下文，z-index:auto 不参与比较（层叠顺序不变）；
 * 不给宽高、不给 inset:0，让它紧贴子节点，否则就是一张全屏吃点击的透明膜。
 */
.dmo-dock-stack {
  position: absolute;
  right: 16px;
  bottom: 16px;
  z-index: auto;
  isolation: isolate;
  pointer-events: none;
}

/* 面板与召唤按钮都要能点；频谱外壳单独放行自己的规则 */
.dmo-dock-stack > .dmo-dock,
.dmo-dock-stack > .dmo-dock-revive {
  position: relative;
  right: auto;
  bottom: auto;
  pointer-events: auto;
}

.dmo-dock {
  position: absolute;
  right: 16px;
  bottom: 16px;
  z-index: 30;
  box-sizing: border-box;
  font-size: 13px;
  line-height: 1.45;
  color: var(--dmo-fg);
  pointer-events: auto;
}

/* ---------- 收起态：一枚胶囊 ---------- */
.dmo-dock--collapsed {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

/* ---------- 收起态胶囊：蓝白玻璃胶囊 ----------
 *
 * 画风锚点：DeepSeek 蓝白。横向一条冷白玻璃，描边是低饱和的鲸蓝，
 * 外侧带一圈蓝雾光晕（--dmo-halo），内层一道自上而下的高光让它是「玻璃」而非「纸片」。
 *
 * 配色仍走 --dmo-glass/--dmo-edge 这组自洽令牌（不消费 --dsw-alias-bg-*），
 * 因为胶囊要的是恒定的一张浅色玻璃 —— 深色主题下它会变成深蓝玻璃，
 * 而不是跟着界面糊成一块看不清的色块。
 */
.dmo-capsule {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  max-width: 340px;
  padding: 7px 11px 7px 8px;
  border: 1px solid var(--dmo-edge-strong, rgba(77, 107, 254, 0.5));
  border-radius: 999px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(236, 244, 255, 0.72)),
    var(--dmo-glass, rgba(255, 255, 255, 0.94));
  box-shadow:
    0 0 0 3px var(--dmo-halo, rgba(77, 107, 254, 0.26)),
    0 10px 26px rgba(38, 74, 176, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.95);
  color: var(--dmo-fg, #16233f);
  font-family: 'Segoe UI Variable Display', 'Segoe UI', system-ui, -apple-system, sans-serif;
  transition: box-shadow 140ms ease, transform 140ms cubic-bezier(.34, 1.56, .64, 1);
  /* 整枚胶囊都是拖动面：拖动过程中不能顺手选中文字，
   * 否则浏览器先起选区、指针事件被选区吞掉，表现为「怎么拖都不动」。 */
  cursor: grab;
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
}

.dmo-capsule:hover {
  transform: translateY(-1px);
  box-shadow:
    0 0 0 4px var(--dmo-halo, rgba(77, 107, 254, 0.3)),
    0 14px 32px rgba(38, 74, 176, 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.95);
}

.dmo-capsule:active {
  /* 拖动时不能再用位移做「按下」反馈：那会把胶囊整体挪 1px 而 box 没动，
   * 视觉上像被卡住。改成收紧光晕。 */
  box-shadow:
    0 0 0 2px var(--dmo-halo, rgba(77, 107, 254, 0.22)),
    0 4px 12px rgba(38, 74, 176, 0.2);
}

/* 拖动中：禁用 hover/active 的位移动画，避免与 left/top 的实时位移打架 */
.dmo-dock[data-dragging='1'] .dmo-capsule,
.dmo-dock[data-dragging='1'] .dmo-capsule:hover,
.dmo-dock[data-dragging='1'] .dmo-capsule:active {
  transform: none;
  transition: none;
  cursor: grabbing;
}

/*
 * 胶囊正文按钮：只包「唱片 + 曲名 + 时间」，点它才展开。
 * 频谱键与播放键是它的兄弟节点 —— 一旦嵌进 button 里，HTML 会强制拆开，
 * 点击事件翻到外层，表现为「点频谱却展开了卡片」。
 */
.dmo-capsule-main {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.dmo-capsule-main:focus-visible,
.dmo-capsule-spectrum:focus-visible,
.dmo-capsule-btn:focus-visible {
  outline: 2px solid var(--dmo-brand, #4d6bfe);
  outline-offset: 2px;
}

/* 收起态的提示：贴在胶囊下沿，一行截断，点开卡片看全文。 */
.dmo-capsule-note {
  flex: none;
  max-width: 150px;
  overflow: hidden;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 10px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dmo-capsule-note.dmo-note--ok {
  background: rgba(45, 164, 78, 0.14);
  color: #1c7a37;
}

.dmo-capsule-note.dmo-note--bad {
  background: rgba(217, 48, 37, 0.14);
  color: #b3261e;
}

.dmo-capsule-disc {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 24px;
  height: 24px;
  border: 1px solid var(--dmo-edge-strong, rgba(77, 107, 254, 0.5));
  border-radius: 50%;
  background: radial-gradient(circle at 50% 50%, var(--dmo-brand-deep, #2f4bd8) 0 26%, transparent 27%),
              conic-gradient(from 210deg, #4d6bfe, #7b95ff, #b9cbff, #4d6bfe);
  color: transparent;
  font-size: 0;
  box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, 0.95);
}

/* 播放中唱片匀速转：纯 CSS，卸载即停，不挂 rAF。 */
.dmo-capsule-disc[data-playing='1'] {
  animation: dmo-spin 2.4s linear infinite;
}

/* ---------- 黑胶唱片 ----------
 *
 * 胶囊与展开卡片共用同一枚 .dmo-vinyl，做到「点了展开风格不变」。
 * 有封面时封面圆形裁切铺满盘面，中心留一枚小标签孔；没封面时用蓝白标签兜底。
 * data-playing 驱动旋转；system 开启「减少动态效果」时全局规则会停掉动画。
 */
.dmo-vinyl {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 1px solid var(--dmo-edge-strong, rgba(77, 107, 254, 0.5));
  background:
    repeating-radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.1) 0 1px, transparent 1px 3px),
    radial-gradient(circle at 50% 50%, #2b3f74 0 30%, #131c33 31% 100%);
  box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, 0.9), 0 2px 10px rgba(38, 74, 176, 0.3);
  overflow: hidden;
}

.dmo-vinyl[data-playing='1'] {
  animation: dmo-spin 2.4s linear infinite;
}

/* 封面铺满盘面，中心留孔；孔用 ::after 叠在最上层 */
.dmo-vinyl-cover {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
  pointer-events: none;
}

.dmo-vinyl-cover::after {
  content: '';
}

.dmo-vinyl[data-cover='1'] .dmo-vinyl-label {
  /* 有封面时标签缩成中心孔 */
  width: 8px;
  height: 8px;
  padding: 0;
  font-size: 0;
  border-color: var(--dmo-brand-deep, #2f4bd8);
  box-shadow: 0 0 0 2px var(--dmo-edge-strong, rgba(77, 107, 254, 0.5));
}

.dmo-vinyl-label {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 13px;
  height: 13px;
  border: 1px solid rgba(47, 75, 216, 0.85);
  border-radius: 50%;
  background: conic-gradient(from 210deg, #2f4bd8, #4d6bfe, #9fb6ff, #4d6bfe, #2f4bd8);
  color: transparent;
  font-size: 0;
  box-shadow: 0 0 0 1.5px rgba(255, 255, 255, 0.85);
}

/* 大号：展开卡片里的黑胶。尺寸跟 dockSize 一起缩放。 */
.dmo-vinyl--lg {
  width: 68px;
  height: 68px;
  box-shadow: inset 0 0 0 3px #fff, 0 8px 20px rgba(0, 0, 0, 0.22);
}

.dmo-vinyl--lg .dmo-vinyl-label {
  width: 22px;
  height: 22px;
  font-size: 11px;
  /* 大号标签里的 ♫ 是白字，必须有实色底 —— 下面这行 gradient 不只是装饰，
   * 还是对比度保证。别把它删成 transparent，否则白字压在黑胶上读不出来。 */
  background: conic-gradient(from 210deg, #2f4bd8, #4d6bfe, #9fb6ff, #4d6bfe, #2f4bd8);
  color: #fff;
  text-shadow: 0 1px 2px rgba(20, 40, 110, 0.65);
}

.dmo-vinyl--lg[data-cover='1'] .dmo-vinyl-label {
  width: 10px;
  height: 10px;
  font-size: 0;
}

/* 拖动句柄：只有唱片这一小块承接 pointer 事件，避免吞掉胶囊正文的点击展开 */
.dmo-drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  cursor: grab;
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
}

.dmo-drag-handle:active {
  cursor: grabbing;
}

.dmo-dock--dragging,
.dmo-dock--dragging * {
  cursor: grabbing !important;
}

/* 拖到一半时加重光晕，暗示「搬动了」 */
.dmo-dock[data-dragging='1'] .dmo-capsule,
.dmo-dock[data-dragging='1'] .dmo-card {
  box-shadow:
    0 0 0 5px var(--dmo-halo, rgba(77, 107, 254, 0.3)),
    0 24px 52px rgba(38, 74, 176, 0.34);
}

/* ---------- 展开卡片里的黑胶舞台 ---------- */
.dmo-vinyl-stage {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px 10px;
  border-bottom: 1px solid var(--dmo-line);
  /* 整块舞台都是拖动手柄：给 grab 光标 + 禁掉文字选中，
   * 否则按住拖动会先触发文本选区（蓝色高亮），看起来像「拖不动」。 */
  cursor: grab;
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
}

.dmo-vinyl-stage:active {
  cursor: grabbing;
}

.dmo-drag-handle--stage {
  border-radius: 50%;
}

.dmo-vinyl-meta {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.dmo-vinyl-title {
  overflow: hidden;
  color: var(--dmo-fg);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: -0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dmo-vinyl-sub {
  color: var(--dmo-fg-dim);
  font-size: 11.5px;
}

@keyframes dmo-spin {
  to { transform: rotate(360deg); }
}

.dmo-capsule-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  text-align: left;
}

.dmo-capsule-name {
  overflow: hidden;
  max-width: 190px;
  color: var(--dmo-fg, #16233f);
  font-size: 12.5px;
  font-weight: 800;
  letter-spacing: -0.01em;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dmo-capsule-meta {
  color: #3f444b;
  font-size: 10.5px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}

/* 胶囊上的四根小柱：仅装饰，真实频谱在展开态底部通栏。 */
.dmo-capsule-bars {
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
  height: 14px;
}

.dmo-capsule-bars i {
  display: block;
  width: 2.5px;
  border-radius: 1px 1px 0 0;
  background: linear-gradient(180deg, var(--dmo-brand-soft, #7b95ff), var(--dmo-brand, #4d6bfe));
  animation: dmo-bar 1.1s ease-in-out infinite;
}

.dmo-capsule-bars i:nth-child(1) { height: 40%; animation-delay: 0s; }
.dmo-capsule-bars i:nth-child(2) { height: 90%; animation-delay: 0.16s; }
.dmo-capsule-bars i:nth-child(3) { height: 60%; animation-delay: 0.32s; }
.dmo-capsule-bars i:nth-child(4) { height: 80%; animation-delay: 0.48s; }

@keyframes dmo-bar {
  0%, 100% { transform: scaleY(0.4); }
  50% { transform: scaleY(1); }
}

/* 胶囊上的频谱开关：一个 ≋ 字符，开启时填成鲸蓝。 */
.dmo-capsule-spectrum {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 22px;
  height: 22px;
  border: 1px solid var(--dmo-edge-strong, rgba(77, 107, 254, 0.5));
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.6);
  color: var(--dmo-fg-dim, #45557a);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  opacity: 0.75;
  transition: opacity 120ms ease, background 120ms ease, color 120ms ease;
}

.dmo-capsule-spectrum:hover { opacity: 1; }

.dmo-capsule-spectrum[data-on='1'] {
  background: linear-gradient(160deg, var(--dmo-brand-soft, #7b95ff), var(--dmo-brand, #4d6bfe));
  border-color: transparent;
  color: #fff;
  opacity: 1;
  box-shadow: 0 2px 10px rgba(77, 107, 254, 0.45);
}

.dmo-capsule-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 26px;
  height: 26px;
  border: 1px solid transparent;
  border-radius: 50%;
  background: linear-gradient(160deg, var(--dmo-brand-soft, #7b95ff), var(--dmo-brand, #4d6bfe));
  color: #fff;
  font-size: 10px;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 3px 12px rgba(77, 107, 254, 0.42);
  transition: transform 120ms ease, box-shadow 120ms ease;
}

.dmo-capsule-btn:hover {
  transform: scale(1.06);
  box-shadow: 0 4px 16px rgba(77, 107, 254, 0.55);
}

.dmo-capsule-dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: transparent;
}

.dmo-capsule-dot[data-busy='1'] {
  background: var(--dmo-brand-soft, #7b95ff);
  animation: dmo-pulse 900ms ease-in-out infinite;
}

@keyframes dmo-pulse {
  50% { opacity: 0.25; }
}

/* ---------- 展开态：向上浮起的卡片 ---------- */
.dmo-dock--expanded {
  width: min(380px, calc(100vw - 32px));
}

/* ---------- 外部播放器舞台（B 站 / 平台 iframe） ----------
 * 为什么单独一块而不是塞进卡片：iframe 需要稳定的 16:9 视口，
 * 塞进可滚动的卡片里会被挤压成一条缝，播放器自带的控件点不到。
 * 独立一块、独立圆角与阴影，视觉上与卡片连成一个整体（负 margin 贴合）。
 */
.dmo-embed {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  margin-bottom: 8px;
  border: 1px solid var(--dmo-line);
  border-radius: 14px;
  background: var(--dsw-alias-bg-elevated, rgba(255, 255, 255, 0.96));
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(14px);
}

/*
 * 关闭外部播放器的按钮。
 * iframe 是个独立文档，里面点什么都出不来，所以出口必须浮在它上面。
 * 放在 16:9 画面右上角，白底黑框保证在任意视频画面上都看得清。
 */
.dmo-embed-close {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1.5px solid rgba(255, 255, 255, 0.9);
  border-radius: 8px;
  background: rgba(20, 22, 26, 0.72);
  color: #fff;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  opacity: 0.72;
  transition: opacity 120ms ease, background 120ms ease;
}

.dmo-embed:hover .dmo-embed-close { opacity: 1; }

.dmo-embed-close:hover {
  background: var(--dmo-brand, #4d6bfe);
  border-color: var(--dmo-brand, #4d6bfe);
  opacity: 1;
}

.dmo-embed-frame {
  display: block;
  width: 100%;
  /* 16:9，且给一个下限：小屏上仍要有 160px 高，否则播放器控件挤成一团。 */
  aspect-ratio: 16 / 9;
  min-height: 160px;
  border: 0;
  border-radius: 10px;
  background: #000;
}

.dmo-embed-missing {
  padding: 18px 12px;
  border-radius: 10px;
  background: var(--dmo-sunken);
  color: var(--dmo-fg-dim);
  font-size: 12px;
  text-align: center;
}

.dmo-embed-note {
  margin: 0;
  padding: 0 2px;
  color: var(--dmo-fg-faint);
  font-size: 11px;
  line-height: 1.45;
}

/*
 * 音源诊断行。只在外部播放器通道出现。
 * 设计意图：让「为什么静音」这件事在界面上自己说出来，
 * 而不是靠用户 F12 或靠开发者猜。
 */
.dmo-diag {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0 2px 6px;
  padding: 6px 9px;
  border-radius: 8px;
  background: var(--dmo-sunken);
  font-size: 11px;
  line-height: 1.5;
}

.dmo-diag-label {
  flex: none;
  color: var(--dmo-fg-faint);
}

.dmo-diag-value {
  color: var(--dmo-fg-dim);
  overflow-wrap: anywhere;
}

/* 不可播诊断：与「外部播放器」那条同样醒目，但用琥珀色区分——
   它不是「走了别的通道」，而是「这条真的放不了，原因在此」。 */
.dmo-diag--blocked {
  background: rgba(168, 118, 31, 0.12);
}

.dmo-diag--blocked .dmo-diag-value {
  color: #8a5f14;
}

/*
 * 卡片与外部播放器共用一套「独立配色上下文」。
 *
 * 事故：某些主题（浅色主题，以及选了浅色强调色的深色主题）把
 * --dsw-alias-label-primary 解析成接近 #fff 的白。插件此前直接继承并大量使用
 * 这个变量，于是白字落在白卡上 —— 标题、走带、播放列表全部消失。
 *
 * 根因不是某个变量取值错了，而是**前景与背景取自两套互不保证的变量**：
 * 背景用 --dsw-alias-bg-elevated（几乎总是浅色），文字用
 * --dsw-alias-label-primary（随主题翻转）。二者一旦错配就是白字白底。
 *
 * 做法是把两者解耦，在本子树里重建配色锚点：
 *   --dmo-fg / --dmo-fg-dim / --dmo-fg-faint / --dmo-line / --dmo-hover / --dmo-sunken
 * 默认取浅底深字；显式深色主题或系统深色时整体翻转为深底浅字。
 * 卡片本体背景仍跟随宿主主题（深色主题下是深卡，视觉上融进界面）。
 */

/* 默认：浅底深墨（浅色主题的正解）—— 墨色不是中性灰，而是偏冷的鲸蓝墨，
 * 这样白玻璃上的字和蓝色描边属于同一个色系，读起来是「一套画风」而不是拼贴。
 *
 * 锚点必须定义在 .dmo-dock-stack 上：胶囊是 .dmo-card 的**兄弟节点**，
 * 只挂在 .dmo-card 上的自定义属性胶囊继承不到，会静默回落到下面每处写的兜底色。
 */
.dmo-dock-stack,
.dmo-card,
.dmo-embed {
  --dmo-fg: #16233f;
  --dmo-fg-dim: #45557a;
  --dmo-fg-faint: #5a6c92;
  --dmo-line: rgba(77, 107, 254, 0.18);
  --dmo-hover: rgba(77, 107, 254, 0.08);
  --dmo-sunken: rgba(77, 107, 254, 0.06);

  /* 鲸鱼娘主题的专用色板（蓝白） */
  --dmo-brand: #4d6bfe;
  --dmo-brand-soft: #7b95ff;
  --dmo-brand-deep: #2f4bd8;
  --dmo-glass: rgba(255, 255, 255, 0.94);
  --dmo-glass-2: rgba(243, 248, 255, 0.97);
  --dmo-edge: rgba(77, 107, 254, 0.28);
  --dmo-edge-strong: rgba(77, 107, 254, 0.5);
  --dmo-halo: rgba(77, 107, 254, 0.26);

  /* 频谱色板：canvas 通过 getComputedStyle(canvas) 继承读取，所以必须挂在
   * 会包住 canvas 的容器上（.dmo-dock-stack 包胶囊/卡片/通栏频谱三者）。
   * 蓝白主调：底噪淡蓝 → 柱底中蓝 → 柱顶近白，光晕取高饱和蓝。 */
  --dmo-spec-base: rgba(150, 200, 255, 0.32);
  --dmo-spec-low: rgba(120, 180, 255, 0.58);
  --dmo-spec-high: rgba(255, 255, 255, 0.98);
  --dmo-spec-glow: rgba(120, 190, 255, 0.72);
  color: var(--dmo-fg);
}

/* 系统级深色兜底（宿主未显式声明主题时生效） */
@media (prefers-color-scheme: dark) {
  .dmo-dock-stack,
  .dmo-card,
  .dmo-embed {
    --dmo-fg: #eaf1ff;
    --dmo-fg-dim: #a8bae0;
    --dmo-fg-faint: #8f9fc4;
    --dmo-line: rgba(120, 160, 255, 0.24);
    --dmo-hover: rgba(120, 160, 255, 0.12);
    --dmo-sunken: rgba(120, 160, 255, 0.09);
    --dmo-glass: rgba(20, 28, 48, 0.94);
    --dmo-glass-2: rgba(26, 36, 60, 0.96);
    --dmo-edge: rgba(120, 160, 255, 0.3);
    --dmo-edge-strong: rgba(140, 176, 255, 0.55);
    --dmo-halo: rgba(80, 120, 255, 0.34);
    /* 深色主题下柱顶不能是纯白，否则在深蓝背景上炸开；改用略带蓝的亮白。 */
    --dmo-spec-base: rgba(130, 180, 255, 0.3);
    --dmo-spec-low: rgba(100, 160, 255, 0.55);
    --dmo-spec-high: rgba(226, 240, 255, 0.96);
    --dmo-spec-glow: rgba(110, 175, 255, 0.8);
  }
}

/*
 * 显式主题优先于系统偏好：这条必须排在 @media 之后，
 * 靠「同权重后出现者胜出」压过上一块。宿主的 data-theme 一旦声明就是权威。
 */
:where([data-theme='dark'], [data-color-scheme='dark'], .dark) .dmo-dock-stack,
:where([data-theme='dark'], [data-color-scheme='dark'], .dark) .dmo-card,
:where([data-theme='dark'], [data-color-scheme='dark'], .dark) .dmo-embed {
  --dmo-fg: #eaf1ff;
  --dmo-fg-dim: #a8bae0;
  --dmo-fg-faint: #8f9fc4;
  --dmo-line: rgba(120, 160, 255, 0.24);
  --dmo-hover: rgba(120, 160, 255, 0.12);
  --dmo-sunken: rgba(120, 160, 255, 0.09);
  --dmo-glass: rgba(20, 28, 48, 0.94);
  --dmo-glass-2: rgba(26, 36, 60, 0.96);
  --dmo-edge: rgba(120, 160, 255, 0.3);
  --dmo-edge-strong: rgba(140, 176, 255, 0.55);
  --dmo-halo: rgba(80, 120, 255, 0.34);
  --dmo-spec-base: rgba(130, 180, 255, 0.3);
  --dmo-spec-low: rgba(100, 160, 255, 0.55);
  --dmo-spec-high: rgba(226, 240, 255, 0.96);
  --dmo-spec-glow: rgba(110, 175, 255, 0.8);
}

.dmo-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  /* 与胶囊同一套语言：冷白玻璃 + 鲸蓝描边 + 外圈蓝雾。
   * 顶部还有一道极细的高光（::before），让它有厚度而不是一片纯色。 */
  border: 1px solid var(--dmo-edge-strong, rgba(77, 107, 254, 0.5));
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(232, 241, 255, 0.78)),
    var(--dmo-glass, rgba(255, 255, 255, 0.94));
  box-shadow:
    0 0 0 3px var(--dmo-halo, rgba(77, 107, 254, 0.26)),
    0 18px 44px rgba(38, 74, 176, 0.26),
    inset 0 1px 0 rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(18px) saturate(1.1);
  max-height: min(560px, calc(100vh - 120px));
  overflow: auto;
  font-family: 'Segoe UI Variable Display', 'Segoe UI', system-ui, -apple-system, sans-serif;
}

/* 顶部一道高光：玻璃的厚度感全靠它，删掉就退回一片平色。 */
.dmo-card::before {
  content: '';
  position: absolute;
  left: 14px;
  right: 14px;
  top: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.98), transparent);
  pointer-events: none;
}

/* 深色主题下仍然给一张深蓝玻璃：纯白底硬压在深色界面上会瞎眼。
 * 这两个选择器排在默认规则之后，靠同权重后者胜出覆盖。 */
@media (prefers-color-scheme: dark) {
  .dmo-card {
    background:
      linear-gradient(180deg, rgba(34, 46, 76, 0.92), rgba(20, 28, 48, 0.9)),
      var(--dmo-glass, rgba(20, 28, 48, 0.94));
    box-shadow:
      0 0 0 3px var(--dmo-halo, rgba(80, 120, 255, 0.34)),
      0 18px 44px rgba(0, 0, 0, 0.5),
      inset 0 1px 0 rgba(150, 185, 255, 0.18);
  }
}

:where([data-theme='dark'], [data-color-scheme='dark'], .dark) .dmo-card {
  background:
    linear-gradient(180deg, rgba(34, 46, 76, 0.92), rgba(20, 28, 48, 0.9)),
    var(--dmo-glass, rgba(20, 28, 48, 0.94));
  box-shadow:
    0 0 0 3px var(--dmo-halo, rgba(80, 120, 255, 0.34)),
    0 18px 44px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(150, 185, 255, 0.18);
}

.dmo-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dmo-card-title {
  font-size: 13px;
  font-weight: 600;
}

.dmo-card-sub {
  flex: 1;
  overflow: hidden;
  color: var(--dmo-fg);
  font-size: 12px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dmo-card-head-actions {
  display: inline-flex;
  gap: 2px;
}

.dmo-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dmo-fg-dim);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.dmo-icon:hover {
  background: var(--dmo-hover);
  color: var(--dmo-fg);
}

.dmo-icon--lg {
  width: 28px;
  height: 28px;
  font-size: 13px;
}

/* ---------- 走带 ---------- */
.dmo-transport {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 旋钮与循环键挂在走带右端：左半是走带按钮，右半是音量，中间留白。 */
.dmo-transport-tail {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

/* ---------- 进度条（独占一整行） ---------- */
.dmo-progress {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.dmo-play {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid var(--dmo-edge-strong, rgba(77, 107, 254, 0.5));
  border-radius: 50%;
  /* 主按钮：鲸蓝实心 + 外圈光晕。这是整个卡片里唯一的强色块，
   * 用户的视线第一秒要能落在它上面。 */
  background: linear-gradient(160deg, var(--dmo-brand-soft, #7b95ff), var(--dmo-brand, #4d6bfe));
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(77, 107, 254, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.5);
  transition: transform 120ms ease, box-shadow 120ms ease;
}

.dmo-play:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(77, 107, 254, 0.52), inset 0 1px 0 rgba(255, 255, 255, 0.55);
}

.dmo-play:disabled {
  opacity: 0.5;
  cursor: default;
}

.dmo-time {
  flex: none;
  min-width: 38px;
  color: var(--dmo-fg-dim);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.dmo-seek {
  flex: 1;
  min-width: 0;
  height: 18px;
  margin: 0;
  padding: 0;
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  cursor: pointer;
}

/* 双色轨道：已播段蓝、未播段淡。用 --dmo-seek-p 把 React 算好的百分比
 * 交给背景渐变 —— 原生 range 的 accent-color 只能整体着色，画不出分野。 */
.dmo-seek::-webkit-slider-runnable-track {
  height: 6px;
  border-radius: 999px;
  background:
    linear-gradient(90deg,
      var(--dmo-brand, #4d6bfe) 0,
      var(--dmo-brand-soft, #7b95ff) var(--dmo-seek-p, 0%),
      rgba(77, 107, 254, 0.18) var(--dmo-seek-p, 0%),
      rgba(77, 107, 254, 0.18) 100%);
}

.dmo-seek::-moz-range-track {
  height: 6px;
  border-radius: 999px;
  background: rgba(77, 107, 254, 0.18);
}

.dmo-seek::-moz-range-progress {
  height: 6px;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--dmo-brand, #4d6bfe), var(--dmo-brand-soft, #7b95ff));
}

.dmo-seek::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  margin-top: -3px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: var(--dmo-brand, #4d6bfe);
  box-shadow: 0 1px 4px rgba(77, 107, 254, 0.5);
}

.dmo-seek::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: var(--dmo-brand, #4d6bfe);
  box-shadow: 0 1px 4px rgba(77, 107, 254, 0.5);
}

.dmo-seek:disabled {
  cursor: default;
  opacity: 0.45;
}

/* ---------- 音量旋钮 ---------- */
/* 为什么是旋钮而不是横条：用户明确要「不是横条」。原生 range 在宿主深色
 * 玻璃卡上会被系统渲染成一条灰轨，形态改不掉，所以这里用 div + role="slider"
 * 自绘：外层圆弧走 conic-gradient，内层圆盘承载指针，读数贴在圆心。 */
.dmo-knob {
  position: relative;
  flex: none;
  width: 30px;
  height: 30px;
  cursor: grab;
  touch-action: none;
  user-select: none;
  outline: none;
}

.dmo-knob[data-dragging='1'] {
  cursor: grabbing;
}

.dmo-knob:focus-visible {
  border-radius: 50%;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.92), 0 0 0 4px var(--dmo-brand, #4d6bfe);
}

/* 弧：未用行程用淡蓝铺满整圈，再用同一角度的扇形把已用行程盖成品牌色。
 * 起始角 -135deg 由 JS 经 --dmo-knob-angle 传入，改行程只改 JS 一处。 */
.dmo-knob-arc {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background:
    conic-gradient(from -135deg,
      rgba(77, 107, 254, 0.14) 0deg 270deg,
      transparent 270deg 360deg);
}

.dmo-knob-arc::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background:
    conic-gradient(from -135deg,
      var(--dmo-brand-soft, #7b95ff) 0deg,
      var(--dmo-brand, #4d6bfe) var(--dmo-knob-sweep, 0deg),
      transparent var(--dmo-knob-sweep, 0deg) 360deg);
}

.dmo-knob-cap {
  position: absolute;
  inset: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--dmo-edge, rgba(77, 107, 254, 0.28));
  border-radius: 50%;
  background: linear-gradient(160deg, #ffffff, #eef2ff);
  box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.9), 0 1px 3px rgba(20, 22, 26, 0.16);
}

/* 指针：跟着旋钮角度转。transform-origin 落在圆心，所以是「绕心旋转」。 */
.dmo-knob-pointer {
  position: absolute;
  top: 2px;
  left: 50%;
  width: 2px;
  height: 6px;
  margin-left: -1px;
  border-radius: 1px;
  background: var(--dmo-brand-deep, #2f4bd8);
  transform-origin: 50% 9px;
  transform: rotate(var(--dmo-knob-angle, -135deg));
}

.dmo-knob-readout {
  position: absolute;
  left: 50%;
  bottom: -13px;
  transform: translateX(-50%);
  color: var(--dmo-fg-faint);
  font-size: 9px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  pointer-events: none;
}

.dmo-knob[data-muted='1'] .dmo-knob-arc::after {
  background: none;
}

.dmo-knob[data-muted='1'] .dmo-knob-readout {
  color: #c2410c;
}

.dmo-knob:hover .dmo-knob-cap {
  border-color: var(--dmo-edge-strong, rgba(77, 107, 254, 0.5));
}

.dmo-mixer {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dmo-mixer-label {
  flex: none;
  color: var(--dmo-fg-dim);
  font-size: 11px;
}

.dmo-volume {
  flex: 1;
  min-width: 0;
  accent-color: var(--dmo-brand, #4d6bfe);
}

.dmo-chip {
  flex: none;
  padding: 2px 8px;
  border: 1px solid var(--dmo-edge, rgba(77, 107, 254, 0.28));
  border-radius: 999px;
  background: rgba(77, 107, 254, 0.06);
  color: var(--dmo-fg-dim);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.dmo-chip:hover {
  color: var(--dmo-brand-deep, #2f4bd8);
  border-color: var(--dmo-edge-strong, rgba(77, 107, 254, 0.5));
  background: rgba(77, 107, 254, 0.12);
}

/* ---------- 链接输入 ---------- */
.dmo-link {
  display: flex;
  gap: 6px;
}

.dmo-link-input {
  flex: 1;
  min-width: 0;
  padding: 6px 9px;
  border: 1px solid var(--dmo-edge, rgba(77, 107, 254, 0.28));
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.72);
  color: inherit;
  font: inherit;
  font-size: 12px;
}

.dmo-link-input::placeholder {
  color: var(--dmo-fg-faint);
}

.dmo-link-input:focus {
  outline: 2px solid var(--dmo-brand, #4d6bfe);
  outline-offset: -1px;
  background: rgba(255, 255, 255, 0.95);
}

.dmo-btn {
  flex: none;
  padding: 6px 12px;
  border: 1px solid var(--dmo-edge, rgba(77, 107, 254, 0.28));
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.6);
  color: inherit;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease;
}

.dmo-btn:hover:not(:disabled) {
  background: rgba(77, 107, 254, 0.1);
  border-color: var(--dmo-edge-strong, rgba(77, 107, 254, 0.5));
}

.dmo-primary {
  border-color: transparent;
  background: linear-gradient(160deg, var(--dmo-brand-soft, #7b95ff), var(--dmo-brand, #4d6bfe));
  color: #fff;
  box-shadow: 0 3px 12px rgba(77, 107, 254, 0.34);
}

.dmo-primary:hover:not(:disabled) {
  background: linear-gradient(160deg, var(--dmo-brand, #4d6bfe), var(--dmo-brand-deep, #2f4bd8));
  border-color: transparent;
}

.dmo-primary:disabled {
  opacity: 0.45;
  cursor: default;
}

/* 自检按钮：靠右、弱化，不抢「加入」的主位 */
.dmo-selfcheck {
  margin-left: 4px;
  color: var(--dmo-fg-dim);
  border-style: dashed;
  border-color: var(--dmo-edge, rgba(77, 107, 254, 0.28));
}

.dmo-selfcheck:hover:not(:disabled) {
  color: inherit;
  border-style: solid;
}

/* ---------- 播放列表 ---------- */
.dmo-queue {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 0;
}

.dmo-queue-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 2px;
}

.dmo-queue-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--dmo-fg-dim);
}

.dmo-queue-count {
  flex: none;
  min-width: 16px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--dmo-hover);
  color: var(--dmo-fg-dim);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.dmo-queue-clear {
  margin-left: auto;
  padding: 1px 7px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dmo-fg-dim);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.dmo-queue-clear:hover {
  background: var(--dmo-hover);
  color: var(--dsw-alias-label-error, #d93025);
}

.dmo-queue-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-height: 168px;
  overflow: auto;
  overscroll-behavior: contain;
}

.dmo-queue-empty {
  padding: 10px 4px;
  color: var(--dmo-fg-dim);
  font-size: 12px;
  text-align: center;
}

/* 行是三列网格：序号 | 曲名（可点） | 时长 + 删除。
   用网格而不是 flex，是为了让长曲名的省略号在三列之间稳定对齐。 */
.dmo-queue-row {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  border-radius: 7px;
}

.dmo-queue-row:hover {
  background: var(--dmo-hover);
}

.dmo-queue-row--active {
  background: var(--dsw-alias-bg-active, rgba(77, 107, 254, 0.12));
}

.dmo-queue-index {
  flex: none;
  color: var(--dmo-fg-dim);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.dmo-queue-name {
  overflow: hidden;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  /* 曲名是列表里最该读清的字：不用继承色，直接钉死最深一档，并压掉半透明 */
  color: var(--dmo-fg);
  font: inherit;
  font-size: 12.5px;
  font-weight: 500;
  letter-spacing: 0.002em;
  opacity: 1;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.dmo-queue-name:hover { text-decoration: underline; }

.dmo-queue-row--active .dmo-queue-name { font-weight: 600; }

.dmo-queue-time {
  color: var(--dmo-fg-dim);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}

/* 删除键默认隐形，悬停在行上才出现：既省地方，也不会让列表看着像一堆按钮。 */
.dmo-queue-del {
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--dmo-fg-dim);
  font-size: 10px;
  line-height: 1;
  opacity: 0;
  cursor: pointer;
}

.dmo-queue-row:hover .dmo-queue-del { opacity: 0.7; }

/* 「无直链」标记：网易云 / QQ 的会员曲拿不到直链，仍然入队（曲名可见、可跳原平台），
   但点下去必然报错。不标出来，队列每行看起来都一样，用户只会以为是随机的
   「点了没反应」。用弱化的琥珀色 + 删除线感，明确是「不可播」而不是「加载中」。 */
.dmo-queue-badge {
  padding: 1px 5px;
  border-radius: 5px;
  background: var(--dmo-sunken);
  color: #a8761f;
  font-size: 9.5px;
  line-height: 1.5;
  white-space: nowrap;
}

.dmo-queue-row--blocked .dmo-queue-name {
  color: var(--dmo-fg-dim);
  text-decoration: line-through;
  text-decoration-color: rgba(168, 118, 31, 0.55);
}

.dmo-queue-del:hover {
  background: var(--dmo-hover);
  color: var(--dsw-alias-label-error, #d93025);
  opacity: 1;
}

/* ---------- 提示条 ---------- */
.dmo-note {
  padding: 6px 9px;
  border-radius: 8px;
  font-size: 12px;
}

.dmo-note--ok {
  background: var(--dsw-alias-bg-success, rgba(45, 164, 78, 0.14));
  color: var(--dsw-alias-label-success, #2da44e);
}

.dmo-note--bad {
  background: var(--dsw-alias-bg-danger, rgba(207, 34, 46, 0.14));
  color: var(--dsw-alias-label-danger, #cf222e);
}

/* ---------- 拖放遮罩 ---------- */
.dmo-dock-dropveil {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px dashed var(--dmo-edge-strong, rgba(77, 107, 254, 0.5));
  border-radius: 14px;
  background: var(--dmo-hover, rgba(77, 107, 254, 0.08));
  color: var(--dmo-brand, #4d6bfe);
  font-size: 12px;
  font-weight: 600;
  pointer-events: none;
}

.dmo-dock--collapsed .dmo-dock-dropveil {
  border-radius: 999px;
}

/* ---------- 彻底隐藏后的召唤按钮 ---------- */
.dmo-dock-revive {
  position: absolute;
  right: 16px;
  bottom: 16px;
  z-index: 30;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid var(--dmo-line);
  border-radius: 50%;
  background: var(--dsw-alias-bg-elevated, rgba(255, 255, 255, 0.9));
  color: var(--dmo-fg-dim);
  font-size: 13px;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.14);
  pointer-events: auto;
}

.dmo-dock-revive:hover {
  color: var(--dmo-brand, #4d6bfe);
}

/* ---------- 底部通栏频谱 ---------- */
.dmo-barspectrum {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  /* 高度由 ShellDock 内联注入（设置项 spectrumHeight），这里只留兜底值 */
  height: 64px;
  opacity: 0.92;
  pointer-events: none;
  z-index: 0;
  transition: opacity 0.28s ease, filter 0.28s ease;
  /* 底沿一层极淡的蓝雾，把整条频谱托住，不让它在页面底边「飘着」。 */
  background: linear-gradient(180deg, transparent 0%, rgba(77, 107, 254, 0.06) 60%, rgba(77, 107, 254, 0.12) 100%);
}

/* 两侧竖向边界线：用户参考图里的那两道「框」，让频谱读起来是一条被框住的带子。 */
.dmo-barspectrum::before,
.dmo-barspectrum::after {
  content: '';
  position: absolute;
  top: 12%;
  bottom: 8%;
  width: 1px;
  background: linear-gradient(180deg, transparent, var(--dmo-brand-soft, #7b95ff), transparent);
  opacity: 0.55;
}

.dmo-barspectrum::before { left: 18px; }
.dmo-barspectrum::after { right: 18px; }

/*
 * 层级二选一（设置项 spectrumDepth）：
 *
 *   front —— 浮在正文之上，清楚可见。z-index 正值，落在外层隔离层内，
 *            所以仍然只覆盖这个右下角坐标系，不会盖住宿主弹窗（那些在 overlay 之外）。
 *   back  —— 藏进页面之下。负 z-index 会沉到隔离层底部，而隔离层本身
 *            是 overlay 的子节点，于是整条频谱被压到正文内容后面，
 *            只有侧栏与边距这类空白区域能透出它的光，形成藏起来的暗纹。
 *            配合低透明度，动静再大也不抢注意力。
 *
 * peek 是卡片头部 ⤒ 键临时提上来看一眼的状态，3 秒后自动沉回去。
 */
.dmo-barspectrum[data-depth='front'] {
  z-index: 25;
  opacity: 0.92;
}

.dmo-barspectrum[data-depth='back'] {
  z-index: -1;
  opacity: 0.5;
}

.dmo-barspectrum[data-depth='peek'] {
  z-index: 25;
  opacity: 1;
}

.dmo-barspectrum[data-glow='strong'] {
  opacity: 1;
  filter: drop-shadow(0 0 12px var(--dmo-spec-glow, rgba(120, 190, 255, 0.72)));
}

.dmo-barspectrum[data-glow='soft'] {
  filter: drop-shadow(0 0 5px var(--dmo-spec-glow, rgba(120, 190, 255, 0.72)));
}

.dmo-barspectrum[data-glow='off'] {
  filter: none;
}

/* ---------- 三档尺寸（设置项 dockSize，用户要的「大中小三个大小」） ----------
 *
 * 胶囊与卡片一起缩放。胶囊之前是固定 max-width，换档只改卡片会显得两张皮。
 * 大档同时把展开卡片撑宽，给出更长的标题与队列行。
 */
.dmo-dock--size-compact .dmo-card { width: 248px; }
.dmo-dock--size-normal .dmo-card { width: 320px; }
.dmo-dock--size-wide .dmo-card { width: 420px; }

.dmo-dock--size-compact .dmo-capsule { max-width: 248px; padding: 6px 10px 6px 7px; }
.dmo-dock--size-normal .dmo-capsule { max-width: 320px; }
.dmo-dock--size-wide .dmo-capsule { max-width: 420px; padding: 8px 12px 8px 9px; }

.dmo-dock--size-compact .dmo-capsule-name { max-width: 128px; font-size: 12px; }
.dmo-dock--size-normal .dmo-capsule-name { max-width: 190px; }
.dmo-dock--size-wide .dmo-capsule-name { max-width: 286px; font-size: 13px; }

.dmo-dock--size-compact .dmo-vinyl { width: 22px; height: 22px; }
.dmo-dock--size-wide .dmo-vinyl { width: 30px; height: 30px; }

.dmo-dock--size-compact .dmo-vinyl--lg { width: 52px; height: 52px; }
.dmo-dock--size-wide .dmo-vinyl--lg { width: 84px; height: 84px; }

/* 卡片宽度永不超过视口，否则小屏上左右各自出界 */
.dmo-dock--size-compact .dmo-card,
.dmo-dock--size-normal .dmo-card,
.dmo-dock--size-wide .dmo-card {
  max-width: calc(100vw - 32px);
}

/* ---------- 不显示曲名（设置项 showTitles） ---------- */
.dmo-dock--no-titles .dmo-capsule-text,
.dmo-dock--no-titles .dmo-queue-name {
  display: none;
}

.dmo-barspectrum .dmo-spectrum {
  height: 100%;
  border-radius: 0;
  background: transparent;
}

/* 侧边栏大屏形态的宿主容器 */
.dmo-seat {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  min-height: 0;
}

.dmo-tabtitle {
  font-size: inherit;
}

/* 无障碍与省电：用户要求减少动效时，所有纯装饰动画停掉。 */
@media (prefers-reduced-motion: reduce) {
  .dmo-capsule-disc[data-playing='1'],
  .dmo-capsule-bars i,
  .dmo-capsule-dot[data-busy='1'] {
    animation: none;
  }

  .dmo-capsule:hover {
    transform: none;
  }
}

/* ============================================================
   设置分区（settings.section）
   Settings.jsx 只产出结构类名，样式全部在这里定义。
   CSS 规则名与 JSX 一一对应，改一处必须同步另一处：
     .dmo-settings          外层
     .dmo-settings-head     标题区
     .dmo-settings-group    分组容器（含 data-group）
     .dmo-settings-group-title  分组标题
     .dmo-setting-row       单行（网格：标签 | 控件 | 值）
     .dmo-setting-text      左侧标签与说明
     .dmo-setting-label     项目名
     .dmo-setting-help      灰色说明
     .dmo-setting-control   右侧控件槽
     .dmo-range / .dmo-select / .dmo-switch / .dmo-range-value
     .dmo-settings-actions  底部按钮条
   ============================================================ */
/*
 * 设置分区。
 *
 * 这块渲染在宿主设置页里（settings.section 槽位），底色由宿主给，
 * 因此不能只抄卡片的配色锚点 —— 必须自带一套前景与描边，
 * 否则浅色主题下同样会出现「字和底同一亮度」。
 * 这里只固定前景色与分隔线，背景保持透明让宿主底板透出来。
 */
.dmo-settings {
  --dmo-fg: #16233f;
  --dmo-fg-dim: #45557a;
  --dmo-fg-faint: #5a6c92;
  --dmo-line: rgba(77, 107, 254, 0.18);
  --dmo-hover: rgba(77, 107, 254, 0.08);
  --dmo-sunken: rgba(77, 107, 254, 0.06);
  --dmo-brand: #4d6bfe;
  --dmo-brand-soft: #7b95ff;
  --dmo-brand-deep: #2f4bd8;
  --dmo-glass: rgba(255, 255, 255, 0.94);
  --dmo-edge: rgba(77, 107, 254, 0.28);
  --dmo-edge-strong: rgba(77, 107, 254, 0.5);
  --dmo-halo: rgba(77, 107, 254, 0.26);
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 2px 0 8px;
  container-type: inline-size;
  color: var(--dmo-fg);
  font-size: 13px;
  line-height: 1.5;
}

@media (prefers-color-scheme: dark) {
  .dmo-settings {
    --dmo-fg: #eaf1ff;
    --dmo-fg-dim: #a8bae0;
    --dmo-fg-faint: #8f9fc4;
    --dmo-line: rgba(120, 160, 255, 0.24);
    --dmo-hover: rgba(120, 160, 255, 0.12);
    --dmo-sunken: rgba(120, 160, 255, 0.09);
    --dmo-glass: rgba(20, 28, 48, 0.94);
    --dmo-edge: rgba(120, 160, 255, 0.3);
    --dmo-edge-strong: rgba(140, 176, 255, 0.55);
    --dmo-brand: #8aa6ff;
    --dmo-brand-soft: #b9ccff;
    --dmo-brand-deep: #5c7cff;
    --dmo-halo: rgba(80, 120, 255, 0.34);
  }
}

:where([data-theme='dark'], [data-color-scheme='dark'], .dark) .dmo-settings {
  --dmo-fg: #eaf1ff;
  --dmo-fg-dim: #a8bae0;
  --dmo-fg-faint: #8f9fc4;
  --dmo-line: rgba(120, 160, 255, 0.24);
  --dmo-hover: rgba(120, 160, 255, 0.12);
  --dmo-sunken: rgba(120, 160, 255, 0.09);
  --dmo-glass: rgba(20, 28, 48, 0.94);
  --dmo-edge: rgba(120, 160, 255, 0.3);
  --dmo-edge-strong: rgba(140, 176, 255, 0.55);
  --dmo-brand: #8aa6ff;
  --dmo-brand-soft: #b9ccff;
  --dmo-brand-deep: #5c7cff;
  --dmo-halo: rgba(80, 120, 255, 0.34);
}

.dmo-settings-head {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--dmo-line);
}

/* 标题左侧一道蓝白渐变竖条，跟胶囊与卡片的观感统一。 */
.dmo-settings-title {
  position: relative;
  padding-left: 12px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.2px;
}

.dmo-settings-title::before {
  content: '';
  position: absolute;
  left: 0;
  top: 2px;
  bottom: 2px;
  width: 3px;
  border-radius: 999px;
  background: linear-gradient(180deg, var(--dmo-brand-soft), var(--dmo-brand-deep));
}

.dmo-settings-sub {
  font-size: 12px;
  color: var(--dmo-fg-dim);
  line-height: 1.6;
}

.dmo-settings .dmo-code {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--dsw-alias-bg-secondary, rgba(127, 127, 127, 0.12));
  font-family: var(--dsw-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11.5px;
}

.dmo-settings-body {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.dmo-settings-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dmo-settings-group-title {
  padding: 0 0 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--dmo-brand);
  opacity: 0.85;
}

/* 单行：左标签 / 右侧控件。控件列宽固定，标签列吃掉剩余空间。 */
.dmo-setting-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px 20px;
  padding: 9px 10px;
  border-radius: 8px;
  cursor: default;
  transition: background-color 120ms ease;
}

.dmo-setting-row:hover {
  background: var(--dmo-hover);
}

/*
 * 滑杆不做「按值填充槽」：原生 input[type=range] 的已填充段要靠内联
 * background-size 计算，设置页项多、值随时变，写死渐变反而会骗人
 * （永远显示满格）。这里只把槽与钮统一到蓝白，视觉与频谱同族。
 */
.dmo-setting-row .dmo-range {
  background: var(--dmo-line);
}

/* 窄容器（设置页侧栏在窄窗口下）自动降为两行堆叠，避免控件被挤扁。 */
@container (max-width: 460px) {
  .dmo-setting-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }

  .dmo-setting-control {
    justify-content: flex-start;
  }
}

.dmo-setting-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.dmo-setting-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--dmo-fg);
}

.dmo-setting-help {
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--dmo-fg-dim);
}

.dmo-setting-control {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex: 0 0 auto;
}

/* ---- 滑杆 ---- */
.dmo-range {
  -webkit-appearance: none;
  appearance: none;
  width: 132px;
  height: 4px;
  border-radius: 999px;
  background: var(--dmo-line);
  outline: none;
  cursor: pointer;
}

.dmo-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: linear-gradient(180deg, var(--dmo-brand-soft, #7b95ff), var(--dmo-brand, #4d6bfe));
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px var(--dmo-edge, rgba(77, 107, 254, 0.28)), 0 0 8px var(--dmo-halo, rgba(77, 107, 254, 0.26));
  cursor: pointer;
}

.dmo-range::-moz-range-thumb {
  width: 13px;
  height: 13px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: linear-gradient(180deg, var(--dmo-brand-soft, #7b95ff), var(--dmo-brand, #4d6bfe));
  box-shadow: 0 0 0 1px var(--dmo-edge, rgba(77, 107, 254, 0.28));
  cursor: pointer;
}

.dmo-range:focus-visible {
  box-shadow: 0 0 0 3px var(--dmo-halo, rgba(77, 107, 254, 0.26));
}

.dmo-range-value {
  min-width: 54px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-align: right;
  color: var(--dmo-fg-dim);
}

/* ---- 下拉 ---- */
.dmo-select {
  min-width: 132px;
  padding: 5px 8px;
  border-radius: 7px;
  border: 1px solid var(--dmo-edge, var(--dmo-line));
  background: var(--dmo-glass, var(--dsw-alias-bg-base, #fff));
  color: inherit;
  font-size: 12.5px;
  cursor: pointer;
}

.dmo-select:hover {
  border-color: var(--dmo-edge-strong, var(--dmo-edge, var(--dmo-line)));
}

.dmo-select:focus-visible {
  outline: 2px solid var(--dmo-brand, #4d6bfe);
  outline-offset: 1px;
}

/* ---- 开关：原生 checkbox 换成滑块，保持可键盘操作与读屏语义 ---- */
.dmo-switch {
  -webkit-appearance: none;
  appearance: none;
  position: relative;
  width: 38px;
  height: 21px;
  margin: 0;
  border-radius: 999px;
  background: var(--dmo-line);
  cursor: pointer;
  transition: background-color 140ms ease;
}

.dmo-switch::after {
  content: '';
  position: absolute;
  top: 2.5px;
  left: 2.5px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
  transition: transform 140ms ease;
}

.dmo-switch:checked {
  background: linear-gradient(90deg, var(--dmo-brand-deep, #2f4bd8), var(--dmo-brand-soft, #7b95ff));
  box-shadow: 0 0 8px var(--dmo-halo, rgba(77, 107, 254, 0.26));
}

.dmo-switch:checked::after {
  transform: translateX(17px);
}

.dmo-switch:focus-visible {
  outline: 2px solid var(--dmo-brand, #4d6bfe);
  outline-offset: 2px;
}

.dmo-switch:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ---- 底部按钮条 ---- */
.dmo-settings-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--dmo-line);
}

.dmo-settings-actions .dmo-btn {
  padding: 5px 12px;
  border-radius: 7px;
  border: 1px solid var(--dmo-edge, var(--dmo-line));
  background: var(--dmo-glass, var(--dsw-alias-bg-base, transparent));
  color: inherit;
  font-size: 12.5px;
  cursor: pointer;
}

.dmo-settings-actions .dmo-btn:hover:not(:disabled) {
  border-color: var(--dmo-edge-strong, var(--dmo-edge, var(--dmo-line)));
  background: var(--dmo-hover);
  color: var(--dmo-brand);
}

.dmo-settings-actions .dmo-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.dmo-settings-meta {
  font-size: 12px;
  color: var(--dmo-fg-dim);
}

.dmo-settings-status {
  font-size: 12px;
  color: var(--dmo-brand, #4d6bfe);
}

@media (prefers-reduced-motion: reduce) {
  .dmo-switch,
  .dmo-switch::after,
  .dmo-setting-row {
    transition: none;
  }
}

/* ---------- 卡片头部的「把频谱提上来」键 ----------
 * 只有频谱选「藏进页面之下」时才出现：平时它沉在正文后面，
 * 用户需要一条能确认它确实在动的通道，按一下就浮上来亮 3 秒。 */
.dmo-icon--peek.is-on {
  color: var(--dmo-brand, #4d6bfe);
  background: var(--dmo-hover);
}

/* ---------- 卡片头部的收藏星标 ----------
 * 空心 ☆ / 实心 ★ 用同一枚按钮切换，靠 is-on 改色而不是换字符，
 * 这样两态的占位宽度完全一致，切换时头部的其它按钮不会左右跳。 */
.dmo-icon--fav {
  font-size: 15px;
  line-height: 1;
}

.dmo-icon--fav.is-on {
  color: #e8a33d;
}

/* ---------- 设置页的「收藏播放链接」/「历史播放链接」 ----------
 * 类名对应关系：
 *   .dmo-lib            两张表的纵向容器
 *   .dmo-lib-group      单张表（表头 + 说明 + 列表）
 *   .dmo-lib-head       表头条：标题 | 条数 | 折叠键 | 清空键
 *   .dmo-lib-row        一行：平台标签 | 标题+元信息 | 播放/删除
 *   .dmo-lib-chip       平台标签（按平台着色）
 * 行是 div 不是 button：行内含两个按钮，button 套 button 在 HTML 里非法，
 * 浏览器会把内层按钮拆到外层之外，点删除会误触发播放。
 * 颜色一律走本插件的 --dmo-fg* / --dmo-line 锚点，不直接用 --dsw-alias-label-*：
 * 后者随主题翻转而卡片底色不翻转，浅色主题下会出现白字白底。 */
.dmo-lib {
  display: flex;
  flex-direction: column;
  gap: 14px;
  container-type: inline-size;
}

.dmo-lib-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dmo-lib-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--dmo-line);
}

.dmo-lib-title {
  position: relative;
  padding-left: 9px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--dmo-fg);
}

.dmo-lib-title::before {
  content: '';
  position: absolute;
  left: 0;
  top: 3px;
  bottom: 3px;
  width: 2.5px;
  border-radius: 999px;
  background: linear-gradient(180deg, var(--dmo-brand-soft), var(--dmo-brand-deep));
}

.dmo-lib-count {
  min-width: 20px;
  padding: 0 6px;
  border-radius: 9px;
  background: var(--dmo-hover);
  color: var(--dmo-brand);
  font-size: 11px;
  line-height: 18px;
  text-align: center;
}

.dmo-lib-toggle,
.dmo-lib-clear {
  margin-left: auto;
  padding: 2px 8px;
  border: 1px solid var(--dmo-line);
  border-radius: 6px;
  background: transparent;
  color: var(--dmo-fg-dim);
  font-size: 11.5px;
  line-height: 18px;
  cursor: pointer;
}

.dmo-lib-toggle {
  margin-left: 0;
  padding: 2px 6px;
}

.dmo-lib-clear:hover:not(:disabled),
.dmo-lib-toggle:hover {
  background: var(--dmo-hover);
  color: var(--dmo-fg);
}

.dmo-lib-clear:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dmo-lib-help,
.dmo-lib-empty {
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--dmo-fg-faint);
}

.dmo-lib-empty {
  padding: 10px 2px;
}

.dmo-lib-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dmo-lib-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 7px;
}

.dmo-lib-row:hover {
  background: var(--dmo-hover);
}

.dmo-lib-chip {
  padding: 1px 6px;
  border: 1px solid var(--dmo-line);
  border-radius: 5px;
  font-size: 10.5px;
  line-height: 16px;
  color: var(--dmo-fg-dim);
  white-space: nowrap;
}

.dmo-lib-chip--bilibili { color: #e06a86; border-color: rgba(224, 106, 134, 0.5); }
.dmo-lib-chip--netease { color: #d4574e; border-color: rgba(212, 87, 78, 0.5); }
.dmo-lib-chip--qqmusic { color: #3aa66a; border-color: rgba(58, 166, 106, 0.5); }
.dmo-lib-chip--youtube { color: #d0453f; border-color: rgba(208, 69, 63, 0.5); }

.dmo-lib-main {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.dmo-lib-name {
  font-size: 12.5px;
  color: var(--dmo-fg);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dmo-lib-meta {
  font-size: 11px;
  color: var(--dmo-fg-faint);
}

.dmo-lib-actions {
  display: flex;
  gap: 4px;
}

.dmo-lib-btn {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--dmo-line);
  border-radius: 6px;
  background: transparent;
  color: var(--dmo-fg-dim);
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
}

.dmo-lib-btn:hover:not(:disabled) {
  background: var(--dmo-hover);
  color: var(--dmo-fg);
}

.dmo-lib-btn--play:hover:not(:disabled) {
  border-color: var(--dmo-edge-strong, var(--dmo-edge, var(--dmo-line)));
  color: var(--dmo-brand);
}

.dmo-lib-btn--del:hover:not(:disabled) {
  color: #d4574e;
}

.dmo-lib-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dmo-lib-status {
  font-size: 12px;
  color: var(--dmo-fg-dim);
}

/* 窄容器（设置弹窗收窄 / 小屏）下降为两列：平台标签独占一行左侧，
 * 标题与操作仍各自成列，避免长曲名把播放键挤出可视区。 */
@container (max-width: 460px) {
  .dmo-lib-row {
    grid-template-columns: auto minmax(0, 1fr);
    row-gap: 4px;
  }

  .dmo-lib-actions {
    grid-column: 2;
    justify-content: flex-end;
  }
}

@media (prefers-reduced-motion: reduce) {
  .dmo-lib-row,
  .dmo-lib-btn,
  .dmo-lib-toggle,
  .dmo-lib-clear {
    transition: none;
  }
}
`;
  function ensureStyle() {
    if (typeof document === "undefined") return null;
    try {
      const existing = document.querySelector(`style[data-plugin-css="${STYLE_TAG_ID}"]`);
      if (existing !== null) return existing;
      const tag = document.createElement("style");
      tag.dataset.plugin = PLUGIN_ID;
      tag.dataset.pluginCss = STYLE_TAG_ID;
      tag.textContent = CSS_TEXT;
      document.head.appendChild(tag);
      return tag;
    } catch (_error) {
      return null;
    }
  }
  function removeStyle() {
    if (typeof document === "undefined") return;
    try {
      const existing = document.querySelector(`style[data-plugin-css="${STYLE_TAG_ID}"]`);
      if (existing !== null && existing.parentNode !== null) existing.parentNode.removeChild(existing);
    } catch (_error) {
    }
  }

  // src/client/settings.js
  var NS = "dsh-music-on";
  var STORAGE_KEY = "dsh-music-on:settings";
  var SPECTRUM_STYLES = ["dots", "bars", "line", "wave", "off"];
  var SPECTRUM_FPS = [30, 60];
  var SPECTRUM_PLACEMENTS = ["bar", "panel"];
  var SPECTRUM_DEPTHS = ["front", "back"];
  var SPECTRUM_GLOWS = ["off", "soft", "strong"];
  var LOOP_MODES = ["all", "one", "off"];
  var CACHE_LIMIT_MIN_MB = 64;
  var CACHE_LIMIT_MAX_MB = 4096;
  var DOCK_SIZES = ["compact", "normal", "wide"];
  var AUTOPLAY_TARGETS = ["both", "link", "file", "off"];
  var PLATFORM_LIMIT_MIN = 5;
  var PLATFORM_LIMIT_MAX = 200;
  var DEFAULT_SETTINGS = Object.freeze({
    volume: 0.6,
    spectrumStyle: "dots",
    spectrumFps: 60,
    spectrumPlacement: "bar",
    spectrumDepth: "front",
    spectrumBars: 48,
    spectrumGlow: "soft",
    spectrumGain: 1,
    spectrumHeight: 64,
    loopMode: "all",
    cacheLimitMB: 512,
    proxyEnabled: true,
    allowAutoplay: true,
    autoplayTarget: "both",
    crossfadeSec: 0,
    fadeOnPause: true,
    startCollapsed: true,
    dockSize: "normal",
    /** 拖动后记住的位置（viewport 像素）。null = 默认右下角，跟随窗口尺寸。 */
    dockX: null,
    dockY: null,
    showTitles: true,
    rememberQueue: true,
    /** 粘贴歌单时最多入队多少首**能播的**曲目。 */
    platformTrackLimit: 60
  });
  var SETTINGS_SCHEMA = Object.freeze([
    {
      key: "volume",
      kind: "range",
      type: "number",
      default: DEFAULT_SETTINGS.volume,
      min: 0,
      max: 1,
      step: 0.01,
      label: "默认音量",
      help: "新会话首次播放时的音量，不影响当前正在播放的音量。"
    },
    {
      key: "spectrumStyle",
      kind: "select",
      type: "SpectrumStyle = 'dots' | 'bars' | 'line' | 'wave' | 'off'",
      default: DEFAULT_SETTINGS.spectrumStyle,
      options: [
        { value: "dots", label: "圆点（蓝白）" },
        { value: "bars", label: "粗柱" },
        { value: "line", label: "折线" },
        { value: "wave", label: "波形" },
        { value: "off", label: "关闭" }
      ],
      label: "频谱样式",
      help: "关闭后完全不创建 canvas 与动画循环，最省电。"
    },
    {
      key: "spectrumFps",
      kind: "select",
      type: "30 | 60",
      default: DEFAULT_SETTINGS.spectrumFps,
      options: [
        { value: 30, label: "30 fps" },
        { value: 60, label: "60 fps" }
      ],
      label: "频谱帧率",
      help: "系统开启「减少动态效果」时，实际帧率会进一步压到 10fps。"
    },
    {
      key: "spectrumPlacement",
      kind: "select",
      type: "SpectrumPlacement = 'bar' | 'panel'",
      default: DEFAULT_SETTINGS.spectrumPlacement,
      options: [
        { value: "bar", label: "贴底通栏" },
        { value: "panel", label: "嵌在卡片内" }
      ],
      label: "频谱位置",
      help: "贴底通栏铺满窗口下方，只在音乐库展开时出现；嵌入则跟着卡片走。"
    },
    {
      key: "spectrumDepth",
      kind: "select",
      type: "SpectrumDepth = 'front' | 'back'",
      default: DEFAULT_SETTINGS.spectrumDepth,
      options: [
        { value: "front", label: "浮在页面之上" },
        { value: "back", label: "藏进页面之下" }
      ],
      label: "频谱层级",
      help: "只对贴底通栏生效。浮起时清楚可见；藏起来时压到正文之下，只在侧栏与边距的空白处透出暗纹，不抢注意力。卡片头部的 ⤒ 可以临时把它提上来看一眼。"
    },
    {
      key: "spectrumBars",
      kind: "range",
      type: "number (16-96)",
      default: DEFAULT_SETTINGS.spectrumBars,
      min: 16,
      max: 96,
      step: 8,
      label: "频谱柱数",
      help: "柱子越多越细腻，代价是每帧绘制量线性增长。"
    },
    {
      key: "spectrumGain",
      kind: "range",
      type: "number (0.5-4)",
      default: DEFAULT_SETTINGS.spectrumGain,
      min: 0.5,
      max: 4,
      step: 0.1,
      label: "频谱灵敏度",
      help: "安静的音乐把灵敏度调高，柱体才不会被压成一条直线。"
    },
    {
      key: "spectrumGlow",
      kind: "select",
      type: "SpectrumGlow = 'off' | 'soft' | 'strong'",
      default: DEFAULT_SETTINGS.spectrumGlow,
      options: [
        { value: "off", label: "无光晕" },
        { value: "soft", label: "柔和" },
        { value: "strong", label: "强烈" }
      ],
      label: "频谱光晕",
      help: "光晕是纯视觉特效，关掉能让低端机帧率更稳。"
    },
    {
      key: "spectrumHeight",
      kind: "range",
      type: "number (32-160)",
      default: DEFAULT_SETTINGS.spectrumHeight,
      min: 32,
      max: 160,
      step: 8,
      label: "频谱高度 (px)",
      help: "贴底通栏与嵌入两种位置都按这个高度渲染。"
    },
    {
      key: "loopMode",
      kind: "select",
      type: "LoopMode = 'all' | 'one' | 'off'",
      default: DEFAULT_SETTINGS.loopMode,
      options: [
        { value: "all", label: "列表循环" },
        { value: "one", label: "单曲循环" },
        { value: "off", label: "播完停止" }
      ],
      label: "默认循环模式",
      help: "仅作为新会话的初始值，播放器上的按钮仍可临时切换。"
    },
    {
      key: "cacheLimitMB",
      kind: "range",
      type: "number (64-4096)",
      default: DEFAULT_SETTINGS.cacheLimitMB,
      min: CACHE_LIMIT_MIN_MB,
      max: CACHE_LIMIT_MAX_MB,
      step: 64,
      label: "缓存上限 (MB)",
      help: "音景文件本地缓存的总容量上限，超出后按最近最少使用淘汰。"
    },
    {
      key: "proxyEnabled",
      kind: "boolean",
      type: "boolean",
      default: DEFAULT_SETTINGS.proxyEnabled,
      label: "平台代理下载",
      help: "关掉后只使用随插件分发的 seed 音景，不发起任何额外网络请求。"
    },
    {
      key: "allowAutoplay",
      kind: "boolean",
      type: "boolean",
      default: DEFAULT_SETTINGS.allowAutoplay,
      label: "自动开始播放",
      help: "加入曲目后立刻开播。浏览器仍可能拦下无声自动播放，此时点一下播放键即可。"
    },
    {
      key: "autoplayTarget",
      kind: "select",
      type: "AutoplayTarget = 'both' | 'link' | 'file' | 'off'",
      default: DEFAULT_SETTINGS.autoplayTarget,
      options: [
        { value: "both", label: "链接和文件都自动播" },
        { value: "link", label: "只有粘贴链接自动播" },
        { value: "file", label: "只有拖入文件自动播" },
        { value: "off", label: "都不自动播" }
      ],
      label: "自动播放范围",
      help: "想「排队但不打断当前这首」时选「都不自动播」，加完自己按播放。"
    },
    {
      key: "crossfadeSec",
      kind: "range",
      type: "number (0-12)",
      default: DEFAULT_SETTINGS.crossfadeSec,
      min: 0,
      max: 12,
      step: 1,
      label: "切歌淡入淡出 (秒)",
      help: "0 表示硬切。非 0 时新曲淡入、旧曲淡出，适合整段铺背景音的场合。"
    },
    {
      key: "fadeOnPause",
      kind: "boolean",
      type: "boolean",
      default: DEFAULT_SETTINGS.fadeOnPause,
      label: "暂停时淡出",
      help: "关掉就是立刻静音，不会有一段渐弱。"
    },
    {
      key: "startCollapsed",
      kind: "boolean",
      type: "boolean",
      default: DEFAULT_SETTINGS.startCollapsed,
      label: "启动时收起为胶囊",
      help: "关掉则每次打开界面都直接展开成完整卡片。"
    },
    {
      key: "dockSize",
      kind: "select",
      type: "DockSize = 'compact' | 'normal' | 'wide'",
      default: DEFAULT_SETTINGS.dockSize,
      options: [
        { value: "compact", label: "小" },
        { value: "normal", label: "中" },
        { value: "wide", label: "大" }
      ],
      label: "胶囊大小",
      help: "三档同时缩放胶囊与展开卡片：小 248px、中 320px、大 420px。卡片打开时头部还有 ⤢ 键可以随时切档，不必进设置。"
    },
    {
      key: "showTitles",
      kind: "boolean",
      type: "boolean",
      default: DEFAULT_SETTINGS.showTitles,
      label: "显示曲名",
      help: "关掉后只留走带按钮，最省纵向空间。"
    },
    {
      key: "rememberQueue",
      kind: "boolean",
      type: "boolean",
      default: DEFAULT_SETTINGS.rememberQueue,
      label: "记住播放队列",
      help: "刷新页面后恢复上次的队列与进度；本地拖入的文件重启后需要重新拖。"
    },
    {
      key: "platformTrackLimit",
      kind: "range",
      type: "number",
      default: DEFAULT_SETTINGS.platformTrackLimit,
      min: PLATFORM_LIMIT_MIN,
      max: PLATFORM_LIMIT_MAX,
      step: 5,
      label: "歌单识别数量",
      help: "粘贴网易云 / QQ 音乐歌单时，最多入队多少首**能播的**曲目。会员曲目与拿不到直链的会被直接跳过，不会占用这个名额。数值越大，解析等待越久。"
    }
  ]);
  function toNumber(value, fallback, min, max) {
    const num = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(num)) return fallback;
    const clamped = Math.min(max, Math.max(min, num));
    return clamped;
  }
  function toBool(value, fallback) {
    if (value === true || value === false) return value;
    if (value === "true" || value === 1 || value === "1") return true;
    if (value === "false" || value === 0 || value === "0") return false;
    return fallback;
  }
  function roundTo(value, step) {
    if (!Number.isFinite(step) || step <= 0) return value;
    const digits = String(step).split(".")[1];
    const scale = Math.pow(10, digits ? digits.length : 0);
    return Math.round(value * scale) / scale;
  }
  function toPoint(x, y) {
    if (x === null || y === null || x === void 0 || y === void 0) return null;
    const nx = typeof x === "number" ? x : Number(x);
    const ny = typeof y === "number" ? y : Number(y);
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null;
    if (Math.abs(nx) > 2e4 || Math.abs(ny) > 2e4) return null;
    return { x: Math.round(nx), y: Math.round(ny) };
  }
  function normalizeSettings(input) {
    const raw = input && typeof input === "object" ? input : {};
    const volumeStep = 0.01;
    const volume = roundTo(toNumber(raw.volume, DEFAULT_SETTINGS.volume, 0, 1), volumeStep);
    const spectrumStyle = SPECTRUM_STYLES.includes(raw.spectrumStyle) ? raw.spectrumStyle : DEFAULT_SETTINGS.spectrumStyle;
    const fpsRaw = toNumber(raw.spectrumFps, DEFAULT_SETTINGS.spectrumFps, 1, 240);
    const spectrumFps = SPECTRUM_FPS.reduce(
      (best, item) => Math.abs(item - fpsRaw) < Math.abs(best - fpsRaw) ? item : best
    );
    const loopMode = LOOP_MODES.includes(raw.loopMode) ? raw.loopMode : DEFAULT_SETTINGS.loopMode;
    const spectrumPlacement = SPECTRUM_PLACEMENTS.includes(raw.spectrumPlacement) ? raw.spectrumPlacement : DEFAULT_SETTINGS.spectrumPlacement;
    const spectrumDepth = SPECTRUM_DEPTHS.includes(raw.spectrumDepth) ? raw.spectrumDepth : DEFAULT_SETTINGS.spectrumDepth;
    const cacheLimitMB = toNumber(
      raw.cacheLimitMB,
      DEFAULT_SETTINGS.cacheLimitMB,
      CACHE_LIMIT_MIN_MB,
      CACHE_LIMIT_MAX_MB
    );
    const spectrumBars = Math.round(toNumber(raw.spectrumBars, DEFAULT_SETTINGS.spectrumBars, 16, 96) / 8) * 8;
    const spectrumGain = roundTo(
      toNumber(raw.spectrumGain, DEFAULT_SETTINGS.spectrumGain, 0.5, 4),
      0.1
    );
    const spectrumHeight = Math.round(
      toNumber(raw.spectrumHeight, DEFAULT_SETTINGS.spectrumHeight, 32, 160) / 8
    ) * 8;
    const spectrumGlow = SPECTRUM_GLOWS.includes(raw.spectrumGlow) ? raw.spectrumGlow : DEFAULT_SETTINGS.spectrumGlow;
    const autoplayTarget = AUTOPLAY_TARGETS.includes(raw.autoplayTarget) ? raw.autoplayTarget : DEFAULT_SETTINGS.autoplayTarget;
    const dockSize = DOCK_SIZES.includes(raw.dockSize) ? raw.dockSize : DEFAULT_SETTINGS.dockSize;
    const crossfadeSec = Math.round(toNumber(raw.crossfadeSec, DEFAULT_SETTINGS.crossfadeSec, 0, 12));
    const dockPos = toPoint(raw.dockX, raw.dockY);
    const dockX = dockPos ? dockPos.x : DEFAULT_SETTINGS.dockX;
    const dockY = dockPos ? dockPos.y : DEFAULT_SETTINGS.dockY;
    const platformTrackLimit = Math.round(
      toNumber(raw.platformTrackLimit, DEFAULT_SETTINGS.platformTrackLimit, PLATFORM_LIMIT_MIN, PLATFORM_LIMIT_MAX) / 5
    ) * 5;
    return {
      volume,
      spectrumStyle,
      spectrumFps,
      spectrumPlacement,
      spectrumDepth,
      spectrumBars,
      spectrumGain,
      spectrumGlow,
      spectrumHeight,
      loopMode,
      cacheLimitMB: Math.round(cacheLimitMB),
      proxyEnabled: toBool(raw.proxyEnabled, DEFAULT_SETTINGS.proxyEnabled),
      allowAutoplay: toBool(raw.allowAutoplay, DEFAULT_SETTINGS.allowAutoplay),
      autoplayTarget,
      crossfadeSec,
      fadeOnPause: toBool(raw.fadeOnPause, DEFAULT_SETTINGS.fadeOnPause),
      startCollapsed: toBool(raw.startCollapsed, DEFAULT_SETTINGS.startCollapsed),
      dockSize,
      dockX,
      dockY,
      showTitles: toBool(raw.showTitles, DEFAULT_SETTINGS.showTitles),
      rememberQueue: toBool(raw.rememberQueue, DEFAULT_SETTINGS.rememberQueue),
      platformTrackLimit
    };
  }
  function defaultSettings() {
    return normalizeSettings(DEFAULT_SETTINGS);
  }
  function safeStorage() {
    try {
      if (typeof localStorage === "undefined" || localStorage === null) return null;
      return localStorage;
    } catch (_error) {
      return null;
    }
  }
  function readLocal() {
    const storage = safeStorage();
    if (storage === null) return null;
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (typeof raw !== "string" || raw === "") return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return normalizeSettings(parsed);
    } catch (_error) {
      return null;
    }
  }
  function writeLocal(settings) {
    const storage = safeStorage();
    if (storage === null) return false;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(normalizeSettings(settings)));
      return true;
    } catch (_error) {
      return false;
    }
  }
  var sharedBridgeCount = 0;
  function bindCrossTab(publish) {
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") {
      return () => {
      };
    }
    const handler = (event) => {
      if (event.key !== null && event.key !== STORAGE_KEY) return;
      publish(readLocal(), "local");
    };
    window.addEventListener("storage", handler);
    sharedBridgeCount += 1;
    return () => {
      if (typeof window.removeEventListener === "function") {
        window.removeEventListener("storage", handler);
      }
      sharedBridgeCount = Math.max(0, sharedBridgeCount - 1);
    };
  }
  function createSettingsStore(ctx) {
    let current = readLocal() || defaultSettings();
    let transport = "local";
    const listeners2 = /* @__PURE__ */ new Set();
    function publish(next, nextTransport) {
      current = normalizeSettings(next);
      if (nextTransport !== void 0) transport = nextTransport;
      for (const listener of [...listeners2]) {
        try {
          listener(current);
        } catch (_error) {
        }
      }
      return current;
    }
    const unbindCrossTab = bindCrossTab((next, nextTransport) => {
      if (next === null) return;
      if (JSON.stringify(next) === JSON.stringify(current)) return;
      publish(next, nextTransport);
    });
    function formOf() {
      try {
        const forms = ctx && ctx.configForms;
        if (!forms || typeof forms.get !== "function") return null;
        const form = forms.get(NS);
        if (!form || typeof form.getSnapshot !== "function") return null;
        return form;
      } catch (_error) {
        return null;
      }
    }
    function loadFromForms() {
      const form = formOf();
      if (form === null) return null;
      try {
        const snapshot = form.getSnapshot();
        if (!snapshot || snapshot.status !== "ready") return null;
        const value = snapshot.value;
        if (!value || typeof value !== "object") return null;
        return value.settings && typeof value.settings === "object" ? value.settings : value;
      } catch (_error) {
        return null;
      }
    }
    async function saveToForms(settings) {
      const form = formOf();
      if (form === null) return false;
      try {
        const snapshot = form.getSnapshot();
        if (!snapshot || snapshot.status !== "ready" || snapshot.writable === false) return false;
        let wrote = 0;
        for (const key of Object.keys(settings)) {
          try {
            await form.set(key, settings[key]);
            wrote += 1;
          } catch (_error) {
          }
        }
        return wrote > 0;
      } catch (_error) {
        return false;
      }
    }
    function commit(next) {
      const settings = normalizeSettings(next);
      const wroteLocal = writeLocal(settings);
      publish(settings, wroteLocal ? "local" : "memory");
      if (formOf() !== null) {
        void saveToForms(settings).then((ok) => {
          if (ok && transport === "local") transport = "config+local";
        });
      }
      return settings;
    }
    return {
      ns: NS,
      storageKey: STORAGE_KEY,
      get() {
        return current;
      },
      get transport() {
        return transport;
      },
      transportName() {
        return transport;
      },
      subscribe(listener) {
        if (typeof listener !== "function") return () => {
        };
        listeners2.add(listener);
        return () => {
          listeners2.delete(listener);
        };
      },
      /** 一次性整体替换（导入 / 重置用）。 */
      save(next) {
        return commit(next);
      },
      /** 只改一项：设置页每一行 onChange 都走这里。 */
      patch(key, value) {
        return commit({ ...current, [key]: value });
      },
      reset() {
        return commit(defaultSettings());
      },
      /** 从 configForms 拉一次；localStorage 已有值时不覆盖（本机优先）。 */
      async load() {
        const viaForms = loadFromForms();
        if (viaForms === null) return current;
        const localRaw = readLocal();
        if (localRaw !== null) {
          publish({ ...viaForms, ...localRaw }, transport);
          return current;
        }
        publish(viaForms, "config");
        return current;
      },
      dispose() {
        listeners2.clear();
        unbindCrossTab();
      }
    };
  }
  function useSettings(react, store) {
    const { useState: useState5, useEffect: useEffect6 } = react;
    const [snapshot, setSnapshot] = useState5(() => store && typeof store.get === "function" ? store.get() : null);
    useEffect6(() => {
      if (!store || typeof store.subscribe !== "function") return void 0;
      const off = store.subscribe((next) => setSnapshot(next));
      return () => {
        off();
      };
    }, [store]);
    return snapshot;
  }

  // src/client/sources.js
  var KIND_LOCAL_FILE = "local-file";
  var KIND_URL_AUDIO = "url-audio";
  var KIND_EXTERNAL_EMBED = "external-embed";
  var AUDIO_KINDS = Object.freeze([KIND_LOCAL_FILE, KIND_URL_AUDIO]);
  var ALL_KINDS = Object.freeze([KIND_LOCAL_FILE, KIND_URL_AUDIO, KIND_EXTERNAL_EMBED]);
  var uidCounter = 0;
  function nextTrackId(prefix) {
    uidCounter += 1;
    return `${prefix}-${uidCounter}`;
  }
  function safeSeconds(value) {
    const num = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(num) || num <= 0) return null;
    return num;
  }
  function safeLoopSeconds(value) {
    const num = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(num) || num < 0) return null;
    return num;
  }
  function titleFromFileName(name) {
    if (typeof name !== "string" || name === "") return "未命名音源";
    const dot = name.lastIndexOf(".");
    if (dot <= 0) return name;
    return name.slice(0, dot);
  }
  function parseFileTitle(fileName) {
    const base = titleFromFileName(fileName);
    const dash = base.indexOf(" - ");
    if (dash > 0 && dash < base.length - 3) {
      const artist = base.slice(0, dash).trim();
      const title = base.slice(dash + 3).trim();
      if (artist !== "" && title !== "") return { title, artist };
    }
    const numbered = /^\s*\d{1,3}\s*[.\-_)]\s+(.+)$/.exec(base);
    if (numbered !== null && numbered[1].trim() !== "") {
      return { title: numbered[1].trim(), artist: "" };
    }
    return { title: base, artist: "" };
  }
  var AUDIO_EXTENSIONS = Object.freeze([
    ".mp3",
    ".m4a",
    ".m4b",
    ".aac",
    ".wav",
    ".wave",
    ".flac",
    ".ogg",
    ".oga",
    ".opus",
    ".weba",
    ".webm",
    ".aiff",
    ".aif",
    ".caf",
    ".amr"
  ]);
  function isAudioFile(file) {
    if (file === null || typeof file !== "object") return false;
    const type = typeof file.type === "string" ? file.type.toLowerCase() : "";
    if (type.startsWith("audio/")) return true;
    if (type === "video/mp4" || type === "application/ogg") return true;
    const name = typeof file.name === "string" ? file.name.toLowerCase() : "";
    for (const ext of AUDIO_EXTENSIONS) {
      if (name.endsWith(ext)) return true;
    }
    return false;
  }
  function toEmbedUrl(input) {
    if (typeof input !== "string" || input.trim() === "") return null;
    const raw = input.trim();
    const bare = /^(BV[0-9A-Za-z]{8,12})$/.exec(raw);
    if (bare !== null) {
      return { url: buildPlayerUrl({ bvid: bare[1], page: 1 }), bvid: bare[1], page: 1 };
    }
    const candidate = /^https?:\/\//i.test(raw) ? raw : /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(raw) ? `https://${raw}` : raw;
    let parsed = null;
    try {
      parsed = new URL(candidate);
    } catch (_error) {
      return null;
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    const host = parsed.hostname.toLowerCase();
    const isBiliHost = host === "bilibili.com" || host.endsWith(".bilibili.com") === true || host === "b23.tv";
    if (isBiliHost === false) return null;
    const bvidFromQuery = parsed.searchParams.get("bvid");
    const bvidMatch = /\/video\/(BV[0-9A-Za-z]{8,12})/.exec(parsed.pathname);
    let bvid = bvidFromQuery !== null && bvidFromQuery !== "" ? bvidFromQuery : null;
    if (bvid === null && bvidMatch !== null) bvid = bvidMatch[1];
    const aid = parsed.searchParams.get("aid") ?? parsed.searchParams.get("avid");
    if (bvid === null && (aid === null || aid === "")) return null;
    const pageRaw = parsed.searchParams.get("p");
    const page = pageRaw !== null && /^\d+$/.test(pageRaw) === true ? Math.max(1, Number(pageRaw)) : 1;
    return {
      url: buildPlayerUrl({ bvid: bvid ?? "", aid: aid ?? "", page }),
      bvid: bvid ?? "",
      page
    };
  }
  function buildPlayerUrl(spec) {
    const params = new URLSearchParams();
    if (spec.bvid !== "") params.set("bvid", spec.bvid);
    else params.set("aid", spec.aid);
    params.set("page", String(spec.page));
    params.set("high_quality", "1");
    params.set("autoplay", "0");
    return `https://player.bilibili.com/player.html?${params.toString()}`;
  }
  function baseTrack(parts) {
    return {
      id: parts.id,
      title: parts.title,
      artist: parts.artist ?? "",
      kind: parts.kind,
      duration: parts.duration ?? null,
      seekable: parts.seekable ?? true,
      source: parts.source ?? null,
      file: parts.file ?? null,
      fileSize: parts.fileSize ?? null,
      url: parts.url ?? null,
      embedUrl: parts.embedUrl ?? null,
      /** 走我们自己 host 的流代理地址（同源，能进 AudioContext）。优先于 url。 */
      streamUrl: parts.streamUrl ?? null,
      /**
       * 曲目的原始页面地址（www.bilibili.com/video/xxx、music.163.com/#/song?id=xxx、
       * y.qq.com/n/ryqq/songDetail/xxx）。收藏与历史存的就是它 —— 内部地址有三种形态
       * （blob: / 相对路径 / player 壳），只有这个是长期有效、人可复制的。
       */
      pageUrl: parts.pageUrl ?? null,
      /** 曲目所属平台标识（bilibili / netease / qq / youtube），队列行据此显示 chip。 */
      platform: parts.platform ?? null,
      /**
       * 这条曲目是从哪个**歌单/专辑页面**解析来的（用户粘贴的那个链接）。
       *
       * 存在的唯一理由：平台曲目的 url 是票据路径 `/api/dsh-music-on/stream?mt=…`，
       * 票据 10 分钟就过期。刷新页面要恢复队列时，票据必然已死 —— 只有这个源地址
       * 能重新解析出带新票据的曲目。没有它，持久化的平台曲目全是点了就报错的死链。
       */
      sourceUrl: parts.sourceUrl ?? null,
      /** 封面图 URL。B 站由解析层提供；本地文件可后填 objectURL；空表示走黑胶兜底。 */
      cover: parts.cover ?? null,
      presetId: parts.presetId ?? null,
      unavailableReason: parts.unavailableReason ?? null,
      loopStart: parts.loopStart ?? null,
      loopEnd: parts.loopEnd ?? null,
      /** presets.play() 的 mode，引擎与 UI 据此分流；普通音源为 null。 */
      presetMode: parts.presetMode ?? null,
      /** 该音源的频谱是否可能可用（false = UI 直接画静止占位，不用等 engine 说）。 */
      spectrumPossible: parts.spectrumPossible ?? true
    };
  }
  function createLocalTrack(file, options) {
    if (isAudioFile(file) === false) return null;
    const named = parseFileTitle(typeof file.name === "string" ? file.name : "");
    let objectUrl = null;
    let revoked = false;
    const track = baseTrack({
      id: options && options.id || nextTrackId("local"),
      title: named.title,
      artist: named.artist,
      kind: KIND_LOCAL_FILE,
      duration: null,
      seekable: true,
      source: "blob",
      file,
      fileSize: typeof file.size === "number" ? file.size : null
    });
    track.load = function load() {
      if (revoked) return Promise.reject(new Error("轨道已释放"));
      if (objectUrl === null) {
        try {
          objectUrl = URL.createObjectURL(file);
        } catch (error) {
          return Promise.reject(error);
        }
      }
      return Promise.resolve({ src: objectUrl, kind: KIND_LOCAL_FILE });
    };
    track.revoke = function revoke() {
      if (revoked) return;
      revoked = true;
      if (objectUrl !== null) {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch (_error) {
        }
        objectUrl = null;
      }
    };
    track.hasObjectUrl = function hasObjectUrl() {
      return objectUrl !== null;
    };
    return track;
  }
  function createUrlTrack(spec) {
    const url = spec && typeof spec.url === "string" ? spec.url : "";
    let title = spec && typeof spec.title === "string" ? spec.title : "";
    if (title === "") {
      const tail = url.split("/").pop() || url;
      title = url === "" ? "网络音频" : titleFromFileName(tail.split("?")[0]) || "网络音频";
    }
    const track = baseTrack({
      id: spec && spec.id || nextTrackId("url"),
      title,
      artist: spec && typeof spec.artist === "string" ? spec.artist : "",
      kind: KIND_URL_AUDIO,
      duration: safeSeconds(spec && spec.duration),
      seekable: true,
      source: "url",
      url,
      pageUrl: spec && typeof spec.pageUrl === "string" && spec.pageUrl !== "" ? spec.pageUrl : null,
      platform: spec && typeof spec.platform === "string" && spec.platform !== "" ? spec.platform : null,
      presetId: spec && spec.presetId || null,
      loopStart: safeLoopSeconds(spec && spec.loopStart),
      loopEnd: safeLoopSeconds(spec && spec.loopEnd)
    });
    track.load = function load() {
      if (url === "") return Promise.reject(new Error("直链为空"));
      return Promise.resolve({ src: url, kind: KIND_URL_AUDIO });
    };
    track.revoke = function revoke() {
    };
    return track;
  }
  function createPlatformTrack(spec) {
    const input = spec || {};
    const streamPath = typeof input.streamPath === "string" && input.streamPath !== "" ? input.streamPath : null;
    const pageUrl = typeof input.pageUrl === "string" && input.pageUrl !== "" ? input.pageUrl : null;
    const platform = typeof input.platform === "string" && input.platform !== "" ? input.platform : null;
    const title = typeof input.title === "string" && input.title.trim() !== "" ? input.title.trim() : "平台曲目";
    const track = baseTrack({
      id: input.id || nextTrackId("platform"),
      title,
      artist: typeof input.artist === "string" ? input.artist : "",
      // kind 用 url-audio：有票据时它就是一条同源音频流，与直链无差别。
      kind: KIND_URL_AUDIO,
      duration: safeSeconds(input.duration),
      seekable: true,
      source: platform === "netease" ? "netease" : platform === "qq" ? "qq" : "platform",
      url: streamPath,
      streamUrl: streamPath,
      pageUrl,
      platform,
      // 歌单源地址：刷新后靠它重新解析出新票据（票据本身 10 分钟就过期）。
      sourceUrl: typeof input.sourceUrl === "string" && input.sourceUrl !== "" ? input.sourceUrl : null,
      // 没有票据就是不能播 —— 如实标注，别让 UI 以为点了会响。
      unavailableReason: streamPath === null ? typeof input.reason === "string" && input.reason !== "" ? input.reason : "该曲目需要会员，可点「打开原平台」收听" : null
    });
    track.load = function load() {
      if (streamPath === null) {
        return Promise.reject(new Error(track.unavailableReason || "该曲目没有可播放的直链"));
      }
      return Promise.resolve({ src: streamPath, kind: KIND_URL_AUDIO });
    };
    track.revoke = function revoke() {
    };
    track.cover = typeof input.cover === "string" && input.cover.trim() !== "" ? input.cover.trim() : null;
    return track;
  }
  function createPresetTrack(item, options) {
    const baseUrl = options && typeof options.baseUrl === "string" ? options.baseUrl : "presets/";
    const name = item && typeof item.name === "string" && item.name !== "" ? item.name : "音景";
    const reason = item && typeof item.unavailableReason === "string" ? item.unavailableReason : null;
    let src = null;
    if (item && typeof item.url === "string" && item.url !== "") src = item.url;
    else if (item && typeof item.file === "string" && item.file !== "") src = `${baseUrl}${item.file}`;
    const track = baseTrack({
      id: options && options.id || (item && typeof item.id === "string" ? `preset:${item.id}` : nextTrackId("preset")),
      title: name,
      artist: "预置音景",
      kind: KIND_URL_AUDIO,
      duration: safeSeconds(item && item.duration),
      seekable: true,
      source: "preset",
      url: src,
      presetId: item && typeof item.id === "string" ? item.id : null,
      unavailableReason: src === null ? reason || "该音景缺少音频文件" : null,
      loopStart: safeLoopSeconds(item && item.loopStart),
      loopEnd: safeLoopSeconds(item && item.loopEnd),
      presetMode: item && typeof item.mode === "string" ? item.mode : null
    });
    track.load = function load() {
      if (src === null) return Promise.reject(new Error(track.unavailableReason || "音景不可用"));
      return Promise.resolve({ src, kind: KIND_URL_AUDIO });
    };
    track.revoke = function revoke() {
    };
    return track;
  }
  function createEmbedTrack(spec) {
    const resolved = toEmbedUrl(spec && spec.url);
    const rawTitle = spec && typeof spec.title === "string" ? spec.title.trim() : "";
    const track = baseTrack({
      id: spec && spec.id || nextTrackId("embed"),
      title: rawTitle !== "" ? rawTitle : "外部播放器",
      artist: spec && typeof spec.artist === "string" ? spec.artist : "Bilibili",
      kind: KIND_EXTERNAL_EMBED,
      duration: null,
      seekable: false,
      source: "external",
      embedUrl: resolved !== null ? resolved.url : null,
      unavailableReason: resolved !== null ? null : "无法从该地址解析出可嵌入的播放器"
    });
    track.bvid = resolved !== null ? resolved.bvid : null;
    track.page = resolved !== null ? resolved.page : null;
    track.load = function load() {
      if (resolved === null) return Promise.reject(new Error(track.unavailableReason || "外部播放器不可用"));
      return Promise.resolve({ src: null, kind: KIND_EXTERNAL_EMBED, embedUrl: resolved.url });
    };
    track.revoke = function revoke() {
    };
    return track;
  }
  function createBilibiliTrack(spec) {
    const input = spec || {};
    const streamBase = typeof input.streamBase === "string" && input.streamBase !== "" ? input.streamBase : "/api/dsh-music-on/stream";
    const params = new URLSearchParams();
    if (typeof input.bvid === "string" && input.bvid !== "") params.set("bvid", input.bvid);
    else if (typeof input.aid === "string" && input.aid !== "") params.set("aid", input.aid);
    const cidText = typeof input.cid === "string" || typeof input.cid === "number" ? String(input.cid).trim() : "";
    if (cidText !== "") params.set("cid", cidText);
    if (typeof input.page === "number" && input.page > 1) params.set("page", String(input.page));
    const hasKey = params.has("bvid") || params.has("aid");
    const streamUrl = hasKey ? `${streamBase}?${params.toString()}` : null;
    let embedUrl = typeof input.embedUrl === "string" && input.embedUrl !== "" ? input.embedUrl : null;
    if (embedUrl === null && typeof input.bvid === "string" && input.bvid !== "") {
      embedUrl = buildPlayerUrl({ bvid: input.bvid, aid: "", page: input.page || 1 });
    }
    const title = typeof input.title === "string" && input.title.trim() !== "" ? input.title.trim() : input.bvid ? `Bilibili ${input.bvid}` : "Bilibili 音频";
    const track = baseTrack({
      id: input.id || nextTrackId("bili"),
      title,
      artist: typeof input.artist === "string" && input.artist !== "" ? input.artist : "Bilibili",
      // kind 保持 url-audio：主路径能进音频图。降级是运行时行为，不是入队时的属性。
      kind: KIND_URL_AUDIO,
      // 时长只用于显示；seekable 在主路径 metadata 到位后被真实时长覆盖。
      duration: safeSeconds(input.duration),
      seekable: true,
      source: "bilibili",
      streamUrl,
      embedUrl,
      unavailableReason: streamUrl === null && embedUrl === null ? "该条目既没有可代理的 bvid/cid，也没有可嵌入的地址" : null
    });
    track.bvid = typeof input.bvid === "string" ? input.bvid : null;
    track.cid = input.cid === void 0 ? null : input.cid;
    track.cover = typeof input.cover === "string" && input.cover.trim() !== "" ? input.cover.trim() : null;
    track.load = function load() {
      if (streamUrl === null && embedUrl === null) {
        return Promise.reject(new Error(track.unavailableReason || "该 B 站条目不可播放"));
      }
      if (streamUrl !== null) return Promise.resolve({ src: streamUrl, kind: KIND_URL_AUDIO });
      return Promise.resolve({ src: null, kind: KIND_EXTERNAL_EMBED, embedUrl });
    };
    track.revoke = function revoke() {
    };
    return track;
  }
  function resolvePresetRoute(played) {
    const input = played || {};
    const mode = typeof input.mode === "string" ? input.mode : "";
    const spectrum = input.spectrum === true;
    if (mode === "audio") {
      const hasSource = typeof input.url === "string" && input.url !== "" || typeof input.file === "string" && input.file !== "" || typeof input.bvid === "string" && input.bvid !== "";
      if (hasSource === false) {
        return { route: "external", spectrum: false, reason: "该音景声明为音频，但没有给出可播地址" };
      }
      return { route: "audio", spectrum, reason: null };
    }
    if (mode === "iframe") return { route: "iframe", spectrum: false, reason: null };
    if (mode === "external") return { route: "external", spectrum: false, reason: null };
    return { route: "external", spectrum: false, reason: `未知的音景模式：${mode || "空"}` };
  }
  function collectFiles(input) {
    if (input === null || input === void 0) return [];
    if (Array.isArray(input)) return input.filter((item) => item && typeof item.name === "string");
    if (typeof input.length === "number" && typeof input.item === "function") {
      const out = [];
      for (let index = 0; index < input.length; index += 1) {
        const file = input.item(index);
        if (file && typeof file.name === "string") out.push(file);
      }
      return out;
    }
    return [];
  }
  function tracksFromFiles(data, options) {
    const files = collectFiles(data && data.files ? data.files : data);
    const prefix = options && options.idPrefix || "local";
    const stamp = Date.now().toString(36);
    const tracks = [];
    let skipped = 0;
    for (let index = 0; index < files.length; index += 1) {
      const track = createLocalTrack(files[index], { id: `${prefix}-${stamp}-${index}` });
      if (track === null) {
        skipped += 1;
        continue;
      }
      tracks.push(track);
    }
    return { tracks, skipped, total: files.length };
  }
  function tracksFromManifest(items, options) {
    if (Array.isArray(items) === false) return [];
    const out = [];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      out.push(createPresetTrack(item, options));
    }
    return out;
  }
  function describeTrack(track) {
    if (!track) return null;
    return {
      id: track.id,
      title: track.title,
      artist: track.artist,
      kind: track.kind,
      duration: track.duration,
      seekable: track.seekable,
      embedUrl: track.embedUrl,
      streamUrl: track.streamUrl,
      cover: track.cover,
      presetId: track.presetId,
      presetMode: track.presetMode,
      spectrumPossible: track.spectrumPossible,
      loopStart: track.loopStart,
      loopEnd: track.loopEnd,
      unavailableReason: track.unavailableReason,
      fileSize: track.fileSize,
      // 收藏与历史要用的「原始页面地址」。UI 不该自己去猜 track.url 是相对路径还是
      // blob:，那是本模块的知识。回推规则见 trackPageUrl。
      pageUrl: trackPageUrl(track),
      // 平台曲目的源歌单地址（票据过期后靠它重新解析）。本地文件与预置音景没有。
      sourceUrl: track.sourceUrl ?? null,
      platform: track.platform ?? null
    };
  }
  function trackPageUrl(track) {
    if (!track) return null;
    if (typeof track.pageUrl === "string" && /^https?:\/\//i.test(track.pageUrl.trim())) {
      return track.pageUrl.trim();
    }
    const bvid = typeof track.bvid === "string" ? track.bvid : "";
    if (/^BV[0-9A-Za-z]{10}$/.test(bvid)) {
      const page = Number.isFinite(track.page) && track.page > 1 ? `?p=${track.page}` : "";
      return `https://www.bilibili.com/video/${bvid}/${page}`;
    }
    const candidates = [track.url, track.embedUrl];
    for (const raw of candidates) {
      if (typeof raw !== "string") continue;
      const value = raw.trim();
      if (/^https?:\/\//i.test(value)) return value;
    }
    return null;
  }

  // src/client/engine.js
  var LOOP_MODES2 = Object.freeze(["off", "all", "one"]);
  var ENGINE_MODES = Object.freeze(["internal", "external"]);
  var LOOP_ORDER = Object.freeze(["off", "all", "one"]);
  var TIME_UPDATE_INTERVAL_MS = 250;
  var DEFAULT_VOLUME = 0.6;
  function clamp01(value) {
    const num = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(num)) return DEFAULT_VOLUME;
    return Math.min(1, Math.max(0, num));
  }
  function emit(set, payload) {
    if (set.size === 0) return;
    for (const listener of [...set]) {
      try {
        listener(payload);
      } catch (error) {
        if (typeof console !== "undefined" && typeof console.error === "function") {
          console.error("[dsh-music-on] 事件订阅者抛错", error);
        }
      }
    }
  }
  function createEngine() {
    let context = null;
    let gain = null;
    let analyser = null;
    let audio = null;
    let sourceNode = null;
    let frequencyBin = null;
    let queue = [];
    let index = -1;
    let current = null;
    let status = "idle";
    let currentTime = 0;
    let duration = null;
    let volume = DEFAULT_VOLUME;
    let muted = false;
    let loopMode = "all";
    let mode = "internal";
    let spectrumAvailable = false;
    let lastError = null;
    let autoplayBlocked = false;
    let allowAutoplay = false;
    let disposed = false;
    const degradedTracks = /* @__PURE__ */ new Set();
    const trackListeners = /* @__PURE__ */ new Set();
    const stateListeners = /* @__PURE__ */ new Set();
    const timeListeners = /* @__PURE__ */ new Set();
    const queueListeners = /* @__PURE__ */ new Set();
    const errorListeners = /* @__PURE__ */ new Set();
    function snapshot() {
      const external = mode === "external";
      return {
        status,
        mode,
        spectrumAvailable: external ? false : spectrumAvailable,
        loopMode,
        volume,
        muted,
        currentIndex: index,
        queueLength: queue.length,
        currentTrack: current ? describeTrack(current) : null,
        // 外部模式下时长与可寻位一律为空：B 站那条虽然知道 10865s，
        // 但那个时间轴属于 iframe，拿来画进度条就是骗人。
        seekable: external ? false : current ? current.seekable !== false : false,
        duration: external ? null : duration,
        currentTime: external ? 0 : currentTime,
        allowAutoplay,
        autoplayBlocked,
        error: lastError,
        degraded: current !== null && degradedTracks.has(current.id) === true
      };
    }
    function publishState(reason) {
      const state = snapshot();
      state.reason = reason;
      emit(stateListeners, state);
    }
    function publishQueue() {
      emit(queueListeners, {
        items: queue.map((track, position) => ({ ...describeTrack(track), index: position, current: position === index })),
        currentIndex: index
      });
    }
    function publishTrack(reason) {
      if (current === null) {
        emit(trackListeners, null);
        return;
      }
      const described = describeTrack(current);
      described.reason = reason;
      described.index = index;
      emit(trackListeners, described);
    }
    function publishTime() {
      emit(timeListeners, { currentTime, duration, seekable: current ? current.seekable !== false : false });
    }
    function fail(error, phase) {
      const message = error && typeof error.message === "string" ? error.message : String(error);
      lastError = { phase, message, at: Date.now() };
      status = "error";
      if (typeof console !== "undefined" && typeof console.warn === "function") {
        console.warn(`[dsh-music-on] ${phase}: ${message}`);
      }
      emit(errorListeners, lastError);
      publishState("error");
    }
    function ensureGraph() {
      if (context !== null) return context;
      const Ctor = typeof window !== "undefined" ? window.AudioContext || window.webkitAudioContext : null;
      if (typeof Ctor !== "function") {
        throw new Error("当前环境没有 Web Audio API");
      }
      context = new Ctor();
      gain = context.createGain();
      analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;
      frequencyBin = new Uint8Array(analyser.frequencyBinCount);
      audio = document.createElement("audio");
      audio.preload = "auto";
      audio.style.display = "none";
      audio.setAttribute("playsinline", "");
      audio.removeAttribute("crossorigin");
      if (typeof document !== "undefined" && document.body) document.body.appendChild(audio);
      sourceNode = context.createMediaElementSource(audio);
      sourceNode.connect(gain);
      gain.connect(analyser);
      analyser.connect(context.destination);
      gain.gain.value = muted ? 0 : volume;
      bindAudioEvents();
      return context;
    }
    function bindAudioEvents() {
      if (audio === null) return;
      audio.onloadedmetadata = () => {
        duration = Number.isFinite(audio.duration) ? audio.duration : null;
        if (duration !== null && current !== null) current.duration = duration;
        publishTime();
        publishState("metadata");
      };
      audio.oncanplay = () => {
        if (status === "loading") {
          status = "paused";
          publishState("canplay");
        }
      };
      audio.onplaying = () => {
        status = "playing";
        autoplayBlocked = false;
        publishState("playing");
      };
      audio.onpause = () => {
        if (status === "ended") return;
        if (status === "error") return;
        status = "paused";
        publishState("paused");
      };
      audio.ontimeupdate = () => {
        currentTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
        enforceLoopPoint();
        const now = Date.now();
        if (now - lastTimeEmit >= TIME_UPDATE_INTERVAL_MS) {
          lastTimeEmit = now;
          publishTime();
        }
      };
      audio.onended = () => {
        currentTime = 0;
        status = "ended";
        publishState("ended");
        if (hasLoopPoint() && loopMode === "one") {
          restartLoopPoint();
          return;
        }
        if (loopMode === "one") {
          seek(0);
          void play();
          return;
        }
        if (loopMode === "off" && index >= queue.length - 1) {
          publishState("queue-end");
          return;
        }
        void next(true);
      };
      audio.onerror = () => {
        const code = audio && audio.error ? audio.error.code : 0;
        const text = code === 1 ? "播放被中止" : code === 2 ? "网络错误" : code === 3 ? "解码失败" : code === 4 ? "格式不支持" : "未知错误";
        if (tryDegradeToEmbed(text) === true) return;
        lastError = { phase: "media", message: text, at: Date.now() };
        status = "error";
        emit(errorListeners, lastError);
        publishState("media-error");
      };
      audio.onstalled = () => {
        if (tryDegradeToEmbed("流中断") === true) return;
        if (status === "playing") publishState("stalled");
      };
    }
    let lastTimeEmit = 0;
    function hasLoopPoint() {
      if (current === null) return false;
      const start = typeof current.loopStart === "number" ? current.loopStart : 0;
      const end = typeof current.loopEnd === "number" ? current.loopEnd : null;
      if (end === null || Number.isFinite(end) === false || end <= 0) return false;
      return end > start;
    }
    function restartLoopPoint() {
      if (audio === null) return;
      const start = typeof current.loopStart === "number" ? current.loopStart : 0;
      try {
        audio.currentTime = start;
      } catch (_error) {
      }
      currentTime = start;
      void play();
    }
    function enforceLoopPoint() {
      if (audio === null || hasLoopPoint() === false) return;
      if (status !== "playing") return;
      const start = typeof current.loopStart === "number" ? current.loopStart : 0;
      const end = typeof current.loopEnd === "number" ? current.loopEnd : null;
      if (end === null) return;
      const EPSILON = 0.15;
      if (audio.currentTime >= end - EPSILON) {
        try {
          audio.currentTime = start;
        } catch (_error) {
        }
        currentTime = start;
        return;
      }
      if (start > 0 && audio.currentTime > 0 && audio.currentTime < start - EPSILON) {
        try {
          audio.currentTime = start;
        } catch (_error) {
        }
        currentTime = start;
      }
    }
    function tryDegradeToEmbed(reason) {
      if (current === null) return false;
      if (typeof current.embedUrl !== "string" || current.embedUrl === "") return false;
      if (current.kind === KIND_EXTERNAL_EMBED) return false;
      if (degradedTracks.has(current.id) === true) return false;
      degradedTracks.add(current.id);
      if (typeof current.revoke === "function") {
        try {
          current.revoke();
        } catch (_error) {
        }
      }
      detachAudio();
      clearSpectrum();
      try {
        if (gain !== null) gain.gain.value = 0;
      } catch (_error) {
      }
      mode = "external";
      spectrumAvailable = false;
      currentTime = 0;
      duration = null;
      lastError = { phase: "degrade", message: `流代理失败（${reason}），已切到内嵌播放器`, at: Date.now() };
      emit(errorListeners, lastError);
      publishTrack("degrade");
      publishTime();
      publishState("mode-external");
      return true;
    }
    function detachAudio() {
      if (audio === null) return;
      try {
        audio.pause();
      } catch (_error) {
      }
      audio.removeAttribute("src");
      audio.load();
    }
    function clearSpectrum() {
      if (analyser === null) return;
      const bins = analyser.frequencyBinCount;
      if (frequencyBin === null || frequencyBin.length !== bins) frequencyBin = new Uint8Array(bins);
      for (let i = 0; i < bins; i += 1) frequencyBin[i] = 0;
    }
    function enterExternalMode(track) {
      detachAudio();
      clearSpectrum();
      mode = "external";
      spectrumAvailable = false;
      status = "playing";
      currentTime = 0;
      duration = null;
      lastError = null;
      void track;
      publishTime();
      publishState("mode-external");
    }
    function enterInternalMode(track, src) {
      mode = "internal";
      spectrumAvailable = true;
      lastError = null;
      try {
        ensureGraph();
      } catch (error) {
        fail(error, "graph");
        return false;
      }
      if (gain !== null) gain.gain.value = muted ? 0 : volume;
      status = "loading";
      currentTime = 0;
      duration = track && track.duration !== null ? track.duration : null;
      if (audio !== null && typeof src === "string" && src !== "") {
        audio.src = src;
        audio.loop = typeof track.loopStart !== "number" || track.loopStart === 0 ? hasLoopPoint() : false;
        audio.load();
      }
      publishTime();
      publishState("mode-internal");
      return true;
    }
    function resolvePlayback(track) {
      if (track === null || track === void 0) return { src: null, external: false };
      if (track.kind === KIND_EXTERNAL_EMBED) {
        return { src: null, external: true };
      }
      const stream = typeof track.streamUrl === "string" && track.streamUrl !== "" ? track.streamUrl : null;
      if (stream !== null) return { src: stream, external: false };
      return { src: null, external: false };
    }
    async function loadAt(position, options) {
      const opts = options || {};
      if (disposed) return false;
      if (position < 0 || position >= queue.length) {
        lastError = { phase: "load", message: "队列位置越界", at: Date.now() };
        fail(lastError, "load");
        return false;
      }
      if (current !== null && current !== queue[position] && typeof current.revoke === "function") {
        try {
          current.revoke();
        } catch (_error) {
        }
      }
      index = position;
      current = queue[position];
      status = "loading";
      lastError = null;
      currentTime = 0;
      duration = current.duration !== null ? current.duration : null;
      if (opts.publishTrack !== false) publishTrack("load");
      publishQueue();
      if (current.kind === KIND_EXTERNAL_EMBED) {
        enterExternalMode(current);
        if (current.embedUrl === null) {
          fail(new Error(current.unavailableReason || "外部播放器地址无效"), "embed");
          return false;
        }
        return true;
      }
      const plan = resolvePlayback(current);
      let loaded = null;
      try {
        loaded = await current.load();
      } catch (error) {
        if (tryDegradeToEmbed("加载失败") === true) {
          if (opts.autoplay !== false) return await play();
          return true;
        }
        fail(error, "load");
        return false;
      }
      if (disposed) return false;
      const src = plan.src !== null ? plan.src : loaded ? loaded.src : null;
      if (src === null && typeof current.embedUrl === "string" && current.embedUrl !== "") {
        enterExternalMode(current);
        return true;
      }
      const ok = enterInternalMode(current, src);
      if (ok === false) return false;
      if (opts.autoplay !== false) return await play();
      status = "paused";
      publishState("loaded");
      return true;
    }
    async function play() {
      if (disposed) return false;
      if (current === null) {
        if (queue.length === 0) return false;
        return await loadAt(index >= 0 ? index : 0);
      }
      if (current.kind === KIND_EXTERNAL_EMBED) {
        mode = "external";
        spectrumAvailable = false;
        status = "playing";
        autoplayBlocked = false;
        publishState("play-external");
        return true;
      }
      if (mode === "external") {
        status = "playing";
        autoplayBlocked = false;
        publishState("play-external");
        return true;
      }
      try {
        ensureGraph();
      } catch (error) {
        fail(error, "graph");
        return false;
      }
      try {
        if (context !== null && context.state === "suspended") {
          await context.resume();
        }
      } catch (_error) {
      }
      if (audio === null) return false;
      try {
        await audio.play();
        status = "playing";
        autoplayBlocked = false;
        publishState("play");
        return true;
      } catch (error) {
        const name = error && typeof error.name === "string" ? error.name : "";
        if (name === "NotAllowedError") {
          autoplayBlocked = true;
          status = "paused";
          lastError = { phase: "autoplay", message: "浏览器拦下了自动播放，点一下播放按钮即可", at: Date.now() };
          emit(errorListeners, lastError);
          publishState("autoplay-blocked");
          return false;
        }
        fail(error, "play");
        return false;
      }
    }
    function pause() {
      if (disposed) return;
      if (mode === "external") {
        status = "paused";
        publishState("pause-external");
        return;
      }
      if (audio !== null) {
        try {
          audio.pause();
        } catch (_error) {
        }
      }
      status = "paused";
      publishState("pause");
    }
    function toggle() {
      if (status === "playing") {
        pause();
        return Promise.resolve(false);
      }
      return play();
    }
    function seek(seconds, options) {
      if (disposed) return false;
      if (current !== null && current.seekable === false) return false;
      if (audio === null || duration === null) return false;
      const target = (options && options.relative ? currentTime : 0) + Number(seconds);
      if (Number.isFinite(target) === false) return false;
      const clamped = Math.min(duration, Math.max(0, target));
      try {
        audio.currentTime = clamped;
      } catch (_error) {
        return false;
      }
      currentTime = clamped;
      publishTime();
      return true;
    }
    async function next(auto) {
      if (disposed) return false;
      if (queue.length === 0) return false;
      if (index < 0) return await loadAt(0);
      if (loopMode === "one" && auto === true) {
        seek(0);
        return await play();
      }
      if (loopMode === "all" && queue.length > 1 && randomEnabled === true) {
        let pick = index;
        while (pick === index) pick = Math.floor(Math.random() * queue.length);
        return await loadAt(pick);
      }
      const atEnd = index >= queue.length - 1;
      if (atEnd) {
        if (loopMode === "off") {
          status = "ended";
          publishState("queue-end");
          return false;
        }
        return await loadAt(0);
      }
      return await loadAt(index + 1);
    }
    async function prev() {
      if (disposed) return false;
      if (queue.length === 0) return false;
      if (index <= 0) {
        if (loopMode === "off") {
          seek(0);
          return true;
        }
        return await loadAt(queue.length - 1);
      }
      return await loadAt(index - 1);
    }
    let randomEnabled = false;
    async function add(tracks, options) {
      if (disposed) return -1;
      const list = Array.isArray(tracks) ? tracks.filter((track) => track && typeof track === "object") : [];
      if (list.length === 0) return -1;
      const opts = options || {};
      const startPosition = queue.length;
      for (const track of list) queue.push(track);
      publishQueue();
      const shouldStart = opts.playFirst === true && current === null;
      if (shouldStart) return await loadAt(startPosition, { autoplay: true }) ? startPosition : -1;
      if (current === null) return startPosition;
      return -1;
    }
    function addFiles(fileList, options) {
      const result = tracksFromFiles(fileList, options);
      const opts = options || {};
      void result.tracks;
      return add(result.tracks, { playFirst: opts.playFirst === true }).then((position) => ({
        position,
        added: result.tracks.length,
        skipped: result.skipped,
        total: result.total
      }));
    }
    function addUrl(url, options) {
      const track = createUrlTrack({ url, title: options && options.title, artist: options && options.artist });
      return add([track], options);
    }
    function addEmbed(url, options) {
      const track = createEmbedTrack({ url, title: options && options.title, artist: options && options.artist });
      return add([track], options);
    }
    function addManifest(items, options) {
      const tracks = tracksFromManifest(items, options);
      return add(tracks, options);
    }
    function addBilibili(spec, options) {
      const track = createBilibiliTrack(spec || {});
      return add([track], options);
    }
    function addPlatform(spec, options) {
      const track = createPlatformTrack(spec || {});
      return add([track], options);
    }
    async function addPresetPlay(played, item, options) {
      const resolved = resolvePresetRoute(played);
      const meta = item || {};
      if (resolved.route === "external") {
        return { position: null, route: "external", reason: resolved.reason };
      }
      if (resolved.route === "iframe") {
        const url = typeof meta.embedUrl === "string" ? meta.embedUrl : "";
        const track2 = createEmbedTrack({
          url,
          title: meta.name,
          artist: "预置音景",
          id: typeof meta.id === "string" ? `preset:${meta.id}:embed` : void 0
        });
        track2.loopStart = null;
        track2.loopEnd = null;
        const position2 = await add([track2], options);
        return { position: position2, route: "iframe", reason: resolved.reason };
      }
      if (typeof played.bvid === "string" && played.bvid !== "") {
        const track2 = createBilibiliTrack({
          bvid: played.bvid,
          cid: played.cid,
          page: meta.page,
          title: meta.name,
          artist: "预置音景",
          duration: meta.duration,
          embedUrl: meta.embedUrl
        });
        track2.loopStart = typeof played.loopStart === "number" ? played.loopStart : track2.loopStart;
        track2.loopEnd = typeof played.loopEnd === "number" ? played.loopEnd : track2.loopEnd;
        const position2 = await add([track2], options);
        return { position: position2, route: "audio", reason: resolved.reason };
      }
      const track = createPresetTrack(
        {
          ...meta,
          url: typeof played.url === "string" ? played.url : meta.url,
          file: typeof played.file === "string" ? played.file : meta.file
        },
        options
      );
      const position = await add([track], options);
      return { position, route: "audio", reason: resolved.reason };
    }
    function remove(position) {
      if (disposed) return -1;
      if (position < 0 || position >= queue.length) return -1;
      const removed = queue[position];
      const wasCurrent = position === index;
      if (removed !== queue.find((track) => track === removed)) {
      }
      queue.splice(position, 1);
      if (wasCurrent) {
        if (typeof removed.revoke === "function") removed.revoke();
        detachAudio();
        clearSpectrum();
        current = null;
        index = -1;
        currentTime = 0;
        duration = null;
        status = "idle";
        if (queue.length > 0) {
          const landing = Math.min(position, queue.length - 1);
          publishQueue();
          publishTrack("removed");
          publishState("removed-current");
          void loadAt(landing, { autoplay: false });
          return landing;
        }
        publishQueue();
        publishTrack("removed");
        publishState("queue-empty");
        return -1;
      }
      if (position < index) index -= 1;
      publishQueue();
      publishState("removed");
      return position;
    }
    function clear() {
      if (disposed) return;
      detachAudio();
      clearSpectrum();
      for (const track of queue) {
        if (track && typeof track.revoke === "function") {
          try {
            track.revoke();
          } catch (_error) {
          }
        }
      }
      queue = [];
      index = -1;
      current = null;
      currentTime = 0;
      duration = null;
      status = "idle";
      lastError = null;
      mode = "internal";
      spectrumAvailable = false;
      publishQueue();
      publishTrack("cleared");
      publishTime();
      publishState("cleared");
    }
    function setVolume(value) {
      volume = clamp01(value);
      if (gain !== null && context !== null) {
        try {
          gain.gain.setTargetAtTime(muted ? 0 : volume, context.currentTime, 0.01);
        } catch (_error) {
          gain.gain.value = muted ? 0 : volume;
        }
      }
      publishState("volume");
      return volume;
    }
    function setMuted(next2) {
      muted = next2 === true;
      if (gain !== null && context !== null) {
        try {
          gain.gain.setTargetAtTime(muted ? 0 : volume, context.currentTime, 0.01);
        } catch (_error) {
          gain.gain.value = muted ? 0 : volume;
        }
      }
      publishState("muted");
      return muted;
    }
    function setLoopMode(next2) {
      loopMode = LOOP_ORDER.includes(next2) ? next2 : "all";
      publishState("loop");
      return loopMode;
    }
    function cycleLoopMode() {
      const at = LOOP_ORDER.indexOf(loopMode);
      return setLoopMode(LOOP_ORDER[(at + 1) % LOOP_ORDER.length]);
    }
    function setRandom(next2) {
      randomEnabled = next2 === true;
      publishState("random");
      return randomEnabled;
    }
    function setAllowAutoplay(next2) {
      allowAutoplay = next2 === true;
      publishState("autoplay-setting");
      return allowAutoplay;
    }
    function onTrackChange(listener) {
      if (typeof listener !== "function") return () => {
      };
      trackListeners.add(listener);
      if (current !== null) {
        try {
          listener({ ...describeTrack(current), reason: "subscribe", index });
        } catch (_error) {
        }
      }
      return () => {
        trackListeners.delete(listener);
      };
    }
    function onStateChange(listener) {
      if (typeof listener !== "function") return () => {
      };
      stateListeners.add(listener);
      try {
        listener({ ...snapshot(), reason: "subscribe" });
      } catch (_error) {
      }
      return () => {
        stateListeners.delete(listener);
      };
    }
    function onTimeUpdate(listener) {
      if (typeof listener !== "function") return () => {
      };
      timeListeners.add(listener);
      return () => {
        timeListeners.delete(listener);
      };
    }
    function onQueueChange(listener) {
      if (typeof listener !== "function") return () => {
      };
      queueListeners.add(listener);
      try {
        listener({
          items: queue.map((track, position) => ({ ...describeTrack(track), index: position, current: position === index })),
          currentIndex: index
        });
      } catch (_error) {
      }
      return () => {
        queueListeners.delete(listener);
      };
    }
    function onError(listener) {
      if (typeof listener !== "function") return () => {
      };
      errorListeners.add(listener);
      return () => {
        errorListeners.delete(listener);
      };
    }
    function unsubscribeAll() {
      trackListeners.clear();
      stateListeners.clear();
      timeListeners.clear();
      queueListeners.clear();
      errorListeners.clear();
    }
    function getAnalyser() {
      if (mode === "external") return null;
      return analyser;
    }
    function readSpectrum(target) {
      if (analyser === null || target === null || typeof target === "undefined") return false;
      if (mode === "external") {
        target.fill(0);
        return false;
      }
      try {
        analyser.getByteFrequencyData(target);
        return true;
      } catch (_error) {
        return false;
      }
    }
    function degradeCurrent() {
      return tryDegradeToEmbed("手动切换");
    }
    async function dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribeAll();
      for (const track of queue) {
        if (track && typeof track.revoke === "function") {
          try {
            track.revoke();
          } catch (_error) {
          }
        }
      }
      if (current !== null && typeof current.revoke === "function") {
        try {
          current.revoke();
        } catch (_error) {
        }
      }
      queue = [];
      current = null;
      index = -1;
      if (audio !== null) {
        try {
          audio.pause();
          audio.removeAttribute("src");
          audio.load();
        } catch (_error) {
        }
        try {
          if (audio.parentNode) audio.parentNode.removeChild(audio);
        } catch (_error) {
        }
        audio.onloadedmetadata = null;
        audio.oncanplay = null;
        audio.onplaying = null;
        audio.onpause = null;
        audio.ontimeupdate = null;
        audio.onended = null;
        audio.onerror = null;
        audio.onstalled = null;
        audio = null;
      }
      try {
        if (sourceNode !== null) sourceNode.disconnect();
      } catch (_error) {
      }
      try {
        if (gain !== null) gain.disconnect();
      } catch (_error) {
      }
      try {
        if (analyser !== null) analyser.disconnect();
      } catch (_error) {
      }
      sourceNode = null;
      gain = null;
      analyser = null;
      frequencyBin = null;
      const closing = context;
      context = null;
      if (closing !== null) {
        try {
          await closing.close();
        } catch (_error) {
        }
      }
      status = "idle";
      mode = "internal";
      spectrumAvailable = false;
    }
    function getState() {
      return snapshot();
    }
    function getQueue() {
      return queue.map((track, position) => ({ ...describeTrack(track), index: position, current: position === index }));
    }
    function getCurrent() {
      return current === null ? null : describeTrack(current);
    }
    function hasGraph() {
      return context !== null;
    }
    return {
      get analyser() {
        return getAnalyser();
      },
      /** visuals 判断「该不该画」的第二个出口，与 state.spectrumAvailable 同源。 */
      get spectrumAvailable() {
        return mode !== "external" && spectrumAvailable;
      },
      get mode() {
        return mode;
      },
      // 播放控制
      play,
      pause,
      toggle,
      seek,
      next,
      prev,
      // 队列
      add,
      addFiles,
      addUrl,
      addEmbed,
      addBilibili,
      addPlatform,
      addPresetPlay,
      addManifest,
      remove,
      clear,
      loadAt,
      // 设置
      setVolume,
      setMuted,
      setLoopMode,
      cycleLoopMode,
      setRandom,
      setAllowAutoplay,
      // 订阅
      onTrackChange,
      onStateChange,
      onTimeUpdate,
      onQueueChange,
      onError,
      unsubscribeAll,
      // 频谱出口
      getAnalyser,
      readSpectrum,
      degradeCurrent,
      // 只读
      getState,
      getQueue,
      getCurrent,
      hasGraph,
      // 生命周期
      dispose,
      // 常量
      LOOP_MODES: LOOP_MODES2
    };
  }
  var singleton = null;
  function getEngine() {
    if (typeof window !== "undefined") {
      const key = "__dsh_music_on_engine__";
      const existing = window[key];
      if (existing && typeof existing.play === "function") return existing;
      const created = createEngine();
      window[key] = created;
      return created;
    }
    if (singleton === null) singleton = createEngine();
    return singleton;
  }

  // src/client/presets.js
  var MANIFEST_PATH = "presets/manifest.json";
  var DEFAULTS = Object.freeze({
    storageDir: "dsh-music-on/presets-cache",
    cacheLimitMb: 64,
    hostCache: "showDirectoryPicker",
    fetchTimeoutMs: 3e4,
    verifyOnPlay: false
  });
  var SOURCE = Object.freeze({
    EMBEDDED: "embedded",
    BILIBILI: "bilibili-embed",
    PLATFORM: "platform-link"
  });
  var STATUS = Object.freeze({
    READY: "ready",
    NEEDS_CONFIG: "needs-config",
    UNAVAILABLE: "unavailable"
  });
  var SOURCE_CAPABILITY = Object.freeze({
    [SOURCE.EMBEDDED]: { plays: true, spectrum: true, offline: true, label: "本地合成" },
    [SOURCE.BILIBILI]: { plays: true, spectrum: false, offline: false, label: "B站嵌入" },
    [SOURCE.PLATFORM]: { plays: false, spectrum: false, offline: false, label: "外部跳转" }
  });
  var CATEGORIES = Object.freeze([
    { id: "white-noise", name: "白噪音" },
    { id: "rain", name: "雨声" },
    { id: "cafe", name: "咖啡馆" },
    { id: "beat", name: "鼓点" },
    { id: "jazz", name: "爵士" },
    { id: "lofi", name: "Lo-Fi" }
  ]);
  async function readSettings(settings) {
    let raw = {};
    try {
      const resolved = typeof settings === "function" ? await settings() : await settings;
      if (resolved && typeof resolved === "object") raw = resolved;
    } catch {
      raw = {};
    }
    const pick = (...keys) => {
      for (const key of keys) {
        const value = raw?.[key];
        if (value !== void 0 && value !== null && value !== "") return value;
      }
      return void 0;
    };
    const limitRaw = pick("cacheLimitMb", "cacheLimit", "maxCacheMb");
    const limit = Number(limitRaw);
    const timeoutRaw = Number(pick("fetchTimeoutMs", "downloadTimeoutMs"));
    return {
      storageDir: String(pick("storageDir", "cacheDir", "presetsDir") ?? DEFAULTS.storageDir),
      cacheLimitMb: Number.isFinite(limit) && limit > 0 ? limit : DEFAULTS.cacheLimitMb,
      hostCache: String(pick("hostCache", "cacheMode") ?? DEFAULTS.hostCache),
      fetchTimeoutMs: Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : DEFAULTS.fetchTimeoutMs,
      verifyOnPlay: Boolean(pick("verifyOnPlay") ?? DEFAULTS.verifyOnPlay)
    };
  }
  function createMemoryCache() {
    const map = /* @__PURE__ */ new Map();
    return {
      kind: "memory",
      async get(key) {
        return map.get(key) ?? null;
      },
      async set(key, blob) {
        map.set(key, blob);
      },
      async delete(key) {
        map.delete(key);
      },
      async list() {
        return [...map.entries()].map(([key, blob]) => ({ key, sizeBytes: blob?.size ?? 0 }));
      },
      async clear() {
        map.clear();
      }
    };
  }
  function createIdbCache(dbName = "dsh-music-on-presets", storeName = "files") {
    if (typeof indexedDB === "undefined") return null;
    let dbPromise = null;
    const open = () => {
      if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
          const req = indexedDB.open(dbName, 1);
          req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      }
      return dbPromise;
    };
    const tx = async (mode, fn) => {
      const db = await open();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        let result;
        try {
          result = fn(store);
        } catch (error) {
          reject(error);
          return;
        }
        transaction.oncomplete = () => resolve(result?.__req ? result.__req.result : result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    };
    return {
      kind: "indexeddb",
      async get(key) {
        const blob = await tx("readonly", (store) => ({ __req: store.get(key) }));
        return blob ?? null;
      },
      async set(key, blob) {
        await tx("readwrite", (store) => {
          store.put(blob, key);
          return null;
        });
      },
      async delete(key) {
        await tx("readwrite", (store) => {
          store.delete(key);
          return null;
        });
      },
      async list() {
        const entries = await tx("readonly", (store) => ({ __req: store.getAllKeys() }));
        const keys = entries ?? [];
        const out = [];
        for (const key of keys) {
          const blob = await this.get(key);
          out.push({ key, sizeBytes: blob?.size ?? 0 });
        }
        return out;
      },
      async clear() {
        await tx("readwrite", (store) => {
          store.clear();
          return null;
        });
      }
    };
  }
  function createCache(opts = {}) {
    const store = opts.cacheStore ?? createIdbCache(`dsh-music-on-presets:${opts.storageDir ?? "default"}`) ?? createMemoryCache();
    return {
      kind: store.kind ?? "host",
      storageDir: opts.storageDir ?? DEFAULTS.storageDir,
      get: (key) => store.get(key),
      set: (key, blob) => store.set(key, blob),
      delete: (key) => store.delete(key),
      list: () => store.list(),
      clear: () => store.clear()
    };
  }
  var isBvId = (value) => typeof value === "string" && /^BV[0-9A-Za-z]{10}$/.test(value.trim());
  function parseManifest(manifest) {
    if (!manifest || typeof manifest !== "object" || !Array.isArray(manifest.items)) {
      throw new Error("preset manifest 结构不合法：缺少 items 数组");
    }
    const issues = [];
    const seen = /* @__PURE__ */ new Set();
    const items = [];
    for (const raw of manifest.items) {
      if (!raw || typeof raw !== "object") {
        issues.push("忽略非对象条目");
        continue;
      }
      const id = String(raw.id ?? "").trim();
      if (!id) {
        issues.push("忽略缺少 id 的条目");
        continue;
      }
      if (seen.has(id)) {
        issues.push(`条目 id 重复：${id}`);
        continue;
      }
      seen.add(id);
      const source = [SOURCE.EMBEDDED, SOURCE.BILIBILI, SOURCE.PLATFORM].includes(raw.source) ? raw.source : SOURCE.EMBEDDED;
      let status = raw.status;
      if (![STATUS.READY, STATUS.NEEDS_CONFIG, STATUS.UNAVAILABLE].includes(status)) {
        status = STATUS.NEEDS_CONFIG;
      }
      let playable = false;
      let reason = raw.unavailableReason ?? null;
      if (source === SOURCE.EMBEDDED) {
        const hasFile = typeof raw.url === "string" && raw.url.length > 0;
        const hasHash = typeof raw.sha256 === "string" && /^[0-9a-f]{64}$/.test(raw.sha256);
        const hasSize = Number.isFinite(Number(raw.sizeBytes)) && Number(raw.sizeBytes) > 0;
        playable = hasFile && hasHash && hasSize;
        if (!playable) {
          if (status === STATUS.READY) {
            issues.push(`${id}: status=ready 但缺少 url/sha256/sizeBytes，降级为 needs-config`);
            status = STATUS.NEEDS_CONFIG;
          }
          reason ??= hasFile ? "清单缺少 sha256 或 sizeBytes，无法校验" : "清单未提供音频文件地址";
        }
      } else if (source === SOURCE.BILIBILI) {
        playable = isBvId(raw.bvid);
        if (!playable) {
          if (status === STATUS.READY) {
            issues.push(`${id}: status=ready 但没有合法 bvid，降级为 needs-config`);
            status = STATUS.NEEDS_CONFIG;
          }
          reason ??= "等待开发者填入公开视频 BV 号";
        }
      } else {
        playable = typeof raw.pageUrl === "string" && /^https?:\/\//.test(raw.pageUrl);
        if (!playable) {
          if (status === STATUS.READY) {
            issues.push(`${id}: status=ready 但没有 pageUrl，降级为 needs-config`);
            status = STATUS.NEEDS_CONFIG;
          }
          reason ??= "等待开发者填入公开歌单页 URL";
        }
      }
      const capability = SOURCE_CAPABILITY[source];
      items.push({
        ...raw,
        id,
        source,
        status,
        playable,
        spectrumAvailable: playable ? raw.spectrumAvailable === true : false,
        unavailableReason: playable ? null : reason,
        label: capability.label
      });
    }
    return {
      version: Number(manifest.version) || 1,
      loopCrossfadeSec: Number(manifest.loopCrossfadeSec) || 0.25,
      items,
      issues
    };
  }
  function resolveUrl(path, baseUrl) {
    const U = globalThis.URL;
    if (typeof U !== "function") return String(path);
    const origin = globalThis.location?.href ?? BASE_ORIGIN;
    try {
      return new U(String(path), new U(baseUrl, origin)).href;
    } catch {
      return String(path);
    }
  }
  var BASE_ORIGIN = "http://localhost/";
  function defaultFetch() {
    return typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : null;
  }
  async function loadManifest({ baseUrl = "./", fetchImpl: fetchImpl2, manifestPath = MANIFEST_PATH } = {}) {
    const doFetch = fetchImpl2 ?? defaultFetch();
    if (!doFetch) throw new Error("dsh-music-on: 当前环境没有 fetch，无法加载预置音景");
    const url = resolveUrl(manifestPath, baseUrl);
    const response = await doFetch(url, { cache: "no-cache" });
    if (!response.ok) throw new Error(`清单加载失败：HTTP ${response.status} ${url}`);
    return parseManifest(await response.json());
  }
  function bytesToHex(buffer) {
    const view = new Uint8Array(buffer);
    let out = "";
    for (let i = 0; i < view.length; i++) out += view[i].toString(16).padStart(2, "0");
    return out;
  }
  async function sha256Hex(buffer) {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) throw new Error("当前不是安全上下文（需要 https 或 localhost），crypto.subtle 不可用");
    const digest = await subtle.digest("SHA-256", buffer);
    return bytesToHex(digest);
  }
  async function fetchWithTimeout(doFetch, url, timeoutMs) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return fetchImpl(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
  async function ensureCached(item, { cache, baseUrl = "./", fetchImpl: fetchImpl2, fetchTimeoutMs = DEFAULTS.fetchTimeoutMs, retries = 1 } = {}) {
    if (item.source !== SOURCE.EMBEDDED) throw new Error(`${item.id}: 不是 embedded 条目，不能下载缓存`);
    if (!item.playable) throw new Error(`${item.id}: 未就绪（${item.unavailableReason ?? "清单未提供可用音频"}）`);
    const doFetch = fetchImpl2 ?? defaultFetch();
    if (!doFetch) throw new Error(`${item.id}: 当前环境没有 fetch`);
    const cacheKey = `preset:${item.id}:${item.sha256}`;
    const cached = await cache.get(cacheKey);
    if (cached) return { blob: cached, fromCache: true, attempts: 0 };
    const url = resolveUrl(item.url, baseUrl);
    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      let response;
      try {
        response = await fetchWithTimeout(doFetch, url, fetchTimeoutMs);
      } catch (error) {
        lastError = new Error(`${item.id}: 下载失败（${error?.message ?? error}）`);
        continue;
      }
      if (!response.ok) {
        lastError = new Error(`${item.id}: 下载失败 HTTP ${response.status}`);
        continue;
      }
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength !== item.sizeBytes) {
        lastError = new Error(`${item.id}: 体积校验失败（期望 ${item.sizeBytes}，实际 ${buffer.byteLength}）`);
        continue;
      }
      let digest;
      try {
        digest = await sha256Hex(buffer);
      } catch (error) {
        throw new Error(`${item.id}: 无法校验 sha256（${error?.message ?? error}）`);
      }
      if (digest !== item.sha256) {
        lastError = new Error(`${item.id}: sha256 校验失败（期望 ${item.sha256.slice(0, 12)}…，实际 ${digest.slice(0, 12)}…）`);
        continue;
      }
      const blob = new Blob([buffer], { type: "audio/wav" });
      await cache.set(cacheKey, blob);
      return { blob, fromCache: false, attempts: attempt + 1 };
    }
    await cache.delete(cacheKey).catch(() => {
    });
    throw lastError ?? new Error(`${item.id}: 下载失败`);
  }
  async function enforceCacheLimit(cache, limitMb, { protectKeys = [] } = {}) {
    if (!(limitMb > 0)) return { removed: 0, sizeBytes: 0 };
    const entries = await cache.list();
    const limitBytes = limitMb * 1024 * 1024;
    let total = entries.reduce((sum, entry) => sum + (entry.sizeBytes ?? 0), 0);
    const protect = new Set(protectKeys);
    let removed = 0;
    for (const entry of entries) {
      if (total <= limitBytes) break;
      if (protect.has(entry.key)) continue;
      await cache.delete(entry.key);
      total -= entry.sizeBytes ?? 0;
      removed += 1;
    }
    return { removed, sizeBytes: total };
  }
  function createEngine2({ audioContextFactory, manifest, onStateChange } = {}) {
    const ctxFactory = audioContextFactory ?? (() => {
      const Ctor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (!Ctor) throw new Error("当前环境没有 AudioContext，无法播放本地音景");
      return new Ctor();
    });
    let ctx = null;
    let gain = null;
    let analyser = null;
    let sourceNode = null;
    let currentId = null;
    let loopCache = /* @__PURE__ */ new Map();
    let volume = 0.8;
    const emit3 = (state) => {
      try {
        onStateChange?.(state);
      } catch {
      }
    };
    const ensureContext = async () => {
      if (!ctx) {
        ctx = ctxFactory();
        gain = ctx.createGain();
        gain.gain.value = volume;
        analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.8;
        gain.connect(analyser);
        analyser.connect(ctx.destination);
      }
      if (ctx.state === "suspended") await ctx.resume();
      return ctx;
    };
    const stopEmbedded = () => {
      if (!sourceNode) return;
      try {
        sourceNode.onended = null;
        sourceNode.stop();
        sourceNode.disconnect();
      } catch {
      }
      sourceNode = null;
    };
    const decode = async (item, blob) => {
      const key = `${item.id}:${item.sha256}`;
      const cached = loopCache.get(key);
      if (cached) return cached;
      const buffer = await blob.arrayBuffer();
      const decoded = await (await ensureContext()).decodeAudioData(buffer);
      loopCache.set(key, decoded);
      return decoded;
    };
    const playEmbedded = async (item, { blob } = {}) => {
      if (!blob) throw new Error(`${item.id}: 缺少已校验的音频数据`);
      await ensureContext();
      const audioBuffer = await decode(item, blob);
      const dur = audioBuffer.duration;
      let loopStart = Number.isFinite(item.loopStart) ? item.loopStart : 0;
      let loopEnd = Number.isFinite(item.loopEnd) ? item.loopEnd : dur;
      loopStart = Math.max(0, Math.min(loopStart, dur - 0.05));
      loopEnd = Math.max(loopStart + 0.05, Math.min(loopEnd, dur));
      stopEmbedded();
      const node = ctx.createBufferSource();
      node.buffer = audioBuffer;
      node.loop = true;
      node.loopStart = loopStart;
      node.loopEnd = loopEnd;
      node.connect(gain);
      node.start(0, loopStart);
      sourceNode = node;
      currentId = item.id;
      emit3({ id: item.id, source: SOURCE.EMBEDDED, playing: true, spectrum: true, loopStart, loopEnd, duration: dur });
      return { playing: true, spectrum: true };
    };
    const stop = () => {
      stopEmbedded();
      const previous = currentId;
      currentId = null;
      emit3({ id: previous, playing: false, source: null, spectrum: false });
    };
    const setVolume = (value) => {
      const v = Math.max(0, Math.min(1, Number(value)));
      if (!Number.isFinite(v)) return volume;
      volume = v;
      if (gain) gain.gain.setTargetAtTime(v, ctx.currentTime, 0.02);
      return volume;
    };
    const readSpectrum = () => {
      if (!analyser || !sourceNode) return null;
      const bins = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(bins);
      return bins;
    };
    return {
      playEmbedded,
      stop,
      setVolume,
      readSpectrum,
      get currentId() {
        return currentId;
      },
      get context() {
        return ctx;
      },
      get analyser() {
        return analyser;
      },
      get hasSpectrum() {
        return Boolean(analyser && sourceNode);
      },
      async close() {
        stop();
        loopCache = /* @__PURE__ */ new Map();
        if (ctx && typeof ctx.close === "function") await ctx.close().catch(() => {
        });
        ctx = null;
        gain = null;
        analyser = null;
      }
    };
  }
  function buildBilibiliEmbedUrl(item, { autoplay = 1, danmaku = 0, highQuality = 1 } = {}) {
    if (item.source !== SOURCE.BILIBILI) throw new Error(`${item.id}: 不是 bilibili-embed 条目`);
    if (!isBvId(item.bvid)) throw new Error(`${item.id}: 未配置合法 bvid（等待开发者填入公开视频 BV 号）`);
    const params = new URLSearchParams({
      bvid: item.bvid.trim(),
      p: "1",
      autoplay: String(autoplay),
      danmaku: String(danmaku),
      // B站参数名就是 danmaku，不是 dm
      high_quality: String(highQuality)
    });
    return `https://player.bilibili.com/player.html?${params.toString()}`;
  }
  function resolvePlatformUrl(item) {
    if (item.source !== SOURCE.PLATFORM) throw new Error(`${item.id}: 不是 platform-link 条目`);
    if (!item.playable) throw new Error(`${item.id}: ${item.unavailableReason ?? "未配置平台链接"}`);
    return item.pageUrl;
  }
  async function createPresets(options = {}) {
    const {
      settings,
      cacheStore,
      baseUrl = "./",
      fetchImpl: fetchImpl2,
      audioContextFactory,
      manifest: providedManifest,
      onStateChange
    } = options;
    const config = await readSettings(settings);
    const cache = createCache({ cacheStore, storageDir: config.storageDir });
    const manifest = providedManifest && providedManifest.items ? providedManifest : await loadManifest({ baseUrl, fetchImpl: fetchImpl2 });
    const looksParsed = Array.isArray(manifest.items) && manifest.items.length > 0 && manifest.items.every((item) => item && typeof item.playable === "boolean" && typeof item.label === "string");
    const parsed = looksParsed ? manifest : parseManifest(manifest);
    const byId = new Map(parsed.items.map((item) => [item.id, item]));
    const listeners2 = /* @__PURE__ */ new Set();
    const statusMap = /* @__PURE__ */ new Map();
    const engine = createEngine2({
      audioContextFactory,
      manifest: parsed,
      onStateChange: (state) => {
        publish({ type: "playback", ...state });
        try {
          onStateChange?.(state);
        } catch {
        }
      }
    });
    function publish(event) {
      for (const fn of listeners2) {
        try {
          fn(event);
        } catch {
        }
      }
    }
    const get = (id) => byId.get(id) ?? null;
    async function prepare(id) {
      const item = get(id);
      if (!item) throw new Error(`未知预置：${id}`);
      if (item.source !== SOURCE.EMBEDDED) return { skipped: true, item };
      if (!item.playable) {
        const error = new Error(`${item.id}: ${item.unavailableReason ?? "未就绪"}`);
        statusMap.set(item.id, { status: STATUS.UNAVAILABLE, reason: error.message });
        publish({ type: "error", id: item.id, error });
        throw error;
      }
      try {
        const result = await ensureCached(item, {
          cache,
          baseUrl,
          fetchImpl: fetchImpl2,
          fetchTimeoutMs: config.fetchTimeoutMs
        });
        await enforceCacheLimit(cache, config.cacheLimitMb, { protectKeys: [`preset:${item.id}:${item.sha256}`] });
        statusMap.set(item.id, { status: STATUS.READY, reason: null, fromCache: result.fromCache });
        publish({ type: "cached", id: item.id, fromCache: result.fromCache });
        return { ...result, item };
      } catch (error) {
        statusMap.set(item.id, { status: STATUS.UNAVAILABLE, reason: error.message });
        publish({ type: "error", id: item.id, error });
        throw error;
      }
    }
    async function play(id) {
      const item = get(id);
      if (!item) {
        const error = new Error(`未知预置：${id}`);
        publish({ type: "error", id, error });
        throw error;
      }
      try {
        if (item.source === SOURCE.EMBEDDED) {
          const { blob } = await prepare(id);
          const state = await engine.playEmbedded(item, { blob });
          return { mode: "audio", ...state };
        }
        if (item.source === SOURCE.BILIBILI) {
          const embedUrl = buildBilibiliEmbedUrl(item);
          publish({ type: "embed", id, embedUrl, spectrum: false });
          return { mode: "iframe", embedUrl, spectrum: false, note: "B站嵌入播放，音频不进入 AudioContext，频谱不可用" };
        }
        const url = resolvePlatformUrl(item);
        publish({ type: "external", id, url });
        return { mode: "external", url, spectrum: false, note: "外部平台跳转，插件内不播放" };
      } catch (error) {
        statusMap.set(item.id, { status: error.status ?? STATUS.UNAVAILABLE, reason: error.message });
        publish({ type: "error", id, error });
        throw error;
      }
    }
    async function prepareAll() {
      const targets = parsed.items.filter((item) => item.source === SOURCE.EMBEDDED && item.playable);
      const results = [];
      for (const item of targets) {
        try {
          await prepare(item.id);
          results.push({ id: item.id, ok: true });
        } catch (error) {
          results.push({ id: item.id, ok: false, error: error.message });
        }
      }
      return results;
    }
    function categories() {
      return CATEGORIES.map((category) => {
        const items = parsed.items.filter((item) => item.category === category.id);
        return {
          ...category,
          items,
          counts: {
            ready: items.filter((item) => item.playable).length,
            needsConfig: items.filter((item) => item.status === STATUS.NEEDS_CONFIG).length,
            unavailable: items.filter((item) => item.status === STATUS.UNAVAILABLE).length
          }
        };
      }).filter((category) => category.items.length > 0);
    }
    function list() {
      return parsed.items.map((item) => ({
        ...item,
        runtime: statusMap.get(item.id) ?? null
      }));
    }
    function unavailableReport() {
      return parsed.items.filter((item) => !item.playable).map((item) => ({
        id: item.id,
        name: item.name,
        source: item.source,
        status: item.status,
        spectrumAvailable: false,
        reason: statusMap.get(item.id)?.reason ?? item.unavailableReason ?? "未配置",
        hint: item.source === SOURCE.BILIBILI ? '在 manifest.json 填入 bvid 并把 status 改为 "ready"' : item.source === SOURCE.PLATFORM ? '在 manifest.json 填入 pageUrl 并把 status 改为 "ready"' : "该条目没有音频产物，需要补生成脚本配方或移除条目"
      }));
    }
    return {
      config,
      cache,
      engine,
      manifest: parsed,
      issues: parsed.issues ?? [],
      categories,
      list,
      get,
      prepare,
      prepareAll,
      play,
      stop: () => engine.stop(),
      setVolume: (v) => engine.setVolume(v),
      readSpectrum: () => engine.readSpectrum(),
      unavailableReport,
      buildBilibiliEmbedUrl: (id) => buildBilibiliEmbedUrl(get(id)),
      resolvePlatformUrl: (id) => resolvePlatformUrl(get(id)),
      onChange(fn) {
        listeners2.add(fn);
        return () => listeners2.delete(fn);
      },
      async cacheStats() {
        const entries = await cache.list();
        const sizeBytes = entries.reduce((sum, entry) => sum + (entry.sizeBytes ?? 0), 0);
        return {
          backend: cache.kind,
          storageDir: cache.storageDir,
          limitMb: config.cacheLimitMb,
          entries: entries.length,
          sizeBytes,
          sizeMb: sizeBytes / (1024 * 1024)
        };
      }
    };
  }

  // src/client/presets-boot.js
  var PRESETS_BASE = "/api/dsh-music-on/presets/";
  var SLOT = "__dsh_music_on_presets__";
  async function ensurePresets(deps = {}) {
    if (typeof window === "undefined") return null;
    if (window[SLOT]) return window[SLOT];
    if (window[`${SLOT}promise`]) return window[`${SLOT}promise`];
    const promise = (async () => {
      try {
        const settings = deps.settings || (deps.store ? deps.store.get() : void 0);
        const controller = await createPresets({
          settings,
          // 末尾斜杠是 URL 语义的一部分：少了它 'presets/manifest.json'
          // 会把最后一段当文件名替换掉，路径直接错位。
          baseUrl: PRESETS_BASE
        });
        window[SLOT] = controller;
        return controller;
      } catch (error) {
        if (typeof console !== "undefined" && console.warn) {
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
  function getPresetsSync() {
    if (typeof window === "undefined") return null;
    return window[SLOT] || null;
  }
  function disposePresets() {
    if (typeof window === "undefined") return;
    const controller = window[SLOT];
    if (!controller) return;
    try {
      if (typeof controller.stop === "function") controller.stop();
      if (controller.cache && typeof controller.cache.close === "function") controller.cache.close();
    } catch (error) {
      void error;
    }
    delete window[SLOT];
  }

  // src/client/parser.js
  var PLATFORMS = Object.freeze([
    "bilibili-video",
    "bilibili-favlist",
    "netease-playlist",
    "netease-track",
    "qq-playlist",
    "qq-track",
    "youtube-video",
    "youtube-playlist",
    "direct-audio",
    "unknown"
  ]);
  var ERROR_CODES = Object.freeze({
    UNSUPPORTED_URL: "E_UNSUPPORTED_URL",
    RESOLVE_TIMEOUT: "E_RESOLVE_TIMEOUT",
    RESOLVE_BLOCKED: "E_RESOLVE_BLOCKED",
    NO_STREAM: "E_NO_STREAM",
    DECODE_FAILED: "E_DECODE_FAILED",
    // 仅在「调用方把 host 返回的 JSON 交给 normalizeResult」这一侧出现：
    BAD_RESPONSE: "E_BAD_RESPONSE"
  });
  var ALLOWED_DOMAINS = Object.freeze([
    "bilibili.com",
    "b23.tv",
    "music.163.com",
    "y.qq.com",
    "youtube.com",
    "youtu.be"
  ]);
  var AUDIO_EXTENSIONS2 = Object.freeze([
    ".mp3",
    ".m4a",
    ".aac",
    ".flac",
    ".wav",
    ".ogg",
    ".oga",
    ".opus",
    ".weba",
    ".m3u8",
    ".mpd"
  ]);
  var ALLOWED_PROTOCOLS = Object.freeze(["http:", "https:"]);
  var BVID_RE = /^BV[0-9A-Za-z]{10}$/;
  var AVID_RE = /^av[0-9]+$/i;
  var EPID_RE = /^ep[0-9]+$/i;
  var SSID_RE = /^ss[0-9]+$/i;
  function createResolveError(code, message, detail) {
    const error = new Error(message);
    error.name = "MusicOnResolveError";
    error.code = code;
    if (detail !== void 0) error.detail = detail;
    return error;
  }
  function normalizeUrl(input) {
    if (typeof input !== "string") {
      throw createResolveError(ERROR_CODES.UNSUPPORTED_URL, "输入必须是字符串");
    }
    let text = input.replace(/[\u0000-\u001f\u007f\u200b-\u200f\ufeff]/g, "").trim();
    if (text === "") {
      throw createResolveError(ERROR_CODES.UNSUPPORTED_URL, "输入为空");
    }
    let decoded = text;
    for (let round = 0; round < 3; round += 1) {
      let next;
      try {
        next = decodeURIComponent(decoded);
      } catch (_error) {
        break;
      }
      if (next === decoded) break;
      decoded = next;
    }
    text = decoded;
    if (!/^[A-Za-z][A-Za-z0-9+.-]*:/.test(text)) {
      if (/^\/\//.test(text)) text = `https:${text}`;
      else if (/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+([/?#]|$)/.test(text)) text = `https://${text}`;
    }
    let parsed;
    try {
      parsed = new URL(text);
    } catch (_error) {
      throw createResolveError(ERROR_CODES.UNSUPPORTED_URL, "不是合法的 URL");
    }
    if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
      throw createResolveError(ERROR_CODES.RESOLVE_BLOCKED, `协议 ${parsed.protocol} 不在白名单内`, {
        protocol: parsed.protocol
      });
    }
    if (parsed.username !== "" || parsed.password !== "") {
      throw createResolveError(ERROR_CODES.RESOLVE_BLOCKED, "URL 不允许携带 userinfo（@ 混淆）");
    }
    const host = normalizeHostname(parsed.hostname);
    if (host === "" || isIpLiteral(host) || host === "localhost" || host.endsWith(".localhost")) {
      throw createResolveError(ERROR_CODES.RESOLVE_BLOCKED, `主机名 ${host || "(空)"} 不允许（IP/本地名）`, { hostname: host });
    }
    return parsed.href;
  }
  function normalizeHostname(hostname) {
    let host = String(hostname || "").toLowerCase();
    if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
    if (host.endsWith(".")) host = host.slice(0, -1);
    return host;
  }
  function isAllowedHostname(hostname) {
    const host = normalizeHostname(hostname);
    if (host === "") return false;
    return ALLOWED_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
  }
  function isUrlAllowed(url) {
    let parsed;
    try {
      parsed = new URL(normalizeUrl(url));
    } catch (_error) {
      return false;
    }
    if (parsed.username !== "" || parsed.password !== "") return false;
    const host = normalizeHostname(parsed.hostname);
    if (host === "") return false;
    if (isIpLiteral(host)) return false;
    return isAllowedHostname(host);
  }
  function isIpLiteral(host) {
    if (host.includes(":")) return true;
    if (/^[0-9]+$/.test(host)) return true;
    if (/^0x[0-9a-f]+$/i.test(host)) return true;
    return /^[0-9]{1,3}(\.[0-9]{1,3}){3}$/.test(host);
  }
  function detectPlatform(url) {
    let parsed;
    try {
      parsed = new URL(normalizeUrl(url));
    } catch (_error) {
      return "unknown";
    }
    if (!isUrlAllowed(parsed.href)) return "unknown";
    const host = normalizeHostname(parsed.hostname);
    if (host === "b23.tv" || host === "bilibili.com" || host.endsWith(".bilibili.com")) {
      if (findFavlistId(parsed) !== null) return "bilibili-favlist";
      if (findBilibiliVideoId(parsed) !== null) return "bilibili-video";
      return "unknown";
    }
    if (host === "music.163.com") {
      const route = neteaseRoute(parsed);
      if (route.kind === "playlist") return "netease-playlist";
      if (route.kind === "track") return "netease-track";
      return "unknown";
    }
    if (host === "y.qq.com") {
      const route = qqRoute(parsed);
      if (route.kind === "playlist") return "qq-playlist";
      if (route.kind === "track") return "qq-track";
      return "unknown";
    }
    if (host === "youtu.be") return "youtube-video";
    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      if (parsed.searchParams.get("list")) return "youtube-playlist";
      if (parsed.pathname.startsWith("/playlist")) return "youtube-playlist";
      if (parsed.searchParams.get("v") || parsed.pathname.startsWith("/shorts/") || parsed.pathname.startsWith("/embed/") || parsed.pathname.startsWith("/live/") || parsed.pathname.startsWith("/watch")) return "youtube-video";
      return "unknown";
    }
    const ext = extensionOf(parsed.pathname);
    if (AUDIO_EXTENSIONS2.includes(ext)) return "direct-audio";
    return "unknown";
  }
  function extractId(url, platform) {
    const kind = platform || detectPlatform(url);
    let parsed;
    try {
      parsed = new URL(normalizeUrl(url));
    } catch (_error) {
      return {};
    }
    if (!isUrlAllowed(parsed.href)) return {};
    switch (kind) {
      case "bilibili-video": {
        const id = findBilibiliVideoId(parsed);
        return id === null ? {} : id;
      }
      case "bilibili-favlist": {
        const fid = findFavlistId(parsed);
        if (fid === null) return {};
        const mid = pathSegmentAfter(parsed.pathname, "space.bilibili.com");
        const out = { fid };
        if (mid !== null) out.mid = mid;
        return out;
      }
      case "netease-playlist": {
        const route = neteaseRoute(parsed);
        return route.playlistId ? { playlistId: route.playlistId } : {};
      }
      case "netease-track": {
        const route = neteaseRoute(parsed);
        return route.trackId ? { trackId: route.trackId } : {};
      }
      case "qq-playlist": {
        const route = qqRoute(parsed);
        return route.playlistId ? { playlistId: route.playlistId } : {};
      }
      case "qq-track": {
        const route = qqRoute(parsed);
        return route.songmid ? { songmid: route.songmid } : {};
      }
      case "youtube-video": {
        const videoId = youtubeVideoId(parsed);
        return videoId ? { videoId } : {};
      }
      case "youtube-playlist": {
        const listId = parsed.searchParams.get("list");
        return listId ? { listId } : {};
      }
      case "direct-audio":
        return { url: parsed.href };
      default:
        return {};
    }
  }
  function extensionOf(pathname) {
    const match = /\.([A-Za-z0-9]+)$/.exec(String(pathname || ""));
    return match ? `.${match[1].toLowerCase()}` : "";
  }
  function findBilibiliVideoId(parsed) {
    const host = normalizeHostname(parsed.hostname);
    const segments = parsed.pathname.split("/").filter(Boolean);
    for (const segment of segments) {
      if (BVID_RE.test(segment)) return { bvid: segment };
      if (AVID_RE.test(segment)) return { aid: segment.toLowerCase().replace(/^av/, "") };
      if (EPID_RE.test(segment) || SSID_RE.test(segment)) return { epid: segment.toLowerCase() };
    }
    const bvid = parsed.searchParams.get("bvid");
    if (bvid && BVID_RE.test(bvid)) return { bvid };
    const aid = parsed.searchParams.get("aid");
    if (aid && /^[0-9]+$/.test(aid)) return { aid };
    if (host === "b23.tv") {
      const code = segments[0];
      if (code) return { shortCode: code };
    }
    return null;
  }
  function findFavlistId(parsed) {
    if (!parsed.pathname.includes("favlist")) {
      const fidParam = parsed.searchParams.get("fid");
      if (fidParam && /^[0-9]+$/.test(fidParam) && normalizeHostname(parsed.hostname) === "space.bilibili.com") {
        return fidParam;
      }
      return null;
    }
    const fid = parsed.searchParams.get("fid");
    if (fid && /^[0-9]+$/.test(fid)) return fid;
    return null;
  }
  function pathSegmentAfter(pathname, marker) {
    const parts = String(pathname || "").split("/").filter(Boolean);
    if (parts.length >= 2 && /^[0-9]+$/.test(parts[0])) return parts[0];
    void marker;
    return null;
  }
  function neteaseRoute(parsed) {
    const hash = String(parsed.hash || "");
    const hashQuery = hash.includes("?") ? new URLSearchParams(hash.slice(hash.indexOf("?") + 1)) : new URLSearchParams();
    const hashPath = hash.replace(/^#!?/, "").split("?")[0];
    const pathParts = String(parsed.pathname || "").split("/").filter(Boolean);
    const pick = (key) => {
      const value = parsed.searchParams.get(key) || hashQuery.get(key);
      return value !== null && value !== void 0 && /^[0-9]+$/.test(value) ? value : null;
    };
    const isDigits = (value) => typeof value === "string" && /^[0-9]+$/.test(value);
    const hashIsPlaylist = hashPath.startsWith("/playlist") || hashPath.startsWith("/discover/playlist");
    const hashIsTrack = hashPath.startsWith("/song") || hashPath.startsWith("/track");
    const pathIsPlaylist = pathParts[0] === "playlist" || pathParts[0] === "discover" && pathParts[1] === "playlist";
    const pathIsTrack = pathParts[0] === "song" || pathParts[0] === "track";
    const directPlaylist = pathIsPlaylist && isDigits(pathParts[1]) ? pathParts[1] : null;
    const directTrack = pathIsTrack && isDigits(pathParts[1]) ? pathParts[1] : null;
    const idParam = pick("id");
    const playlistId = directPlaylist || (idParam !== null && (hashIsPlaylist || pathIsPlaylist) ? idParam : null);
    const trackId = directTrack || (idParam !== null && (hashIsTrack || pathIsTrack) ? idParam : null) || pick("songid");
    let kind = "unknown";
    if (playlistId !== null) kind = "playlist";
    else if (trackId !== null) kind = "track";
    return { kind, playlistId, trackId };
  }
  function qqRoute(parsed) {
    const pathParts = String(parsed.pathname || "").split("/").filter(Boolean);
    const hashQuery = String(parsed.hash || "").includes("?") ? new URLSearchParams(String(parsed.hash).slice(String(parsed.hash).indexOf("?") + 1)) : new URLSearchParams();
    let playlistId = null;
    let songmid = null;
    for (let i = 0; i < pathParts.length; i += 1) {
      const part = pathParts[i];
      if (part === "playlist" || part === "taoge") {
        const next = (pathParts[i + 1] || "").replace(/\.html$/i, "");
        if (/^[0-9]+$/.test(next)) playlistId = next;
      }
      if (part === "songDetail" || part === "song") {
        const next = (pathParts[i + 1] || "").replace(/\.html$/i, "");
        if (/^[0-9A-Za-z]+$/.test(next) && !/^[0-9]+$/.test(next)) songmid = next;
      }
    }
    if (playlistId === null) {
      const disstid = parsed.searchParams.get("disstid") || parsed.searchParams.get("id") || hashQuery.get("id");
      if (disstid && /^[0-9]+$/.test(disstid)) playlistId = disstid;
    }
    if (songmid === null) {
      const mid = parsed.searchParams.get("songmid");
      if (mid && /^[0-9A-Za-z]+$/.test(mid)) songmid = mid;
    }
    return {
      kind: playlistId ? "playlist" : songmid ? "track" : "unknown",
      playlistId,
      songmid
    };
  }
  function youtubeVideoId(parsed) {
    const host = normalizeHostname(parsed.hostname);
    if (host === "youtu.be") {
      const id = String(parsed.pathname || "").split("/").filter(Boolean)[0];
      return id && /^[A-Za-z0-9_-]{6,}$/.test(id) ? id : null;
    }
    const v = parsed.searchParams.get("v");
    if (v && /^[A-Za-z0-9_-]{6,}$/.test(v)) return v;
    const pathParts = String(parsed.pathname || "").split("/").filter(Boolean);
    if (pathParts.length >= 2 && ["shorts", "embed", "live", "v"].includes(pathParts[0])) {
      const id = pathParts[1];
      if (/^[A-Za-z0-9_-]{6,}$/.test(id)) return id;
    }
    return null;
  }
  function describeError(error) {
    const code = error && typeof error === "object" && typeof error.code === "string" ? error.code : ERROR_CODES.DECODE_FAILED;
    const message = error && typeof error === "object" && typeof error.message === "string" && error.message !== "" ? error.message : "未知错误";
    return {
      code,
      message,
      retryable: code === ERROR_CODES.RESOLVE_TIMEOUT || code === ERROR_CODES.RESOLVE_BLOCKED
    };
  }

  // src/client/library.js
  var FAV_KEY = "dsh-music-on:favorites.v1";
  var HIST_KEY = "dsh-music-on:history.v1";
  var FAV_MAX = 200;
  var HIST_MAX = 100;
  var TITLE_MAX = 200;
  var TRACKING_PARAMS = /* @__PURE__ */ new Set([
    "spm_id_from",
    "spm_id",
    "from_source",
    "from_spmid",
    "vd_source",
    "share_source",
    "share_medium",
    "share_plat",
    "share_session_id",
    "share_tag",
    "unique_k",
    "bbid",
    "ts",
    "wts",
    "seid",
    "buvid",
    "up_id",
    "tab",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "timestamp",
    "src",
    "source",
    "ref",
    "referer",
    "track",
    "trackid"
  ]);
  var PLATFORM_HOSTS = [
    ["bilibili", ["bilibili.com", "b23.tv", "biliapi.net"]],
    ["netease", ["music.163.com"]],
    ["qqmusic", ["y.qq.com", "c.y.qq.com"]],
    ["youtube", ["youtube.com", "youtu.be"]]
  ];
  var PLATFORM_LABELS = Object.freeze({
    bilibili: "B站",
    netease: "网易云",
    qqmusic: "QQ音乐",
    youtube: "YouTube",
    direct: "直链",
    other: "链接"
  });
  function safeStorage2() {
    try {
      if (typeof localStorage === "undefined" || localStorage === null) return null;
      return localStorage;
    } catch (_error) {
      return null;
    }
  }
  function hostOf(url) {
    try {
      return String(new globalThis.URL(url).hostname || "").toLowerCase();
    } catch (_error) {
      return "";
    }
  }
  function hostMatches(host, domain) {
    return host === domain || host.endsWith(`.${domain}`);
  }
  function canonicalUrl(raw) {
    const text = String(raw === null || raw === void 0 ? "" : raw).trim();
    if (text === "") return "";
    let parsed = null;
    try {
      parsed = new globalThis.URL(text);
    } catch (_error) {
      return text;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return text;
    for (const key of [...parsed.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) parsed.searchParams.delete(key);
    }
    parsed.hash = cleanHash(parsed.hash);
    return parsed.toString();
  }
  function cleanHash(raw) {
    const hash = String(raw || "");
    if (hash === "" || hash === "#") return "";
    const body = hash.replace(/^#!?/, "");
    const mark = body.indexOf("?");
    if (mark < 0) {
      return body === "" || body === "/" ? "" : `#${body}`;
    }
    const path = body.slice(0, mark);
    const params = new URLSearchParams(body.slice(mark + 1));
    for (const key of [...params.keys()]) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) params.delete(key);
    }
    const query = params.toString();
    const rebuilt = `${path}${query === "" ? "" : `?${query}`}`;
    return rebuilt === "" || rebuilt === "/" ? "" : `#${rebuilt}`;
  }
  function platformOf(url) {
    const host = hostOf(url);
    for (const [platform, domains] of PLATFORM_HOSTS) {
      if (domains.some((domain) => hostMatches(host, domain))) return platform;
    }
    if (/\.(mp3|m4a|aac|wav|flac|ogg|oga|opus|weba|webm)(\?|#|$)/i.test(String(url || ""))) {
      return "direct";
    }
    return "other";
  }
  function platformLabel(platform) {
    return PLATFORM_LABELS[platform] || PLATFORM_LABELS.other;
  }
  function normalizeEntry(raw) {
    const source = typeof raw === "string" ? { url: raw } : raw;
    if (!source || typeof source !== "object") return null;
    const url = canonicalUrl(source.url);
    if (url === "" || !/^https?:\/\//i.test(url)) return null;
    const rawTitle = typeof source.title === "string" ? source.title.trim() : "";
    const title = rawTitle === "" ? "" : rawTitle.slice(0, TITLE_MAX);
    const platform = typeof source.platform === "string" && source.platform !== "" ? source.platform : platformOf(url);
    const kind = typeof source.kind === "string" ? source.kind : "";
    const now = Date.now();
    const addedAt = Number.isFinite(source.addedAt) ? source.addedAt : now;
    const playedAt = Number.isFinite(source.playedAt) ? source.playedAt : addedAt;
    const plays = Number.isFinite(source.plays) && source.plays > 0 ? Math.floor(source.plays) : 1;
    return { id: url, url, title, platform, kind, addedAt, playedAt, plays };
  }
  function entryFrom(link, extra) {
    const base = typeof link === "string" ? { url: link } : link || {};
    return normalizeEntry({ ...base, ...extra || {} });
  }
  function relativeTime(ts, now) {
    const time = Number.isFinite(ts) ? ts : 0;
    const base = Number.isFinite(now) ? now : Date.now();
    const diff = base - time;
    if (!(diff > 0)) return "刚刚";
    const sec = Math.floor(diff / 1e3);
    if (sec < 60) return "刚刚";
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} 分钟前`;
    const hour = Math.floor(min / 60);
    if (hour < 24) return `${hour} 小时前`;
    const day = Math.floor(hour / 24);
    if (day < 30) return `${day} 天前`;
    const date = new Date(time);
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
  function readList(key, max) {
    const storage = safeStorage2();
    if (storage === null) return [];
    try {
      const raw = storage.getItem(key);
      if (typeof raw !== "string" || raw === "") return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return dedupe(parsed, max);
    } catch (_error) {
      return [];
    }
  }
  function dedupe(list, max) {
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    for (const item of Array.isArray(list) ? list : []) {
      const entry = normalizeEntry(item);
      if (entry === null || seen.has(entry.id)) continue;
      seen.add(entry.id);
      out.push(entry);
      if (out.length >= max) break;
    }
    return out;
  }
  function writeList(key, list, max) {
    const clean = dedupe(list, max);
    const storage = safeStorage2();
    if (storage !== null) {
      try {
        storage.setItem(key, JSON.stringify(clean));
      } catch (_error) {
      }
    }
    return clean;
  }
  var listeners = /* @__PURE__ */ new Set();
  var storageBound = false;
  function emit2() {
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch (_error) {
      }
    }
  }
  function bindStorage() {
    if (storageBound) return;
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
    storageBound = true;
    window.addEventListener("storage", (event) => {
      if (event && event.key !== null && event.key !== FAV_KEY && event.key !== HIST_KEY) return;
      emit2();
    });
  }
  function subscribeLibrary(listener) {
    if (typeof listener !== "function") return () => {
    };
    bindStorage();
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }
  function loadFavorites() {
    return readList(FAV_KEY, FAV_MAX);
  }
  function addFavorite(entry) {
    const normalized = normalizeEntry(entry);
    if (normalized === null) return loadFavorites();
    const rest = loadFavorites().filter((item) => item.id !== normalized.id);
    const list = writeList(FAV_KEY, [normalized, ...rest], FAV_MAX);
    emit2();
    return list;
  }
  function removeFavorite(id) {
    const list = writeList(FAV_KEY, loadFavorites().filter((item) => item.id !== id), FAV_MAX);
    emit2();
    return list;
  }
  function isFavorite(id) {
    return loadFavorites().some((item) => item.id === id);
  }
  function toggleFavorite(entry) {
    const normalized = normalizeEntry(entry);
    if (normalized === null) return { list: loadFavorites(), favorited: false };
    if (isFavorite(normalized.id)) {
      return { list: removeFavorite(normalized.id), favorited: false };
    }
    return { list: addFavorite(normalized), favorited: true };
  }
  function clearFavorites() {
    const list = writeList(FAV_KEY, [], FAV_MAX);
    emit2();
    return list;
  }
  function loadHistory() {
    return readList(HIST_KEY, HIST_MAX);
  }
  function recordHistoryMany(entries) {
    const list = Array.isArray(entries) ? entries : [];
    let current = loadHistory();
    for (const item of list) {
      const normalized = normalizeEntry(item);
      if (normalized === null) continue;
      const previous = current.find((row) => row.id === normalized.id);
      const merged = {
        ...normalized,
        title: normalized.title !== "" ? normalized.title : previous ? previous.title : "",
        addedAt: previous ? previous.addedAt : normalized.addedAt,
        playedAt: normalized.playedAt,
        plays: (previous ? previous.plays : 0) + 1
      };
      current = [merged, ...current.filter((row) => row.id !== normalized.id)];
    }
    const written = writeList(HIST_KEY, current, HIST_MAX);
    emit2();
    return written;
  }
  function removeHistory(id) {
    const list = writeList(HIST_KEY, loadHistory().filter((item) => item.id !== id), HIST_MAX);
    emit2();
    return list;
  }
  function clearHistory() {
    const list = writeList(HIST_KEY, [], HIST_MAX);
    emit2();
    return list;
  }

  // src/client/linkintake.js
  var RESOLVE_PATH2 = "/api/dsh-music-on/resolve";
  var STREAM_PATH2 = "/api/dsh-music-on/stream";
  var BV_RE = /^BV[0-9A-Za-z]{10}$/;
  var AUDIO_EXT_RE = /\.(mp3|m4a|aac|wav|flac|ogg|oga|opus|weba|webm)(\?|#|$)/i;
  function extractUrls(text) {
    const source = typeof text === "string" ? text : "";
    const hits = source.match(/https?:\/\/[^\s<>"']+/gi) || [];
    const cleaned = hits.map(
      (raw) => raw.replace(/[),.;:!?\]}]+$/, (tail) => tail.includes("?") || tail.includes("#") ? tail : tail.replace(/[.,;:!?]+$/, ""))
    );
    if (cleaned.length > 0) return Array.from(new Set(cleaned));
    const bare = source.trim();
    if (bare !== "" && !/\s/.test(bare) && /^[\w.-]+\.[a-z]{2,}\//i.test(bare)) return [`https://${bare}`];
    if (BV_RE.test(bare)) return [`https://www.bilibili.com/video/${bare}`];
    if (/^av\d+$/i.test(bare)) return [`https://www.bilibili.com/video/${bare}`];
    return [];
  }
  function classifyUrl(url) {
    let normalized;
    try {
      normalized = normalizeUrl(url);
    } catch (_error) {
      normalized = null;
    }
    if (!normalized) {
      return { route: "unsupported", platform: null, ids: {}, reason: "不是合法的 http(s) 链接" };
    }
    const platform = detectPlatform(normalized);
    const ids = platform && extractId(normalized, platform) || {};
    if (platform === "bilibili-video" || platform === "bilibili-short") {
      return { route: "bilibili", platform, ids, reason: null };
    }
    if (platform === "bilibili-audio") {
      return { route: "bilibili", platform, ids, reason: null };
    }
    if (isPlatformPage(platform)) {
      return { route: "platform", platform, ids, reason: platformReason(platform) };
    }
    if (AUDIO_EXT_RE.test(normalized)) {
      return { route: "audio-direct", platform, ids, reason: null };
    }
    if (isPlatformHost(normalized)) {
      return { route: "platform", platform, ids, reason: "该平台链接会交给宿主解析，解析不出可播曲目时退回「打开原平台」" };
    }
    if (isUrlAllowed(normalized)) {
      return { route: "stream", platform, ids, reason: null };
    }
    return { route: "unsupported", platform, ids, reason: "不在受支持的音乐平台或音频直链范围内" };
  }
  function isPlatformHost(url) {
    try {
      const host = new URL(url).hostname.toLowerCase();
      return host === "music.163.com" || host === "y.qq.com" || host.endsWith(".y.qq.com") || host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be";
    } catch (_error) {
      return false;
    }
  }
  function isPlatformPage(platform) {
    if (typeof platform !== "string" || platform === "" || platform === "unknown") return false;
    return platform.startsWith("netease") || platform.startsWith("qq") || platform.startsWith("youtube");
  }
  function platformReason(platform) {
    if (platform.startsWith("netease")) return "网易云链接会解析成可播放曲目，需要会员的曲目只能跳原平台";
    if (platform.startsWith("qq")) return "QQ音乐链接会解析成可播放曲目，需要会员的曲目只能跳原平台";
    return "YouTube 需要额外解码服务，这里只做跳转";
  }
  function buildBilibiliEmbedUrl2(ids, page) {
    const spec = ids || {};
    if (typeof spec.bvid === "string" && BV_RE.test(spec.bvid)) {
      const p = Number.isInteger(page) && page > 0 ? page : 1;
      return `https://player.bilibili.com/player.html?bvid=${spec.bvid}&p=${p}&autoplay=1&danmaku=0&high_quality=1`;
    }
    if (spec.aid) {
      return `https://player.bilibili.com/player.html?aid=${String(spec.aid)}&autoplay=1&danmaku=0&high_quality=1`;
    }
    return null;
  }
  async function fetchJson(url, { fetchImpl: fetchImpl2, signal } = {}) {
    const doFetch = fetchImpl2 || (typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : null);
    if (!doFetch) throw new Error("当前环境没有 fetch");
    const response = await doFetch(url, {
      method: "GET",
      credentials: "same-origin",
      headers: { accept: "application/json" },
      signal
    });
    if (!response.ok) {
      let detail = "";
      try {
        const body = await response.json();
        detail = body && (body.message || body.code) ? `：${body.message || body.code}` : "";
      } catch (_error) {
      }
      throw new Error(`解析服务返回 HTTP ${response.status}${detail}`);
    }
    return await response.json();
  }
  async function resolveBilibili(url, { fetchImpl: fetchImpl2 } = {}) {
    const target = `${RESOLVE_PATH2}?url=${encodeURIComponent(url)}`;
    try {
      const body = await fetchJson(target, { fetchImpl: fetchImpl2 });
      if (!body || body.ok === false) {
        throw new Error(body && body.message || body && body.code || "解析服务返回失败");
      }
      const result = body.result || body;
      const tracks = Array.isArray(result.tracks) ? result.tracks : [];
      const track = tracks[0];
      if (!track) throw new Error(body && body.message || "解析结果没有曲目");
      return {
        ok: true,
        cid: track.cid,
        title: track.title || result.title,
        duration: typeof track.duration === "number" ? track.duration : void 0,
        streamOnly: track.streamOnly !== false,
        // 封面可能挂在 result 顶层（视频级 pic），也可能在 track 上；两处都认。
        cover: track.cover || result.cover || null
      };
    } catch (error) {
      return { ok: false, error: error && error.message ? error.message : String(error) };
    }
  }
  var MAX_PLATFORM_TRACKS = 200;
  function platformKeyOf(platform) {
    if (typeof platform !== "string") return null;
    if (platform.startsWith("netease")) return "netease";
    if (platform.startsWith("qq")) return "qq";
    if (platform.startsWith("youtube")) return "youtube";
    if (platform.startsWith("bilibili")) return "bilibili";
    return null;
  }
  async function resolvePlatform(url, { fetchImpl: fetchImpl2, limit } = {}) {
    const limitPart = Number.isFinite(Number(limit)) && Number(limit) > 0 ? `&limit=${Math.trunc(Number(limit))}` : "";
    const target = `${RESOLVE_PATH2}?url=${encodeURIComponent(url)}${limitPart}`;
    try {
      const body = await fetchJson(target, { fetchImpl: fetchImpl2 });
      if (!body || body.ok === false) {
        throw new Error(body && body.message || body && body.code || "解析服务返回失败");
      }
      const result = body.result || body;
      const tracks = Array.isArray(result.tracks) ? result.tracks : [];
      if (tracks.length === 0) throw new Error("解析结果没有曲目");
      return {
        ok: true,
        platform: result.platform || null,
        title: result.title || null,
        cover: result.cover || null,
        pageUrl: result.pageUrl || url,
        // scanned 是宿主的诊断值：扫了多少首候选才凑出这些。有了它才能如实说
        // 「跳过 12 首会员曲目」，而不是让用户以为歌单只有 30 首。
        scanned: Number.isFinite(Number(result.scanned)) ? Number(result.scanned) : null,
        tracks
      };
    } catch (error) {
      return { ok: false, error: error && error.message ? error.message : String(error) };
    }
  }
  async function intakeLinks(engine, text, deps = {}) {
    const urls = extractUrls(text);
    const report = { added: 0, skipped: 0, items: [], errors: [] };
    const playFirst = deps.playFirst !== false;
    const recorded = [];
    if (urls.length === 0) {
      report.errors.push("没认出链接：请粘贴以 http(s) 开头的 B站 / 网易云 / QQ音乐 地址，或直接拖入音频文件");
      return report;
    }
    if (!engine || typeof engine.addUrl !== "function") {
      report.errors.push("播放引擎未就绪");
      return report;
    }
    for (const url of urls) {
      const verdict = classifyUrl(url);
      try {
        if (verdict.route === "audio-direct") {
          await engine.addUrl(url, { playFirst });
          report.items.push({ url, route: verdict.route, added: true });
          report.added += 1;
          recorded.push({ url, platform: verdict.platform });
          continue;
        }
        if (verdict.route === "bilibili") {
          const resolved = await resolveBilibili(url, deps);
          const embedUrl = buildBilibiliEmbedUrl2(verdict.ids, verdict.ids && verdict.ids.page);
          const cid = resolved.ok ? toSafeCid(resolved.cid) : null;
          const title = resolved.title || (verdict.ids && verdict.ids.bvid ? `Bilibili ${verdict.ids.bvid}` : url);
          const cover = resolved.ok && typeof resolved.cover === "string" && resolved.cover ? resolved.cover : null;
          await engine.addBilibili({
            bvid: verdict.ids && verdict.ids.bvid,
            cid: cid === null ? void 0 : cid,
            page: verdict.ids && verdict.ids.page,
            title,
            duration: resolved.duration,
            embedUrl,
            cover,
            // 注意：unavailableReason 只描述「流代理主路为什么不可用」，
            // 不能因为解析失败就把整条曲目标成不可用 —— embedUrl 还在，照样能出声。
            unavailableReason: resolved.ok ? null : resolved.error || null
          }, { playFirst });
          report.items.push({ url, route: "bilibili", added: true, cid, title, note: resolved.ok ? null : resolved.error });
          report.added += 1;
          recorded.push({ url, title, platform: verdict.platform, kind: "bilibili" });
          continue;
        }
        if (verdict.route === "stream") {
          await engine.addUrl(`${STREAM_PATH2}?url=${encodeURIComponent(url)}`, { playFirst });
          report.items.push({ url, route: "stream", added: true });
          report.added += 1;
          recorded.push({ url, platform: verdict.platform });
          continue;
        }
        if (verdict.route === "platform") {
          const resolved = await resolvePlatform(url, deps);
          if (resolved.ok !== true) {
            report.skipped += 1;
            report.errors.push(`${url}：${resolved.error || "解析失败"}`);
            report.items.push({ url, route: "platform", added: false, note: resolved.error });
            continue;
          }
          const platformKey = platformKeyOf(resolved.platform || verdict.platform);
          const list = resolved.tracks.slice(0, MAX_PLATFORM_TRACKS);
          let firstOfBatch = report.added === 0;
          let addedHere = 0;
          let vipSkipped = 0;
          for (const track of list) {
            const streamPath = typeof track.streamPath === "string" && track.streamPath !== "" ? track.streamPath : null;
            if (streamPath === null) {
              vipSkipped += 1;
              continue;
            }
            await engine.addPlatform({
              streamPath,
              pageUrl: track.pageUrl || resolved.pageUrl || url,
              // 源歌单地址：票据 10 分钟过期，刷新后只能靠它重新解析。
              sourceUrl: url,
              title: track.title || resolved.title || url,
              artist: track.artist,
              duration: track.duration,
              platform: platformKey,
              id: track.id,
              // 逐曲封面优先；单曲链接时宿主把封面放在 result 顶层，回落到它。
              cover: typeof track.cover === "string" && track.cover !== "" ? track.cover : typeof resolved.cover === "string" && resolved.cover !== "" ? resolved.cover : void 0,
              reason: null
            }, { playFirst: playFirst && firstOfBatch });
            firstOfBatch = false;
            addedHere += 1;
            report.added += 1;
            recorded.push({
              url: track.pageUrl || url,
              title: track.title || resolved.title,
              platform: platformKey,
              kind: "platform"
            });
          }
          if (addedHere === 0) {
            report.skipped += 1;
            const why = vipSkipped > 0 ? `解析到 ${vipSkipped} 首但都需要会员，拿不到可播地址` : "解析结果里没有可播曲目";
            report.errors.push(`${url}：${why}`);
            report.items.push({ url, route: "platform", added: false, note: why });
            continue;
          }
          const notes = [];
          if (vipSkipped > 0) notes.push(`跳过 ${vipSkipped} 首会员曲目`);
          const truncated = resolved.tracks.length - list.length;
          if (truncated > 0) notes.push(`另有 ${truncated} 首未入队（一次最多 ${MAX_PLATFORM_TRACKS} 首）`);
          report.items.push({
            url,
            route: "platform",
            added: true,
            title: resolved.title || platformLabel2(verdict.platform),
            note: notes.length > 0 ? notes.join("，") : null
          });
          continue;
        }
        report.skipped += 1;
        report.errors.push(`${url}：${verdict.reason || "不受支持"}`);
        report.items.push({ url, route: verdict.route, added: false, note: verdict.reason });
      } catch (error) {
        report.skipped += 1;
        report.errors.push(`${url}：${describeError(error)}`);
        report.items.push({ url, route: verdict.route, added: false, note: describeError(error) });
      }
    }
    if (recorded.length > 0) {
      try {
        recordHistoryMany(recorded);
      } catch (_error) {
      }
    }
    return report;
  }
  function toSafeCid(value) {
    if (value === null || value === void 0) return null;
    const text = String(value).trim();
    if (!/^\d{1,20}$/.test(text)) return null;
    const num = Number(text);
    if (!Number.isSafeInteger(num) || num <= 0) return null;
    return text;
  }
  function platformLabel2(platform) {
    switch (platform) {
      case "netease-playlist":
        return "网易云歌单";
      case "netease-song":
      case "netease-track":
        return "网易云单曲";
      case "netease-album":
        return "网易云专辑";
      case "qq-playlist":
        return "QQ音乐歌单";
      case "qq-song":
      case "qq-track":
        return "QQ音乐单曲";
      case "qq-album":
        return "QQ音乐专辑";
      case "youtube-video":
        return "YouTube";
      default:
        return null;
    }
  }
  function summarizeReport(report) {
    if (!report) return "";
    const parts = [];
    if (report.added > 0) parts.push(`已加入 ${report.added} 条`);
    if (report.skipped > 0) parts.push(`跳过 ${report.skipped} 条`);
    const items = Array.isArray(report.items) ? report.items : [];
    const notes = items.filter((item) => item && item.added === true && typeof item.note === "string" && item.note !== "").map((item) => item.note);
    if (notes.length > 0) parts.push(`但：${notes[0]}`);
    if (report.errors.length > 0 && report.added === 0) parts.push(report.errors[0]);
    return parts.join("，");
  }
  function hasDegradedItem(report) {
    const items = report && Array.isArray(report.items) ? report.items : [];
    return items.some((item) => item && item.added === true && typeof item.note === "string" && item.note !== "");
  }

  // src/client/ui/ShellDock.js
  var COLLAPSE_KEY = `${PLUGIN_ID}:dock.collapsed`;
  var HIDDEN_KEY = `${PLUGIN_ID}:dock.hidden`;
  var SPECTRUM_MEMO_KEY = `${PLUGIN_ID}:spectrum.memo`;
  var BILIBILI_PROBE_URL = "https://www.bilibili.com/video/BV1Lyw7zPEeo/";
  function readFlag(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === "1") return true;
      if (raw === "0") return false;
    } catch (_error) {
    }
    return fallback;
  }
  function readFlagRaw(key) {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === "1") return true;
      if (raw === "0") return false;
    } catch (_error) {
    }
    return null;
  }
  function writeFlag(key, value) {
    try {
      window.localStorage.setItem(key, value ? "1" : "0");
    } catch (_error) {
    }
  }
  function readText(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (_error) {
      return null;
    }
  }
  function writeText(key, value) {
    try {
      window.localStorage.setItem(key, String(value));
    } catch (_error) {
    }
  }
  var QUEUE_KEY = `${PLUGIN_ID}:queue.v1`;
  var QUEUE_MAX = 200;
  function serializeTrack(track) {
    if (!track || typeof track !== "object") return null;
    const raw = track.raw || track;
    const record = {
      kind: track.kind || raw.kind || "",
      title: track.title || track.name || "",
      artist: track.artist || "",
      duration: typeof track.duration === "number" && Number.isFinite(track.duration) ? track.duration : null,
      category: track.category || raw.category || "",
      spectrumAvailable: track.spectrumAvailable !== false
    };
    const ticketPath = typeof raw.url === "string" && raw.url.startsWith("/api/dsh-music-on/stream") ? raw.url : null;
    const sourceUrl = typeof raw.sourceUrl === "string" && /^https?:\/\//i.test(raw.sourceUrl) ? raw.sourceUrl : null;
    if (sourceUrl !== null) {
      record.sourceUrl = sourceUrl;
      record.platform = typeof raw.platform === "string" ? raw.platform : "";
      if (typeof raw.pageUrl === "string" && raw.pageUrl !== "") record.pageUrl = raw.pageUrl;
    } else if (typeof raw.url === "string" && raw.url !== "" && ticketPath === null) {
      record.url = raw.url;
    } else if (typeof raw.pageUrl === "string" && raw.pageUrl !== "") {
      record.pageUrl = raw.pageUrl;
    }
    if (typeof raw.bvid === "string" && raw.bvid !== "") record.bvid = raw.bvid;
    if (typeof raw.embedUrl === "string" && raw.embedUrl !== "") record.embedUrl = raw.embedUrl;
    if (typeof raw.presetId === "string" && raw.presetId !== "") record.presetId = raw.presetId;
    if (typeof raw.cover === "string" && /^https:\/\//i.test(raw.cover)) record.cover = raw.cover;
    if (!record.url && !record.pageUrl && !record.bvid && !record.embedUrl) {
      record.missing = true;
    }
    return record;
  }
  function saveQueue(queue) {
    try {
      const list = (Array.isArray(queue) ? queue : []).map(serializeTrack).filter(Boolean).slice(0, QUEUE_MAX);
      window.localStorage.setItem(QUEUE_KEY, JSON.stringify(list));
    } catch (_error) {
    }
  }
  function loadQueue() {
    try {
      const raw = window.localStorage.getItem(QUEUE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === "object") : [];
    } catch (_error) {
      return [];
    }
  }
  function clearSavedQueue() {
    try {
      window.localStorage.removeItem(QUEUE_KEY);
    } catch (_error) {
    }
  }
  function fmtTime(sec) {
    if (typeof sec !== "number" || !Number.isFinite(sec) || sec < 0) return "--:--";
    const total = Math.floor(sec);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  }
  function displayDuration(state) {
    return state && state.mode === "external" ? NaN : state && state.duration;
  }
  function trackLabel(state, t) {
    const track = state && state.track;
    if (!track) return t("dock.idle", "未播放");
    return track.title || track.name || track.fileName || t("dock.untitled", "未命名");
  }
  function currentPageUrl(engine) {
    if (!engine || typeof engine.getState !== "function") return "";
    const snapshot = engine.getState();
    const track = snapshot && (snapshot.currentTrack || snapshot.track);
    return track && typeof track.pageUrl === "string" ? track.pageUrl : "";
  }
  function trackCover(state) {
    const track = state && state.track;
    const raw = track && (track.cover || track.coverUrl || track.artwork);
    if (typeof raw !== "string") return null;
    const url = raw.trim();
    if (url === "") return null;
    if (/^https:\/\//i.test(url)) return url;
    if (/^(blob:|data:image\/|\/)/i.test(url)) return url;
    return null;
  }
  var SIZE_ORDER = ["compact", "normal", "wide"];
  var SIZE_LABELS = { compact: "小", normal: "中", wide: "大" };
  var SIZE_GLYPHS = { compact: "▭", normal: "▭▭", wide: "▭▭▭" };
  function dockPositionStyle(pick, pos, live) {
    const point = live || pos;
    if (!point) return null;
    return { left: `${point.x}px`, top: `${point.y}px`, right: "auto", bottom: "auto" };
  }
  function playbackSurface(state) {
    const track = state && state.track;
    const embedUrl = track && typeof track.embedUrl === "string" && track.embedUrl !== "" ? track.embedUrl : null;
    const external = Boolean(embedUrl) || state && state.mode === "external";
    return { external, embedUrl };
  }
  function normalizeState(state) {
    const src = state || {};
    const status = typeof src.status === "string" ? src.status : "";
    const track = src.currentTrack || src.track || null;
    const position = typeof src.currentTime === "number" ? src.currentTime : typeof src.position === "number" ? src.position : 0;
    const trackDuration = track && typeof track.duration === "number" ? track.duration : NaN;
    const rawDuration = typeof src.duration === "number" ? src.duration : trackDuration;
    const duration = displayDuration({ ...src, track, duration: rawDuration });
    return {
      ...src,
      track,
      currentTrack: track,
      status,
      playing: src.playing === true || status === "playing",
      loading: status === "loading",
      busy: src.busy === true || status === "loading" || status === "switching",
      position,
      currentTime: position,
      duration
    };
  }
  function createShellDock(props) {
    const { engine, store, t } = props;
    const { useState: useState5, useEffect: useEffect6, useRef: useRef4, useCallback: useCallback4, useMemo: useMemo4, createElement: h6 } = props.React;
    return function ShellDock() {
      const settings = useStoreSnapshot(props.React, store);
      const [collapsed, setCollapsed] = useState5(() => {
        const manual = readFlagRaw(COLLAPSE_KEY);
        if (manual !== null) return manual;
        return settings ? settings.startCollapsed !== false : true;
      });
      const [hidden, setHidden] = useState5(() => readFlag(HIDDEN_KEY, false));
      const [state, setState] = useState5(() => normalizeState(engine && engine.getState ? engine.getState() : {}));
      const [queue, setQueue] = useState5(() => engine && engine.getQueue ? engine.getQueue() : []);
      const [draft, setDraft] = useState5("");
      const [busy, setBusy] = useState5(false);
      const [note, setNote] = useState5(null);
      const [dragging, setDragging] = useState5(false);
      const [favOn, setFavOn] = useState5(() => {
        const url = currentPageUrl(engine);
        return url === "" ? false : isFavorite(url);
      });
      const [peekSpectrum, setPeekSpectrum] = useState5(false);
      useEffect6(() => {
        if (!peekSpectrum) return void 0;
        const timer = window.setTimeout(() => setPeekSpectrum(false), 3e3);
        return () => window.clearTimeout(timer);
      }, [peekSpectrum]);
      const dragDepth = useRef4(0);
      const knobRef = useRef4(null);
      const knobDragRef = useRef4(null);
      const knobListenersRef = useRef4(null);
      const onKnobUpRef = useRef4(null);
      const volumeRef = useRef4(typeof settings.volume === "number" ? settings.volume : 0.8);
      const knobMovedRef = useRef4(false);
      const lastLoudRef = useRef4(0.8);
      const [knobValue, setKnobValue] = useState5(volumeRef.current);
      const [knobDragging, setKnobDragging] = useState5(false);
      const spectrumCfg = {
        style: settings.spectrumStyle || "bars",
        fps: settings.spectrumFps || 60,
        bars: settings.spectrumBars || 48,
        gain: typeof settings.spectrumGain === "number" ? settings.spectrumGain : 1,
        glow: settings.spectrumGlow || "soft",
        height: settings.spectrumHeight || 64
      };
      const spectrumStyle = spectrumCfg.style;
      const spectrumPlacement = settings.spectrumPlacement || "bar";
      const spectrumDepth = settings.spectrumDepth === "back" ? "back" : "front";
      const spectrumPeek = spectrumDepth === "back" && peekSpectrum;
      const dockSize = settings.dockSize || "normal";
      const showTitles = settings.showTitles !== false;
      const autoplayTarget = settings.autoplayTarget || "both";
      const autoOn = settings.allowAutoplay !== false && autoplayTarget !== "off";
      const autoLinks = autoOn && (autoplayTarget === "both" || autoplayTarget === "link");
      const autoFiles = autoOn && (autoplayTarget === "both" || autoplayTarget === "file");
      const trackLimit = Number.isFinite(Number(settings.platformTrackLimit)) ? Number(settings.platformTrackLimit) : 60;
      useEffect6(() => {
        if (!engine || typeof engine.onStateChange !== "function") return void 0;
        const offTime = typeof engine.onTimeUpdate === "function" ? engine.onTimeUpdate((tick) => {
          const time = tick && typeof tick === "object" ? tick.currentTime : tick;
          if (typeof time !== "number" || !Number.isFinite(time)) return;
          setState((prev) => normalizeState({
            ...prev,
            currentTime: time,
            duration: tick && typeof tick.duration === "number" ? tick.duration : prev.duration
          }));
        }) : void 0;
        const offState = engine.onStateChange((next) => setState(normalizeState(next || {})));
        const offTrack = typeof engine.onTrackChange === "function" ? engine.onTrackChange(() => setState(normalizeState(engine.getState ? engine.getState() : {}))) : void 0;
        const offQueue = typeof engine.onQueueChange === "function" ? engine.onQueueChange((next) => {
          if (Array.isArray(next)) setQueue(next);
          else if (next && Array.isArray(next.items)) setQueue(next.items);
          else setQueue([]);
        }) : void 0;
        const offError = typeof engine.onError === "function" ? engine.onError((error) => {
          const text = error && error.message ? error.message : String(error);
          setNote({ tone: "bad", text });
        }) : void 0;
        if (typeof engine.getState === "function") setState(normalizeState(engine.getState()));
        if (typeof engine.getQueue === "function") {
          const initial = engine.getQueue();
          setQueue(Array.isArray(initial) ? initial : initial && Array.isArray(initial.items) ? initial.items : []);
        }
        return () => {
          if (offTime) offTime();
          if (offState) offState();
          if (offTrack) offTrack();
          if (offQueue) offQueue();
          if (offError) offError();
        };
      }, []);
      useEffect6(() => {
        writeFlag(COLLAPSE_KEY, collapsed);
      }, [collapsed]);
      useEffect6(() => {
        writeFlag(HIDDEN_KEY, hidden);
      }, [hidden]);
      const [pos, setPos] = useState5(() => {
        const sx = settings.dockX;
        const sy = settings.dockY;
        return typeof sx === "number" && typeof sy === "number" ? { x: sx, y: sy } : null;
      });
      const [holding, setHolding] = useState5(() => {
        const sx = settings.dockX;
        const sy = settings.dockY;
        return typeof sx === "number" && typeof sy === "number";
      });
      const dragRef = useRef4(null);
      const posRef = useRef4(pos);
      posRef.current = pos;
      const liveRef = useRef4(null);
      const holdingRef = useRef4(false);
      const stackRef = useRef4(null);
      const collapsedHandleRef = useRef4(null);
      const stageHandleRef = useRef4(null);
      const panelRef = useRef4(null);
      const commitPos = useCallback4((next) => {
        if (!store || typeof store.patch !== "function") return;
        store.patch("dockX", next ? next.x : null);
        store.patch("dockY", next ? next.y : null);
      }, [store]);
      const clampToViewport = useCallback4((x, y) => {
        const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
        const vh = typeof window !== "undefined" ? window.innerHeight : 800;
        const el = panelRef.current || stackRef.current;
        const w = el && el.offsetWidth ? el.offsetWidth : 320;
        const hgt = el && el.offsetHeight ? el.offsetHeight : 64;
        const margin = 40;
        const maxX = Math.max(margin, vw - w);
        const maxY = Math.max(margin, vh - hgt);
        return {
          x: Math.round(Math.min(Math.max(-(w - margin), x), maxX)),
          y: Math.round(Math.min(Math.max(0, y), maxY))
        };
      }, []);
      const applyPos = useCallback4((next) => {
        const point = { x: next.x, y: next.y };
        liveRef.current = point;
        const wasHolding = holdingRef.current;
        holdingRef.current = true;
        const el = stackRef.current || panelRef.current;
        if (el && el.style) {
          el.style.left = `${point.x}px`;
          el.style.top = `${point.y}px`;
          el.style.right = "auto";
          el.style.bottom = "auto";
        }
        if (!wasHolding) setHolding(true);
      }, []);
      const dragListenersRef = useRef4(null);
      const suppressClickRef = useRef4(false);
      const detachDragListeners = useCallback4(() => {
        const off = dragListenersRef.current;
        dragListenersRef.current = null;
        if (!off || typeof window === "undefined") return;
        window.removeEventListener("pointermove", off.move);
        window.removeEventListener("pointerup", off.up);
        window.removeEventListener("pointercancel", off.up);
      }, []);
      const stepDrag = useCallback4((event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const next = clampToViewport(event.clientX - drag.grabX, event.clientY - drag.grabY);
        if (!drag.moved) {
          if (Math.abs(event.clientX - drag.startX) < 4 && Math.abs(event.clientY - drag.startY) < 4) return;
          drag.moved = true;
          suppressClickRef.current = true;
          setDragging(true);
          setHolding(true);
          holdingRef.current = true;
        }
        drag.last = next;
        applyPos(next);
      }, [applyPos, clampToViewport]);
      const finishDrag = useCallback4((event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        dragRef.current = null;
        detachDragListeners();
        setDragging(false);
        if (drag.moved) {
          if (typeof setTimeout === "function") {
            setTimeout(() => {
              suppressClickRef.current = false;
            }, 0);
          }
        }
        if (drag.moved && drag.last) {
          liveRef.current = { x: drag.last.x, y: drag.last.y };
          setPos(drag.last);
          commitPos(drag.last);
        } else {
          holdingRef.current = false;
          liveRef.current = null;
          setHolding(false);
        }
      }, [commitPos, detachDragListeners]);
      const onDragStart = useCallback4((event) => {
        if (event.button !== 0) return;
        const panel2 = stackRef.current || panelRef.current || event.currentTarget;
        if (!panel2 || typeof panel2.getBoundingClientRect !== "function") return;
        const rect = panel2.getBoundingClientRect();
        if (dragRef.current && dragRef.current.pointerId === event.pointerId) return;
        detachDragListeners();
        dragRef.current = {
          pointerId: event.pointerId,
          // 指针相对盒子左上角的偏移 —— 拖动时保持这个偏移，盒子才会「跟手」。
          grabX: event.clientX - rect.left,
          grabY: event.clientY - rect.top,
          moved: false,
          startX: event.clientX,
          startY: event.clientY,
          origin: { x: rect.left, y: rect.top },
          panel: panel2
        };
        if (typeof window !== "undefined") {
          dragListenersRef.current = { move: stepDrag, up: finishDrag };
          window.addEventListener("pointermove", stepDrag);
          window.addEventListener("pointerup", finishDrag);
          window.addEventListener("pointercancel", finishDrag);
        }
      }, [detachDragListeners, stepDrag, finishDrag]);
      const onDragMove = useCallback4((event) => {
        stepDrag(event);
      }, [stepDrag]);
      const onDragEnd = useCallback4((event) => {
        finishDrag(event);
      }, [finishDrag]);
      const swallowClickAfterDrag = useCallback4((event) => {
        if (!suppressClickRef.current) return;
        suppressClickRef.current = false;
        event.preventDefault();
        event.stopPropagation();
      }, []);
      useEffect6(() => () => detachDragListeners(), [detachDragListeners]);
      useEffect6(() => {
        const sync = () => {
          const url = currentPageUrl(engine);
          setFavOn(url === "" ? false : isFavorite(url));
        };
        sync();
        return subscribeLibrary(sync);
      }, [engine, state.track]);
      const toggleFav = useCallback4(() => {
        const track = state.track;
        const url = track && typeof track.pageUrl === "string" ? track.pageUrl : "";
        if (url === "") {
          flash(t("dock.favNoUrl", "当前曲目没有可收藏的链接地址"));
          return;
        }
        const result = toggleFavorite(entryFrom(url, {
          title: track.title,
          platform: track.kind === "external-embed" ? "bilibili" : void 0
        }));
        setFavOn(result.favorited === true);
        flash(result.favorited === true ? t("dock.favorited", "已收藏") : t("dock.unfavorited", "已取消收藏"));
      }, [state.track, t]);
      const onDragReset = useCallback4(() => {
        dragRef.current = null;
        holdingRef.current = false;
        liveRef.current = null;
        setHolding(false);
        setDragging(false);
        setPos(null);
        for (const el of [stackRef.current, panelRef.current]) {
          if (!el || !el.style) continue;
          el.style.left = "";
          el.style.top = "";
          el.style.right = "";
          el.style.bottom = "";
        }
        commitPos(null);
      }, [commitPos]);
      useEffect6(() => {
        if (!pos) return void 0;
        const handle = () => {
          setPos((prev) => prev ? clampToViewport(prev.x, prev.y) : prev);
        };
        window.addEventListener("resize", handle);
        return () => window.removeEventListener("resize", handle);
      }, [pos, clampToViewport]);
      const queueReadyRef = useRef4(false);
      useEffect6(() => {
        if (!settings.rememberQueue) return;
        if (!queueReadyRef.current) {
          queueReadyRef.current = true;
          return;
        }
        saveQueue(queue);
      }, [queue, settings.rememberQueue]);
      useEffect6(() => {
        if (note === null) return void 0;
        const ttl = note.tone === "bad" ? 15e3 : 4e3;
        const timer = window.setTimeout(() => setNote(null), ttl);
        return () => window.clearTimeout(timer);
      }, [note]);
      const guard = useCallback4((fn) => async (...args) => {
        try {
          await fn(...args);
        } catch (error) {
          setNote({ tone: "bad", text: error && error.message ? error.message : String(error) });
        }
      }, []);
      const flashRef = useRef4(setNote);
      flashRef.current = setNote;
      const flash = useCallback4((text) => {
        flashRef.current({ tone: "ok", text });
      }, []);
      const togglePlay = guard(async () => {
        if (!engine) return;
        await engine.toggle();
      });
      const restoredRef = useRef4(false);
      useEffect6(() => {
        if (restoredRef.current) return;
        if (!engine || typeof engine.addUrl !== "function") return;
        restoredRef.current = true;
        if (!settings.rememberQueue) return;
        const current = typeof engine.getQueue === "function" ? engine.getQueue() : [];
        const currentCount = Array.isArray(current) ? current.length : current && Array.isArray(current.items) ? current.items.length : 0;
        if (currentCount > 0) return;
        const saved = loadQueue();
        if (saved.length === 0) return;
        const run = async () => {
          let restored = 0;
          let deadTickets = 0;
          const bySource = /* @__PURE__ */ new Map();
          for (const item of saved) {
            if (!item || item.missing) continue;
            const src = typeof item.sourceUrl === "string" ? item.sourceUrl : null;
            if (src === null) continue;
            if (!bySource.has(src)) bySource.set(src, []);
            bySource.get(src).push(item);
          }
          for (const [src, wanted] of bySource) {
            let resolved = null;
            try {
              resolved = await resolvePlatform(src, { limit: trackLimit });
            } catch (_error) {
              resolved = null;
            }
            if (resolved === null || resolved.ok !== true) {
              deadTickets += wanted.length;
              continue;
            }
            const pool = Array.isArray(resolved.tracks) ? resolved.tracks : [];
            for (const item of wanted) {
              const match = pool.find((t2) => typeof t2.pageUrl === "string" && t2.pageUrl === item.pageUrl) || pool.find((t2) => item.title && t2.title === item.title);
              if (!match || typeof match.streamPath !== "string" || match.streamPath === "") {
                deadTickets += 1;
                continue;
              }
              try {
                await engine.addPlatform({
                  streamPath: match.streamPath,
                  pageUrl: match.pageUrl || item.pageUrl,
                  sourceUrl: src,
                  title: match.title || item.title,
                  artist: match.artist,
                  duration: match.duration,
                  platform: item.platform,
                  id: match.id,
                  cover: match.cover,
                  reason: null
                }, { playFirst: false });
                restored += 1;
              } catch (_error) {
                deadTickets += 1;
              }
            }
          }
          for (const item of saved) {
            if (!item || item.missing || item.sourceUrl) continue;
            try {
              if (item.embedUrl && typeof engine.addEmbed === "function") {
                await engine.addEmbed(item.embedUrl, { playFirst: false, title: item.title });
              } else if (item.url || item.pageUrl) {
                await engine.addUrl(item.url || item.pageUrl, { playFirst: false });
              } else if (item.bvid && typeof engine.addBilibili === "function") {
                await engine.addBilibili({ bvid: item.bvid, title: item.title }, { playFirst: false });
              } else {
                continue;
              }
              restored += 1;
            } catch (_error) {
            }
          }
          if (restored > 0) {
            const extra = deadTickets > 0 ? t("dock.queueRestoredPartial", { count: deadTickets }) : "";
            flash(t("dock.queueRestored", `已恢复上次的播放列表（${restored} 条）`) + extra);
          } else if (deadTickets > 0) {
            flashRef.current({
              tone: "bad",
              text: t("dock.queueRestoreFailed", `上次的 ${deadTickets} 条平台曲目需要重新解析，请重新粘贴歌单链接`)
            });
          }
        };
        void run();
      }, [engine, settings.rememberQueue, flash, t, trackLimit]);
      const closeEmbed = guard(async () => {
        setEmbedDismissed(true);
        if (engine) {
          try {
            if (typeof engine.pause === "function") await engine.pause();
          } catch (error) {
            void error;
          }
        }
        flash(t("dock.embedClosed", "外部播放器已关闭，可在播放列表里重新打开"));
      });
      const addFiles = useCallback4(async (files) => {
        if (!engine || !files || files.length === 0) return;
        setBusy(true);
        try {
          const result = await engine.addFiles(files, { playFirst: autoFiles });
          setNote({ tone: "ok", text: autoFiles ? t("dock.added", "已加入并开始播放") : t("dock.queued", "已加入队列，按播放键开始") });
          void result;
        } catch (error) {
          setNote({ tone: "bad", text: error && error.message ? error.message : String(error) });
        } finally {
          setBusy(false);
        }
      }, [engine, t, autoFiles]);
      const runSelfCheck = useCallback4(async () => {
        setBusy(true);
        try {
          const target = "/api/dsh-music-on/resolve?url=" + encodeURIComponent(BILIBILI_PROBE_URL);
          let line = "";
          try {
            const res = await fetch(target, { credentials: "same-origin", headers: { accept: "application/json" } });
            let head = "";
            try {
              const text = await res.text();
              head = text.slice(0, 120).replace(/\s+/g, " ");
            } catch (_error) {
              head = "(响应体不可读)";
            }
            line = `解析 HTTP ${res.status}｜${head}`;
          } catch (error) {
            line = `解析请求失败：${error && error.message ? error.message : String(error)}`;
          }
          setNote({ tone: "bad", text: line });
        } finally {
          setBusy(false);
        }
      }, []);
      const submitLink = useCallback4(async () => {
        const text = draft.trim();
        if (!text) return;
        setBusy(true);
        try {
          const report = await intakeLinks(engine, text, { playFirst: autoLinks, limit: trackLimit });
          if (report.added > 0) {
            setDraft("");
            const degraded = hasDegradedItem(report);
            const firstTitle = (Array.isArray(report.items) ? report.items : []).map((item) => item && (item.title || item.name) || "").find((title) => title !== "");
            const summary = summarizeReport(report);
            setNote({ tone: degraded ? "bad" : "ok", text: firstTitle ? `${summary} · ${firstTitle}` : summary });
            const state2 = engine.getState ? engine.getState() : null;
            if (state2 && state2.autoplayBlocked === true) {
              setNote({ tone: "bad", text: t("dock.autoplayBlocked", "已就绪，点一下播放键出声") });
            }
          } else {
            setNote({ tone: "bad", text: summarizeReport(report) });
          }
        } catch (error) {
          setNote({ tone: "bad", text: error && error.message ? error.message : String(error) });
        } finally {
          setBusy(false);
        }
      }, [draft, engine, t, autoLinks, trackLimit]);
      const onDragEnter = useCallback4((event) => {
        if (!event.dataTransfer) return;
        const types = Array.from(event.dataTransfer.types || []);
        if (!types.includes("Files")) return;
        event.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }, []);
      const onDragOver = useCallback4((event) => {
        if (!event.dataTransfer) return;
        const types = Array.from(event.dataTransfer.types || []);
        if (!types.includes("Files")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }, []);
      const onDragLeave = useCallback4(() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }, []);
      const onDrop = useCallback4((event) => {
        if (!event.dataTransfer) return;
        event.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        const files = Array.from(event.dataTransfer.files || []).filter(
          (f) => typeof f.type === "string" && (f.type.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|flac|aac|opus|webm)$/i.test(f.name))
        );
        if (files.length === 0) {
          setNote({ tone: "bad", text: t("dock.notAudio", "只接受音频文件") });
          return;
        }
        void addFiles(files);
      }, [addFiles, t]);
      const onSeek = useCallback4((event) => {
        const value = Number(event.target.value);
        if (!Number.isFinite(value) || !engine) return;
        try {
          engine.seek(value);
        } catch (_error) {
        }
      }, []);
      const applyVolume = useCallback4((next, commit) => {
        const raw = Number(next);
        if (!Number.isFinite(raw)) return;
        const value = Math.min(1, Math.max(0, raw));
        volumeRef.current = value;
        setKnobValue(value);
        if (engine && typeof engine.setVolume === "function") {
          try {
            engine.setVolume(value);
          } catch (_error) {
          }
        }
        if (commit === true && store && typeof store.patch === "function") {
          try {
            store.patch("volume", Math.round(value * 100) / 100);
          } catch (_error) {
          }
        }
      }, [engine, store]);
      useEffect6(() => {
        const next = typeof settings.volume === "number" ? settings.volume : 0.8;
        if (Math.abs(next - volumeRef.current) > 5e-3) {
          volumeRef.current = next;
          setKnobValue(next);
        }
      }, [settings.volume]);
      const stepVolume = useCallback4((deltaSteps) => {
        const steps = Number(deltaSteps);
        if (!Number.isFinite(steps) || steps === 0) return;
        applyVolume(volumeRef.current + steps * 0.05, true);
      }, [applyVolume]);
      const stepKnob = useCallback4((event) => {
        const drag = knobDragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const dy = event.clientY - drag.startY;
        if (!drag.moved && Math.abs(dy) >= 2) drag.moved = true;
        applyVolume(drag.startValue - dy / 130, false);
      }, [applyVolume]);
      const detachKnobListeners = useCallback4(() => {
        const listeners2 = knobListenersRef.current;
        if (!listeners2 || typeof window === "undefined") return;
        window.removeEventListener("pointermove", listeners2.move);
        window.removeEventListener("pointerup", listeners2.up);
        window.removeEventListener("pointercancel", listeners2.up);
        knobListenersRef.current = null;
      }, []);
      const onKnobDown = useCallback4((event) => {
        if (event.button !== 0) return;
        if (knobDragRef.current) return;
        detachKnobListeners();
        knobDragRef.current = {
          pointerId: event.pointerId,
          startY: event.clientY,
          startValue: volumeRef.current,
          moved: false
        };
        setKnobDragging(true);
        event.preventDefault();
        if (typeof window !== "undefined") {
          const up = () => {
            onKnobUpRef.current();
          };
          knobListenersRef.current = { move: stepKnob, up };
          window.addEventListener("pointermove", stepKnob);
          window.addEventListener("pointerup", up);
          window.addEventListener("pointercancel", up);
        }
      }, [detachKnobListeners, stepKnob]);
      const onKnobMove = useCallback4((event) => {
        stepKnob(event);
      }, [stepKnob]);
      const onKnobUp = useCallback4(() => {
        const drag = knobDragRef.current;
        if (!drag) return;
        knobDragRef.current = null;
        setKnobDragging(false);
        detachKnobListeners();
        knobMovedRef.current = drag.moved;
        applyVolume(volumeRef.current, true);
      }, [applyVolume, detachKnobListeners]);
      onKnobUpRef.current = onKnobUp;
      useEffect6(() => () => detachKnobListeners(), [detachKnobListeners]);
      const onKnobKeys = useCallback4((event) => {
        const map = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 4, PageDown: -4 };
        if (event.key === "Home") {
          event.preventDefault();
          applyVolume(0, true);
          return;
        }
        if (event.key === "End") {
          event.preventDefault();
          applyVolume(1, true);
          return;
        }
        const steps = map[event.key];
        if (!steps) return;
        event.preventDefault();
        stepVolume(steps);
      }, [applyVolume, stepVolume]);
      const onKnobClick = useCallback4(() => {
        if (knobMovedRef.current) {
          knobMovedRef.current = false;
          return;
        }
        if (volumeRef.current <= 1e-3) applyVolume(lastLoudRef.current, true);
        else {
          lastLoudRef.current = volumeRef.current > 0 ? volumeRef.current : 0.8;
          applyVolume(0, true);
        }
      }, [applyVolume]);
      useEffect6(() => {
        const node = knobRef.current;
        if (!node || typeof node.addEventListener !== "function") return void 0;
        const onWheel = (event) => {
          event.preventDefault();
          const dir = event.deltaY > 0 ? -1 : event.deltaY < 0 ? 1 : 0;
          if (dir !== 0) stepVolume(dir);
        };
        node.addEventListener("wheel", onWheel, { passive: false });
        return () => node.removeEventListener("wheel", onWheel);
      }, [stepVolume, collapsed, hidden]);
      const toggleSpectrum = useCallback4(() => {
        if (!store || typeof store.patch !== "function") {
          setNote({ tone: "bad", text: t("dock.noStore", "设置存储不可用，频谱开关不能落盘") });
          return;
        }
        try {
          if (spectrumStyle !== "off") {
            writeText(SPECTRUM_MEMO_KEY, spectrumStyle);
            store.patch("spectrumStyle", "off");
          } else {
            const back = readText(SPECTRUM_MEMO_KEY);
            store.patch("spectrumStyle", back && back !== "off" ? back : "bars");
          }
          flash(spectrumStyle === "off" ? t("dock.spectrumTurnedOn", "频谱已打开") : t("dock.spectrumTurnedOff", "频谱已关闭"));
        } catch (error) {
          setNote({ tone: "bad", text: error && error.message ? error.message : String(error) });
        }
      }, [spectrumStyle, flash]);
      useEffect6(() => {
        if (spectrumStyle !== "off") writeText(SPECTRUM_MEMO_KEY, spectrumStyle);
      }, [spectrumStyle]);
      const cycleSize = useCallback4(() => {
        if (!store || typeof store.patch !== "function") return;
        const index = SIZE_ORDER.indexOf(dockSize);
        const next = SIZE_ORDER[(index + 1) % SIZE_ORDER.length] || "normal";
        try {
          store.patch("dockSize", next);
          flash(`${t("dock.sizeNow", "大小")}：${SIZE_LABELS[next]}`);
        } catch (error) {
          setNote({ tone: "bad", text: error && error.message ? error.message : String(error) });
        }
      }, [dockSize, flash]);
      const spectrumOn = spectrumStyle !== "off";
      const playing = Boolean(state && state.playing);
      const duration = displayDuration(state);
      const position = state && typeof state.position === "number" ? state.position : 0;
      const external = Boolean(state && state.external);
      const [embedDismissed, setEmbedDismissed] = useState5(false);
      const embedKeyRef = useRef4(null);
      if (external) {
        const key = state && state.embedUrl || state && state.track && state.track.id || "external";
        if (embedKeyRef.current !== key) {
          embedKeyRef.current = key;
          if (embedDismissed) setEmbedDismissed(false);
        }
      }
      const surface = playbackSurface(state);
      const seekPercent = Number.isFinite(duration) && duration > 0 && Number.isFinite(position) ? Math.min(100, Math.max(0, position / duration * 100)) : 0;
      const knobAngle = -135 + 270 * Math.min(1, Math.max(0, knobValue));
      const knob = h6(
        "div",
        {
          ref: knobRef,
          className: "dmo-knob",
          role: "slider",
          tabIndex: 0,
          "aria-label": t("dock.volume", "音量"),
          "aria-valuemin": 0,
          "aria-valuemax": 100,
          "aria-valuenow": Math.round(knobValue * 100),
          "aria-valuetext": `${Math.round(knobValue * 100)}%`,
          title: t("dock.volumeHint", "滚轮或拖动调节，单击静音"),
          "data-muted": knobValue <= 1e-3 ? "1" : void 0,
          "data-dragging": knobDragging ? "1" : void 0,
          // 两条 conic-gradient 的起止角度都从这里进 CSS 变量，避免在样式表里
          // 重复写死 270° 行程（改行程只改这一个数）。
          style: {
            "--dmo-knob-angle": `${knobAngle}deg`,
            "--dmo-knob-sweep": `${270 * Math.min(1, Math.max(0, knobValue))}deg`
          },
          onPointerDown: onKnobDown,
          onPointerMove: onKnobMove,
          onPointerUp: onKnobUp,
          onPointerCancel: onKnobUp,
          onClick: onKnobClick,
          onKeyDown: onKnobKeys
        },
        h6("span", { className: "dmo-knob-arc", "aria-hidden": "true" }),
        h6(
          "span",
          { className: "dmo-knob-cap", "aria-hidden": "true" },
          h6("span", { className: "dmo-knob-pointer", "aria-hidden": "true" })
        ),
        h6(
          "span",
          { className: "dmo-knob-readout", "aria-hidden": "true" },
          knobValue <= 1e-3 ? "静音" : `${Math.round(knobValue * 100)}`
        )
      );
      const loopButton = h6("button", {
        type: "button",
        className: "dmo-chip",
        title: t("dock.loop", "循环模式"),
        onClick: () => guard(async () => engine.cycleLoopMode())()
      }, state && state.loopMode || "off");
      const blockedReason = state && state.track && typeof state.track.unavailableReason === "string" && state.track.unavailableReason !== "" ? state.track.unavailableReason : null;
      const panelClass = [
        "dmo-dock",
        collapsed ? "dmo-dock--collapsed" : "dmo-dock--expanded",
        dragging ? "dmo-dock--dragging" : "",
        `dmo-dock--size-${dockSize}`,
        showTitles ? "" : "dmo-dock--no-titles"
      ].filter(Boolean).join(" ");
      const stackStyle = dockPositionStyle(holding, pos, liveRef.current);
      const wrapStack = (...children) => h6("div", {
        className: "dmo-dock-stack",
        ref: stackRef,
        style: stackStyle,
        "data-depth": spectrumDepth
      }, ...children);
      const spectrumBar = spectrumPlacement === "bar" && engine && spectrumStyle !== "off" ? h6("div", {
        className: "dmo-barspectrum",
        "data-style": spectrumStyle,
        "data-glow": spectrumCfg.glow,
        "data-depth": spectrumPeek ? "peek" : spectrumDepth,
        // 通栏频谱走 fixed 贴视口底沿，本来就**不**跟随胶囊位置：
        // 它是「页面底部」的装饰，胶囊挪到哪儿它都该留在底部。
        // 这里绝不能引用 .dmo-dock-stack 的坐标，也不能改成 absolute。
        style: { height: `${spectrumCfg.height}px` }
      }, props.Spectrum ? h6(props.Spectrum, { engine, settings: { ...settings, ...spectrumCfg } }) : null) : null;
      if (hidden) {
        return wrapStack(h6("button", {
          type: "button",
          className: "dmo-dock-revive",
          title: t("dock.show", "显示音乐库"),
          "aria-label": t("dock.show", "显示音乐库"),
          onClick: () => setHidden(false)
        }, "♪"), spectrumBar);
      }
      if (collapsed) {
        return wrapStack(h6(
          "div",
          {
            ref: panelRef,
            className: panelClass,
            "data-dragging": dragging ? "1" : void 0,
            // 整枚胶囊都是拖动面。
            //
            // 之前只把手柄（左侧黑胶）当拖动面，用户实际按的是胶囊身上的空白与文字区，
            // 那些地方没有 pointerdown，于是「怎么拖都不动」。把 pointer 事件挂到整枚
            // 胶囊上，再用 4px 死区区分「点」与「拖」：位移没超死区就当点击透传，
            // 超了就当拖动。这样既不用猜用户按哪儿，也不破坏展开按钮。
            onPointerDown: onDragStart,
            onPointerMove: onDragMove,
            onPointerUp: onDragEnd,
            onPointerCancel: onDragEnd,
            // 拖完落手时浏览器合成的 click 在这里被拦下（捕获阶段），
            // 否则指针停在哪个按钮上就会触发哪个按钮 —— 最常见的表现是「一拖就把卡片拖开了」。
            onClickCapture: swallowClickAfterDrag,
            onDragEnter,
            onDragOver,
            onDragLeave,
            onDrop
          },
          h6(
            "div",
            { className: "dmo-capsule" },
            // 黑胶只是视觉与双击复位入口：pointerdown 已经上移到整枚胶囊，
            // 这里再挂一次会让同一次按下触发两遍 onDragStart（第二次把 grabX 覆盖成
            // 相对手柄的偏移），所以只在手柄上保留双击复位。
            h6("span", {
              className: "dmo-drag-handle",
              title: t("dock.dragHint", "拖动移动位置，双击复位"),
              "aria-hidden": true,
              ref: collapsedHandleRef,
              onDoubleClick: onDragReset
            }, h6(
              "span",
              { className: "dmo-vinyl", "data-playing": playing ? "1" : void 0, "data-cover": trackCover(state) ? "1" : void 0 },
              trackCover(state) ? h6("img", { className: "dmo-vinyl-cover", src: trackCover(state), alt: "", draggable: false, onError: (e) => {
                const el = e.currentTarget;
                el.style.display = "none";
              } }) : null,
              h6("span", { className: "dmo-vinyl-label" }, playing ? "♫" : "♪")
            )),
            h6(
              "button",
              {
                type: "button",
                className: "dmo-capsule-main",
                title: t("dock.expand", "展开音乐库"),
                "aria-expanded": false,
                onClick: () => setCollapsed(false)
              },
              h6(
                "span",
                { className: "dmo-capsule-text" },
                h6("span", { className: "dmo-capsule-name" }, trackLabel(state, t)),
                h6("span", { className: "dmo-capsule-meta" }, `${fmtTime(position)} / ${fmtTime(duration)}`)
              )
            ),
            // 频谱一键开关就放在胶囊上：用户看着频谱动，想关掉时不该被迫先展开卡片。
            h6("button", {
              type: "button",
              className: "dmo-capsule-spectrum",
              "data-on": spectrumOn ? "1" : void 0,
              title: spectrumOn ? t("dock.spectrumOff", "关闭频谱") : t("dock.spectrumOn", "打开频谱"),
              "aria-label": spectrumOn ? t("dock.spectrumOff", "关闭频谱") : t("dock.spectrumOn", "打开频谱"),
              "aria-pressed": spectrumOn,
              onClick: (event) => {
                event.stopPropagation();
                toggleSpectrum();
              }
            }, spectrumOn ? "≋" : "∅"),
            h6("button", {
              type: "button",
              className: "dmo-capsule-btn",
              title: playing ? t("dock.pause", "暂停") : t("dock.play", "播放"),
              "aria-label": playing ? t("dock.pause", "暂停") : t("dock.play", "播放"),
              onClick: (event) => {
                event.stopPropagation();
                void togglePlay();
              }
            }, playing ? "❚❚" : "▶"),
            h6("span", { className: "dmo-capsule-dot", "data-busy": busy ? "1" : void 0 }),
            // 收起态也要能看见提示：切换频谱的确认、拖放的拒绝原因都落在这里。
            note ? h6("span", { className: `dmo-capsule-note dmo-note--${note.tone}`, title: note.text }, note.text) : null
          ),
          dragging ? h6("div", { className: "dmo-dock-dropveil" }, t("dock.dropHere", "松手即播放")) : null
        ), spectrumBar);
      }
      const panel = h6(
        "div",
        {
          ref: panelRef,
          className: panelClass,
          "data-dragging": dragging ? "1" : void 0,
          // 展开态同理：拖动面是卡片顶部的黑胶舞台，但卡片里全是按钮
          // （播放/上一首/下一首/循环/自检/队列行）。拖完落手若指针正停在其中
          // 一个按钮上，浏览器会把 click 派给「按下与松手的共同祖先」——
          // 对舞台内起拖、舞台外松手的情况，那个祖先正是这张卡片。
          // 在卡片上挂捕获阶段的抑制器，一次盖住所有子按钮。
          onClickCapture: swallowClickAfterDrag,
          onDragEnter,
          onDragOver,
          onDragLeave,
          onDrop
        },
        // 外部播放器舞台。放在卡片内地平线上方，宽高由 CSS 控制；
        // sandbox 必须给 allow-same-origin，否则 player.bilibili.com 的脚本拿不到自己的存储，直接黑屏。
        //
        // 关闭按钮不可省：iframe 是全屏级文档，里面点任何东西都出不来。
        // 用户想「关掉这个播放器」时，界面上必须有个属于本插件的出口 ——
        // 否则只能把整条队列清空，代价太大。
        surface.external && !embedDismissed ? h6(
          "div",
          { className: "dmo-embed" },
          h6("button", {
            type: "button",
            className: "dmo-embed-close",
            title: t("dock.embedClose", "关闭外部播放器"),
            "aria-label": t("dock.embedClose", "关闭外部播放器"),
            onClick: closeEmbed
          }, "✕"),
          surface.embedUrl ? h6("iframe", {
            className: "dmo-embed-frame",
            src: surface.embedUrl,
            title: trackLabel(state, t),
            allow: "autoplay; fullscreen; picture-in-picture; encrypted-media",
            frameBorder: "0",
            scrolling: "no",
            sandbox: "allow-scripts allow-same-origin allow-presentation allow-popups allow-forms",
            referrerPolicy: "no-referrer-when-downgrade"
          }) : h6("div", { className: "dmo-embed-missing" }, t("dock.noEmbed", "这条音源没有可嵌入的地址")),
          h6(
            "div",
            { className: "dmo-embed-note" },
            t("dock.embedNote", "外部播放器：进度与音量由播放器自身控制，频谱不可用")
          )
        ) : null,
        h6(
          "div",
          { className: "dmo-card" },
          // 黑胶舞台：展开后延续胶囊的黑胶语言，封面来自解析层给的 track.cover。
          // 没有封面（本地文件、纯预置音景）时退化为纯黑胶，不显示空白 img。
          //
          // 拖动事件挂在**整个舞台**（含封面与元信息），不只挂在黑胶那块小圆盘上：
          // 圆盘只有 68px，用户很难精准按住，之前「拖不动」很可能就是没按中手柄。
          // 舞台内没有可交互控件，pointerdown 挂在这里不会吃掉任何点击。
          h6(
            "div",
            {
              className: "dmo-vinyl-stage",
              "data-playing": playing ? "1" : void 0,
              title: t("dock.dragHint", "拖动移动位置，双击复位"),
              onPointerDown: onDragStart,
              onPointerMove: onDragMove,
              onPointerUp: onDragEnd,
              onPointerCancel: onDragEnd,
              onDoubleClick: onDragReset
            },
            h6(
              "div",
              {
                className: "dmo-drag-handle dmo-drag-handle--stage",
                ref: stageHandleRef
              },
              h6(
                "span",
                {
                  className: "dmo-vinyl dmo-vinyl--lg",
                  "data-playing": playing ? "1" : void 0,
                  "data-cover": trackCover(state) ? "1" : void 0
                },
                trackCover(state) ? h6("img", {
                  className: "dmo-vinyl-cover",
                  src: trackCover(state),
                  alt: "",
                  draggable: false,
                  onError: (e) => {
                    e.currentTarget.style.display = "none";
                  }
                }) : null,
                h6("span", { className: "dmo-vinyl-label" }, playing ? "♫" : "♪")
              )
            ),
            h6(
              "div",
              { className: "dmo-vinyl-meta" },
              h6("span", { className: "dmo-vinyl-title" }, trackLabel(state, t)),
              h6(
                "span",
                { className: "dmo-vinyl-sub" },
                surface.external ? t("dock.externalBadge", "外部播放器") : state.artist || t("dock.localBadge", "本地播放")
              )
            )
          ),
          // 卡片头
          h6(
            "div",
            { className: "dmo-card-head" },
            h6("span", { className: "dmo-card-title" }, t("dock.title", "音乐库")),
            h6("span", { className: "dmo-card-sub" }, trackLabel(state, t)),
            h6(
              "span",
              { className: "dmo-card-head-actions" },
              // 收藏当前曲目。星标放在卡片右上角（locale 文案也是这么引导用户的）。
              // 没有可保存地址时按钮仍然可点 —— 点了会给出原因，比一个静默禁用的按钮诚实。
              h6("button", {
                type: "button",
                className: `dmo-icon dmo-icon--fav${favOn ? " is-on" : ""}`,
                title: favOn ? t("dock.favorited", "已收藏") : t("dock.favorite", "收藏当前曲目"),
                "aria-label": favOn ? t("dock.favorited", "已收藏") : t("dock.favorite", "收藏当前曲目"),
                "aria-pressed": favOn,
                onClick: toggleFav
              }, favOn ? "★" : "☆"),
              // 三档尺寸的快捷入口：用户要「大中小三个大小」，不该每次进设置页。
              h6("button", {
                type: "button",
                className: "dmo-icon dmo-icon--size",
                title: `${t("dock.sizeCycle", "切换大小")}（${SIZE_LABELS[dockSize] || "中"}）`,
                "aria-label": t("dock.sizeCycle", "切换大小"),
                "data-size": dockSize,
                onClick: cycleSize
              }, SIZE_GLYPHS[dockSize] || "▭"),
              h6("button", {
                type: "button",
                className: `dmo-icon dmo-icon--spectrum${spectrumOn ? " is-on" : ""}`,
                title: spectrumOn ? t("dock.spectrumOff", "关闭频谱") : t("dock.spectrumOn", "打开频谱"),
                "aria-label": spectrumOn ? t("dock.spectrumOff", "关闭频谱") : t("dock.spectrumOn", "打开频谱"),
                "aria-pressed": spectrumOn,
                onClick: toggleSpectrum
              }, "≋"),
              // 「藏起来」的频谱需要一个临时提上来的入口：平时它压在页面下面，
              // 用户想确认它在动，按下这个键就能让它浮上来亮 3 秒再沉回去。
              spectrumDepth === "back" ? h6("button", {
                type: "button",
                className: `dmo-icon dmo-icon--peek${peekSpectrum ? " is-on" : ""}`,
                title: peekSpectrum ? t("dock.spectrumSink", "让频谱沉回页面下") : t("dock.spectrumPeek", "把频谱提上来看看"),
                "aria-label": peekSpectrum ? t("dock.spectrumSink", "让频谱沉回页面下") : t("dock.spectrumPeek", "把频谱提上来看看"),
                "aria-pressed": peekSpectrum,
                onClick: () => setPeekSpectrum((prev) => !prev)
              }, "⤒") : null,
              h6("button", {
                type: "button",
                className: "dmo-icon",
                title: t("dock.collapse", "收起"),
                "aria-label": t("dock.collapse", "收起"),
                onClick: () => setCollapsed(true)
              }, "▾"),
              h6("button", {
                type: "button",
                className: "dmo-icon",
                title: t("dock.hide", "隐藏"),
                "aria-label": t("dock.hide", "隐藏"),
                onClick: () => setHidden(true)
              }, "✕")
            )
          ),
          // 走带：上一首 / 播放 / 下一首，右侧挂音量旋钮与循环
          h6(
            "div",
            { className: "dmo-transport" },
            h6("button", {
              type: "button",
              className: "dmo-icon dmo-icon--lg",
              title: t("dock.prev", "上一首"),
              "aria-label": t("dock.prev", "上一首"),
              onClick: () => guard(async () => engine.prev())()
            }, "⏮"),
            h6("button", {
              type: "button",
              className: "dmo-play",
              title: playing ? t("dock.pause", "暂停") : t("dock.play", "播放"),
              "aria-label": playing ? t("dock.pause", "暂停") : t("dock.play", "播放"),
              disabled: busy,
              onClick: () => void togglePlay()
            }, playing ? "❚❚" : "▶"),
            h6("button", {
              type: "button",
              className: "dmo-icon dmo-icon--lg",
              title: t("dock.next", "下一首"),
              "aria-label": t("dock.next", "下一首"),
              onClick: () => guard(async () => engine.next())()
            }, "⏭"),
            h6("div", { className: "dmo-transport-tail" }, knob, loopButton)
          ),
          // 进度条独占一整行。
          //
          // 原先进度条被塞在走带行里，与上一首/播放/下一首、两个时间戳抢同一行，
          // 在 340px 宽的卡片里只剩几十像素 —— 既看不出进度也拖不准。
          // 用户的诉求很直接：最长的那根横条应该是音乐进度，不是音量。
          h6(
            "div",
            { className: "dmo-progress" },
            h6("span", { className: "dmo-time" }, fmtTime(position)),
            h6("input", {
              className: "dmo-seek",
              type: "range",
              min: 0,
              // 时长未知时给 1，避免 max=0 让浏览器把滑块画成禁用态
              max: Number.isFinite(duration) && duration > 0 ? duration : 1,
              step: 0.1,
              value: Number.isFinite(position) ? position : 0,
              disabled: !Number.isFinite(duration) || duration <= 0,
              "aria-label": t("dock.seek", "进度"),
              // 已播进度交给 CSS 画在轨道上：原生 range 的 accent-color 只能整体着色，
              // 画不出「已播蓝、未播灰」的对照。
              style: { "--dmo-seek-p": `${seekPercent}%` },
              onChange: onSeek
            }),
            h6("span", { className: "dmo-time" }, fmtTime(duration))
          ),
          // 链接输入
          h6(
            "form",
            {
              className: "dmo-link",
              onSubmit: (event) => {
                event.preventDefault();
                void submitLink();
              }
            },
            h6("input", {
              className: "dmo-link-input",
              type: "text",
              value: draft,
              placeholder: t("dock.linkPlaceholder", "粘贴 B站 / 网易云 / QQ音乐 链接或歌单"),
              "aria-label": t("dock.linkPlaceholder", "粘贴链接"),
              onChange: (event) => setDraft(event.target.value)
            }),
            h6("button", {
              type: "submit",
              className: "dmo-btn dmo-primary",
              disabled: busy || draft.trim() === ""
            }, t("dock.add", "加入")),
            h6("button", {
              type: "button",
              className: "dmo-btn dmo-selfcheck",
              title: "打一次 /api/dsh-music-on/resolve，把真实 HTTP 状态显示出来",
              disabled: busy,
              onClick: () => {
                void runSelfCheck();
              }
            }, t("dock.selfCheck", "自检"))
          ),
          // 播放列表
          //
          // 这不是「队列的另一份 UI」，而是唯一让用户看见「先放什么、后放什么」的地方。
          // 引擎本身一直是数组队列，缺的只是可读的列表：序号、曲名、时长、逐条删除。
          // 每行必须是 div 而不是 button——行里还有删除按钮，button 嵌套 button 在
          // HTML 里是非法的，浏览器会直接把内层按钮拆出去，点删除会误触发播放。
          h6(
            "div",
            { className: "dmo-queue" },
            h6(
              "div",
              { className: "dmo-queue-head" },
              h6("span", { className: "dmo-queue-title" }, t("dock.playlist", "播放列表")),
              h6("span", { className: "dmo-queue-count" }, `${queue.length}`),
              queue.length > 0 ? h6("button", {
                type: "button",
                className: "dmo-queue-clear",
                title: t("dock.clear", "清空"),
                onClick: () => guard(async () => {
                  await engine.clear();
                  clearSavedQueue();
                  flash(t("dock.cleared", "播放列表已清空"));
                })()
              }, t("dock.clear", "清空")) : null
            ),
            queue.length === 0 ? h6("div", { className: "dmo-queue-empty" }, t("dock.queueEmpty", "拖入音频，或粘贴链接，或从预置里挑一首")) : h6("div", { className: "dmo-queue-list" }, queue.map((item, index) => {
              const active = Boolean(item && state.track && state.track.id === item.id);
              const seconds = typeof item.duration === "number" ? item.duration : NaN;
              const blocked = typeof item.unavailableReason === "string" && item.unavailableReason !== "";
              return h6(
                "div",
                {
                  key: `${item.id || index}`,
                  className: `dmo-queue-row${active ? " dmo-queue-row--active" : ""}${blocked ? " dmo-queue-row--blocked" : ""}`,
                  "data-kind": item.kind || "",
                  "data-blocked": blocked ? "1" : void 0
                },
                h6("span", { className: "dmo-queue-index" }, active ? "▶" : String(index + 1)),
                h6("button", {
                  type: "button",
                  className: "dmo-queue-name",
                  title: blocked ? `${item.title || item.name || ""} — ${item.unavailableReason}` : item.title || item.name || "",
                  onClick: () => guard(async () => engine.loadAt(index))()
                }, item.title || item.name || t("dock.untitled", "未命名")),
                blocked ? h6("span", {
                  className: "dmo-queue-badge",
                  title: item.unavailableReason
                }, t("dock.vipBadge", "无直链")) : null,
                h6("span", { className: "dmo-queue-time" }, Number.isFinite(seconds) && seconds > 0 ? fmtTime(seconds) : ""),
                h6("button", {
                  type: "button",
                  className: "dmo-queue-del",
                  title: t("dock.remove", "移除"),
                  "aria-label": t("dock.remove", "移除"),
                  onClick: () => guard(async () => engine.remove(index))()
                }, "✕")
              );
            }))
          ),
          // 音源诊断行：只在「当前曲目本该出声却没走内部音频图」时出现。
          // 没有这一行，用户面对的是一张一切正常的卡片和一片安静——
          // 那正是「加入了但没声音」这类问题反复说不清的原因。
          //
          // 三种通道都要说清楚，尤其第三种：网易云/QQ 的会员曲**没有票据**，
          // 它入队成功、曲名正常显示、卡片看不出任何异样，点下去却必然报错。
          // 这一行把「为什么不会响」写在界面上，而不是留给用户猜。
          surface.external ? h6(
            "div",
            { className: "dmo-diag" },
            h6("span", { className: "dmo-diag-label" }, t("dock.diagTitle", "播放通道")),
            h6(
              "span",
              { className: "dmo-diag-value" },
              surface.embedUrl ? t("dock.diagExternal", "内嵌播放器（频谱不可用）") : t("dock.diagNoEmbed", "没有可用的播放地址")
            )
          ) : blockedReason ? h6(
            "div",
            { className: "dmo-diag dmo-diag--blocked" },
            h6("span", { className: "dmo-diag-label" }, t("dock.diagTitle", "播放通道")),
            h6("span", { className: "dmo-diag-value" }, blockedReason)
          ) : null,
          note ? h6("div", { className: `dmo-note dmo-note--${note.tone}` }, note.text) : null,
          dragging ? h6("div", { className: "dmo-dock-dropveil" }, t("dock.dropHere", "松手即播放")) : null
        )
      );
      return wrapStack(panel, spectrumBar);
    };
  }
  function useStoreSnapshot(React3, store) {
    const [snap, setSnap] = React3.useState(() => store && store.get ? store.get() : {});
    React3.useEffect(() => {
      if (!store || typeof store.subscribe !== "function") return void 0;
      setSnap(store.get());
      return store.subscribe((next) => setSnap(next || {}));
    }, [store]);
    return snap;
  }

  // src/client/i18n.js
  function interpolate(template, params) {
    return String(template).replace(
      /\{(\w+)\}/g,
      (match, name) => Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
    );
  }
  function localTemplate(key) {
    for (const lang of ["zh", "en"]) {
      const dict = DICTS[lang];
      if (dict && typeof dict[key] === "string" && dict[key] !== "") return dict[key];
    }
    return null;
  }
  function safeTranslate(hostT, options) {
    const lang = options && options.lang || "zh";
    const templates = /* @__PURE__ */ new Map();
    const templateOf = (key) => {
      if (templates.has(key)) return templates.get(key);
      let value = null;
      if (typeof hostT === "function") {
        try {
          const probe = hostT(key, {});
          if (typeof probe === "string" && probe !== key) value = probe;
        } catch (_error) {
          value = null;
        }
      }
      if (value === null) {
        const own = localTemplate(key);
        if (own !== null && lang !== "zh") {
          const localized = DICTS[lang] && DICTS[lang][key];
          value = typeof localized === "string" && localized !== "" ? localized : own;
        } else {
          value = own;
        }
      }
      templates.set(key, value);
      return value;
    };
    const translate = (key, paramsOrFallback) => {
      const fallback = typeof paramsOrFallback === "string" ? paramsOrFallback : void 0;
      const params = paramsOrFallback && typeof paramsOrFallback === "object" ? paramsOrFallback : void 0;
      if (params !== void 0) {
        if (typeof hostT === "function") {
          try {
            const out = hostT(key, params);
            if (typeof out === "string") return out;
          } catch (_error) {
          }
        }
        const template2 = templateOf(key);
        return interpolate(template2 !== null ? template2 : fallback !== void 0 ? fallback : key, params);
      }
      const template = templateOf(key);
      if (template !== null) return template;
      return fallback !== void 0 ? fallback : key;
    };
    translate.clearCache = () => templates.clear();
    return translate;
  }

  // src/client/ui/PlayerPanel.jsx
  var import_react2 = __toESM(__require("react"), 1);

  // src/client/ui/PresetsSection.jsx
  var import_react = __toESM(__require("react"), 1);
  var h = (...args) => {
    const create = import_react.default.createElement || import_react.default.default && import_react.default.default.createElement;
    return create(...args);
  };
  var CATEGORY_LABEL = Object.freeze({
    "white-noise": "白噪音",
    rain: "雨声",
    cafe: "咖啡馆",
    beat: "鼓点",
    jazz: "爵士",
    lofi: "Lo-Fi"
  });
  var STATUS_LABEL = Object.freeze({
    ready: "就绪",
    "needs-config": "未配置",
    unavailable: "不可用"
  });
  function PresetChip(props) {
    const { item, runtime, currentId, onPick } = props;
    const isCurrent = currentId === item.id;
    const status = runtime && runtime.status || item.status;
    const busy = status === "preparing";
    const broken = status === "error" || status === "unavailable";
    const notReady = item.playable !== true;
    const className = [
      "dmo-chip",
      isCurrent ? "dmo-chip-on" : "",
      busy ? "dmo-chip-busy" : "",
      broken ? "dmo-chip-bad" : "",
      notReady ? "dmo-chip-off" : ""
    ].filter(Boolean).join(" ");
    const title = broken ? runtime && runtime.reason ? runtime.reason : item.unavailableReason || "该条目不可用" : notReady ? `${item.name}：${STATUS_LABEL[item.status] || item.status}${item.source === "bilibili-embed" ? "（需在 manifest.json 填入 bvid）" : item.source === "platform-link" ? "（需填入歌单页链接）" : ""}` : item.spectrumAvailable === false ? `${item.name}：可播放，但该源不提供频谱` : item.name;
    return h(
      "button",
      {
        type: "button",
        className,
        title,
        disabled: notReady || busy,
        "data-preset-id": item.id,
        "aria-pressed": isCurrent ? "true" : "false",
        onClick: () => onPick(item)
      },
      h("span", { className: "dmo-chip-name" }, item.name || CATEGORY_LABEL[item.category] || item.id),
      // 只有「可播但没频谱」才标；不可播的条目已经有自己的红点语义。
      !notReady && item.spectrumAvailable === false ? h("span", { className: "dmo-chip-tag" }, "无频谱") : null,
      busy ? h("span", { className: "dmo-chip-tag" }, "载入中") : null,
      broken ? h("span", { className: "dmo-chip-dot", "aria-hidden": "true" }) : null
    );
  }
  function PresetsSection(props) {
    const { presets, onNotice, seed } = props || {};
    const [open, setOpen] = (0, import_react.useState)(true);
    const [error, setError] = (0, import_react.useState)("");
    const [runtime, setRuntime] = (0, import_react.useState)({});
    const [currentId, setCurrentId] = (0, import_react.useState)(null);
    const mounted = (0, import_react.useRef)(true);
    (0, import_react.useEffect)(() => {
      mounted.current = true;
      return () => {
        mounted.current = false;
      };
    }, []);
    (0, import_react.useEffect)(() => {
      if (!presets || typeof presets.onChange !== "function") return void 0;
      const off = presets.onChange((event) => {
        if (!mounted.current || !event) return;
        if (event.type === "error" && event.id) {
          setRuntime((prev) => ({
            ...prev,
            [event.id]: { status: "error", reason: event.error && event.error.message }
          }));
          return;
        }
        if ((event.type === "embed" || event.type === "external") && event.id) {
          setCurrentId(event.id);
          return;
        }
        if (event.type === "cached" && event.id) {
          setRuntime((prev) => ({ ...prev, [event.id]: { status: "ready" } }));
        }
      });
      return off;
    }, [presets, seed]);
    const categories = (0, import_react.useMemo)(() => {
      if (!presets || typeof presets.categories !== "function") return [];
      try {
        return presets.categories();
      } catch (cause) {
        void cause;
        return [];
      }
    }, [presets, seed]);
    const issues = (0, import_react.useMemo)(() => {
      if (!presets || typeof presets.unavailableReport !== "function") return [];
      try {
        return presets.unavailableReport();
      } catch {
        return [];
      }
    }, [presets, seed]);
    const pick = (0, import_react.useCallback)(
      async (item) => {
        if (!presets) return;
        setError("");
        try {
          const result = await presets.play(item.id);
          if (!mounted.current) return;
          if (result && result.mode === "external" && result.url) {
            window.open(result.url, "_blank", "noopener,noreferrer");
            onNotice && onNotice(`已在新标签页打开 ${item.name}`);
            return;
          }
          if (result && result.mode === "iframe") {
            onNotice && onNotice(`${item.name}：B 站嵌入播放，频谱不可用`);
            setCurrentId(item.id);
            return;
          }
          setCurrentId(item.id);
        } catch (cause) {
          if (!mounted.current) return;
          const message = cause && cause.message ? cause.message : "音景加载失败";
          setError(message);
          onNotice && onNotice(message);
        }
      },
      [presets, onNotice]
    );
    if (!presets) {
      return h(
        "section",
        { className: "dmo-presets dmo-presets-loading" },
        h("div", { className: "dmo-presets-head" }, h("span", { className: "dmo-presets-title" }, "音景")),
        h("div", { className: "dmo-presets-hint" }, "预置音景加载中…")
      );
    }
    const total = categories.reduce((sum, c) => sum + c.items.length, 0);
    const readyCount = categories.reduce((sum, c) => sum + c.counts.ready, 0);
    return h(
      "section",
      { className: open ? "dmo-presets" : "dmo-presets dmo-presets-closed" },
      h(
        "div",
        { className: "dmo-presets-head" },
        h(
          "button",
          {
            type: "button",
            className: "dmo-presets-title-btn",
            onClick: () => setOpen((v) => !v),
            "aria-expanded": open ? "true" : "false",
            title: open ? "收起音景" : "展开音景"
          },
          h("span", { className: "dmo-presets-caret" }, open ? "▾" : "▸"),
          h("span", { className: "dmo-presets-title" }, "音景"),
          h("span", { className: "dmo-presets-count" }, `${readyCount}/${total}`)
        ),
        issues.length > 0 ? h(
          "span",
          {
            className: "dmo-presets-warn",
            title: issues.map((i) => `${i.name}：${i.reason}`).join("\n")
          },
          `${issues.length} 项未就绪`
        ) : null
      ),
      open ? h(
        "div",
        { className: "dmo-presets-body" },
        ...categories.map(
          (category) => h(
            "div",
            { className: "dmo-presets-group", key: category.id },
            h("div", { className: "dmo-presets-group-name" }, CATEGORY_LABEL[category.id] || category.name || category.id),
            h(
              "div",
              { className: "dmo-presets-chips" },
              ...category.items.map(
                (item) => h(PresetChip, {
                  key: item.id,
                  item,
                  runtime: runtime[item.id],
                  currentId,
                  onPick: pick
                })
              )
            )
          )
        ),
        error !== "" ? h("div", { className: "dmo-presets-error", role: "alert" }, error) : null,
        h("div", { className: "dmo-presets-hint" }, "自研合成音可循环无缝播放；B 站条目为嵌入播放，不产生频谱。")
      ) : null
    );
  }

  // src/client/ui/PlayerPanel.jsx
  var h2 = (...args) => {
    const create = import_react2.default.createElement || import_react2.default.default && import_react2.default.default.createElement;
    return create(...args);
  };
  function formatTime(seconds) {
    if (seconds === null || seconds === void 0 || Number.isFinite(seconds) === false || seconds < 0) return "--:--";
    const total = Math.floor(seconds);
    const s = total % 60;
    const m = Math.floor(total / 60) % 60;
    const hrs = Math.floor(total / 3600);
    const pad = (value) => value < 10 ? `0${value}` : String(value);
    return hrs > 0 ? `${hrs}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }
  var LOOP_LABEL = Object.freeze({
    off: "播完停止",
    all: "列表循环",
    one: "单曲循环"
  });
  var LOOP_GLYPH = Object.freeze({
    off: "▶",
    all: "↻",
    one: "↻¹"
  });
  function QueueRow({ item, onSelect, onRemove }) {
    const badge = item.kind === KIND_EXTERNAL_EMBED ? "外链" : item.source === "preset" ? "音景" : "";
    return h2(
      "li",
      {
        className: item.current ? "dmo-queue-row dmo-queue-row-current" : "dmo-queue-row",
        "data-index": String(item.index)
      },
      h2(
        "button",
        {
          type: "button",
          className: "dmo-queue-main",
          onClick: () => onSelect(item.index),
          title: item.unavailableReason ? `${item.title} - ${item.unavailableReason}` : item.title
        },
        h2("span", { className: "dmo-queue-index" }, item.current ? "▶" : String(item.index + 1)),
        h2(
          "span",
          { className: "dmo-queue-text" },
          h2("span", { className: "dmo-queue-title" }, item.title),
          item.artist ? h2("span", { className: "dmo-queue-artist" }, item.artist) : null
        ),
        badge ? h2("span", { className: "dmo-queue-badge" }, badge) : null,
        item.unavailableReason ? h2("span", { className: "dmo-queue-badge dmo-queue-badge-warn" }, "不可用") : null,
        item.duration !== null ? h2("span", { className: "dmo-queue-dur" }, formatTime(item.duration)) : null
      ),
      h2(
        "button",
        {
          type: "button",
          className: "dmo-queue-remove",
          onClick: (event) => {
            event.stopPropagation();
            onRemove(item.index);
          },
          title: "从队列移除",
          "aria-label": `移除 ${item.title}`
        },
        "×"
      )
    );
  }
  function ExternalStage({ track, degraded }) {
    return h2(
      "div",
      { className: "dmo-stage dmo-stage-external" },
      h2(
        "div",
        { className: "dmo-embed-frame" },
        h2("iframe", {
          src: track.embedUrl,
          title: track.title,
          allow: "autoplay; fullscreen; picture-in-picture",
          frameBorder: "0",
          scrolling: "no",
          sandbox: "allow-scripts allow-same-origin allow-presentation allow-popups",
          referrerPolicy: "no-referrer-when-downgrade"
        })
      ),
      h2(
        "p",
        { className: "dmo-embed-note" },
        degraded ? "音频流代理失败，已自动切到内嵌播放器。外部播放器，频谱不可用。" : "外部播放器，频谱不可用。进度与音量由播放器自身控制，本面板只负责切歌。"
      )
    );
  }
  function EmptyStage({ dragging }) {
    return h2(
      "div",
      { className: dragging ? "dmo-stage dmo-stage-empty dmo-stage-drag" : "dmo-stage dmo-stage-empty" },
      h2("span", { className: "dmo-stage-glyph" }, "♫"),
      h2("p", { className: "dmo-stage-title" }, "把音频文件拖到这里"),
      h2("p", { className: "dmo-stage-hint" }, "支持 mp3 / m4a / wav / flac / ogg，可一次拖入多首；也接受 B 站播放页链接。")
    );
  }
  function PlayerPanel(props) {
    const engine = props && props.engine ? props.engine : null;
    const settings = props && props.settings || {};
    const presets = props && props.presets || null;
    const [state, setState] = (0, import_react2.useState)(() => engine ? engine.getState() : { status: "idle", mode: "internal" });
    const [queue, setQueue] = (0, import_react2.useState)(() => engine ? engine.getQueue() : []);
    const [dragDepth, setDragDepth] = (0, import_react2.useState)(0);
    const [notice, setNotice] = (0, import_react2.useState)("");
    const [scrubbing, setScrubbing] = (0, import_react2.useState)(false);
    const [scrubValue, setScrubValue] = (0, import_react2.useState)(0);
    const rootRef = (0, import_react2.useRef)(null);
    const rangeRef = (0, import_react2.useRef)(null);
    (0, import_react2.useEffect)(() => {
      if (engine === null) return void 0;
      setState(engine.getState());
      const offState = engine.onStateChange((next) => setState(next));
      const offQueue = engine.onQueueChange((payload) => {
        setQueue(payload.items);
      });
      const offTime = engine.onTimeUpdate((payload) => {
        setState((prev) => {
          if (prev.currentTime === payload.currentTime && prev.duration === payload.duration) return prev;
          return { ...prev, currentTime: payload.currentTime, duration: payload.duration };
        });
      });
      const offError = engine.onError((error) => {
        setNotice(error && error.message ? error.message : "播放出错");
      });
      return () => {
        offState();
        offQueue();
        offTime();
        offError();
      };
    }, [engine]);
    (0, import_react2.useEffect)(() => {
      if (engine === null) return;
      if (typeof settings.volume === "number") engine.setVolume(settings.volume);
      if (typeof settings.loopMode === "string") engine.setLoopMode(settings.loopMode);
    }, [engine]);
    (0, import_react2.useEffect)(() => {
      if (notice === "") return void 0;
      const timer = setTimeout(() => setNotice(""), 4e3);
      return () => clearTimeout(timer);
    }, [notice]);
    (0, import_react2.useEffect)(() => {
      const onDragOver = (event) => {
        if (event.dataTransfer && Array.from(event.dataTransfer.types || []).includes("Files")) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }
      };
      const onDrop = (event) => {
        if (event.dataTransfer && Array.from(event.dataTransfer.types || []).includes("Files")) {
          event.preventDefault();
        }
      };
      window.addEventListener("dragover", onDragOver);
      window.addEventListener("drop", onDrop);
      return () => {
        window.removeEventListener("dragover", onDragOver);
        window.removeEventListener("drop", onDrop);
      };
    }, []);
    const ingestFiles = (0, import_react2.useCallback)(
      async (fileList) => {
        if (engine === null) return;
        const result = await engine.addFiles(fileList, { playFirst: true });
        if (result && result.skipped > 0) {
          setNotice(`已加入 ${result.added} 首，跳过 ${result.skipped} 个非音频文件`);
        } else if (result && result.added > 0) {
          setNotice(`已加入 ${result.added} 首`);
        }
      },
      [engine]
    );
    const ingestText = (0, import_react2.useCallback)(
      async (text) => {
        if (engine === null) return false;
        const raw = typeof text === "string" ? text.trim() : "";
        if (raw === "") return false;
        const embed = toEmbedUrl(raw);
        if (embed !== null) {
          await engine.addEmbed(raw, { title: `Bilibili ${embed.bvid || ""}`.trim() });
          setNotice("已加入外部播放器");
          return true;
        }
        if (/^https?:\/\//i.test(raw)) {
          await engine.addUrl(raw);
          setNotice("已加入网络音频");
          return true;
        }
        return false;
      },
      [engine]
    );
    const onDragEnter = (0, import_react2.useCallback)((event) => {
      event.preventDefault();
      setDragDepth((depth) => depth + 1);
    }, []);
    const onDragLeave = (0, import_react2.useCallback)((event) => {
      event.preventDefault();
      setDragDepth((depth) => Math.max(0, depth - 1));
    }, []);
    const onDragOverZone = (0, import_react2.useCallback)((event) => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    }, []);
    const onDropZone = (0, import_react2.useCallback)(
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        setDragDepth(0);
        const data = event.dataTransfer;
        if (!data) return;
        const files = data.files && data.files.length > 0 ? data.files : null;
        if (files !== null) {
          void ingestFiles(files);
          return;
        }
        const text = data.getData("text/uri-list") || data.getData("text/plain") || "";
        void ingestText(text).then((handled) => {
          if (handled === false) setNotice("没有识别到可播放的音频或链接");
        });
      },
      [ingestFiles, ingestText]
    );
    const current = state.currentTrack;
    const isExternal = state.mode === "external";
    const isPlaying = state.status === "playing";
    const seekable = isExternal === false && state.seekable !== false;
    const duration = state.duration !== null && Number.isFinite(state.duration) ? state.duration : 0;
    const timeShown = scrubbing ? scrubValue : state.currentTime || 0;
    const onToggle = (0, import_react2.useCallback)(() => {
      if (engine === null) return;
      void engine.toggle();
    }, [engine]);
    const onPrev = (0, import_react2.useCallback)(() => {
      if (engine === null) return;
      void engine.prev();
    }, [engine]);
    const onNext = (0, import_react2.useCallback)(() => {
      if (engine === null) return;
      void engine.next();
    }, [engine]);
    const onSeekStart = (0, import_react2.useCallback)(() => {
      setScrubbing(true);
      setScrubValue(state.currentTime || 0);
    }, [state.currentTime]);
    const onSeekInput = (0, import_react2.useCallback)((event) => {
      const value = Number(event.target.value);
      setScrubValue(Number.isFinite(value) ? value : 0);
    }, []);
    const onSeekCommit = (0, import_react2.useCallback)(
      (event) => {
        if (engine === null) return;
        const value = Number(event.target.value);
        setScrubbing(false);
        if (Number.isFinite(value)) engine.seek(value);
      },
      [engine]
    );
    const onVolume = (0, import_react2.useCallback)(
      (event) => {
        if (engine === null) return;
        const value = Number(event.target.value);
        if (Number.isFinite(value) === false) return;
        engine.setVolume(value / 100);
        if (value > 0 && state.muted === true) engine.setMuted(false);
      },
      [engine, state.muted]
    );
    const onMute = (0, import_react2.useCallback)(() => {
      if (engine === null) return;
      engine.setMuted(state.muted !== true);
    }, [engine, state.muted]);
    const onLoop = (0, import_react2.useCallback)(() => {
      if (engine === null) return;
      engine.cycleLoopMode();
    }, [engine]);
    const onClear = (0, import_react2.useCallback)(() => {
      if (engine === null) return;
      engine.clear();
      setNotice("队列已清空");
    }, [engine]);
    const onSelect = (0, import_react2.useCallback)(
      (index) => {
        if (engine === null) return;
        void engine.loadAt(index, { autoplay: true });
      },
      [engine]
    );
    const onRemove = (0, import_react2.useCallback)(
      (index) => {
        if (engine === null) return;
        engine.remove(index);
      },
      [engine]
    );
    const onKeyDown = (0, import_react2.useCallback)(
      (event) => {
        const tag = event.target && event.target.tagName ? event.target.tagName.toLowerCase() : "";
        if (tag === "input" || tag === "textarea" || tag === "select" || tag === "button") return;
        if (event.key === " ") {
          event.preventDefault();
          onToggle();
          return;
        }
        if (event.key === "ArrowLeft" && event.altKey) {
          event.preventDefault();
          onPrev();
          return;
        }
        if (event.key === "ArrowRight" && event.altKey) {
          event.preventDefault();
          onNext();
        }
      },
      [onNext, onPrev, onToggle]
    );
    const volumeValue = (0, import_react2.useMemo)(() => {
      const value = typeof state.volume === "number" ? state.volume : 0.6;
      return Math.round(value * 100);
    }, [state.volume]);
    const progressMax = duration > 0 ? duration : 0;
    const progressPercent = progressMax > 0 ? Math.min(100, Math.max(0, timeShown / progressMax * 100)) : 0;
    const loopMode = state.loopMode || "all";
    const dragging = dragDepth > 0;
    return h2(
      "div",
      {
        className: dragging ? "dmo-panel dmo-panel-drag" : "dmo-panel",
        ref: rootRef,
        tabIndex: 0,
        role: "region",
        "aria-label": "音乐播放器",
        onKeyDown,
        onDragEnter,
        onDragLeave,
        onDragOver: onDragOverZone,
        onDrop: onDropZone
      },
      h2(
        "div",
        { className: "dmo-panel-head" },
        h2(
          "div",
          { className: "dmo-now" },
          h2("span", { className: "dmo-now-title", title: current ? current.title : "" }, current ? current.title : "未在播放"),
          current && current.artist ? h2("span", { className: "dmo-now-artist" }, current.artist) : null,
          current && current.unavailableReason ? h2("span", { className: "dmo-now-warn" }, current.unavailableReason) : null
        ),
        h2(
          "div",
          { className: "dmo-head-actions" },
          h2(
            "button",
            {
              type: "button",
              className: "dmo-btn dmo-btn-ghost",
              onClick: onClear,
              disabled: queue.length === 0,
              title: "清空队列并停止播放"
            },
            "清空"
          )
        )
      ),
      dragging ? h2(
        "div",
        { className: "dmo-drop-hint" },
        h2("span", { className: "dmo-drop-glyph" }, "⬇"),
        h2("span", null, "松手加入队列")
      ) : null,
      // 降级路径：current 仍是 url-audio 的 kind，但 state.mode 已是 external，
      // 此时同样要挂 iframe（embedUrl 来自 track 本身）。
      isExternal && current && current.embedUrl ? h2(ExternalStage, { track: current, degraded: state.degraded === true }) : queue.length === 0 ? h2(EmptyStage, { dragging }) : h2(
        "div",
        { className: "dmo-stage" },
        h2("span", { className: "dmo-stage-glyph dmo-stage-glyph-live" }, isPlaying ? "♫" : "♪"),
        h2("span", { className: "dmo-stage-meta" }, `${queue.length} 首在队列中`),
        state.autoplayBlocked ? h2("span", { className: "dmo-stage-warn" }, "浏览器拦下了自动播放，点播放按钮即可") : null
      ),
      /* 进度条：外部模式 / 无时长时禁用，并显示不确定态。 */
      h2(
        "div",
        { className: "dmo-progress" },
        h2("span", { className: "dmo-progress-time" }, formatTime(timeShown)),
        h2(
          "div",
          { className: seekable && progressMax > 0 ? "dmo-progress-track" : "dmo-progress-track dmo-progress-indeterminate" },
          h2("span", { className: "dmo-progress-fill", style: { width: `${progressPercent}%` } }),
          h2("input", {
            ref: rangeRef,
            type: "range",
            className: "dmo-progress-range",
            min: 0,
            max: progressMax > 0 ? progressMax : 1,
            step: 0.1,
            value: timeShown,
            disabled: seekable === false || progressMax <= 0,
            onChange: onSeekInput,
            onPointerDown: onSeekStart,
            onPointerUp: onSeekCommit,
            onKeyUp: onSeekCommit,
            "aria-label": "播放进度"
          })
        ),
        h2(
          "span",
          { className: "dmo-progress-time" },
          isExternal ? "∞" : formatTime(progressMax > 0 ? progressMax : null)
        )
      ),
      h2(
        "div",
        { className: "dmo-controls" },
        h2(
          "button",
          { type: "button", className: "dmo-btn dmo-btn-icon", onClick: onPrev, title: "上一首", "aria-label": "上一首" },
          "⏮"
        ),
        h2(
          "button",
          {
            type: "button",
            className: "dmo-btn dmo-btn-play",
            onClick: onToggle,
            title: isPlaying ? "暂停" : "播放",
            "aria-label": isPlaying ? "暂停" : "播放"
          },
          isPlaying ? "⏸" : "▶"
        ),
        h2(
          "button",
          { type: "button", className: "dmo-btn dmo-btn-icon", onClick: onNext, title: "下一首", "aria-label": "下一首" },
          "⏭"
        ),
        h2(
          "button",
          {
            type: "button",
            className: loopMode === "off" ? "dmo-btn dmo-btn-icon dmo-btn-dim" : "dmo-btn dmo-btn-icon",
            onClick: onLoop,
            title: `循环：${LOOP_LABEL[loopMode] || "列表循环"}`,
            "aria-label": `循环模式：${LOOP_LABEL[loopMode] || "列表循环"}`
          },
          LOOP_GLYPH[loopMode] || LOOP_GLYPH.all
        ),
        h2(
          "div",
          { className: "dmo-volume" },
          h2(
            "button",
            {
              type: "button",
              className: "dmo-btn dmo-btn-icon dmo-btn-ghost",
              onClick: onMute,
              title: state.muted ? "取消静音" : "静音",
              "aria-label": state.muted ? "取消静音" : "静音"
            },
            state.muted ? "🔇" : "🔊"
          ),
          h2("input", {
            type: "range",
            className: "dmo-range dmo-volume-range",
            min: 0,
            max: 100,
            step: 1,
            value: state.muted ? 0 : volumeValue,
            onChange: onVolume,
            "aria-label": "音量"
          })
        )
      ),
      queue.length > 0 ? h2(
        "ul",
        { className: "dmo-queue" },
        queue.map(
          (item) => h2(QueueRow, { key: item.id, item, onSelect, onRemove })
        )
      ) : null,
      /* 音景分区常驻面板底部：队列为空时它就是唯一入口，所以不能藏进折叠区之外。 */
      h2(PresetsSection, { presets, onNotice: setNotice }),
      notice !== "" ? h2("div", { className: "dmo-notice", role: "status" }, notice) : null
    );
  }
  var PlayerPanel_default = PlayerPanel;

  // src/client/ui/Spectrum.jsx
  var import_react3 = __require("react");
  var FFT_SIZE = 2048;
  var PEAK_DECAY_PER_FRAME = 0.6;
  var REF_FRAME_MS = 1e3 / 60;
  var REDUCED_MOTION_FPS = 10;
  var MAX_DPR = 2;
  var ANALYSER_PROBE_MS = 500;
  var STYLE_VALUES = ["dots", "bars", "line", "wave", "off"];
  var DEFAULT_STYLE = "dots";
  var DEFAULT_BAR_COUNT = 48;
  var BAR_COUNT_MIN = 16;
  var BAR_COUNT_MAX = 96;
  var BAR_COUNT_STEP = 8;
  var GAIN_MIN = 0.5;
  var GAIN_MAX = 4;
  var GAIN_DEFAULT = 1;
  var GLOW_VALUES = ["off", "soft", "strong"];
  var GLOW_DEFAULT = "soft";
  var GLOW_BLUR = { off: 0, soft: 6, strong: 12 };
  var GLOW_STRONG_COLOR = "rgba(120,190,255,0.85)";
  var DOT_W_MIN = 2;
  var DOT_W_MAX = 4;
  var DOT_GAP_TARGET = 1.75;
  var DOT_GAP_MIN = 1.5;
  var DOT_GAP_MAX = 2;
  var DOT_GAP_FLOOR = 0.5;
  var FLOOR_H = 2;
  var PEAK_H = 2;
  var FALLBACK_PALETTE = Object.freeze({
    base: "rgba(150,200,255,0.30)",
    low: "rgba(120,180,255,0.55)",
    high: "rgba(255,255,255,0.98)",
    glow: "rgba(90,170,255,0.55)"
  });
  function cssVar(styles, name, fallback) {
    if (!styles || typeof styles.getPropertyValue !== "function") return fallback;
    const value = styles.getPropertyValue(name);
    const text = typeof value === "string" ? value.trim() : "";
    return text === "" ? fallback : text;
  }
  function logBandEdges(binCount, bars) {
    const edges = new Int32Array(bars + 1);
    const minBin = 1;
    const maxBin = Math.max(minBin + 1, binCount - 1);
    const logMin = Math.log(minBin);
    const logMax = Math.log(maxBin);
    let prev = minBin;
    edges[0] = minBin;
    for (let i = 1; i <= bars; i += 1) {
      const ratio = i / bars;
      let bin = Math.round(Math.exp(logMin + (logMax - logMin) * ratio));
      if (bin <= prev) bin = prev + 1;
      if (bin > maxBin) bin = maxBin;
      edges[i] = bin;
      prev = bin;
    }
    return edges;
  }
  function sampleBands(freq, edges, bars, out) {
    for (let i = 0; i < bars; i += 1) {
      const from = edges[i];
      const to = Math.max(from + 1, edges[i + 1]);
      let peak = 0;
      for (let bin = from; bin < to && bin < freq.length; bin += 1) {
        if (freq[bin] > peak) peak = freq[bin];
      }
      out[i] = peak / 255;
    }
    return out;
  }
  function prefersReducedMotion() {
    try {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches === true;
    } catch (_error) {
      return false;
    }
  }
  function roundRectPath(ctx, x, y, w, height, r) {
    const radius = Math.max(0, Math.min(r, w / 2, height / 2));
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, w, height, radius);
      return;
    }
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + height - radius);
    ctx.quadraticCurveTo(x + w, y + height, x + w - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }
  function roundRect(ctx, x, y, w, height, r) {
    ctx.beginPath();
    roundRectPath(ctx, x, y, w, height, r);
  }
  function readAnalyser(engine) {
    if (!engine || typeof engine !== "object") return null;
    try {
      if (typeof engine.getAnalyser === "function") {
        const node = engine.getAnalyser();
        if (node) return node;
      }
      if (engine.analyser && typeof engine.analyser === "object") return engine.analyser;
    } catch (_error) {
      return null;
    }
    return null;
  }
  function readEngineState(engine) {
    try {
      if (engine && typeof engine.getState === "function") {
        const state = engine.getState();
        if (state && typeof state === "object") return state;
      }
      if (engine && typeof engine === "object") {
        const available = engine.spectrumAvailable;
        if (typeof available === "boolean") {
          return { mode: available ? "internal" : "external", spectrumAvailable: available };
        }
      }
    } catch (_error) {
    }
    return null;
  }
  function normalizeStyle(value) {
    return STYLE_VALUES.includes(value) ? value : DEFAULT_STYLE;
  }
  function normalizeBarCount(value) {
    const num = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(num)) return DEFAULT_BAR_COUNT;
    const clamped = Math.min(BAR_COUNT_MAX, Math.max(BAR_COUNT_MIN, Math.round(num)));
    return Math.round(clamped / BAR_COUNT_STEP) * BAR_COUNT_STEP;
  }
  function normalizeGain(value) {
    const num = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(num)) return GAIN_DEFAULT;
    return Math.min(GAIN_MAX, Math.max(GAIN_MIN, num));
  }
  function normalizeGlow(value) {
    return GLOW_VALUES.includes(value) ? value : GLOW_DEFAULT;
  }
  function dotLayout(width, count) {
    const n = Math.max(1, Math.round(count) || 1);
    const w = Math.max(1, Number(width) || 1);
    const slot = w / n;
    let barW = Math.min(DOT_W_MAX, Math.max(DOT_W_MIN, slot - DOT_GAP_TARGET));
    let gap = slot - barW;
    if (gap > DOT_GAP_MAX) gap = DOT_GAP_MAX;
    if (gap < DOT_GAP_MIN) {
      gap = Math.max(DOT_GAP_FLOOR, Math.min(DOT_GAP_MIN, slot - DOT_W_MIN));
      barW = Math.min(DOT_W_MAX, Math.max(1, slot - gap));
    }
    const step = barW + gap;
    const total = step * (n - 1) + barW;
    return { barW, gap, step, slot, x0: Math.max(0, (w - total) / 2), total };
  }
  function Spectrum(props) {
    const { engine, settings } = props || {};
    const style = normalizeStyle(settings && settings.spectrumStyle);
    const configuredFps = settings && settings.spectrumFps === 30 ? 30 : 60;
    const barCount = normalizeBarCount(settings && settings.spectrumBars);
    const gain = normalizeGain(settings && settings.spectrumGain);
    const glow = normalizeGlow(settings && settings.spectrumGlow);
    const initialSpectrumAvailable = (() => {
      const state = readEngineState(engine);
      if (state === null) return true;
      if (state.mode === "external") return false;
      return state.spectrumAvailable !== false;
    })();
    const canvasRef = (0, import_react3.useRef)(null);
    const hostRef = (0, import_react3.useRef)(null);
    const rafRef = (0, import_react3.useRef)(0);
    const geometryRef = (0, import_react3.useRef)({ width: 0, height: 0, dpr: 1 });
    const peaksRef = (0, import_react3.useRef)(null);
    const bandsRef = (0, import_react3.useRef)(null);
    const edgesRef = (0, import_react3.useRef)(null);
    const visibleRef = (0, import_react3.useRef)(true);
    const externalRef = (0, import_react3.useRef)(initialSpectrumAvailable === false);
    (0, import_react3.useEffect)(() => {
      if (style === "off") return void 0;
      const canvas = canvasRef.current;
      if (canvas === null || canvas === void 0) return void 0;
      const maybeCtx = canvas.getContext("2d");
      if (maybeCtx === null || maybeCtx === void 0) return void 0;
      const ctx2d = maybeCtx;
      const reduced = prefersReducedMotion();
      const fps = reduced ? Math.min(REDUCED_MOTION_FPS, configuredFps) : configuredFps;
      const intervalMs = 1e3 / Math.max(1, fps);
      if (!peaksRef.current || peaksRef.current.length !== barCount) {
        peaksRef.current = new Float32Array(barCount);
        bandsRef.current = new Float32Array(barCount);
      }
      let analyser = null;
      let binCount = FFT_SIZE / 2;
      let freq = new Uint8Array(binCount);
      let waveBuf = new Uint8Array(FFT_SIZE);
      let nextProbeTs = 0;
      function bindAnalyser(node) {
        if (!node || typeof node !== "object") return false;
        if (node.fftSize !== FFT_SIZE) {
          try {
            node.fftSize = FFT_SIZE;
          } catch (_error) {
          }
        }
        const bins = Number(node.frequencyBinCount);
        const safeBins = Number.isFinite(bins) && bins > 0 ? Math.floor(bins) : FFT_SIZE / 2;
        if (node === analyser && safeBins === binCount && freq !== null) return true;
        const timeSize = Number.isFinite(node.fftSize) && node.fftSize > 0 ? node.fftSize : safeBins * 2;
        analyser = node;
        binCount = safeBins;
        freq = new Uint8Array(safeBins);
        waveBuf = new Uint8Array(timeSize);
        edgesRef.current = logBandEdges(safeBins, barCount);
        return true;
      }
      bindAnalyser(readAnalyser(engine));
      peaksRef.current.fill(0);
      bandsRef.current.fill(0);
      let paletteCache = null;
      function readPalette() {
        let computed = null;
        try {
          computed = getComputedStyle(canvas);
        } catch (_error) {
          computed = null;
        }
        return {
          base: cssVar(computed, "--dmo-spec-base", FALLBACK_PALETTE.base),
          low: cssVar(computed, "--dmo-spec-low", FALLBACK_PALETTE.low),
          high: cssVar(computed, "--dmo-spec-high", FALLBACK_PALETTE.high),
          glow: cssVar(computed, "--dmo-spec-glow", FALLBACK_PALETTE.glow)
        };
      }
      function palette() {
        if (paletteCache === null) paletteCache = readPalette();
        return paletteCache;
      }
      function resize() {
        const host = hostRef.current || canvas;
        const dpr = Math.min(MAX_DPR, Math.max(1, window.devicePixelRatio || 1));
        const rect = host.getBoundingClientRect();
        const width = Math.max(1, Math.round(rect.width || host.clientWidth || 320));
        const height = Math.max(1, Math.round(rect.height || host.clientHeight || 64));
        const pixelW = Math.round(width * dpr);
        const pixelH = Math.round(height * dpr);
        if (canvas.width !== pixelW || canvas.height !== pixelH) {
          canvas.width = pixelW;
          canvas.height = pixelH;
        }
        geometryRef.current = { width, height, dpr };
        ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
        paletteCache = null;
      }
      function glowParams(colors) {
        const blur = GLOW_BLUR[glow] || 0;
        return { blur, color: glow === "strong" ? GLOW_STRONG_COLOR : colors.glow };
      }
      function drawDots(colors) {
        const { width, height } = geometryRef.current;
        const layout = dotLayout(width, barCount);
        const { barW, step: step2, x0 } = layout;
        const radius = barW / 2;
        const { blur, color: glowColor } = glowParams(colors);
        const floorY = height - FLOOR_H;
        const bands = bandsRef.current;
        const peaks = peaksRef.current;
        for (let i = 0; i < barCount; i += 1) {
          const x = x0 + i * step2;
          const value = bands[i];
          ctx2d.fillStyle = colors.base;
          roundRect(ctx2d, x, floorY, barW, FLOOR_H, radius);
          ctx2d.fill();
          if (value > 1e-3) {
            const barH = Math.max(FLOOR_H, value * height);
            const top = height - barH;
            const gradient = ctx2d.createLinearGradient(0, height, 0, top);
            gradient.addColorStop(0, colors.low);
            gradient.addColorStop(1, colors.high);
            if (blur > 0) {
              ctx2d.shadowBlur = blur;
              ctx2d.shadowColor = glowColor;
            }
            ctx2d.fillStyle = gradient;
            roundRect(ctx2d, x, top, barW, barH, radius);
            ctx2d.fill();
            if (blur > 0) {
              ctx2d.shadowBlur = 0;
              ctx2d.shadowColor = "transparent";
            }
          }
          const peak = peaks[i];
          if (peak > 2e-3) {
            const py = Math.max(0, Math.min(height - PEAK_H, height - peak * height));
            ctx2d.fillStyle = colors.high;
            roundRect(ctx2d, x, py, barW, PEAK_H, PEAK_H / 2);
            ctx2d.fill();
          }
        }
        ctx2d.shadowBlur = 0;
      }
      function drawBars(colors) {
        const { width, height } = geometryRef.current;
        const layout = dotLayout(width, barCount);
        const { barW, step: step2, x0 } = layout;
        const radius = Math.min(barW / 2, 3);
        const { blur, color: glowColor } = glowParams(colors);
        const bands = bandsRef.current;
        const peaks = peaksRef.current;
        for (let i = 0; i < barCount; i += 1) {
          const x = x0 + i * step2;
          const value = bands[i];
          ctx2d.fillStyle = colors.base;
          roundRect(ctx2d, x, height - FLOOR_H, barW, FLOOR_H, radius);
          ctx2d.fill();
          if (value > 1e-3) {
            const barH = Math.max(FLOOR_H, value * height);
            const top = height - barH;
            const gradient = ctx2d.createLinearGradient(0, height, 0, top);
            gradient.addColorStop(0, colors.low);
            gradient.addColorStop(1, colors.high);
            if (blur > 0) {
              ctx2d.shadowBlur = blur;
              ctx2d.shadowColor = glowColor;
            }
            ctx2d.fillStyle = gradient;
            roundRect(ctx2d, x, top, barW, barH, radius);
            ctx2d.fill();
            if (blur > 0) {
              ctx2d.shadowBlur = 0;
              ctx2d.shadowColor = "transparent";
            }
          }
          const peak = peaks[i];
          if (peak > 2e-3) {
            const py = Math.max(0, Math.min(height - PEAK_H, height - peak * height));
            ctx2d.fillStyle = colors.high;
            roundRect(ctx2d, x, py, barW, PEAK_H, PEAK_H / 2);
            ctx2d.fill();
          }
        }
        ctx2d.shadowBlur = 0;
      }
      function drawLine(colors) {
        const { width, height } = geometryRef.current;
        const step2 = width / Math.max(1, barCount - 1);
        const bands = bandsRef.current;
        const peaks = peaksRef.current;
        ctx2d.strokeStyle = colors.base;
        ctx2d.lineWidth = 1;
        ctx2d.beginPath();
        ctx2d.moveTo(0, height - 1);
        ctx2d.lineTo(width, height - 1);
        ctx2d.stroke();
        ctx2d.lineWidth = 1.6;
        ctx2d.lineJoin = "round";
        ctx2d.strokeStyle = colors.high;
        ctx2d.beginPath();
        for (let i = 0; i < barCount; i += 1) {
          const x = i * step2;
          const y = height - bands[i] * height;
          if (i === 0) ctx2d.moveTo(x, y);
          else ctx2d.lineTo(x, y);
        }
        ctx2d.stroke();
        ctx2d.strokeStyle = colors.low;
        ctx2d.lineWidth = 1.2;
        for (let i = 0; i < barCount; i += 1) {
          const peak = peaks[i];
          if (peak <= 2e-3) continue;
          const x = i * step2;
          const y = Math.max(1, height - peak * height);
          ctx2d.beginPath();
          ctx2d.moveTo(Math.max(0, x - step2 * 0.3), y);
          ctx2d.lineTo(Math.min(width, x + step2 * 0.3), y);
          ctx2d.stroke();
        }
      }
      function drawWave(colors) {
        const { width, height } = geometryRef.current;
        const layout = dotLayout(width, barCount);
        const { barW, step: step2, x0 } = layout;
        const center = height / 2;
        const bands = bandsRef.current;
        const gradient = ctx2d.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, colors.low);
        gradient.addColorStop(0.5, colors.high);
        gradient.addColorStop(1, colors.low);
        ctx2d.beginPath();
        for (let i = 0; i < barCount; i += 1) {
          const amp = bands[i];
          const half = Math.min(center, Math.max(0.75, amp * center));
          const x = x0 + i * step2;
          roundRectPath(ctx2d, x, center - half, barW, half * 2, barW / 2);
        }
        ctx2d.fillStyle = gradient;
        ctx2d.fill();
        ctx2d.strokeStyle = colors.high;
        ctx2d.lineWidth = 1.5;
        ctx2d.lineJoin = "round";
        ctx2d.stroke();
      }
      function step(now, prevTs2) {
        const { width, height } = geometryRef.current;
        const nowTs = typeof now === "number" ? now : performance.now();
        const dt = prevTs2 === null ? intervalMs : Math.max(1, nowTs - prevTs2);
        const decay = PEAK_DECAY_PER_FRAME * dt / REF_FRAME_MS;
        const bands = bandsRef.current;
        const peaks = peaksRef.current;
        if (analyser === null && nextProbeTs <= nowTs) {
          nextProbeTs = nowTs + ANALYSER_PROBE_MS;
          bindAnalyser(readAnalyser(engine));
        }
        if (analyser !== null && !externalRef.current) {
          if (style === "wave" || style === "line") {
            analyser.getByteTimeDomainData(waveBuf);
            const chunk = Math.max(1, Math.floor(waveBuf.length / barCount));
            const boost = style === "wave" ? 1.6 : 2.2;
            for (let i = 0; i < barCount; i += 1) {
              let peak = 0;
              const from = i * chunk;
              for (let k = from; k < from + chunk && k < waveBuf.length; k += 1) {
                const amplitude = Math.abs(waveBuf[k] - 128);
                if (amplitude > peak) peak = amplitude;
              }
              bands[i] = Math.min(1, peak / 128 * boost * gain);
            }
          } else {
            analyser.getByteFrequencyData(freq);
            sampleBands(freq, edgesRef.current, barCount, bands);
            for (let i = 0; i < barCount; i += 1) {
              bands[i] = Math.min(1, bands[i] * gain);
            }
          }
        } else {
          const t = nowTs / 1e3;
          for (let i = 0; i < barCount; i += 1) {
            bands[i] = 0.035 + 0.02 * (1 + Math.sin(t * 1.2 + i * 0.35));
          }
        }
        for (let i = 0; i < barCount; i += 1) {
          const value = bands[i];
          const decayed = peaks[i] - decay;
          peaks[i] = Math.max(value, decayed > 0 ? decayed : 0);
        }
        ctx2d.clearRect(0, 0, width, height);
        const colors = palette();
        if (style === "dots") drawDots(colors);
        else if (style === "wave") drawWave(colors);
        else if (style === "line") drawLine(colors);
        else drawBars(colors);
      }
      let prevTs = null;
      function loop(now) {
        rafRef.current = 0;
        const ts = typeof now === "number" ? now : performance.now();
        if (!visibleRef.current || typeof document !== "undefined" && document.hidden === true) {
          return;
        }
        if (prevTs === null || ts - prevTs >= intervalMs - 1) {
          try {
            step(ts, prevTs);
          } catch (_error) {
          }
          prevTs = ts;
        }
        rafRef.current = requestAnimationFrame(loop);
      }
      function resume() {
        if (rafRef.current !== 0) return;
        if (!visibleRef.current) return;
        if (typeof document !== "undefined" && document.hidden === true) return;
        prevTs = null;
        rafRef.current = requestAnimationFrame(loop);
      }
      function suspend() {
        if (rafRef.current !== 0) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = 0;
        }
        prevTs = null;
      }
      resize();
      try {
        step(performance.now(), null);
      } catch (_error) {
      }
      let resizeObserver = null;
      if (typeof ResizeObserver === "function") {
        resizeObserver = new ResizeObserver(() => {
          resize();
        });
        resizeObserver.observe(hostRef.current || canvas);
      } else if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
        window.addEventListener("resize", resize);
      }
      const onVisibility = () => {
        if (typeof document !== "undefined" && document.hidden === true) suspend();
        else resume();
      };
      if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
        document.addEventListener("visibilitychange", onVisibility);
      }
      let observer = null;
      if (typeof IntersectionObserver === "function") {
        const host = hostRef.current || canvas;
        observer = new IntersectionObserver(
          (entries) => {
            const entry = entries && entries[0];
            visibleRef.current = entry ? entry.isIntersecting === true : true;
            if (visibleRef.current) resume();
            else suspend();
          },
          { threshold: 0.01 }
        );
        observer.observe(host);
      }
      let offState = null;
      if (engine && typeof engine.onStateChange === "function") {
        try {
          const unsubscribe = engine.onStateChange((state) => {
            const next = state && typeof state === "object" ? state : readEngineState(engine);
            if (next !== null) {
              externalRef.current = next.mode === "external" || next.spectrumAvailable === false;
            }
            if (bindAnalyser(readAnalyser(engine))) nextProbeTs = 0;
            if (visibleRef.current) resume();
          });
          offState = typeof unsubscribe === "function" ? unsubscribe : null;
        } catch (_error) {
          offState = null;
        }
      }
      resume();
      let mq = null;
      const onScheme = () => {
        paletteCache = null;
        if (rafRef.current === 0) {
          try {
            step(performance.now(), null);
          } catch (_error) {
          }
        }
      };
      try {
        if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
          mq = window.matchMedia("(prefers-color-scheme: dark)");
          if (mq && typeof mq.addEventListener === "function") mq.addEventListener("change", onScheme);
        }
      } catch (_error) {
        mq = null;
      }
      return () => {
        if (rafRef.current !== 0) cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
        if (observer !== null) {
          observer.disconnect();
          observer = null;
        }
        if (resizeObserver !== null) {
          resizeObserver.disconnect();
          resizeObserver = null;
        } else if (typeof window !== "undefined" && typeof window.removeEventListener === "function") {
          window.removeEventListener("resize", resize);
        }
        if (typeof document !== "undefined" && typeof document.removeEventListener === "function") {
          document.removeEventListener("visibilitychange", onVisibility);
        }
        if (typeof offState === "function") offState();
        offState = null;
        if (mq !== null && typeof mq.removeEventListener === "function") mq.removeEventListener("change", onScheme);
        mq = null;
        peaksRef.current.fill(0);
        bandsRef.current.fill(0);
      };
    }, [engine, style, configuredFps, barCount, gain, glow]);
    if (style === "off") {
      return null;
    }
    const children = [
      (0, import_react3.createElement)("canvas", {
        key: "canvas",
        ref: canvasRef,
        className: "dmo-spectrum-canvas",
        "aria-hidden": "true"
      })
    ];
    if (initialSpectrumAvailable === false) {
      children.push(
        (0, import_react3.createElement)(
          "span",
          { key: "badge", className: "dmo-spectrum-badge" },
          "外部播放器 · 无频谱"
        )
      );
    }
    return (0, import_react3.createElement)(
      "div",
      {
        ref: hostRef,
        className: "dmo-spectrum",
        "data-style": style,
        "data-fps": String(configuredFps),
        "data-bars": String(barCount),
        "data-glow": glow,
        "data-spectrum": initialSpectrumAvailable === false ? "unavailable" : "available"
      },
      children
    );
  }
  var Spectrum_default = Spectrum;

  // src/client/ui/Settings.jsx
  var import_react5 = __require("react");

  // src/client/ui/LibrarySection.jsx
  var import_react4 = __require("react");
  var COLLAPSE_KEY2 = "dsh-music-on:lib.collapsed";
  var STATUS_MS = 4e3;
  function readCollapsed() {
    const fallback = { fav: false, hist: true };
    try {
      if (typeof localStorage === "undefined" || localStorage === null) return fallback;
      const raw = localStorage.getItem(COLLAPSE_KEY2);
      if (typeof raw !== "string" || raw === "") return fallback;
      const parsed = JSON.parse(raw);
      return {
        fav: parsed && parsed.fav === true,
        hist: parsed && parsed.hist === true
      };
    } catch (_error) {
      return fallback;
    }
  }
  function writeCollapsed(next) {
    try {
      if (typeof localStorage === "undefined" || localStorage === null) return;
      localStorage.setItem(COLLAPSE_KEY2, JSON.stringify({ fav: next.fav === true, hist: next.hist === true }));
    } catch (_error) {
    }
  }
  function entryName(entry) {
    const title = entry && typeof entry.title === "string" ? entry.title.trim() : "";
    if (title !== "") return title;
    const url = entry && typeof entry.url === "string" ? entry.url : "";
    if (url === "") return "未命名链接";
    return url.length > 72 ? `${url.slice(0, 69)}…` : url;
  }
  function playsLabel(entry, tr) {
    const plays = entry && Number.isFinite(entry.plays) ? entry.plays : 1;
    if (plays <= 1) return "";
    return tr("lib.playsCount", "播放 {count} 次").replace("{count}", String(plays));
  }
  function LibrarySection(props) {
    const { t, engine } = props || {};
    const tr = typeof t === "function" ? t : (key, fallback) => fallback !== void 0 ? fallback : key;
    const [favorites, setFavorites] = (0, import_react4.useState)(() => loadFavorites());
    const [history, setHistory] = (0, import_react4.useState)(() => loadHistory());
    const [folded, setFolded] = (0, import_react4.useState)(() => readCollapsed());
    const [status, setStatus] = (0, import_react4.useState)("");
    const [busy, setBusy] = (0, import_react4.useState)(false);
    (0, import_react4.useEffect)(
      () => subscribeLibrary(() => {
        setFavorites(loadFavorites());
        setHistory(loadHistory());
      }),
      []
    );
    (0, import_react4.useEffect)(() => {
      if (!status) return void 0;
      const timer = setTimeout(() => setStatus(""), STATUS_MS);
      return () => clearTimeout(timer);
    }, [status]);
    (0, import_react4.useEffect)(() => {
      writeCollapsed(folded);
    }, [folded]);
    const toggleFold = (0, import_react4.useCallback)((which) => {
      setFolded((prev) => ({ ...prev, [which]: !prev[which] }));
    }, []);
    const play = (0, import_react4.useCallback)(
      (entry) => {
        if (!engine || typeof engine.addUrl !== "function") {
          setStatus(tr("lib.noEngine", "播放器还没就绪，稍后再点"));
          return;
        }
        setBusy(true);
        Promise.resolve().then(() => intakeLinks(engine, entry.url, { playFirst: true })).then((report) => {
          if (report && report.added > 0) {
            setStatus(`${tr("lib.playing", "已加入播放列表")} · ${entryName(entry)}`);
          } else {
            setStatus(`${tr("lib.failed", "这条链接现在解析不了")}：${summarizeReport(report)}`);
          }
        }).catch((error) => {
          setStatus(error && error.message ? error.message : String(error));
        }).then(() => {
          setBusy(false);
        });
      },
      [engine, tr]
    );
    const dropFavorite = (0, import_react4.useCallback)((entry) => {
      removeFavorite(entry.id);
    }, []);
    const dropHistory = (0, import_react4.useCallback)((entry) => {
      removeHistory(entry.id);
    }, []);
    const wipeFavorites = (0, import_react4.useCallback)(() => {
      clearFavorites();
      setStatus(tr("lib.favCleared", "收藏已清空"));
    }, [tr]);
    const wipeHistory = (0, import_react4.useCallback)(() => {
      clearHistory();
      setStatus(tr("lib.histCleared", "历史已清空"));
    }, [tr]);
    function table(id, title, help, list, onDrop, onWipe, empty) {
      const isFolded = folded[id] === true;
      const head = (0, import_react4.createElement)(
        "div",
        { className: "dmo-lib-head" },
        (0, import_react4.createElement)("span", { className: "dmo-lib-title" }, title),
        (0, import_react4.createElement)("span", { className: "dmo-lib-count" }, String(list.length)),
        (0, import_react4.createElement)(
          "button",
          {
            type: "button",
            className: "dmo-lib-toggle",
            "aria-expanded": !isFolded,
            title: isFolded ? tr("lib.expand", "展开列表") : tr("lib.collapse", "收起列表"),
            onClick: () => toggleFold(id)
          },
          isFolded ? "▸" : "▾"
        ),
        list.length > 0 ? (0, import_react4.createElement)(
          "button",
          {
            type: "button",
            className: "dmo-lib-clear",
            disabled: busy,
            onClick: onWipe
          },
          tr("lib.clearAll", "清空")
        ) : null
      );
      const rows = list.map(
        (entry) => (0, import_react4.createElement)(
          "div",
          { key: entry.id, className: "dmo-lib-row", title: entry.url },
          (0, import_react4.createElement)("span", { className: `dmo-lib-chip dmo-lib-chip--${entry.platform || "other"}` }, platformLabel(entry.platform)),
          (0, import_react4.createElement)(
            "span",
            { className: "dmo-lib-main" },
            (0, import_react4.createElement)("span", { className: "dmo-lib-name" }, entryName(entry)),
            (0, import_react4.createElement)(
              "span",
              { className: "dmo-lib-meta" },
              relativeTime(entry.playedAt || entry.addedAt),
              playsLabel(entry, tr) === "" ? null : ` · ${playsLabel(entry, tr)}`
            )
          ),
          (0, import_react4.createElement)(
            "span",
            { className: "dmo-lib-actions" },
            (0, import_react4.createElement)(
              "button",
              {
                type: "button",
                className: "dmo-lib-btn dmo-lib-btn--play",
                disabled: busy,
                title: tr("lib.play", "播放"),
                "aria-label": `${tr("lib.play", "播放")} ${entryName(entry)}`,
                onClick: () => play(entry)
              },
              "▶"
            ),
            (0, import_react4.createElement)(
              "button",
              {
                type: "button",
                className: "dmo-lib-btn dmo-lib-btn--del",
                title: tr("lib.del", "删除"),
                "aria-label": `${tr("lib.del", "删除")} ${entryName(entry)}`,
                onClick: () => onDrop(entry)
              },
              "✕"
            )
          )
        )
      );
      return (0, import_react4.createElement)(
        "section",
        { key: id, className: "dmo-lib-group", "data-group": id },
        head,
        help ? (0, import_react4.createElement)("div", { className: "dmo-lib-help" }, help) : null,
        isFolded ? null : rows.length > 0 ? (0, import_react4.createElement)("div", { className: "dmo-lib-list" }, rows) : (0, import_react4.createElement)("div", { className: "dmo-lib-empty" }, empty)
      );
    }
    return (0, import_react4.createElement)(
      "div",
      { className: "dmo-lib", "data-plugin": "dsh-music-on" },
      table(
        "fav",
        tr("lib.favTitle", "收藏播放链接"),
        tr("lib.favHelp", "长期保留的链接。点「播放」直接入队开播，刷新与重启都不会丢。"),
        favorites,
        dropFavorite,
        wipeFavorites,
        tr("lib.favEmpty", "还没有收藏。播放时点卡片右上角的 ☆ 就能收藏当前这条。")
      ),
      table(
        "hist",
        tr("lib.histTitle", "历史播放链接"),
        tr("lib.histHelp", "凡粘贴进来解析过的链接自动记一笔，最多保留最近 100 条，重复播放只累加次数。"),
        history,
        dropHistory,
        wipeHistory,
        tr("lib.histEmpty", "还没有历史。粘贴过的链接会自动记在这里。")
      ),
      status ? (0, import_react4.createElement)("div", { className: "dmo-lib-status" }, status) : null
    );
  }
  var LibrarySection_default = LibrarySection;

  // src/client/ui/Settings.jsx
  function textBlock(label, help, keyPrefix) {
    const parts = [
      (0, import_react5.createElement)("span", { key: `${keyPrefix}-label`, className: "dmo-setting-label" }, label)
    ];
    if (help) {
      parts.push((0, import_react5.createElement)("span", { key: `${keyPrefix}-help`, className: "dmo-setting-help" }, help));
    }
    return (0, import_react5.createElement)("span", { key: `${keyPrefix}-text`, className: "dmo-setting-text" }, parts);
  }
  function Settings(props) {
    const { settings, onChange, engine, t } = props || {};
    const fallbackStore = (0, import_react5.useMemo)(() => createSettingsStore(), []);
    const fallbackSettings = useSettings({ useState: import_react5.useState, useEffect: import_react5.useEffect }, fallbackStore);
    const current = settings || fallbackSettings;
    const [status, setStatus] = (0, import_react5.useState)("");
    const [busy, setBusy] = (0, import_react5.useState)(false);
    const [cacheInfo, setCacheInfo] = (0, import_react5.useState)(null);
    (0, import_react5.useEffect)(() => {
      if (!status) return void 0;
      const timer = setTimeout(() => setStatus(""), 2e3);
      return () => clearTimeout(timer);
    }, [status]);
    (0, import_react5.useEffect)(
      () => () => {
        fallbackStore.dispose();
      },
      [fallbackStore]
    );
    function emit3(key, value) {
      if (typeof onChange === "function") {
        onChange(key, value);
        return;
      }
      fallbackStore.patch(key, value);
      setStatus("已保存到本机");
    }
    function measureCache() {
      setBusy(true);
      const finish = (mb) => {
        setCacheInfo({ mb });
        setBusy(false);
      };
      try {
        if (typeof navigator !== "undefined" && navigator.storage && typeof navigator.storage.estimate === "function") {
          navigator.storage.estimate().then(
            (estimate) => {
              const bytes = estimate && typeof estimate.usage === "number" ? estimate.usage : 0;
              finish(Math.round(bytes / (1024 * 1024) * 10) / 10);
            },
            () => finish(null)
          );
          return;
        }
        finish(null);
      } catch (_error) {
        finish(null);
      }
    }
    function clearCache() {
      setBusy(true);
      let keys = [];
      try {
        if (typeof caches !== "undefined" && typeof caches.keys === "function") {
          caches.keys().then((list) => {
            keys = Array.isArray(list) ? list : [];
            return Promise.all(
              keys.map(
                (key) => Promise.resolve().then(() => caches.delete(key)).catch(() => false)
              )
            );
          }).then((results) => {
            const cleared = results.filter(Boolean).length;
            setStatus(cleared > 0 ? `已清空 ${cleared} 个缓存桶` : "缓存已是最新状态");
          }).catch(() => {
            setStatus("清空缓存失败，详见控制台");
          }).then(() => {
            setBusy(false);
            setCacheInfo(null);
          });
          return;
        }
        setStatus("当前环境无缓存可清");
      } catch (_error) {
        setStatus("清空缓存失败，详见控制台");
      }
      setBusy(false);
      setCacheInfo(null);
    }
    function resetAll() {
      setBusy(true);
      const defaults = normalizeSettings(void 0);
      for (const spec of SETTINGS_SCHEMA) emit3(spec.key, defaults[spec.key]);
      setBusy(false);
      setStatus("已恢复默认值");
    }
    const rows = SETTINGS_SCHEMA.map((spec) => {
      const value = current && current[spec.key] !== void 0 ? current[spec.key] : spec.default;
      const labelNode = textBlock(spec.label, spec.help, spec.key);
      if (spec.kind === "boolean") {
        return (0, import_react5.createElement)(
          "div",
          { key: spec.key, className: "dmo-setting-row" },
          labelNode,
          (0, import_react5.createElement)(
            "span",
            { className: "dmo-setting-control" },
            (0, import_react5.createElement)("input", {
              type: "checkbox",
              className: "dmo-switch",
              role: "switch",
              checked: value === true,
              disabled: busy,
              "aria-label": spec.label,
              onChange: (event) => emit3(spec.key, event.target.checked === true)
            })
          )
        );
      }
      if (spec.kind === "select") {
        const options = spec.options.map(
          (item) => (0, import_react5.createElement)("option", { key: String(item.value), value: String(item.value) }, item.label)
        );
        return (0, import_react5.createElement)(
          "div",
          { key: spec.key, className: "dmo-setting-row" },
          labelNode,
          (0, import_react5.createElement)(
            "span",
            { className: "dmo-setting-control" },
            (0, import_react5.createElement)(
              "select",
              {
                className: "dmo-select",
                value: String(value),
                disabled: busy,
                "aria-label": spec.label,
                onChange: (event) => {
                  const raw = event.target.value;
                  const picked = spec.options.find((item) => String(item.value) === raw);
                  emit3(spec.key, picked ? picked.value : spec.default);
                }
              },
              options
            )
          )
        );
      }
      const display = spec.key === "volume" ? `${Math.round(Number(value) * 100)}%` : String(value);
      return (0, import_react5.createElement)(
        "div",
        { key: spec.key, className: "dmo-setting-row" },
        labelNode,
        (0, import_react5.createElement)(
          "span",
          { className: "dmo-setting-control" },
          (0, import_react5.createElement)("input", {
            type: "range",
            className: "dmo-range",
            min: spec.min,
            max: spec.max,
            step: spec.step,
            value: Number(value),
            disabled: busy,
            "aria-label": spec.label,
            onChange: (event) => emit3(spec.key, Number(event.target.value))
          }),
          (0, import_react5.createElement)("span", { className: "dmo-range-value" }, display)
        )
      );
    });
    const GROUPS = [
      { id: "layout", title: "界面", keys: ["startCollapsed", "dockSize", "showTitles"] },
      { id: "playback", title: "播放", keys: ["volume", "loopMode", "allowAutoplay", "autoplayTarget", "crossfadeSec", "fadeOnPause", "rememberQueue"] },
      { id: "intake", title: "链接与歌单", keys: ["platformTrackLimit"] },
      { id: "spectrum", title: "频谱", keys: ["spectrumStyle", "spectrumPlacement", "spectrumBars", "spectrumGain", "spectrumGlow", "spectrumHeight", "spectrumFps"] },
      { id: "network", title: "网络与缓存", keys: ["proxyEnabled", "cacheLimitMB"] }
    ];
    const groupedKeys = new Set(GROUPS.reduce((all, group) => all.concat(group.keys), []));
    const ungrouped = SETTINGS_SCHEMA.map((spec) => spec.key).filter((key) => !groupedKeys.has(key));
    if (ungrouped.length > 0) GROUPS.push({ id: "other", title: "其他", keys: ungrouped });
    const byKey = /* @__PURE__ */ new Map();
    SETTINGS_SCHEMA.forEach((spec, index) => {
      byKey.set(spec.key, rows[index]);
    });
    const groups = GROUPS.map((group) => {
      const children = group.keys.map((key) => byKey.get(key)).filter(Boolean);
      if (children.length === 0) return null;
      return (0, import_react5.createElement)(
        "section",
        { key: group.id, className: "dmo-settings-group", "data-group": group.id },
        (0, import_react5.createElement)("div", { className: "dmo-settings-group-title" }, group.title),
        children
      );
    }).filter(Boolean);
    const actions = [
      (0, import_react5.createElement)(
        "button",
        { key: "measure", type: "button", className: "dmo-btn", onClick: measureCache, disabled: busy },
        "查看缓存占用"
      ),
      (0, import_react5.createElement)(
        "button",
        { key: "clear", type: "button", className: "dmo-btn", onClick: clearCache, disabled: busy },
        "清空缓存"
      ),
      (0, import_react5.createElement)(
        "button",
        { key: "reset", type: "button", className: "dmo-btn", onClick: resetAll, disabled: busy },
        "恢复默认值"
      )
    ];
    if (cacheInfo) {
      actions.push(
        (0, import_react5.createElement)(
          "span",
          { key: "cacheinfo", className: "dmo-settings-meta" },
          cacheInfo.mb === null ? "缓存占用不可读" : `当前占用 ${cacheInfo.mb} MB`
        )
      );
    }
    if (status) {
      actions.push((0, import_react5.createElement)("span", { key: "status", className: "dmo-settings-status" }, status));
    }
    return (0, import_react5.createElement)(
      "div",
      { className: "dmo-settings", "data-plugin": "dsh-music-on" },
      (0, import_react5.createElement)(
        "div",
        { className: "dmo-settings-head" },
        (0, import_react5.createElement)("div", { className: "dmo-settings-title" }, "音景播放器"),
        (0, import_react5.createElement)(
          "div",
          { className: "dmo-settings-sub" },
          "设置即时生效并持久化在 ",
          (0, import_react5.createElement)("code", { className: "dmo-code" }, "dsh-music-on:settings"),
          "，刷新后保留。"
        )
      ),
      (0, import_react5.createElement)("div", { className: "dmo-settings-body" }, groups),
      // 收藏与历史放在设置项之后、操作按钮之前：它们是「我攒下来的链接」，
      // 与上面那 19 项「播放器怎么表现」是两类东西，不该混进同一张表里。
      (0, import_react5.createElement)(LibrarySection_default, { key: "library", engine, t }),
      (0, import_react5.createElement)("div", { className: "dmo-settings-actions" }, actions)
    );
  }
  var Settings_default = Settings;

  // src/client/register.js
  var OVERLAY_SLOT = "shell.overlay";
  var PANE_TAB_SLOT = "sidebar.right.pane.tab";
  var PANE_TAB_TITLE_SLOT = "sidebar.right.pane.tab.title";
  var SETTINGS_SLOT = "settings.section";
  var inject = ["slots", "locale", "sidebarRight", "sidebarRightTabs"];
  function getRuntime() {
    const key = "__dsh_music_on_runtime__";
    if (typeof window !== "undefined" && window[key]) {
      const existing = window[key];
      if (existing.engine && typeof existing.engine.play === "function") return existing;
    }
    const runtime = { engine: getEngine(), store: createSettingsStore() };
    if (typeof window !== "undefined") window[key] = runtime;
    return runtime;
  }
  function setReactBridge(react) {
    if (!react || typeof react.createElement !== "function") {
      throw new Error("[dsh-music-on] 传入的 react 模块没有 createElement");
    }
    if (typeof window !== "undefined") window["__dsh_music_on_react__"] = react;
    REACT_REF = react;
  }
  var REACT_REF = null;
  function reactRef() {
    if (typeof window !== "undefined" && window["__dsh_music_on_react__"]) {
      return window["__dsh_music_on_react__"];
    }
    if (REACT_REF !== null) return REACT_REF;
    throw new Error("[dsh-music-on] react 未就绪");
  }
  function ShellDockSeat(props) {
    const React3 = reactRef();
    const runtime = getRuntime();
    const t = props && props.t || fallbackTranslate;
    const Dock = React3.useMemo(
      () => createShellDock({ React: React3, engine: runtime.engine, store: runtime.store, t, Spectrum: Spectrum_default }),
      [React3, t]
    );
    return React3.createElement(Dock, null);
  }
  function MusicTabTitle(props) {
    const t = props && props.t || fallbackTranslate;
    return reactRef().createElement("span", { className: "dmo-tabtitle" }, t("tab.title", "音乐台"));
  }
  function MusicSeat(props) {
    const React3 = reactRef();
    const { store, engine, t } = props || {};
    const settings = useSettingsSnapshot(store);
    const [presets, setPresets] = useStateSafe(() => getPresetsSync());
    useEffectSafe(() => {
      if (presets !== null) return void 0;
      let alive = true;
      ensurePresets({ store }).then((controller) => {
        if (alive && controller) setPresets(controller);
      });
      return () => {
        alive = false;
      };
    }, [presets, store]);
    return React3.createElement(
      "div",
      { className: "dmo-seat" },
      React3.createElement(Spectrum_default, { engine, settings }),
      React3.createElement(PlayerPanel_default, { engine, settings, presets, t })
    );
  }
  function MusicSettingsSection(props) {
    const React3 = reactRef();
    const runtime = props && props.runtime || getRuntime();
    const t = props && props.t || fallbackTranslate;
    const settings = useSettingsSnapshot(runtime.store);
    const onChange = (key, value) => {
      runtime.store.patch(key, value);
    };
    return React3.createElement(
      getSettingsBoundary(),
      { t },
      React3.createElement(Settings_default, { settings, onChange, engine: runtime.engine, t })
    );
  }
  var BoundaryComponent = null;
  function getSettingsBoundary() {
    if (BoundaryComponent !== null) return BoundaryComponent;
    const React3 = reactRef();
    const Base = React3 && React3.Component ? React3.Component : class {
    };
    class SettingsBoundary extends Base {
      constructor(props) {
        super(props);
        this.state = { error: null };
      }
      static getDerivedStateFromError(error) {
        return { error };
      }
      componentDidCatch(error, info) {
        if (typeof console !== "undefined" && console.error) {
          console.error("[dsh-music-on] 设置分区渲染失败", error, info);
        }
      }
      render() {
        const { error } = this.state;
        if (!error) return this.props.children;
        const t = this.props.t || fallbackTranslate;
        return React3.createElement(
          "div",
          { className: "dmo-settings dmo-settings--error" },
          React3.createElement("div", { className: "dmo-settings-group-title" }, t("settings.crashedTitle", "设置分区渲染失败")),
          React3.createElement(
            "p",
            { className: "dmo-setting-help" },
            t("settings.crashedHelp", "这不影响播放器本身。把下面这行错误发出来就能定位：")
          ),
          React3.createElement("pre", { className: "dmo-settings-trace" }, String(error && error.message ? error.message : error))
        );
      }
    }
    BoundaryComponent = SettingsBoundary;
    return BoundaryComponent;
  }
  function useSettingsSnapshot(store) {
    const { useState: useState5, useEffect: useEffect6 } = reactRef();
    const [snapshot, setSnapshot] = useState5(() => store ? store.get() : {});
    useEffect6(() => {
      if (!store || typeof store.subscribe !== "function") return void 0;
      setSnapshot(store.get());
      return store.subscribe((next) => setSnapshot(next));
    }, [store]);
    return snapshot;
  }
  function fallbackTranslate(key, fallback) {
    return fallback !== void 0 ? fallback : key;
  }
  function useStateSafe(initial) {
    const react = REACT_REF;
    if (!react || typeof react.useState !== "function") {
      return [typeof initial === "function" ? initial() : initial, () => {
      }];
    }
    return react.useState(initial);
  }
  function useEffectSafe(effect, deps) {
    const react = REACT_REF;
    if (!react || typeof react.useEffect !== "function") return void 0;
    return react.useEffect(effect, deps);
  }
  function registerShellDock(ctx, deps) {
    const { t } = deps;
    if (!ctx.slots) throw new Error("dsh-music-on: ctx.slots unavailable");
    return ctx.effect(
      () => ctx.slots.inject(
        OVERLAY_SLOT,
        () => ctx.slots.register(
          { name: OVERLAY_SLOT, id: PLUGIN_ID, order: 900, locale: PLUGIN_ID, inject: () => ({ t }) },
          ShellDockSeat
        )
      ),
      "dsh-music-on: shell dock"
    );
  }
  function registerTabType(ctx, deps) {
    const { t, icons } = deps;
    const definition = {
      id: TAB_ID,
      kind: TAB_KIND,
      // 会话内只留一个音乐台：重复点击聚焦已有页，而不是再开一个（openTabIn:
      // definition.multiple === true 才会拼 randomUUID 生成新 contentId）。
      multiple: false,
      // 隐藏后仍保活：播放不能被切标签页打断。
      keepMounted: true,
      priority: TAB_PRIORITY,
      title: () => t("tab.title"),
      guide: [
        {
          id: TAB_GUIDE_ID,
          order: TAB_GUIDE_ORDER,
          title: () => t("guide.title"),
          description: () => t("guide.description"),
          icon: icons && icons.music !== void 0 ? icons.music : void 0
        }
      ]
    };
    return ctx.effect(() => ctx.sidebarRightTabs.register(definition), "dsh-music-on: tab type");
  }
  function registerTabSeats(ctx, deps) {
    const { t, runtime } = deps;
    const seats = [
      [PANE_TAB_SLOT, MusicSeat, { engine: runtime.engine, store: runtime.store, t }, "dsh-music-on: tab body"],
      [PANE_TAB_TITLE_SLOT, MusicTabTitle, { t }, "dsh-music-on: tab title"]
    ];
    const disposers = seats.map(
      ([slot, Component, extra, label]) => ctx.effect(
        () => ctx.slots.inject(
          slot,
          () => ctx.slots.register(
            { name: slot, key: TAB_ID, locale: PLUGIN_ID, inject: () => ({ ...extra }) },
            Component
          )
        ),
        label
      )
    );
    return () => {
      for (const dispose of disposers.reverse()) dispose();
    };
  }
  function registerSettingsSection(ctx, deps) {
    const { t, runtime } = deps;
    return ctx.effect(
      () => ctx.slots.inject(
        SETTINGS_SLOT,
        () => ctx.slots.register(
          {
            name: SETTINGS_SLOT,
            id: PLUGIN_ID,
            order: 120,
            label: () => t("settings.title", "音乐库"),
            locale: PLUGIN_ID,
            inject: () => ({ runtime, t })
          },
          MusicSettingsSection
        )
      ),
      "dsh-music-on: settings section"
    );
  }
  function openMusicTab(ctx) {
    try {
      ctx.sidebarRight.openTab(TAB_KIND, { params: { source: "command" } });
      return true;
    } catch (error) {
      if (ctx.logger && typeof ctx.logger.warn === "function") ctx.logger.warn(error);
      return false;
    }
  }
  function apply(ctx) {
    ensureStyle();
    ctx.effect(() => removeStyle, "dsh-music-on: style");
    ctx.effect(() => ctx.locale.register(PLUGIN_ID, "zh", DICTS.zh), "dsh-music-on: locale zh");
    ctx.effect(() => ctx.locale.register(PLUGIN_ID, "en", DICTS.en), "dsh-music-on: locale en");
    const t = safeTranslate(ctx.locale.bind(PLUGIN_ID));
    const runtime = getRuntime();
    const deps = { t, runtime };
    safely(ctx, () => registerShellDock(ctx, deps), "shell dock");
    safely(ctx, () => registerSettingsSection(ctx, deps), "settings section");
    safely(ctx, () => registerTabType(ctx, deps), "tab type");
    safely(ctx, () => registerTabSeats(ctx, deps), "tab seats");
    void ensurePresets({ store: runtime.store });
    ctx.effect(
      () => () => {
        try {
          runtime.engine.dispose();
        } catch (_error) {
        }
        disposePresets();
      },
      "dsh-music-on: engine dispose"
    );
  }
  function safely(ctx, run, label) {
    try {
      run();
    } catch (error) {
      const logger = ctx && ctx.logger;
      if (logger && typeof logger.warn === "function") {
        logger.warn(`dsh-music-on: ${label} 注册失败`, error);
      } else if (typeof console !== "undefined") {
        console.warn(`dsh-music-on: ${label} 注册失败`, error);
      }
    }
  }
  var __test = {
    ShellDockSeat,
    MusicSeat,
    MusicTabTitle,
    MusicSettingsSection,
    useSettingsSnapshot,
    setReactBridge,
    safeTranslate,
    interpolate,
    getSettingsBoundary
  };
  var register_default = { name: PLUGIN_ID, inject, apply };
  return __toCommonJS(register_exports);
})();
globalThis.__dshMusicOnImpl__ = __dshMusicOnImpl__;
// ---- 内联实现结束 ----

        var impl = globalThis.__dshMusicOnImpl__;
        try { delete globalThis.__dshMusicOnImpl__; } catch (_e) { globalThis.__dshMusicOnImpl__ = void 0; }
        if (!impl) throw new Error('[dsh-music-on] 内联实现未求值');

        // 组件树共用同一份 react 实例：桥接必须在挂载任何组件之前完成。
        if (typeof impl.setReactBridge === 'function') impl.setReactBridge(require('react'));

        Object.assign(exported, impl);
        exported.__test = Object.assign({}, impl.__test, { react: require('react') });
        return module$.exports;
      },
    });
  } catch (error) {
    console.warn('[dsh-music-on] client bundle 注册失败：', error);
  }
})();
