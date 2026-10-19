/**
 * dsh-music-on —— 样式注入。
 *
 * 约定与宿主内置插件逐字一致（见
 * `C:\Users\candi\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\dsh-client-ui-sidebar-terminal\lib\client.js`
 * 里的 css$1 / tagId$1 块）：
 *   const tag = document.createElement('style');
 *   tag.dataset.plugin = <包名>;
 *   tag.dataset.pluginCss = <'包名/xxx.css'>;
 *   tag.textContent = css;
 *   document.head.appendChild(tag);
 * 插入前用 document.querySelector 幂等判断，重复装载不会产生第二个标签。
 *
 * 颜色一律走宿主语义变量（--dsw-alias-*）+ 兜底色，深浅主题自动适配。
 * 类名前缀统一 `dmo-`，与内置插件的短哈希前缀（如 zjup-W_）不会撞车。
 */
import { PLUGIN_ID } from '../shared.js';

/** 样式标签身份：`包名/文件`，同时作为 data-plugin-css 的值。 */
export const STYLE_TAG_ID = `${PLUGIN_ID}/client.css`;

/** 播放器 / 频谱 / 列表的全部样式。 */
export const CSS_TEXT = `
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
  border: 1px solid var(--dmo-edge, rgba(var(--dmo-rgb, 77, 107, 254), 0.28));
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
  background: var(--dsw-alias-interactive-bg-selected, rgba(var(--dmo-rgb, 77, 107, 254), .14));
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
  border: 1px solid var(--dmo-edge-strong, rgba(var(--dmo-rgb, 77, 107, 254), 0.5));
  border-radius: 999px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(var(--dmo-glass-tint, 236, 244, 255), 0.72)),
    var(--dmo-glass, rgba(255, 255, 255, 0.94));
  box-shadow:
    0 0 0 3px var(--dmo-halo, rgba(var(--dmo-rgb, 77, 107, 254), 0.26)),
    0 10px 26px rgba(var(--dmo-rgb-deep, 38, 74, 176), 0.22),
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
    0 0 0 4px var(--dmo-halo, rgba(var(--dmo-rgb, 77, 107, 254), 0.3)),
    0 14px 32px rgba(var(--dmo-rgb-deep, 38, 74, 176), 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.95);
}

.dmo-capsule:active {
  /* 拖动时不能再用位移做「按下」反馈：那会把胶囊整体挪 1px 而 box 没动，
   * 视觉上像被卡住。改成收紧光晕。 */
  box-shadow:
    0 0 0 2px var(--dmo-halo, rgba(var(--dmo-rgb, 77, 107, 254), 0.22)),
    0 4px 12px rgba(var(--dmo-rgb-deep, 38, 74, 176), 0.2);
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
  border: 1px solid var(--dmo-edge-strong, rgba(var(--dmo-rgb, 77, 107, 254), 0.5));
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
  border: 1px solid var(--dmo-edge-strong, rgba(var(--dmo-rgb, 77, 107, 254), 0.5));
  background:
    repeating-radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.1) 0 1px, transparent 1px 3px),
    radial-gradient(circle at 50% 50%, #2b3f74 0 30%, #131c33 31% 100%);
  box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, 0.9), 0 2px 10px rgba(var(--dmo-rgb-deep, 38, 74, 176), 0.3);
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
  box-shadow: 0 0 0 2px var(--dmo-edge-strong, rgba(var(--dmo-rgb, 77, 107, 254), 0.5));
}

.dmo-vinyl-label {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 13px;
  height: 13px;
  border: 1px solid rgba(var(--dmo-rgb-deeper, 47, 75, 216), 0.85);
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
    0 0 0 5px var(--dmo-halo, rgba(var(--dmo-rgb, 77, 107, 254), 0.3)),
    0 24px 52px rgba(var(--dmo-rgb-deep, 38, 74, 176), 0.34);
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
  border: 1px solid var(--dmo-edge-strong, rgba(var(--dmo-rgb, 77, 107, 254), 0.5));
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
  box-shadow: 0 2px 10px rgba(var(--dmo-rgb, 77, 107, 254), 0.45);
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
  box-shadow: 0 3px 12px rgba(var(--dmo-rgb, 77, 107, 254), 0.42);
  transition: transform 120ms ease, box-shadow 120ms ease;
}

.dmo-capsule-btn:hover {
  transform: scale(1.06);
  box-shadow: 0 4px 16px rgba(var(--dmo-rgb, 77, 107, 254), 0.55);
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
.dmo-embed,
.dmo-settings {
  /* 主题色三元组：整套 rgba(...) 都从这里派生，切换主题只换这一个值。
   * 之所以要拆出 RGB 三元组而不是只给一个 --dmo-brand：#dmo-line / --dmo-halo
   * 这类半透明层需要同一个色相配不同 alpha，CSS 没法给十六进制加透明度。 */
  --dmo-rgb: 77, 107, 254;
  --dmo-rgb-deep: 38, 74, 176;
  --dmo-rgb-deeper: 47, 75, 216;
  --dmo-glass-tint: 236, 244, 255;
  --dmo-glass-tint-2: 232, 241, 255;

  --dmo-fg: #16233f;
  --dmo-fg-dim: #45557a;
  --dmo-fg-faint: #5a6c92;
  --dmo-line: rgba(var(--dmo-rgb), 0.18);
  --dmo-hover: rgba(var(--dmo-rgb), 0.08);
  --dmo-sunken: rgba(var(--dmo-rgb), 0.06);

  /* 鲸鱼娘主题的专用色板（蓝白） */
  --dmo-brand: #4d6bfe;
  --dmo-brand-soft: #7b95ff;
  --dmo-brand-deep: #2f4bd8;
  --dmo-glass: rgba(255, 255, 255, 0.94);
  --dmo-glass-2: rgba(243, 248, 255, 0.97);
  --dmo-edge: rgba(var(--dmo-rgb), 0.28);
  --dmo-edge-strong: rgba(var(--dmo-rgb), 0.5);
  --dmo-halo: rgba(var(--dmo-rgb), 0.26);

  /* 频谱色板：canvas 通过 getComputedStyle(canvas) 继承读取，所以必须挂在
   * 会包住 canvas 的容器上（.dmo-dock-stack 包胶囊/卡片/通栏频谱三者）。
   * 底噪淡色 → 柱底中色 → 柱顶近白，光晕取高饱和同色相。 */
  --dmo-spec-base: rgba(150, 200, 255, 0.32);
  --dmo-spec-low: rgba(120, 180, 255, 0.58);
  --dmo-spec-high: rgba(255, 255, 255, 0.98);
  --dmo-spec-glow: rgba(120, 190, 255, 0.72);
  color: var(--dmo-fg);
}

/* ---------- 配色主题 ----------
 *
 * 每一块只覆盖颜色令牌，结构/间距/字号一概不动 —— 主题只该改颜色。
 * 顺序要求：必须排在 .dmo-dock-stack 默认块之后、深色块**之前**。
 * 放深色块之后会把「深色下该用深玻璃」这件事一起盖掉，卡片在深色界面上
 * 变成一张刺眼的白纸。
 *
 * 这里**不能**用 :where() 包起来。早期写成 :where([data-dmo-theme='x'])，
 * 结果是括号内权重被压到 0，主题块永远输给上面权重 (0,1,0) 的默认块 ——
 * 七套主题算出来的计算样式完全一致，换主题视觉上毫无变化（真机实测复现）。
 * 现在用普通属性选择器，与默认块同权 (0,1,0)，靠「排在后面」胜出；
 * 卡片里更具体的选择器（例如 .dmo-x.dmo-y）仍然能盖过主题。
 */
[data-dmo-theme='whale'] {
  /* 默认主题：与上方锚点同值。写全是为了让「七套主题都自带完整令牌」成为
   * 可断言的事实 —— 只有 --dmo-rgb 的块会让测试与实际渲染产生分歧。 */
  --dmo-rgb: 77, 107, 254;
  --dmo-brand: #4d6bfe;
}

[data-dmo-theme='aurora'] {
  --dmo-rgb: 92, 140, 255;
  --dmo-rgb-deep: 52, 70, 190;
  --dmo-rgb-deeper: 70, 96, 220;
  --dmo-glass-tint: 232, 240, 255;
  --dmo-glass-tint-2: 228, 236, 255;
  --dmo-brand: #5c8cff;
  --dmo-brand-soft: #9f7bff;
  --dmo-brand-deep: #3a4fd8;
  --dmo-glass: rgba(255, 255, 255, 0.94);
  --dmo-glass-2: rgba(240, 245, 255, 0.97);
  --dmo-spec-base: rgba(130, 200, 255, 0.32);
  --dmo-spec-low: rgba(130, 170, 255, 0.6);
  --dmo-spec-high: rgba(226, 240, 255, 0.98);
  --dmo-spec-glow: rgba(140, 150, 255, 0.75);
}

[data-dmo-theme='mint'] {
  --dmo-rgb: 40, 180, 140;
  --dmo-rgb-deep: 16, 110, 84;
  --dmo-rgb-deeper: 18, 138, 99;
  --dmo-glass-tint: 232, 252, 244;
  --dmo-glass-tint-2: 226, 249, 239;
  --dmo-brand: #23b98a;
  --dmo-brand-soft: #6fe0b6;
  --dmo-brand-deep: #128a63;
  --dmo-glass: rgba(255, 255, 255, 0.94);
  --dmo-glass-2: rgba(240, 253, 248, 0.97);
  --dmo-spec-base: rgba(140, 235, 200, 0.32);
  --dmo-spec-low: rgba(80, 215, 170, 0.6);
  --dmo-spec-high: rgba(240, 255, 250, 0.98);
  --dmo-spec-glow: rgba(60, 220, 170, 0.72);
}

[data-dmo-theme='sunset'] {
  --dmo-rgb: 245, 138, 60;
  --dmo-rgb-deep: 150, 68, 16;
  --dmo-rgb-deeper: 209, 96, 28;
  --dmo-glass-tint: 255, 240, 226;
  --dmo-glass-tint-2: 255, 234, 216;
  --dmo-brand: #f5863c;
  --dmo-brand-soft: #ffb26b;
  --dmo-brand-deep: #d1601c;
  --dmo-glass: rgba(255, 255, 255, 0.94);
  --dmo-glass-2: rgba(255, 247, 240, 0.97);
  --dmo-spec-base: rgba(255, 190, 140, 0.32);
  --dmo-spec-low: rgba(255, 150, 90, 0.6);
  --dmo-spec-high: rgba(255, 245, 230, 0.98);
  --dmo-spec-glow: rgba(255, 150, 70, 0.72);
}

[data-dmo-theme='rose'] {
  --dmo-rgb: 232, 90, 140;
  --dmo-rgb-deep: 140, 36, 74;
  --dmo-rgb-deeper: 194, 58, 107;
  --dmo-glass-tint: 255, 236, 244;
  --dmo-glass-tint-2: 255, 230, 240;
  --dmo-brand: #e85a8c;
  --dmo-brand-soft: #ff8fb5;
  --dmo-brand-deep: #c23a6b;
  --dmo-glass: rgba(255, 255, 255, 0.94);
  --dmo-glass-2: rgba(255, 245, 249, 0.97);
  --dmo-spec-base: rgba(255, 180, 210, 0.32);
  --dmo-spec-low: rgba(255, 120, 175, 0.6);
  --dmo-spec-high: rgba(255, 246, 250, 0.98);
  --dmo-spec-glow: rgba(255, 110, 170, 0.72);
}

[data-dmo-theme='neon'] {
  --dmo-rgb: 0, 210, 190;
  --dmo-rgb-deep: 0, 70, 90;
  --dmo-rgb-deeper: 0, 140, 130;
  --dmo-glass-tint: 224, 255, 250;
  --dmo-glass-tint-2: 216, 253, 248;
  --dmo-brand: #00d2be;
  --dmo-brand-soft: #6bffe8;
  --dmo-brand-deep: #00998c;
  --dmo-glass: rgba(250, 255, 254, 0.94);
  --dmo-glass-2: rgba(238, 255, 253, 0.97);
  --dmo-spec-base: rgba(120, 255, 235, 0.34);
  --dmo-spec-low: rgba(0, 235, 210, 0.62);
  --dmo-spec-high: rgba(235, 255, 252, 0.99);
  --dmo-spec-glow: rgba(0, 255, 220, 0.78);
}

[data-dmo-theme='mono'] {
  --dmo-rgb: 120, 124, 132;
  --dmo-rgb-deep: 48, 52, 58;
  --dmo-rgb-deeper: 75, 85, 99;
  --dmo-glass-tint: 242, 243, 245;
  --dmo-glass-tint-2: 236, 238, 241;
  --dmo-brand: #6b7280;
  --dmo-brand-soft: #9aa1ab;
  --dmo-brand-deep: #4b5563;
  --dmo-glass: rgba(255, 255, 255, 0.94);
  --dmo-glass-2: rgba(246, 247, 248, 0.97);
  --dmo-spec-base: rgba(190, 195, 202, 0.32);
  --dmo-spec-low: rgba(150, 156, 165, 0.6);
  --dmo-spec-high: rgba(252, 252, 253, 0.98);
  --dmo-spec-glow: rgba(160, 168, 178, 0.7);
}

/*
 * 系统级深色兜底（宿主未显式声明主题时生效）。
 *
 * 只覆盖「前景 / 玻璃 / 描边透明度」这三类，**不覆盖色相**：
 * 色相由主题块决定，深色只是把它换成深玻璃与更高的描边透明度。
 * 早先这里写死了蓝色系的 spec 色板，导致换成薄荷/落日主题后频谱仍是蓝的。
 */
@media (prefers-color-scheme: dark) {
  .dmo-dock-stack,
  .dmo-card,
  .dmo-embed,
  .dmo-settings {
    --dmo-fg: #eef3ff;
    --dmo-fg-dim: #a8b4cf;
    --dmo-fg-faint: #8b96b3;
    --dmo-line: rgba(var(--dmo-rgb), 0.3);
    --dmo-hover: rgba(var(--dmo-rgb), 0.16);
    --dmo-sunken: rgba(var(--dmo-rgb), 0.12);
    --dmo-glass: rgba(20, 28, 48, 0.94);
    --dmo-glass-2: rgba(26, 36, 60, 0.96);
    --dmo-edge: rgba(var(--dmo-rgb), 0.42);
    --dmo-edge-strong: rgba(var(--dmo-rgb), 0.66);
    --dmo-halo: rgba(var(--dmo-rgb), 0.36);
  }
}

/*
 * 显式主题优先于系统偏好：这条必须排在 @media 之后，
 * 靠「同权重后出现者胜出」压过上一块。宿主的 data-theme 一旦声明就是权威。
 */
:where([data-theme='dark'], [data-color-scheme='dark'], .dark) .dmo-dock-stack,
:where([data-theme='dark'], [data-color-scheme='dark'], .dark) .dmo-card,
:where([data-theme='dark'], [data-color-scheme='dark'], .dark) .dmo-embed,
:where([data-theme='dark'], [data-color-scheme='dark'], .dark) .dmo-settings {
  --dmo-fg: #eef3ff;
  --dmo-fg-dim: #a8b4cf;
  --dmo-fg-faint: #8b96b3;
  --dmo-line: rgba(var(--dmo-rgb), 0.3);
  --dmo-hover: rgba(var(--dmo-rgb), 0.16);
  --dmo-sunken: rgba(var(--dmo-rgb), 0.12);
  --dmo-glass: rgba(20, 28, 48, 0.94);
  --dmo-glass-2: rgba(26, 36, 60, 0.96);
  --dmo-edge: rgba(var(--dmo-rgb), 0.42);
  --dmo-edge-strong: rgba(var(--dmo-rgb), 0.66);
  --dmo-halo: rgba(var(--dmo-rgb), 0.36);
}

.dmo-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  /* 与胶囊同一套语言：冷白玻璃 + 鲸蓝描边 + 外圈蓝雾。
   * 顶部还有一道极细的高光（::before），让它有厚度而不是一片纯色。 */
  border: 1px solid var(--dmo-edge-strong, rgba(var(--dmo-rgb, 77, 107, 254), 0.5));
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(var(--dmo-glass-tint-2, 232, 241, 255), 0.78)),
    var(--dmo-glass, rgba(255, 255, 255, 0.94));
  box-shadow:
    0 0 0 3px var(--dmo-halo, rgba(var(--dmo-rgb, 77, 107, 254), 0.26)),
    0 18px 44px rgba(var(--dmo-rgb-deep, 38, 74, 176), 0.26),
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
      linear-gradient(180deg, rgba(var(--dmo-rgb-dark, 34, 46, 76), 0.92), rgba(var(--dmo-rgb-dark-2, 20, 28, 48), 0.9)),
      var(--dmo-glass, rgba(var(--dmo-rgb-dark-2, 20, 28, 48), 0.94));
    box-shadow:
      0 0 0 3px var(--dmo-halo, rgba(80, 120, 255, 0.34)),
      0 18px 44px rgba(0, 0, 0, 0.5),
      inset 0 1px 0 rgba(150, 185, 255, 0.18);
  }
}

:where([data-theme='dark'], [data-color-scheme='dark'], .dark) .dmo-card {
  background:
    linear-gradient(180deg, rgba(var(--dmo-rgb-dark, 34, 46, 76), 0.92), rgba(var(--dmo-rgb-dark-2, 20, 28, 48), 0.9)),
    var(--dmo-glass, rgba(var(--dmo-rgb-dark-2, 20, 28, 48), 0.94));
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
  border: 1px solid var(--dmo-edge-strong, rgba(var(--dmo-rgb, 77, 107, 254), 0.5));
  border-radius: 50%;
  /* 主按钮：鲸蓝实心 + 外圈光晕。这是整个卡片里唯一的强色块，
   * 用户的视线第一秒要能落在它上面。 */
  background: linear-gradient(160deg, var(--dmo-brand-soft, #7b95ff), var(--dmo-brand, #4d6bfe));
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(var(--dmo-rgb, 77, 107, 254), 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.5);
  transition: transform 120ms ease, box-shadow 120ms ease;
}

.dmo-play:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(var(--dmo-rgb, 77, 107, 254), 0.52), inset 0 1px 0 rgba(255, 255, 255, 0.55);
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
      rgba(var(--dmo-rgb, 77, 107, 254), 0.18) var(--dmo-seek-p, 0%),
      rgba(var(--dmo-rgb, 77, 107, 254), 0.18) 100%);
}

.dmo-seek::-moz-range-track {
  height: 6px;
  border-radius: 999px;
  background: rgba(var(--dmo-rgb, 77, 107, 254), 0.18);
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
  box-shadow: 0 1px 4px rgba(var(--dmo-rgb, 77, 107, 254), 0.5);
}

.dmo-seek::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: var(--dmo-brand, #4d6bfe);
  box-shadow: 0 1px 4px rgba(var(--dmo-rgb, 77, 107, 254), 0.5);
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
      rgba(var(--dmo-rgb, 77, 107, 254), 0.14) 0deg 270deg,
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
  border: 1px solid var(--dmo-edge, rgba(var(--dmo-rgb, 77, 107, 254), 0.28));
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
  border-color: var(--dmo-edge-strong, rgba(var(--dmo-rgb, 77, 107, 254), 0.5));
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
  border: 1px solid var(--dmo-edge, rgba(var(--dmo-rgb, 77, 107, 254), 0.28));
  border-radius: 999px;
  background: rgba(var(--dmo-rgb, 77, 107, 254), 0.06);
  color: var(--dmo-fg-dim);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  /* 循环按钮的文字是「列表循环/单曲循环/不循环」，比原先的裸枚举 all 长得多。
     不锁不换行的话，走带行空间紧张时会被压成两行、把整行撑高。 */
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
}

/* 循环模式换档时给一点状态色，让「现在是哪种循环」不用凑近看字。 */
.dmo-chip[data-loop='one'] {
  color: var(--dmo-brand-deep, #2f4bd8);
  border-color: var(--dmo-edge-strong, rgba(var(--dmo-rgb, 77, 107, 254), 0.5));
  background: rgba(var(--dmo-rgb, 77, 107, 254), 0.12);
}

.dmo-chip[data-loop='off'] {
  opacity: 0.72;
}

.dmo-chip:hover {
  color: var(--dmo-brand-deep, #2f4bd8);
  border-color: var(--dmo-edge-strong, rgba(var(--dmo-rgb, 77, 107, 254), 0.5));
  background: rgba(var(--dmo-rgb, 77, 107, 254), 0.12);
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
  border: 1px solid var(--dmo-edge, rgba(var(--dmo-rgb, 77, 107, 254), 0.28));
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
  border: 1px solid var(--dmo-edge, rgba(var(--dmo-rgb, 77, 107, 254), 0.28));
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.6);
  color: inherit;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease;
}

.dmo-btn:hover:not(:disabled) {
  background: rgba(var(--dmo-rgb, 77, 107, 254), 0.1);
  border-color: var(--dmo-edge-strong, rgba(var(--dmo-rgb, 77, 107, 254), 0.5));
}

.dmo-primary {
  border-color: transparent;
  background: linear-gradient(160deg, var(--dmo-brand-soft, #7b95ff), var(--dmo-brand, #4d6bfe));
  color: #fff;
  box-shadow: 0 3px 12px rgba(var(--dmo-rgb, 77, 107, 254), 0.34);
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
  border-color: var(--dmo-edge, rgba(var(--dmo-rgb, 77, 107, 254), 0.28));
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
  background: var(--dsw-alias-bg-active, rgba(var(--dmo-rgb, 77, 107, 254), 0.12));
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
  border: 2px dashed var(--dmo-edge-strong, rgba(var(--dmo-rgb, 77, 107, 254), 0.5));
  border-radius: 14px;
  background: var(--dmo-hover, rgba(var(--dmo-rgb, 77, 107, 254), 0.08));
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
  /* 宽度走 --dmo-span（设置项 spectrumSpan，20-100%）：
   * left 用 calc 算出居中偏移，right 置 auto —— 若同时留 left/right，
   * width 会被忽略，带子永远满宽，「频谱太短」的另一半也修不好。 */
  left: calc((100% - var(--dmo-span, 80%)) / 2);
  right: auto;
  width: var(--dmo-span, 80%);
  bottom: 0;
  /* 高度由 ShellDock 内联注入（设置项 spectrumHeight），这里只留兜底值 */
  height: 64px;
  opacity: 0.92;
  pointer-events: none;
  z-index: 0;
  transition: opacity 0.28s ease, filter 0.28s ease, width 0.18s ease, left 0.18s ease;
  /* 底沿一层极淡的同色雾，把整条频谱托住，不让它在页面底边「飘着」。 */
  background: linear-gradient(180deg, transparent 0%, rgba(var(--dmo-rgb), 0.06) 60%, rgba(var(--dmo-rgb), 0.12) 100%);
}

/* 两侧竖向边界线：用户参考图里的那两道「框」，让频谱读起来是一条被框住的带子。
 * 贴在带子自己的两侧（0），不是视口两侧 —— 带子收窄后仍要贴着内容边界。 */
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

.dmo-barspectrum::before { left: 0; }
.dmo-barspectrum::after { right: 0; }

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
 *
 * 颜色令牌一律不在这里重复定义：.dmo-settings 已并入文件上方那段共享令牌块
 * 与主题块的选择器列表。早先它自己硬编码了一整套（--dmo-brand: #4d6bfe 等），
 * 又排在那 7 个主题块之后，于是设置页永远显示鲸鱼蓝、换主题只改播放器不改设置页。
 */
.dmo-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 14px 16px 16px;
  border: 1px solid var(--dmo-line);
  border-radius: 14px;
  /* 必须自带底色。设置分区是别人的弹窗里的一块「外来内容」，宿主那层是半透明的，
   * 早前这里没写 background，于是 --dmo-fg-faint(#5a6c92) 直接落在宿主的
   * rgba(132,122,98,0.5) 面板上 —— 实测对比度只有 2.0:1，11.5px 的说明文字
   * 在真机上几乎读不出来（截图里「长期保留的链接…」那行几乎和背景同色）。
   * 用与卡片同一套玻璃令牌，深色块会把 --dmo-glass-2 翻成深玻璃，两边都自洽。 */
  background: var(--dmo-glass-2, rgba(243, 248, 255, 0.97));
  container-type: inline-size;
  color: var(--dmo-fg);
  font-size: 13px;
  line-height: 1.5;
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
  box-shadow: 0 0 0 1px var(--dmo-edge, rgba(var(--dmo-rgb, 77, 107, 254), 0.28)), 0 0 8px var(--dmo-halo, rgba(var(--dmo-rgb, 77, 107, 254), 0.26));
  cursor: pointer;
}

.dmo-range::-moz-range-thumb {
  width: 13px;
  height: 13px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: linear-gradient(180deg, var(--dmo-brand-soft, #7b95ff), var(--dmo-brand, #4d6bfe));
  box-shadow: 0 0 0 1px var(--dmo-edge, rgba(var(--dmo-rgb, 77, 107, 254), 0.28));
  cursor: pointer;
}

.dmo-range:focus-visible {
  box-shadow: 0 0 0 3px var(--dmo-halo, rgba(var(--dmo-rgb, 77, 107, 254), 0.26));
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
  box-shadow: 0 0 8px var(--dmo-halo, rgba(var(--dmo-rgb, 77, 107, 254), 0.26));
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

/**
 * 幂等注入：重复装载、切主题、HMR 都不会产生第二个 <style>。
 * 样式失败只影响观感，绝不让插件抛错。
 */
export function ensureStyle() {
  if (typeof document === 'undefined') return null;
  try {
    const existing = document.querySelector(`style[data-plugin-css="${STYLE_TAG_ID}"]`);
    if (existing !== null) return existing;
    const tag = document.createElement('style');
    tag.dataset.plugin = PLUGIN_ID;
    tag.dataset.pluginCss = STYLE_TAG_ID;
    tag.textContent = CSS_TEXT;
    document.head.appendChild(tag);
    return tag;
  } catch (_error) {
    return null;
  }
}

/** 卸载时清理：只删自己那一个标签。 */
export function removeStyle() {
  if (typeof document === 'undefined') return;
  try {
    const existing = document.querySelector(`style[data-plugin-css="${STYLE_TAG_ID}"]`);
    if (existing !== null && existing.parentNode !== null) existing.parentNode.removeChild(existing);
  } catch (_error) {
    /* 清理失败不影响下一次装载：ensureStyle 仍会复用已存在的标签 */
  }
}