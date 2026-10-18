/**
 * dsh-music-on —— 浏览器半边与宿主的唯一接缝。
 *
 * 装载链路上的三个硬事实（改动此处前务必重读）：
 *
 *  1) `client.js` 是 `window.__ModuleLoader__.load({ factory: (require) => … })`
 *     的 CJS 壳，宿主 `dsh-client-modules` 只 readFileSync 后原样吐出，**零转译**。
 *     故本文件只允许 ESM 静态 import，不允许 JSX、不允许 TS。
 *
 *  2) `require` 只认平台种子词、已 materialize 的模块、已注册的 package factory；
 *     相对路径一概不解析。真正的出口是 `client.js` 里内联的整棵实现。
 *
 *  3) 宿主是 cordis 语义：`exports.inject` 声明依赖，`exports.apply(ctx)` 是插件体。
 *
 * 落点选择（这才是本文件最关键的决定）：
 *   音乐库挂 `shell.overlay`（root 级槽位），不挂右侧栏。
 *   `dsh-client-ui-layout` 里 `.AppFrame_overlayLayer` 是 `position:absolute; inset:0;
 *   z-index:20; pointer-events:none`，直接子元素自动恢复 `pointer-events:auto`。
 *   所以组件只要自己 `bottom/right` 定位，就正好落在「界面右下空白处」，
 *   且不会挡住下方任何东西。
 *
 * 注册分三段，全部包在 ctx.effect 里保证卸载干净：
 *   A. 悬浮音乐库  shell.overlay
 *   B. 设置分区    settings.section
 *   C. 标签页类型  sidebarRightTabs（保留，供用户想侧边栏大屏形态时用）
 */

import { PLUGIN_ID, TAB_ID, TAB_KIND, TAB_PRIORITY, TAB_GUIDE_ORDER, TAB_GUIDE_ID } from '../shared.js';
import { DICTS } from './locale.js';
import { ensureStyle, removeStyle } from './styles.js';
import { createSettingsStore } from './settings.js';
import { getEngine } from './engine.js';
import { disposePresets, ensurePresets, getPresetsSync } from './presets-boot.js';
import { createShellDock } from './ui/ShellDock.js';
import { safeTranslate, interpolate } from './i18n.js';
import PlayerPanel from './ui/PlayerPanel.jsx';
import Spectrum from './ui/Spectrum.jsx';
import Settings from './ui/Settings.jsx';

/* safeTranslate / interpolate 的实现搬到 src/client/i18n.js。
 *
 * 搬家的理由是测试：register.js 会 import `.jsx`，Node 侧无法直接加载它，
 * 而「第二参传字符串遇上含 {占位符} 的字典就抛 TypeError」这个真根因必须被单测盯住
 * （见 test/i18n-crash.test.mjs）。实现只留一份，这里只做 import，不再复制。 */

/** 槽位名常量：注册处与自检处共用一份，避免拼写漂移。 */
export const OVERLAY_SLOT = 'shell.overlay';
export const PANE_TAB_SLOT = 'sidebar.right.pane.tab';
export const PANE_TAB_TITLE_SLOT = 'sidebar.right.pane.tab.title';
export const SETTINGS_SLOT = 'settings.section';

/**
 * 依赖服务：缺任何一个注册都会静默失败，故显式声明让宿主先就绪。
 *
 * 铁律：`inject` 里只能写**真实存在的 cordis 服务名**。
 * `shell` 曾经被我写进这里，结果是 web boot 报
 *   `dsh-music-on: pending (waiting for service: shell)` —— 1 entry did not activate。
 * 宿主里 `shell` 只是设置卡片/终端条目之类的 id，压根不是一个服务；
 * `shell.overlay`（含那个点）是 slots 服务里的**槽位名**，挂在 `slots` 上，
 * 与有没有 `shell` 服务无关。见 `dsh-client-ui-layout/lib/client.js:313`
 * 的 `renderSlot("shell.overlay", {})` 与 `:643` 的声明。
 */
export const inject = ['slots', 'locale', 'sidebarRight', 'sidebarRightTabs'];

/* ---------------- 运行时单例 ---------------- */

