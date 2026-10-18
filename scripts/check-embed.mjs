// 检查客户端 bundle 里是否真的存在 iframe 渲染路径（B站 embed 兜底）
import fs from 'node:fs';

const src = fs.readFileSync('client.js', 'utf8');
const checks = {
  'player.bilibili.com 字面量': src.includes('player.bilibili.com'),
  "createElement('iframe') / h('iframe')": /['"]iframe['"]/.test(src),
  'dmo-embed 类名': src.includes('dmo-embed'),
  'embedUrl 字段名': src.includes('embedUrl'),
};
for (const [k, v] of Object.entries(checks)) console.log(`${v ? '✓' : '✗'} ${k}`);
