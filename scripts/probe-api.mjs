// 读 slots 服务与 layout 服务的真实 API 表面：注册形态、inject 表面、renderSlot 传参。
// 目标：确定「挂 shell.overlay 还是 shell.bottom」以及组件能否拿到自己需要的东西。
// 用法: node scripts/probe-api.mjs
import { readFileSync } from 'node:fs';

const R = 'C:\\Users\\candi\\AppData\\Roaming\\npm\\node_modules\\@deepseek-ai\\dsh\\node_modules\\@deepseek-ai';

function grep(file, pattern, { before = 250, after = 500, limit = 8 } = {}) {
  let s;
  try { s = readFileSync(file, 'utf8'); } catch (e) { return console.log(`读不到 ${file}: ${e.message}`); }
  const re = new RegExp(pattern, 'g');
  let m;
  let n = 0;
  while ((m = re.exec(s)) !== null && n < limit) {
    n += 1;
    const start = Math.max(0, m.index - before);
    console.log(`  @${m.index} …${s.slice(start, m.index + after).replace(/\s+/g, ' ')}…\n`);
  }
  if (n === 0) console.log(`  （无匹配 ${pattern}）`);
}

console.log('===== 1. slots 服务从哪来（service 声明） =====');
grep(`${R}\\dsh-client-ui-layout\\lib\\client.js`, 'super\\(ctx, "slots"|"slots"', { limit: 4 });

console.log('\n===== 2. renderSlot 的第二参 props 如何传给注册组件 =====');
// layout 里 renderSlot("shell.bottom", {}) 传了空对象；看注册组件收到什么
grep(`${R}\\dsh-client-ui-layout\\lib\\client.js`, 'renderSlot\\("shell\\.bottom"', { limit: 2 });

console.log('\n===== 3. shell.overlay 的渲染（列表，多个贡献者） =====');
grep(`${R}\\dsh-client-ui-layout\\lib\\client.js`, 'renderSlot\\("shell\\.overlay"', { limit: 2 });

console.log('\n===== 4. 已装宿主插件里 shell.overlay / shell.bottom 的真实用例 =====');
const pkgs = ['dsh-client-ui-plan', 'dsh-client-ui-goal', 'dsh-client-ui-jobs', 'dsh-client-ui-schedule',
  'dsh-client-ui-user-questions', 'dsh-client-ui-attachment', 'dsh-client-ui-commands', 'dsh-client-ui-deliverables'];
for (const p of pkgs) {
  const f = `${R}\\${p}\\lib\\client.js`;
  let s;
  try { s = readFileSync(f, 'utf8'); } catch { continue; }
  if (!/shell\.overlay|shell\.bottom/.test(s)) continue;
  console.log(`\n--- ${p} ---`);
  for (const m of s.matchAll(/ctx\.slots\.(inject|register)\([^)]{0,200}"(shell\.(?:overlay|bottom))"[^)]{0,200}/g)) {
    console.log('   ', m[0].replace(/\s+/g, ' ').slice(0, 260));
  }
}

console.log('\n===== 5. 有没有插件用到 shell.bottom（判断该位置是否已被占） =====');
for (const p of pkgs) {
  const f = `${R}\\${p}\\lib\\client.js`;
  let s;
  try { s = readFileSync(f, 'utf8'); } catch { continue; }
  if (s.includes('shell.bottom')) console.log(`  ${p}: 用了 shell.bottom`);
}
