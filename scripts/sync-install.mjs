#!/usr/bin/env node
// Sync the source tree into the profile's node_modules copy.
// `file:` deps are materialised as real directory copies, not symlinks, so edits
// in the source tree do not reach the running host until they are copied over.
// Compares sha256 first; only `--apply` actually writes.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, statSync, unlinkSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';

const SRC = 'J:/plugin/dsh-music-on';
const DEST = 'C:/Users/candi/.dsh/profiles/web/node_modules/dsh-music-on';
const APPLY = process.argv.includes('--apply');

const SKIP_DIRS = new Set(['node_modules', '.git', 'test', 'scripts', 'docs', 'screenshots']);
const SKIP_FILES = new Set(['screenshots.json', '.gitignore', 'README.en.md', 'pnpm-lock.yaml']);
const KEEP_EXT = new Set(['.js', '.jsx', '.json', '.mjs', '.md']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      walk(full, out);
    } else if (KEEP_EXT.has(name.slice(name.lastIndexOf('.'))) && !SKIP_FILES.has(name)) {
      out.push(full);
    }
  }
  return out;
}

const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

const srcFiles = walk(SRC);
const wanted = new Set();
const pending = [];
for (const file of srcFiles) {
  const rel = relative(SRC, file).split('\\').join('/');
  wanted.add(rel);
  const dest = join(DEST, rel);
  if (!existsSync(dest)) { pending.push({ rel, why: 'missing' }); continue; }
  if (sha(file) !== sha(dest)) pending.push({ rel, why: 'stale' });
}

const stray = [];
for (const file of walk(DEST)) {
  const rel = relative(DEST, file).split('\\').join('/');
  if (!wanted.has(rel)) stray.push(rel);
}

console.log(`源文件 ${srcFiles.length} 个 → ${DEST}`);
console.log(`待同步 ${pending.length} 个${pending.length ? '：' + pending.map((p) => p.rel + '(' + p.why + ')').join(', ') : ''}`);
console.log(`安装副本残留 ${stray.length} 个${stray.length ? '：' + stray.join(', ') : ''}`);

if (!APPLY) {
  console.log('（dry-run，加 --apply 才真写）');
  process.exit(0);
}

for (const { rel } of pending) {
  const dest = join(DEST, rel);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, readFileSync(join(SRC, rel)));
}
for (const rel of stray) {
  const full = join(DEST, rel);
  // Guard: only ever unlink inside the install copy.
  if (full.replace(/\\/g, '/').startsWith(DEST + '/')) unlinkSync(full);
}

let same = 0;
const bad = [];
for (const file of srcFiles) {
  const rel = relative(SRC, file).split('\\').join('/');
  const dest = join(DEST, rel);
  if (existsSync(dest) && sha(file) === sha(dest)) same += 1;
  else bad.push(rel);
}
console.log(`同步后：${same}/${srcFiles.length} 个文件哈希一致${bad.length ? '，不一致：' + bad.join(', ') : '，不一致 0 个'}`);
