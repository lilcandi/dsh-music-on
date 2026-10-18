/**
 * dsh-music-on —— 语言包（zh / en）。
 *
 * 宿主通过 `locale` 服务按 namespace 取字典；`register.js` 用同一个
 * PLUGIN_ID 作 namespace，所以这里的 key 与那边 `t('tab.title')` 必须逐字对应。
 *
 * 只放界面固定文案。动态内容（曲名、错误详情）不进字典，避免 key 爆炸。
 */

/** @type {Record<string, Record<string, string>>} */
export const DICTS = {
  zh: {
    'tab.title': '音乐台',
    'settings.title': '音乐库',
    'guide.title': '音乐台',
    'guide.description': '播放本地音频、平台歌单与预置音景',
    'panel.drop': '把音频文件拖到这里',
    'panel.empty': '暂无播放内容',
    'panel.queue': '播放队列',

    /* ---- 右下角音乐库（ShellDock）----
       宿主 t 的签名是 t(key, params)：第二参是**插值对象**，不是兜底文案。
       所以这里每个 key 都必须在 zh 里有一条，否则界面直接漏出 key 本身。 */
    'dock.title': '音乐库',
    'dock.idle': '未播放',
    'dock.untitled': '未命名',
    'dock.play': '播放',
    'dock.pause': '暂停',
    'dock.prev': '上一首',
    'dock.next': '下一首',
    'dock.seek': '进度',
    'dock.volume': '音量',
    'dock.volumeHint': '滚轮或拖动调节，单击静音',
    'dock.loop': '循环模式',
    'dock.add': '加入',
    'dock.added': '已加入并开始播放',
    'dock.parsed': '已解析并加入队列',
    'dock.notAudio': '只接受音频文件',
    'dock.dropHere': '松手即播放',
    'dock.expand': '展开音乐库',
    'dock.collapse': '收起',
    'dock.hide': '隐藏',
    'dock.show': '显示音乐库',
    'dock.linkPlaceholder': '粘贴 B站 / 网易云 / QQ音乐 链接或歌单',
    'dock.queued': '已加入队列，按播放键开始',
    'dock.queueEmpty': '拖入音频，或粘贴链接，或从预置里挑一首',
    'dock.cleared': '播放列表已清空',
    'dock.queueRestored': '已恢复上次的播放列表',
  'dock.queueRestoredPartial': '，另有 {count} 条已失效',
  'dock.queueRestoreFailed': '上次的平台曲目需要重新解析，请重新粘贴歌单链接',
    'dock.spectrumPeek': '把频谱提上来看看',
    'dock.spectrumSink': '让频谱沉回页面下',
    'dock.dragHint': '拖动移动位置，双击复位',
    'dock.sizeCycle': '切换大小',
    'dock.sizeNow': '大小',
    'dock.externalBadge': '外部播放器',
    'dock.localBadge': '本地播放',
    'dock.autoplayBlocked': '已就绪，点一下播放键出声',
    'dock.noEmbed': '这条音源没有可嵌入的地址',
    'dock.embedNote': '外部播放器：进度与音量由播放器自身控制，频谱不可用',
    'dock.diagTitle': '播放通道',
    'dock.diagExternal': '内嵌播放器（频谱不可用）',
    'dock.diagNoEmbed': '没有可用的播放地址',
    'dock.vipBadge': '无直链',
    'dock.selfCheck': '自检',
    'dock.playlist': '播放列表',
    'dock.clear': '清空',
    'dock.remove': '移除',
    'dock.spectrumOn': '打开频谱',
    'dock.spectrumOff': '关闭频谱',
    'dock.spectrumTurnedOn': '频谱已打开',
    'dock.spectrumTurnedOff': '频谱已关闭',
    'dock.embedClose': '关闭外部播放器',
    'dock.embedClosed': '外部播放器已关闭，可在播放列表里重新打开',
    'dock.noStore': '设置存储不可用，频谱开关不能落盘',
    'dock.batchHint': '一次粘贴多条链接即可批量加进播放列表',
    'dock.favorite': '收藏当前曲目',
    'dock.favorited': '已收藏',
    'dock.unfavorited': '已取消收藏',
    'dock.favNoUrl': '当前曲目没有可收藏的链接地址',

    /* ---- 设置页的收藏 / 历史列表 ----
       注意 `{count}` 是宿主插值占位符，不是模板串，不要手改成别的写法。 */
    'lib.favTitle': '收藏播放链接',
    'lib.favHelp': '长期保留的链接。点击「播放」直接入队开播，刷新与重启都不会丢。',
    'lib.histTitle': '历史播放链接',
    'lib.histHelp': '凡粘贴进来解析过的链接自动记一笔，最多保留最近 100 条，重复播放只累加次数。',
    'lib.favEmpty': '还没有收藏。播放时点卡片右上角的 ☆ 就能收藏当前这条。',
    'lib.histEmpty': '还没有历史。粘贴过的链接会自动记在这里。',
    'lib.play': '播放',
    'lib.del': '删除',
    'lib.clearAll': '清空',
    'lib.playsCount': '播放 {count} 次',
    'lib.noEngine': '播放器还没就绪，稍后再点',
    'lib.favCleared': '收藏已清空',
    'lib.histCleared': '历史已清空',
    'lib.playing': '已加入播放列表',
    'lib.failed': '这条链接现在解析不了',
    'lib.collapse': '收起列表',
    'lib.expand': '展开列表',
  },
  en: {
    'tab.title': 'Music',
    'settings.title': 'Music library',
    'guide.title': 'Music',
    'guide.description': 'Local audio, platform playlists, and preset soundscapes',
    'panel.drop': 'Drop audio files here',
    'panel.empty': 'Nothing playing',
    'panel.queue': 'Queue',

    'dock.title': 'Music library',
    'dock.idle': 'Not playing',
    'dock.untitled': 'Untitled',
    'dock.play': 'Play',
    'dock.pause': 'Pause',
    'dock.prev': 'Previous',
    'dock.next': 'Next',
    'dock.seek': 'Seek',
    'dock.volume': 'Volume',
    'dock.volumeHint': 'Scroll or drag to adjust, click to mute',
    'dock.loop': 'Loop mode',
    'dock.add': 'Add',
    'dock.added': 'Added to the queue',
    'dock.parsed': 'Resolved and queued',
    'dock.notAudio': 'Audio files only',
    'dock.dropHere': 'Release to play',
    'dock.expand': 'Expand music library',
    'dock.collapse': 'Collapse',
    'dock.hide': 'Hide',
    'dock.show': 'Show music library',
    'dock.linkPlaceholder': 'Paste a Bilibili / NetEase / QQ Music link or playlist',
    'dock.queued': 'Queued — press play to start',
    'dock.queueEmpty': 'Drop audio, paste a link, or pick a preset',
    'dock.cleared': 'Playlist cleared',
    'dock.queueRestored': 'Playlist restored from last time',
  'dock.queueRestoredPartial': ' ({count} entries expired)',
  'dock.queueRestoreFailed': 'Saved platform tracks need re-resolving — paste the playlist link again',
    'dock.spectrumPeek': 'Lift the spectrum up',
    'dock.spectrumSink': 'Sink the spectrum back',
    'dock.dragHint': 'Drag to move, double-click to reset',
    'dock.sizeCycle': 'Switch size',
    'dock.sizeNow': 'Size',
    'dock.externalBadge': 'External player',
    'dock.localBadge': 'Local playback',
    'dock.autoplayBlocked': 'Ready — press play to unmute',
    'dock.noEmbed': 'This source has no embeddable address',
    'dock.embedNote': 'External player: seek and volume are handled inside it; spectrum unavailable',
    'dock.diagTitle': 'Output path',
    'dock.diagExternal': 'Embedded player (spectrum unavailable)',
    'dock.diagNoEmbed': 'No playable address',
    'dock.vipBadge': 'No direct link',
    'dock.selfCheck': 'Check',
    'dock.playlist': 'Playlist',
    'dock.clear': 'Clear',
    'dock.remove': 'Remove',
    'dock.spectrumOn': 'Show spectrum',
    'dock.spectrumOff': 'Hide spectrum',
    'dock.spectrumTurnedOn': 'Spectrum on',
    'dock.spectrumTurnedOff': 'Spectrum off',
    'dock.embedClose': 'Close external player',
    'dock.embedClosed': 'External player closed — reopen it from the playlist',
    'dock.noStore': 'Settings storage unavailable — spectrum toggle cannot persist',
    'dock.batchHint': 'Paste several links at once to build the playlist',
    'dock.favorite': 'Favorite this track',
    'dock.favorited': 'Favorited',
    'dock.unfavorited': 'Removed from favorites',
    'dock.favNoUrl': 'This track has no link worth saving',

    'lib.favTitle': 'Favorite links',
    'lib.favHelp': 'Links kept for good. Press Play to queue and start it; survives refresh and restart.',
    'lib.favEmpty': 'No favorites yet. Press ☆ in the dock header while playing to save the current track.',
    'lib.histTitle': 'Play history',
    'lib.histHelp': 'Every pasted and resolved link is recorded here, newest first, up to 100. Replaying only bumps the count.',
    'lib.histEmpty': 'No history yet. Links you paste will show up here.',
    'lib.playsCount': 'played {count} times',
    'lib.play': 'Play',
    'lib.del': 'Remove',
    'lib.clearAll': 'Clear all',
    'lib.expand': 'Expand list',
    'lib.collapse': 'Collapse list',
    'lib.playing': 'Added to the playlist',
    'lib.failed': 'This link cannot be resolved right now',
    'lib.noEngine': 'Player not ready yet — try again in a moment',
    'lib.favCleared': 'Favorites cleared',
    'lib.histCleared': 'History cleared',
  },
};