/**
 * 引擎与设置 store 都是跨组件共享的模块级单例。
 * 二次 materialize（HMR / 双份 bundle）会造出两份实例，表现为
 * 「切一次面板就多一路声音」「设置改了不生效」，所以挂在 window 上兜底。
 * @returns {{engine: object, store: object}}
 */
export function getRuntime() {
  const key = '__dsh_music_on_runtime__';
  if (typeof window !== 'undefined' && window[key]) {
    const existing = window[key];
    if (existing.engine && typeof existing.engine.play === 'function') return existing;
  }
  const runtime = { engine: getEngine(), store: createSettingsStore() };
  if (typeof window !== 'undefined') window[key] = runtime;
  return runtime;
}

/* ---------------- React 桥 ---------------- */

/**
 * 宿主不往插槽 props 里塞 react，组件内部各自 `import React from 'react'`
 * 又会各拿一份。这里统一从模块表取一次并缓存，保证整棵树共用同一个实例。
 * @param {object} react 宿主模块表里的 react 命名空间。
 */
export function setReactBridge(react) {
  if (!react || typeof react.createElement !== 'function') {
    throw new Error('[dsh-music-on] 传入的 react 模块没有 createElement');
  }
  if (typeof window !== 'undefined') window['__dsh_music_on_react__'] = react;
  REACT_REF = react;
}

/** @type {object | null} 供 UI 组件复用的 react 引用。 */
let REACT_REF = null;

/**
 * 取宿主 react 实例。
 *
 * 优先 window 上挂的那份：client.js 是 CJS 壳，可能被 materialize 两次；
 * 模块级变量会随之分叉，window 上的那份才是全局唯一的。
 * @returns {object} react 命名空间。
 */
function reactRef() {
  if (typeof window !== 'undefined' && window['__dsh_music_on_react__']) {
    return window['__dsh_music_on_react__'];
  }
  if (REACT_REF !== null) return REACT_REF;
  throw new Error('[dsh-music-on] react 未就绪');
}

/* ---------------- 组件适配层 ---------------- */

/**
 * 右下角音乐库座位。
 *
 * 宿主注入的插槽 props 里没有 react，也没有引擎；这里把运行时依赖
 * 收进一个闭包组件，槽位只认这一个组件。
 * @param {object} props 宿主注入的插槽 props（本组件不消费）。
 * @returns {object} React 元素。
 */
function ShellDockSeat(props) {
  // 每个组件体都取一次 react：模块顶层求值发生在 client.js 的 require 阶段，
  // 那时 setReactBridge 还没执行，顶层取会拿到空。
  const React = reactRef();
  const runtime = getRuntime();
  const t = (props && props.t) || fallbackTranslate;
  // createShellDock 每次渲染都会新建组件函数，必须用 useMemo 固定，
  // 否则 React 会把整棵树当成新类型卸载重建 —— 表现为播放状态每帧丢失。
  const Dock = React.useMemo(
    () => createShellDock({ React, engine: runtime.engine, store: runtime.store, t, Spectrum }),
    [React, t],
  );
  return React.createElement(Dock, null);
}

/** 标签页标题组件：标题是静态文案，不订阅播放状态，避免每帧重渲染标签条。 */
function MusicTabTitle(props) {
  const t = (props && props.t) || fallbackTranslate;
  return reactRef().createElement('span', { className: 'dmo-tabtitle' }, t('tab.title', '音乐台'));
}

/** 侧边栏大屏形态：频谱在上、面板在下。 */
function MusicSeat(props) {
  const React = reactRef();
  const { store, engine, t } = props || {};
  const settings = useSettingsSnapshot(store);

  // 预置控制器异步建（拉清单 + 探 IndexedDB）。首帧给同步快照，建好后补。
  const [presets, setPresets] = useStateSafe(() => getPresetsSync());
  useEffectSafe(() => {
    if (presets !== null) return undefined;
    let alive = true;
    ensurePresets({ store }).then((controller) => {
      if (alive && controller) setPresets(controller);
    });
    return () => {
      alive = false;
    };
  }, [presets, store]);

  return React.createElement(
    'div',
    { className: 'dmo-seat' },
    React.createElement(Spectrum, { engine, settings }),
    React.createElement(PlayerPanel, { engine, settings, presets, t }),
  );
}

