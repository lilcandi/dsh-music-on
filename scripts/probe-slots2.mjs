// 挖宿主前端里真正注册过的插槽名：查 slots.register 的调用实参与 registry.
// 用法: node scripts/probe-slots2.mjs
import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'C:\\Users\\candi\\AppData\\Roaming\\npm\\node_modules\\@deepseek-ai\\dsh\\node_modules\\@deepseek-ai\\dsh-web-frontend\\dist\\assets';
const files = readdirSync(DIR).filter((f) => f.endsWith('.js'));
for (const f of files) {
  const src = readFileSync(join(DIR, f), 'utf8');
  console.log(`\n########## ${f} (${src.length} bytes) ##########`);

  // 找 ".register(" 附近带 name 的对象字面量
  const re = /\.register\(\s*\{/g;
  let m, n = 0;
  while ((m = re.exec(src)) !== null && n < 40) {
    n++;
    const slice = src.slice(m.index, m.index + 320);
    if (!/name\s*:/.test(slice)) continue;
    console.log(`\n@${m.index}: ${slice.replace(/\n/g, ' ').slice(0, 300)}`);
  }
  if (n === 0) console.log('  （无 .register({...}) 调用）');

  // 直接搜 slot 名字符串
  console.log('\n--- 疑似 slot 名（含点、小写开头、长度<40） ---');
  const names = new Set();
  for (const mm of src.matchAll(/["'`]([a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9_-]+){1,2})["'`]/g)) {
    const v = mm[1];
    if (v.length < 40 && !/\.(js|ts|css|json|yaml|yml|md|png|svg|com|io|ai|org)$/.test(v)) names.add(v);
  }
  console.log([...names].sort().join('  ').slice(0, 3000));
}
