#!/usr/bin/env node
// Builds the search index for the "Ask LOS Help" assistant.
//
//   node tools/build-help-index.mjs            # writes help-index.js at the repo root
//   node tools/build-help-index.mjs --check    # prints stats only, writes nothing
//
// Walks every .mdx page, strips frontmatter, imports, JSX and Markdown syntax
// down to plain text (headings, table text, Frame captions and component
// titles are kept), splits each page into sections at H2/H3 headings, computes
// the heading anchors the way Mintlify renders them, and writes the result as
// a plain script that assigns window.LOS_HELP_INDEX. Mintlify loads every .js
// file in the repo on every page, so no fetch is needed at runtime.
//
// The output is deterministic for a given set of pages (sorted paths, no
// timestamps), so re-running it on unchanged content produces an identical
// file and a clean git diff.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'help-index.js');
const CHECK_ONLY = process.argv.includes('--check');

// Payload budget. The shipped total (help-index.js + help-assistant.js) stays
// under 600 KB. LOS pages are always indexed in full. If the full site does
// not fit, other products' sections (and the LOS changelog, which is history
// rather than how-to) are capped in steps, down to the heading plus the first
// paragraph. If LOS alone is over budget the build still succeeds and warns.
const TOTAL_BUDGET_BYTES = 600 * 1024;
const ASSISTANT_FILE = path.join(ROOT, 'help-assistant.js');
const BUDGET_BYTES = TOTAL_BUDGET_BYTES - 8 * 1024 -
  (fs.existsSync(ASSISTANT_FILE) ? fs.statSync(ASSISTANT_FILE).size : 40 * 1024);
const NON_LOS_CAPS = [Infinity, 1600, 900, 0];
const SUMMARY_CHARS = 320;
const CODE_BLOCK_CHARS = 300;

const ALWAYS_IGNORED_DIRS = new Set([
  '.git', '.github', '.claude', '.agents', '.idea', '.vscode', 'node_modules',
  'build', 'dist', 'coverage', '.cache', 'tmp', 'temp', 'snippets', 'tools',
  'images', 'logo', 'drafts',
]);

// ---------------------------------------------------------------------------
// File discovery

function readMintignore() {
  const file = path.join(ROOT, '.mintignore');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((pat) => {
      const dirOnly = pat.endsWith('/');
      const body = pat.replace(/^\//, '').replace(/\/$/, '');
      const re = new RegExp(
        '(^|/)' + body.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '§').replace(/\*/g, '[^/]*').replace(/§/g, '.*') +
          (dirOnly ? '(/|$)' : '$'),
      );
      return re;
    });
}

function walk(dir, ignores, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(ROOT, abs).split(path.sep).join('/');
    if (entry.isDirectory()) {
      if (ALWAYS_IGNORED_DIRS.has(entry.name)) continue;
      if (ignores.some((re) => re.test(rel + '/'))) continue;
      walk(abs, ignores, out);
    } else if (entry.name.endsWith('.mdx')) {
      if (ignores.some((re) => re.test(rel))) continue;
      out.push(rel);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Product tagging

function productFor(rel) {
  if (rel.startsWith('omnia/los/')) return 'los';
  const top = rel.split('/')[0];
  if (['atlas', 'kairos', 'aptos', 'omnia', 'argos'].includes(top)) return top;
  return 'home';
}

// ---------------------------------------------------------------------------
// Frontmatter

function parseFrontmatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: {}, body: src };
  const data = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    data[kv[1]] = v.replace(/\\"/g, '"');
  }
  return { data, body: src.slice(m[0].length) };
}

// ---------------------------------------------------------------------------
// Slugs. A faithful copy of how Mintlify turns a heading into its DOM id
// (@mintlify/common slugify + cleanHeadingId over @sindresorhus/slugify 2.2):
//   1. lowercase, trim, whitespace runs to "-", then encodeURIComponent;
//   2. slugify with decamelize off, keeping "_" (and "%" plus uppercase hex
//      when step 1 produced percent escapes), collapsing other runs to "-",
//      folding "word-s" / "word-t" contractions, trimming separators;
//   3. de-duplicate per page: the second "Approve" becomes "approve-2";
//   4. at render, percent-decode and strip ?,;:!'"()[]{} and emoji.
// So "Credit quality & pricing panel" is #credit-quality-&-pricing-panel and
// "Why a count turns amber?" is #why-a-count-turns-amber. Checked against
// @mintlify/common for every heading on the site (see tools/HELP-ASSISTANT.md).