/** 设置分区组件：把 store 的当前值 + onChange 接到 Settings 上。 */
function MusicSettingsSection(props) {
  const React = reactRef();
  const runtime = (props && props.runtime) || getRuntime();
  const t = (props && props.t) || fallbackTranslate;
  const settings = useSettingsSnapshot(runtime.store);
  const onChange = (key, value) => {
    runtime.store.patch(key, value);
  };
  // engine 必须一起交给 Settings：收藏/历史表里的「播放」要走 intakeLinks 入队，
  // 没有 engine 那两行只能是个装饰。
  // 整块用 boundary 包起来：设置分区里任何一个子组件在渲染期抛错，
  // React 会把整棵子树卸载（用户看到的就是「设置页一片空白」，且没有任何提示）。
  return React.createElement(
    getSettingsBoundary(),
    { t },
    React.createElement(Settings, { settings, onChange, engine: runtime.engine, t }),
  );
}

/**
 * 设置分区错误边界（惰性构造的 class 组件）。
 *
 * 存在理由是一次真实事故：`lib.playsCount` 的字典值含 `{count}`，而宿主
 * `translate()` 把第二参当插值对象、用 `name in params` 取值，我们却传了字符串 →
 * `TypeError: Cannot use 'in' operator` → 设置分区整棵子树被卸载 → 无声白屏。
 * 文案拼错这种低级错误不该以「什么都看不见」的形式呈现，所以留一道网。
 *
 * 为什么是工厂而不是直接 `class extends React.Component`：错误边界只能写成 class，
 * 而 `react` 要等 client.js 的 require 阶段才拿得到；模块顶层求值时 reactRef() 还是空的，
 * 那时 extends 出来的基类是空对象，边界根本不会生效。所以等到第一次真正渲染时再建类，并缓存。
 * @returns {Function} 可直接 createElement 的边界组件。
 */
let BoundaryComponent = null;
function getSettingsBoundary() {
  if (BoundaryComponent !== null) return BoundaryComponent;
  const React = reactRef();
  const Base = React && React.Component ? React.Component : class {};

  class SettingsBoundary extends Base {
    constructor(props) {
      super(props);
      this.state = { error: null };
    }

    static getDerivedStateFromError(error) {
      return { error };
    }

    componentDidCatch(error, info) {
      // 只在控制台留证据，不打断用户操作。
      if (typeof console !== 'undefined' && console.error) {
        console.error('[dsh-music-on] 设置分区渲染失败', error, info);
      }
    }

    render() {
      const { error } = this.state;
      if (!error) return this.props.children;
      const t = this.props.t || fallbackTranslate;
      return React.createElement(
        'div',
        { className: 'dmo-settings dmo-settings--error' },
        React.createElement('div', { className: 'dmo-settings-group-title' }, t('settings.crashedTitle', '设置分区渲染失败')),
        React.createElement(
          'p',
          { className: 'dmo-setting-help' },
          t('settings.crashedHelp', '这不影响播放器本身。把下面这行错误发出来就能定位：'),
        ),
        React.createElement('pre', { className: 'dmo-settings-trace' }, String(error && error.message ? error.message : error)),
      );
    }
  }

  BoundaryComponent = SettingsBoundary;
  return BoundaryComponent;
}

/**
 * 订阅设置 store，返回可直接渲染的扁平对象。
 *
 * 用 useState + 初始快照而不是 useSyncExternalStore：宿主各版本对后者
 * 的支持不一致，而这个 store 的变更频率极低（用户点设置才变），
 * 手写订阅没有性能问题，却少一个不兼容点。
 * @param {object} store createSettingsStore() 的返回值。
 * @returns {object} 当前设置快照。
 */
function useSettingsSnapshot(store) {
  const { useState, useEffect } = reactRef();
  const [snapshot, setSnapshot] = useState(() => (store ? store.get() : {}));
  useEffect(() => {
    if (!store || typeof store.subscribe !== 'function') return undefined;
    setSnapshot(store.get());
    return store.subscribe((next) => setSnapshot(next));
  }, [store]);
  return snapshot;
}

/** 兜底翻译器：注入的 t 缺失时至少不崩。 */
function fallbackTranslate(key, fallback) {
  return fallback !== undefined ? fallback : key;
}

