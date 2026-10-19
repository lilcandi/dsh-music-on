#!/usr/bin/env node
// 安装位置自检：验证 C:\Users\candi\.dsh\profiles\web\node_modules\dsh-music-on
// 里的产物是否完整、宿主半边能否真 import、客户端 bundle 是否符合宿主模块表规则。
//
// 用法：node scripts/check-install.mjs
// 为什么单独成文件：PowerShell 里内联 node -e 的反引号和正则在双引号里会被
// 解析器吃掉，写成文件才靠得住（这坑踩过两次）。

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const INSTALL = 'C:\\Users\\candi\\.dsh\\profiles\\web\\node_modules\\dsh-music-on';
const SRC = 'J:\\plugin\\dsh-music-on';

const RUNTIME_FILES = [
  'index.js', 'client.js', 'package.json', 'cordis.patch.yml',
  'src/index.js', 'src/shared.js',
  'src/host/resolve.js', 'src/host/stream.js',
  // mediatoken 是平台直链的票据层：resolve 签发、stream 验签，两条路由共用
  // 同一把私钥。这个文件漏进清单时，自检全绿而「粘贴网易云/QQ 链接」在浏览器里
  // 静默退回只跳转 —— 与 linkintake/library 同一类陷阱。
  'src/host/mediatoken.js',
  'src/client/register.js', 'src/client/engine.js', 'src/client/sources.js',
  'src/client/settings.js',
  'src/client/parser.js', 'src/client/styles.js', 'src/client/locale.js',
  // linkintake 是「粘贴链接」的分流器，library 是收藏/历史的存储层。
  // 这两个文件漏进清单时安装自检照常全绿，而功能在浏览器里静默消失 —— 必须列进来。
  'src/client/linkintake.js', 'src/client/library.js',
  'src/client/ui/PlayerPanel.jsx', 'src/client/ui/Spectrum.jsx',
  'src/client/ui/Settings.jsx',
  'src/client/ui/ShellDock.js', 'src/client/ui/LibrarySection.jsx',
];

let fail = 0;
const ok = (name, detail = '') => console.log(`ok    ${name}${detail ? '  ' + detail : ''}`);
const bad = (name, detail = '') => { fail++; console.log(`FAIL  ${name}${detail ? '  ' + detail : ''}`); };

// ---- 1. 文件齐不齐、和源码是否逐字节一致 ----
for (const rel of RUNTIME_FILES) {
  const srcPath = join(SRC, rel);
  const dstPath = join(INSTALL, rel);
  if (!existsSync(dstPath)) { bad(`缺失 ${rel}`); continue; }
  if (existsSync(srcPath) && statSync(srcPath).size !== statSync(dstPath).size) {
    bad(`大小不一致 ${rel}`, `${statSync(srcPath).size} vs ${statSync(dstPath).size}`);
  }
}
if (fail === 0) ok('运行时文件齐全', `${RUNTIME_FILES.length} 个`);

// ---- 2. 没有递归复制造成的嵌套重复目录 ----
// src/presets 那条随音景目录一起删了 —— 目录已不存在，断言恒真等于没有断言。
const NESTED = ['src/src', 'src/client/src'];
const nestedFound = NESTED.filter((d) => existsSync(join(INSTALL, d)));
nestedFound.length === 0 ? ok('无嵌套重复目录') : bad('嵌套重复目录', nestedFound.join(', '));

// ---- 3. 宿主半边能真 import ----
try {
  const mod = await import(pathToFileURL(join(INSTALL, 'index.js')).href);
  const problems = [];
  if (mod.name !== 'dsh-music-on') problems.push(`name=${mod.name}`);
  if (!Array.isArray(mod.inject)) problems.push('inject 非数组');
  if (typeof mod.apply !== 'function') problems.push('apply 非函数');
  const routes = mod.routes ?? {};
  for (const k of ['resolve', 'stream']) {
    if (typeof routes[k] !== 'string') problems.push(`routes.${k} 缺失`);
  }
  // 音景整体移除后，注入清单里不该再有 webServer：宿主会一直等一个
  // 本插件根本用不到的服务，表现为启动日志里一条 pending。
  if (mod.inject.includes('webServer')) problems.push('inject 仍含 webServer');
  // routes 只剩两条。presets 那条若还留着，宿主会挂一条指向已删模块的路由。
  if ('presets' in routes) problems.push('routes 仍含 presets');
  problems.length === 0
    ? ok('宿主半边 import', `inject=${JSON.stringify(mod.inject)}`)
    : bad('宿主半边 import', problems.join('; '));
} catch (error) {
  bad('宿主半边 import', error.message);
}