/** 语言包注册表：宿主 locale 服务按此结构装载。 */
export const LOCALES = DICTS;

/**
 * 构造一个最小 `t` 实现（只给注册期的标题/引导用，组件里用宿主注入的 t）。
 *
 * 签名刻意与宿主对齐为 `(key, paramsOrFallback)`：
 *   - 第二个参数是对象 → 按宿主语义做 `{name}` 插值；
 *   - 第二个参数是字符串 → 当兜底文案（这是本插件自己的扩展，宿主并不支持，
 *     是为了在没有 locale 服务的极端情况下也不漏 key）。
 *
 * @param {string} lang 语言代码，zh / en；未知语言回落到 zh。
 * @returns {(key: string, paramsOrFallback?: object | string) => string}
 */
export function createTranslator(lang) {
  const dict = DICTS[lang] || DICTS.zh;
  const base = DICTS.zh;
  return (key, paramsOrFallback) => {
    let template;
    if (Object.prototype.hasOwnProperty.call(dict, key)) template = dict[key];
    else if (Object.prototype.hasOwnProperty.call(base, key)) template = base[key];
    else if (typeof paramsOrFallback === 'string') return paramsOrFallback;
    else return key;

    if (paramsOrFallback && typeof paramsOrFallback === 'object') {
      // 与宿主同一套插值语法，缺参时原样保留占位符。
      return template.replace(/\{(\w+)\}/g, (match, name) =>
        name in paramsOrFallback ? String(paramsOrFallback[name]) : match,
      );
    }
    return template;
  };
}