/**
 * hooks 的安全取用层。
 *
 * 组件体可能在没有 react 桥的极早时机被求值（宿主预渲染、单测里的浅调用）。
 * 直接解构会在那种情况下抛错，把一个可降级的渲染失败放大成整块白屏。
 * 所以这两个包装：桥在就用真 hook，桥不在就返回退化实现。
 */
function useStateSafe(initial) {
  const react = REACT_REF;
  if (!react || typeof react.useState !== 'function') {
    return [typeof initial === 'function' ? initial() : initial, () => {}];
  }
  return react.useState(initial);
}

function useEffectSafe(effect, deps) {
  const react = REACT_REF;
  if (!react || typeof react.useEffect !== 'function') return undefined;
  return react.useEffect(effect, deps);
}

/* ---------------- 注册三段 ---------------- */

/**
 * A. 右下角悬浮音乐库。
 *
 * 槽位是 root 级的：宿主在应用外壳里渲染一次，不随会话切换卸载，
 * 所以音乐能跨会话连续播放。注册值里 order 取大值，压在其它覆盖层之上。
 * @param {object} ctx 浏览器侧 cordis 上下文。
 * @param {{t: Function}} deps 注入的翻译器。
 * @returns {Function} disposer。
 */
export function registerShellDock(ctx, deps) {
  const { t } = deps;
  if (!ctx.slots) throw new Error('dsh-music-on: ctx.slots unavailable');
  return ctx.effect(
    () =>
      ctx.slots.inject(OVERLAY_SLOT, () =>
        ctx.slots.register(
          { name: OVERLAY_SLOT, id: PLUGIN_ID, order: 900, locale: PLUGIN_ID, inject: () => ({ t }) },
          ShellDockSeat,
        ),
      ),
    'dsh-music-on: shell dock',
  );
}

/**
 * B. 登记标签页类型（可选的侧边栏大屏形态）。只描述静态面貌，不碰运行时。
 * @param {object} ctx 上下文。
 * @param {{t: Function, icons?: object}} deps 注入。
 * @returns {Function} disposer。
 */
export function registerTabType(ctx, deps) {
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
    title: () => t('tab.title'),
    guide: [
      {
        id: TAB_GUIDE_ID,
        order: TAB_GUIDE_ORDER,
        title: () => t('guide.title'),
        description: () => t('guide.description'),
        icon: icons && icons.music !== undefined ? icons.music : undefined,
      },
    ],
  };
  return ctx.effect(() => ctx.sidebarRightTabs.register(definition), 'dsh-music-on: tab type');
}

/**
 * B2. 挂侧边栏座位。key 必须等于类型定义里的 id，否则宿主
 * `types.find(d => d.kind === tab.kind)` 拿不到定义，渲染「nothing can view this」。
 * @param {object} ctx 上下文。
 * @param {{t: Function, runtime: object}} deps 注入。
 * @returns {Function} 合并 disposer。
 */
export function registerTabSeats(ctx, deps) {
  const { t, runtime } = deps;
  const seats = [
    [PANE_TAB_SLOT, MusicSeat, { engine: runtime.engine, store: runtime.store, t }, 'dsh-music-on: tab body'],
    [PANE_TAB_TITLE_SLOT, MusicTabTitle, { t }, 'dsh-music-on: tab title'],
  ];
  const disposers = seats.map(([slot, Component, extra, label]) =>
    ctx.effect(
      () =>
        ctx.slots.inject(slot, () =>
          ctx.slots.register(
            { name: slot, key: TAB_ID, locale: PLUGIN_ID, inject: () => ({ ...extra }) },
            Component,
          ),
        ),
      label,
    ),
  );
  return () => {
    for (const dispose of disposers.reverse()) dispose();
  };
}

/**
 * C. 挂设置分区。宿主设置弹窗按 `settings.section` 收集侧栏条目，
 * 组件拿到的是整段空白区域，纵向排队渲染。
 * @param {object} ctx 上下文。
 * @param {{t: Function, runtime: object}} deps 注入。
 * @returns {Function} disposer。
 */