function mintSlugRaw(text) {
  let s = encodeURIComponent(text.toLowerCase().trim().replace(/\s+/g, '-'));
  const pct = /%[0-9A-F]{2}/.test(s);
  if (!pct) s = s.toLowerCase();
  s = s.replace(pct ? /[^a-z\dA-Z%_]+/g : /[^a-z\d_]+/g, '-');
  s = s.replace(/\\/g, '');
  s = s.replace(/([a-zA-Z\d]+)-([ts])(-|$)/g, '$1$2$3');
  return s.replace(/-{2,}/g, '-').replace(/^-|-$/g, '');
}

function cleanHeadingId(id) {
  let s = id;
  try { s = decodeURIComponent(id.replace(/%(?![0-9A-Fa-f]{2})/g, '%25')); } catch { s = id; }
  return s
    .replace(/[?,;:!'"()[\]{}]/g, '')
    .replace(/\p{Emoji_Modifier}|\p{Emoji_Modifier_Base}|\p{Emoji_Presentation}|\p{Extended_Pictographic}|[\u200D\uFE0E\uFE0F]/gu, '');
}

function makeSlugger() {
  const seen = new Map();
  return (text) => {
    const slug = mintSlugRaw(text);
    const count = seen.get(slug) ?? 0;
    seen.set(slug, count + 1);
    if (count === 0) return cleanHeadingId(slug);
    let n = count + 1;
    while (seen.has(`${slug}-${n}`)) n += 1;
    seen.set(`${slug}-${n}`, 1);
    return cleanHeadingId(`${slug}-${n}`);
  };
}

export { mintSlugRaw, cleanHeadingId, makeSlugger, pageToSections, toBlocks };

// ---------------------------------------------------------------------------
// MDX to plain text

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}

// Inline Markdown to text: links keep their label, emphasis and code markers go.
function inlineText(s) {
  return decodeEntities(
    s
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1$2')
      .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,;:!?]|$)/g, '$1$2')
      .replace(/~~([^~]+)~~/g, '$1')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{\\s*["'\`]([^"'\`]*)["'\`]\\s*\\})`));
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : '';
}

