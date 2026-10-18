// 在安装位置上跑一遍语法与关键标记检查（避免 shell 引号转义地狱）
import fs from 'node:fs';
import vm from 'node:vm';

const p = 'C:/Users/candi/.dsh/profiles/web/node_modules/dsh-music-on/client.js';
const src = fs.readFileSync(p, 'utf8');
new vm.Script(src);
console.log('安装位置 client.js 语法 OK,', src.length, 'bytes');
console.log('const vol 出现次数:', (src.match(/const vol =/g) || []).length);
console.log('含 dmo-capsule:', src.includes('dmo-capsule'));
console.log('含 dmo-dock--size-:', src.includes('dmo-dock--size-'));
console.log('含 autoFiles:', src.includes('autoFiles'));
console.log('含 .dmo-setting-row:', src.includes('.dmo-setting-row'));
console.log('含 settings.section:', src.includes('settings.section'));
console.log('含 shell.overlay:', src.includes('shell.overlay'));