export function registerSettingsSection(ctx, deps) {
  const { t, runtime } = deps;
  return ctx.effect(
    () =>
      ctx.slots.inject(SETTINGS_SLOT, () =>
        ctx.slots.register(
          {
            name: SETTINGS_SLOT,
            id: PLUGIN_ID,
            order: 120,
            label: () => t('settings.title', '音乐库'),
            locale: PLUGIN_ID,
            inject: () => ({ runtime, t }),
          },
          MusicSettingsSection,
        ),
      ),
    'dsh-music-on: settings section',
  );
}

/**
 * 打开侧边栏音乐台的入口：命令面板、快捷键共用。
 * @param {object} ctx 上下文。
 * @returns {boolean} 是否成功发起。
 */
export function openMusicTab(ctx) {
  try {
    ctx.sidebarRight.openTab(TAB_KIND, { params: { source: 'command' } });
    return true;
  } catch (error) {
    if (ctx.logger && typeof ctx.logger.warn === 'function') ctx.logger.warn(error);
    return false;
  }
}

/* ---------------- 插件体 ---------------- */

/**
 * cordis 插件体。宿主装载流程：
 * 读 client.js → factory 内 require 本文件 → 调本函数。
 * @param {object} ctx 浏览器侧 cordis 上下文。
 */
export function apply(ctx) {
  // 样式只注入一次；removeStyle 在卸载时撤销。
  ensureStyle();
  ctx.effect(() => removeStyle, 'dsh-music-on: style');

  // 字典：无类型三元形式 (ns, locale, dict)，不需要污染 LocaleNamespaceMap。
  ctx.effect(() => ctx.locale.register(PLUGIN_ID, 'zh', DICTS.zh), 'dsh-music-on: locale zh');
  ctx.effect(() => ctx.locale.register(PLUGIN_ID, 'en', DICTS.en), 'dsh-music-on: locale en');

  // bind 返回的函数引用稳定，可以安全地作为注入值反复传递。
  // 但它的第二参是插值对象而非兜底文案，直接透传会在含 {占位符} 的字典上抛 TypeError，
  // 所以统一经 safeTranslate 收口（详见该函数注释）。
  const t = safeTranslate(ctx.locale.bind(PLUGIN_ID));
  const runtime = getRuntime();
  const deps = { t, runtime };

  // 右下角音乐库是主入口；分段注册，任何一段失败都不影响其余段。
  safely(ctx, () => registerShellDock(ctx, deps), 'shell dock');
  safely(ctx, () => registerSettingsSection(ctx, deps), 'settings section');
  safely(ctx, () => registerTabType(ctx, deps), 'tab type');
  safely(ctx, () => registerTabSeats(ctx, deps), 'tab seats');

  // 预置清单提前预热：等用户点开面板才拉会看到一段空白。
  void ensurePresets({ store: runtime.store });

  // 引擎随插件卸载而销毁，避免留下一个还在播的无声上下文。
  ctx.effect(
    () => () => {
      try {
        runtime.engine.dispose();
      } catch (_error) {
        // 卸载路径不抛错。
      }
      disposePresets();
    },
    'dsh-music-on: engine dispose',
  );
}

/**
 * 单段注册失败降级。
 *
 * 宿主对插件 apply 抛错的处理是整插件记为 failed —— 一段没注册上会让
 * 音乐库整个消失。这里逐段兜住：坏一段，其余照常。
 * @param {object} ctx 上下文（取 logger）。
 * @param {Function} run 注册动作。
 * @param {string} label 日志标签。
 */
function safely(ctx, run, label) {
  try {
    run();
  } catch (error) {
    const logger = ctx && ctx.logger;
    if (logger && typeof logger.warn === 'function') {
      logger.warn(`dsh-music-on: ${label} 注册失败`, error);
    } else if (typeof console !== 'undefined') {
      console.warn(`dsh-music-on: ${label} 注册失败`, error);
    }
  }
}

/** 测试用出口。 */
export const __test = {
  ShellDockSeat,
  MusicSeat,
  MusicTabTitle,
  MusicSettingsSection,
  useSettingsSnapshot,
  setReactBridge,
  safeTranslate,
  interpolate,
  getSettingsBoundary,
};

export { PLUGIN_ID, TAB_ID, TAB_KIND, TAB_PRIORITY };
export default { name: PLUGIN_ID, inject, apply };