// Turns the MDX body into a list of blocks: { type: 'h', level, text } or
// { type: 'p', text }. JSX tags are dropped, keeping the text between them and
// the human-readable attributes (title, caption).
function toBlocks(body) {
  const blocks = [];
  let para = [];
  const flush = () => {
    const t = inlineText(para.join(' '));
    if (t) blocks.push({ type: 'p', text: t });
    para = [];
  };

  // Fold multi-line JSX opening tags onto one line so their attributes parse.
  const folded = body.replace(
    /<([A-Za-z][\w.]*)((?:[^>"'{]|"[^"]*"|'[^']*'|\{[^}]*\})*)>/g,
    (m) => (m.includes('\n') ? m.replace(/\s*\r?\n\s*/g, ' ') : m),
  );
  const lines = folded.split(/\r?\n/);
  let inFence = null;
  let fenceBuf = [];
  let tableHeader = null;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Fenced code blocks: mermaid is dropped, other code is kept, capped.
    const fence = line.match(/^\s*(```+|~~~+)\s*([\w-]*)/);
    if (inFence) {
      if (fence && line.trim().startsWith(inFence.marker)) {
        if (inFence.lang !== 'mermaid') {
          const code = fenceBuf.join(' ').replace(/\s+/g, ' ').trim();
          if (code) blocks.push({ type: 'p', text: code.length > CODE_BLOCK_CHARS ? code.slice(0, CODE_BLOCK_CHARS) + ' …' : code });
        }
        inFence = null;
        fenceBuf = [];
      } else {
        fenceBuf.push(line);
      }
      continue;
    }
    if (fence) {
      flush();
      inFence = { marker: fence[1], lang: (fence[2] || '').toLowerCase() };
      continue;
    }

    if (/^\s*(import|export)\s/.test(line)) { flush(); continue; }

    // Headings.
    const h = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (h) {
      flush();
      blocks.push({ type: 'h', level: h[1].length, raw: h[2], text: inlineText(h[2]) });
      tableHeader = null;
      continue;
    }

    // Tables: separator rows dropped, each row becomes one line of text.
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flush();
      if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) continue;
      const cells = line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => inlineText(c.replace(/\\\|/g, '|')).replace(/[.;]$/, ''));
      const next = lines[i + 1] || '';
      if (!tableHeader && /^\s*\|[\s:|-]+\|\s*$/.test(next)) {
        tableHeader = cells;
        blocks.push({ type: 'p', text: cells.filter(Boolean).join(' | ') + '.', table: true });
      } else {
        const text = cells.map((c) => (c === '✓' || c === '✔' ? 'yes' : c)).filter(Boolean);
        // Label checkmark columns with their header so "who can" questions read sensibly.
        if (tableHeader && cells.some((c) => c === '✓' || c === '✔')) {
          const who = cells.map((c, k) => ((c === '✓' || c === '✔') ? tableHeader[k] : null)).filter(Boolean);
          blocks.push({ type: 'p', text: `${cells[0]}: ${who.join(', ')}.`, table: true });
        } else {
          blocks.push({ type: 'p', text: text.join(' | ') + '.', table: true });
        }
      }
      continue;
    }
    tableHeader = null;

    // JSX: keep titles and captions, drop the tags. Inline code spans are
    // masked first so a literal `<band>` placeholder in code survives.
    const codeSpans = [];
    const masked = line.replace(/`[^`]*`/g, (m) => { codeSpans.push(m); return `\u0000${codeSpans.length - 1}\u0000`; });
    const unmask = (s) => s.replace(/\u0000(\d+)\u0000/g, (_, k) => codeSpans[Number(k)]);
    if (/<\/?[A-Za-z]/.test(masked)) {
      line = masked;
      const tags = line.match(/<[A-Za-z][^>]*>/g) || [];
      const labels = [];
      for (const t of tags) {
        const name = (t.match(/^<([A-Za-z][\w.]*)/) || [])[1] || '';
        const title = attr(t, 'title');
        const caption = attr(t, 'caption');
        if (caption) labels.push(caption);
        if (title) labels.push(title);
        if (/^(img|Frame)$/.test(name)) {
          const alt = attr(t, 'alt');
          if (alt && !caption && name === 'img') { /* alt text is not body copy; skip */ }
        }
      }
      const stripped = unmask(line.replace(/<\/?[A-Za-z][^>]*\/?>/g, ' ').replace(/^\s*\/?>\s*$/, ''));
      if (labels.length) {
        flush();
        for (const l of labels) blocks.push({ type: 'p', text: inlineText(l).replace(/([^.!?:])$/, '$1.'), label: true });
      }
      if (stripped.trim()) para.push(stripped);
      else if (!labels.length) flush();
      continue;
    }
    // Continuation of a multi-line JSX tag's attributes.
    if (/^\s*[a-zA-Z]+=("|\{)/.test(line) || /^\s*\/?>\s*$/.test(line)) continue;

    if (!line.trim()) { flush(); continue; }

    // List items and block quotes start a new paragraph-ish line.
    const li = line.match(/^\s*(?:[-*+]|\d+[.)])\s+(.*)$/);
    if (li) { flush(); para.push(li[1]); continue; }
    para.push(line.replace(/^\s*>\s?/, ''));
  }
  flush();
  return blocks;
}

// ---------------------------------------------------------------------------
// Sections

function pageToSections(rel, src) {
  const { data, body } = parseFrontmatter(src);
  const url = '/' + rel.replace(/\.mdx$/, '').replace(/(^|\/)index$/, '').replace(/\/$/, '');
  const title = data.title || data.sidebarTitle || rel;
  const blocks = toBlocks(body);
  const slug = makeSlugger();
  const sections = [];
  let cur = { heading: '', anchor: '', paras: [] };
  if (data.description) cur.paras.push(inlineText(data.description));

  for (const b of blocks) {
    if (b.type === 'h') {
      const anchor = b.level <= 4 ? slug(b.text) : '';
      if (b.level === 2 || b.level === 3) {
        sections.push(cur);
        cur = { heading: b.text, anchor, paras: [] };
      } else {
        cur.paras.push(b.text.replace(/([^.!?:])$/, '$1.'));
      }
      continue;
    }
    cur.paras.push(b.text);
  }
  sections.push(cur);

  return {
    url: url || '/',
    title,
    nav: data.sidebarTitle || '',
    product: productFor(rel),
    sections: sections
      .map((s) => ({ ...s, text: s.paras.join('\n').replace(/[ \t]+/g, ' ').trim() }))
      .filter((s) => s.heading || s.text),
  };
}

// cap = 0 keeps the first paragraph only; otherwise whole paragraphs up to
// cap characters (always at least the first).
function summarise(text, cap) {
  const paras = text.split('\n');
  const clip = (t, n) => (t.length > n ? t.slice(0, n).replace(/\s+\S*$/, '') + ' …' : t);
  if (!cap) return clip(paras[0] || '', SUMMARY_CHARS);
  const out = [];
  let used = 0;
  for (const p of paras) {
    if (out.length && used + p.length > cap) break;
    out.push(out.length ? p : clip(p, cap));
    used += p.length + 1;
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Output

function serialise(pages, cap) {
  const summariseNonLos = cap !== Infinity;
  const pageRows = [];
  const sectionRows = [];
  pages.forEach((p, pi) => {
    pageRows.push([p.url, p.title, p.product, p.nav]);
    for (const s of p.sections) {
      const cappable = p.product !== 'los' || /\/changelog$/.test(p.url);
      const text = summariseNonLos && cappable ? summarise(s.text, cap) : s.text;
      sectionRows.push([pi, s.heading, s.anchor, text]);
    }
  });
  const data = { v: 1, mode: summariseNonLos ? 'los-full-other-' + (cap || 'summary') : 'full', pages: pageRows, sections: sectionRows };
  const json = JSON.stringify(data).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029').replace(/<\/script/gi, '<\\/script');
  return (
    '/* Generated by tools/build-help-index.mjs. Do not edit by hand; re-run `node tools/build-help-index.mjs`. */\n' +
    '(function(){var d=' + json + ';window.LOS_HELP_INDEX=d;' +
    'try{window.dispatchEvent(new CustomEvent("los-help-index-ready"))}catch(e){}})();\n'
  );
}

function main() {
  const ignores = readMintignore();
  const files = walk(ROOT, ignores).sort();
  const pages = files.map((rel) => pageToSections(rel, fs.readFileSync(path.join(ROOT, rel), 'utf8')));

  let out;
  let usedCap;
  for (const cap of NON_LOS_CAPS) {
    usedCap = cap;
    out = serialise(pages, cap);
    if (Buffer.byteLength(out) <= BUDGET_BYTES) break;
  }

  const bytes = Buffer.byteLength(out);
  const sectionCount = pages.reduce((n, p) => n + p.sections.length, 0);
  const losPages = pages.filter((p) => p.product === 'los').length;
  const mode = usedCap === Infinity ? 'full text for every product'
    : usedCap ? `LOS full text, other products and the changelog capped at ${usedCap} chars per section`
    : 'LOS full text, other products and the changelog summarised to the first paragraph';
  const total = bytes + (fs.existsSync(ASSISTANT_FILE) ? fs.statSync(ASSISTANT_FILE).size : 0);

  if (bytes > BUDGET_BYTES) {
    process.stderr.write(`warning: help-index.js is ${((bytes - BUDGET_BYTES) / 1024).toFixed(1)} KB over budget with LOS indexed in full\n`);
  }
  if (!CHECK_ONLY) {
    const prev = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
    if (prev !== out) fs.writeFileSync(OUT, out);
    process.stdout.write(`${prev === out ? 'unchanged' : 'wrote'} ${path.relative(ROOT, OUT)}\n`);
  }
  process.stdout.write(
    `${pages.length} pages (${losPages} LOS), ${sectionCount} sections, help-index.js ${(bytes / 1024).toFixed(1)} KB ` +
      `(shipped total ${(total / 1024).toFixed(1)} KB of ${TOTAL_BUDGET_BYTES / 1024} KB), ${mode}\n`,
  );
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