// ---- 4. 客户端 bundle 符合宿主模块表规则 ----
const bundlePath = join(INSTALL, 'client.js');
if (!existsSync(bundlePath)) {
  bad('client.js 缺失');
} else {
  const text = readFileSync(bundlePath, 'utf8');
  const rules = {
    'ModuleLoader 包装': text.includes('__ModuleLoader__'),
    '相对 require 已内联': !/require\(\s*["'`]\.\.?\//.test(text),
    // 音景功能已整体移除：旧的自检只查 'dmo-presets' 这个从未存在过的类名，
    // 任何残留都能蒙过去。真实删掉的是 dmo-soundscapes 一族与静态路由前缀。
    '音景分区已移除': !text.includes('dmo-soundscapes')
      && !text.includes('data-preset-id')
      && !text.includes('/api/dsh-music-on/presets'),
    '频谱组件已进包': /Spectrum|dmo-spectrum/.test(text),
    // 设置分区是槽位名 + PLUGIN_ID 注册，SETTINGS_SECTION_ID 常量未必进 bundle，
    // 断言槽位字面量本身才是真的接线证据。
    '设置分区槽位已注册': text.includes('settings.section'),
    '设置组件已进包': /MusicSettingsSection|dmo-settings/.test(text),
    // 右下角音乐库：槽位名字面量必须进包，否则 apply 里注册的就是空槽。
    '右下角音乐库槽位已注册': text.includes('shell.overlay'),
    '音乐库组件已进包': /dmo-dock|dmo-capsule/.test(text),
    '频谱位置设置已进包': text.includes('spectrumPlacement'),
    // 频谱宽度与主题是「可改变长度」和「更多主题色」两条需求的落地证据：
    // 只加设置项不加消费方，滑块拉到底画面纹丝不动 —— 这两条必须真进包。
    '频谱宽度设置已进包': text.includes('spectrumSpan'),
    '主题切换已进包': text.includes('data-dmo-theme') || text.includes('dataDmoTheme'),
    // 收藏/历史：存储键字面量必须进包，否则「设置页那两块是空的」会毫无提示。
    '收藏与历史存储键已进包': text.includes('dsh-music-on:favorites.v1') && text.includes('dsh-music-on:history.v1'),
    '收藏历史组件已进包': /LibrarySection|dmo-lib/.test(text),
    // 拖动通道：window 监听是本插件唯一的拖动实现，绝不能再出现指针捕获
    // （捕获会把 click 的 target 重定向到容器，导致「能拖但按钮全失效」）。
    '未使用 setPointerCapture': !/setPointerCapture/.test(text),
    // 平台直链通道：客户端必须走 addPlatform（拿宿主签发的票据取流），
    // 而不是把网易云/QQ 页面塞进 iframe —— 那两个站设了 X-Frame-Options，
    // 塞进去必然白屏，而「解析成功却一声不响」最难排查。
    '平台票据通道已接线': text.includes('addPlatform'),
  };
  for (const [name, pass] of Object.entries(rules)) {
    pass ? ok(name) : bad(name);
  }
  console.log(`      bundle = ${text.length} bytes`);
}

// ---- 5. patch 文件顶层必须是 YAML 数组 ----
try {
  const yml = readFileSync(join(INSTALL, 'cordis.patch.yml'), 'utf8');
  const firstCode = yml.split(/\r?\n/).find((line) => line.trim() && !line.trim().startsWith('#'));
  firstCode?.startsWith('- ')
    ? ok('cordis.patch.yml 顶层为数组')
    : bad('cordis.patch.yml 顶层不是数组', `首行代码: ${firstCode}`);
} catch (error) {
  bad('cordis.patch.yml 读取', error.message);
}

// ---- 6. 已登记进 profile ----
try {
  const profilePkg = JSON.parse(readFileSync('C:\\Users\\candi\\.dsh\\profiles\\web\\package.json', 'utf8'));
  const dep = profilePkg.dependencies?.['dsh-music-on'];
  const bundles = profilePkg.dsh?.profile?.bundles ?? [];
  dep ? ok('profile dependencies 已登记', dep) : bad('profile dependencies 未登记');
  bundles.includes('dsh-music-on')
    ? ok('profile.profile.bundles 已登记')
    : bad('profile.profile.bundles 未登记', '缺这行插件不会挂载');
} catch (error) {
  bad('profile package.json 读取', error.message);
}

console.log(fail === 0 ? '\n安装自检全部通过' : `\n安装自检失败 ${fail} 项`);
process.exitCode = fail === 0 ? 0 : 1;
