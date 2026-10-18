// 穷举宿主所有槽位声明：从客户端包源码里抓 `"slot.name": { kind: ... }` 的 children 声明，
// 用来找「底部/浮层/根级」可插的位置。必须先读再写，不能凭猜。
// 用法: node scripts/probe-slots.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = [
  'C:\\Users\\candi\\.dsh\\profiles\\web\\node_modules\\@deepseek-ai',
  'C:\\Users\\candi\\AppData\\Roaming\\npm\\node_modules\\@deepseek-ai\\dsh\\node_modules\\@deepseek-ai',
];

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (name === 'node_modules') continue;
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out);
    else if (name === 'client.js') out.push(p);
  }
  return out;
}

const files = [...new Set(ROOTS.flatMap((r) => walk(r)))];
console.log(`扫描 ${files.length} 个客户端 bundle\n`);

const decl = new Map(); // slot -> Set(kind + scope + owner)
for (const file of files) {
  let s;
  try { s = readFileSync(file, 'utf8'); } catch { continue; }
  const owner = file.split('node_modules\\').pop().split('\\')[0];
  for (const m of s.matchAll(/"([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+){1,3})"\s*:\s*\{\s*kind\s*:\s*"([a-z-]+)"([^}]{0,120})\}/g)) {
    const [, slot, kind, rest] = m;
    const scope = /scope\s*:\s*"([a-z-]+)"/.exec(rest)?.[1] ?? '?';
    if (!decl.has(slot)) decl.set(slot, new Set());
    decl.get(slot).add(`${kind}/${scope}  @${owner}`);
  }
}

const rank = (name) =>
  /^(root|app|shell)/.test(name) ? 0
  : /bottom|footer|dock|hud|toast|overlay|float|portal/i.test(name) ? 1
  : /rightbar|sidebar/.test(name) ? 2
  : /settings/.test(name) ? 3
  : 4;

const sorted = [...decl.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
for (const slot of sorted) {
  console.log(`${slot}`);
  for (const v of decl.get(slot)) console.log(`    ${v}`);
}
console.log(`\n合计 ${decl.size} 个槽位`);
