import { compile } from '@mdx-js/mdx';
import fs from 'node:fs';
import path from 'node:path';
const ROOT = '/root/docs';
const walk = (d, out = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
  const p = path.join(d, e.name);
  if (e.isDirectory() && !['node_modules','.git','images','logo'].includes(e.name)) walk(p, out);
  else if (e.name.endsWith('.mdx')) out.push(p); } return out; };

const files = walk(ROOT);
let bad = 0, imgMissing = 0;
for (const f of files) {
  let src = fs.readFileSync(f, 'utf8').replace(/^---[\s\S]*?\n---\n/, '');
  try { await compile(src, { jsx: true }); }
  catch (e) { bad++; console.log('MDX FAIL', path.relative(ROOT, f), '-', e.message.slice(0, 90)); }
  for (const m of src.matchAll(/src="(\/[^"]+)"/g)) {
    if (!fs.existsSync(path.join(ROOT, m[1]))) { imgMissing++; console.log('IMG MISS', path.relative(ROOT, f), m[1]); }
  }
}
// Every nav page must exist, and every page should be in nav.
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs.json'), 'utf8'));
const navPages = new Set();
(function collect(n) { if (Array.isArray(n)) return n.forEach(collect);
  if (n && typeof n === 'object') return Object.entries(n).forEach(([k, v]) =>
    k === 'pages' ? v.forEach(p => typeof p === 'string' ? navPages.add(p) : collect(p)) : collect(v)); })(cfg.navigation);
const onDisk = new Set(files.map(f => path.relative(ROOT, f).replace(/\.mdx$/, '')));
const navMissing = [...navPages].filter(p => !onDisk.has(p));
const orphan = [...onDisk].filter(p => !navPages.has(p) && p !== 'index');
console.log(`\n${files.length} pages | mdx failures ${bad} | missing images ${imgMissing}`);
console.log(`nav entries ${navPages.size} | nav pointing at nothing ${navMissing.length}${navMissing.length ? ': ' + navMissing.join(', ') : ''}`);
console.log(`pages not in nav ${orphan.length}${orphan.length ? ': ' + orphan.join(', ') : ''}`);
// Terminology. Strip code spans and fences first: code identifiers keep their
// real names by design, so only prose is checked.
const banned = [[/\bMCCU\b/, 'MCCU'], [/\bIECCU\b/, 'IECCU'], [/Smart Universa/, 'Smart Universa'],
                [/Highgate Alpha/, 'Highgate Alpha'], [/Easi Banking/, 'Easi Banking'],
                [/\btenants?\b/i, 'tenant'], [/iLoan/, 'iLoan']];
let terms = 0;
for (const f of files) {
  const prose = fs.readFileSync(f, 'utf8')
    .replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '')
    .replace(/src="[^"]*"/g, '').replace(/href="[^"]*"/g, '');
  for (const [re, name] of banned) {
    if (re.test(prose)) { terms++; console.log('TERM', path.relative(ROOT, f), '->', name); }
  }
}
console.log(`terminology violations ${terms}`);
