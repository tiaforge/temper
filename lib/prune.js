// Ship only the CSS a project uses: drops temper rules whose selectors need a data-* attribute or value
// that appears nowhere in the project. Conservative by construction:
// - a selector is dropped only when an attribute it *requires* is unused; attributes inside :not(), or
//   inside :is()/:where()/:has() with several alternatives, never count as required;
// - a computed value we cannot resolve to literals keeps every value of that attribute;
// - a data-* name mentioned in JS/TS (dataset.tone, setAttribute('data-tone', …)) keeps the whole attribute.
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { walk, attributeUsage } from './check.js';

const vocab = JSON.parse(readFileSync(new URL('../vocab.json', import.meta.url), 'utf8'));
const MARKUP = new Set(['.html', '.htm', '.svelte', '.astro', '.vue', '.jsx', '.tsx']);
const SOURCES = new Set([...MARKUP, '.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.jsx', '.tsx', '.svelte', '.vue', '.astro']);

/** name → Set of values ('' for no value) or 'any', for every data-* attribute the sources use. */
export function projectUsage(paths) {
  const usage = new Map();
  const any = name => usage.set(name, 'any');
  for (const p of paths) for (const file of walk(p, SOURCES)) {
    const text = readFileSync(file, 'utf8'), ext = extname(file);
    if (MARKUP.has(ext)) attributeUsage(text, file, usage);
    // script code: dataset.fooBar, 'data-foo' (setAttribute, toggleAttribute, querySelector, objects).
    // In HTML-like files only <script> blocks and Astro frontmatter are code.
    const code = /^\.(html?|svelte|vue|astro)$/.test(ext)
      ? [...text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>|^\s*---\n([\s\S]*?)\n---/gi)].map(m => m[1] ?? m[2]).join('\n')
      : text;
    for (const m of code.matchAll(/\bdataset\.([a-zA-Z]\w*)|\bdataset\[\s*['"]([a-zA-Z]\w*)['"]/g))
      any('data-' + (m[1] ?? m[2]).replace(/[A-Z]/g, c => '-' + c.toLowerCase()));
    for (const m of code.matchAll(/['"`](data-[a-z0-9-]+)['"`]/g)) any(m[1]);
  }
  return usage;
}

// ───────────── CSS ─────────────

/** Index of the bracket that closes the one at i ({ or (), skipping strings. */
function closing(css, i) {
  const open = css[i], close = open === '{' ? '}' : ')';
  let depth = 0;
  for (let j = i; j < css.length; j++) {
    const c = css[j];
    if (c === '"' || c === "'") { for (j++; j < css.length && css[j] !== c; j++) if (css[j] === '\\') j++; continue; }
    if (c === open) depth++;
    else if (c === close && --depth === 0) return j;
  }
  return css.length;
}

/** Splits at commas outside brackets and strings. */
function splitTop(s) {
  const parts = [];
  let depth = 0, last = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'") { for (i++; i < s.length && s[i] !== c; i++) if (s[i] === '\\') i++; continue; }
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ',' && depth === 0) { parts.push(s.slice(last, i)); last = i + 1; }
  }
  parts.push(s.slice(last));
  return parts;
}

/** The [data-*] attributes a selector cannot match without: [{ name, value? }]. */
export function required(sel) {
  const out = [];
  for (let i = 0; i < sel.length; i++) {
    const c = sel[i];
    if (c === ':' && /^:{1,2}[\w-]+\(/.test(sel.slice(i))) {
      const open = sel.indexOf('(', i), end = closing(sel, open);
      const name = sel.slice(i, open).replace(/^:+/, '');
      const inner = sel.slice(open + 1, end);
      // :not() never requires anything; a list of alternatives requires none of them for sure
      if (name !== 'not' && splitTop(inner).length === 1) out.push(...required(inner));
      i = end;
    } else if (c === '[') {
      const end = sel.indexOf(']', i);
      const m = /^\[\s*(data-[\w-]+)\s*(?:(=)\s*("[^"]*"|'[^']*'|[^\s\]]+))?/.exec(sel.slice(i, end + 1));
      if (m) out.push({ name: m[1], value: m[2] ? m[3].replace(/^["']|["']$/g, '') : undefined });
      i = end;
    } else if (c === '"' || c === "'") {
      for (i++; i < sel.length && sel[i] !== c; i++) if (sel[i] === '\\') i++;
    }
  }
  return out;
}

const GROUPS = new Set(['media', 'supports', 'layer', 'container', 'scope', 'starting-style', 'document']);

/** Removes the selectors (and rules) of `css` that need an attribute or value `usage` does not have. */
export function pruneCss(css, usage) {
  const used = ({ name, value }) => {
    if (!vocab.attributes[name] && !vocab.deprecated?.attributes?.[name]) return true; // not ours: keep
    const u = usage.get(name);
    if (!u) return false;
    if (u === 'any' || value === undefined) return true;
    return u.has(value);
  };
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let out = '', i = 0;
  while (i < css.length) {
    if (/\s/.test(css[i])) { i++; continue; }
    // the end of this statement: a ; before any { (at-rule statement) or the block's }
    let j = i, brace = -1;
    for (; j < css.length; j++) {
      const c = css[j];
      if (c === '"' || c === "'") { for (j++; j < css.length && css[j] !== c; j++) if (css[j] === '\\') j++; continue; }
      if (c === '(') { j = closing(css, j); continue; }
      if (c === ';') break;
      if (c === '{') { brace = j; break; }
    }
    if (brace < 0) { out += css.slice(i, j + 1); i = j + 1; continue; } // @import, @layer a, b;
    const prelude = css.slice(i, brace).trim(), end = closing(css, brace), body = css.slice(brace + 1, end);
    i = end + 1;
    if (prelude.startsWith('@')) {
      const name = /^@([\w-]+)/.exec(prelude)[1];
      if (GROUPS.has(name)) { const inner = pruneCss(body, usage); if (inner.trim()) out += `${prelude}{${inner}}`; }
      else out += `${prelude}{${body}}`; // @keyframes, @font-face, @property: kept as they are
      continue;
    }
    const kept = splitTop(prelude).filter(sel => required(sel).every(used));
    if (kept.length) out += `${kept.map(s => s.trim()).join(',')}{${body}}`;
  }
  return out;
}
