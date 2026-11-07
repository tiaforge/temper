// tinystyle check: validates tinystyle attributes in markup and --ts-* tokens in CSS.
// Diagnostics: { file, line, col, severity: 'error' | 'warning', code, message }
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const vocab = JSON.parse(readFileSync(new URL('../vocab.json', import.meta.url), 'utf8'));

const MARKUP = new Set(['.html', '.htm', '.svelte', '.astro', '.vue', '.jsx', '.tsx']);
const STYLES = new Set(['.css', '.scss', '.sass', '.less']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.svelte-kit', '.astro', '.output', 'coverage']);

function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

function closest(word, candidates, max = 2) {
  let best, bestD = max + 1;
  for (const c of candidates) { const dd = distance(word, c); if (dd < bestD) { best = c; bestD = dd; } }
  return best;
}

function position(text, index) {
  const before = text.slice(0, index);
  const line = before.split('\n').length;
  return { line, col: index - before.lastIndexOf('\n') };
}

// Matches an attribute and its optional value: name, name="v", name='v', name={expr}, name=v
const ATTR = /(?<=[\s<])(data-[a-z0-9-]+|aria-label(?:ledby)?)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|(\{[^}]*\})|([^\s"'>/=`{}]+)))?/g;
const TAG = /<([a-zA-Z][\w-]*)((?:[^>"'{}]|"[^"]*"|'[^']*'|\{[^}]*\})*)>/g;

export function checkMarkup(text, file = '<input>') {
  const out = [];
  const report = (index, severity, code, message) => out.push({ file, ...position(text, index), severity, code, message });
  const attrNames = Object.keys(vocab.attributes);

  for (const tag of text.matchAll(TAG)) {
    const attrsStart = tag.index + 1 + tag[1].length;
    const seen = new Map();
    for (const m of tag[2].matchAll(ATTR)) {
      const name = m[1];
      const value = m[2] ?? m[3] ?? m[5];
      const dynamic = m[4] !== undefined || (value !== undefined && /[{}]|\$\{/.test(value));
      seen.set(name, { value, dynamic });
      const at = attrsStart + m.index;
      if (name.startsWith('aria-')) continue;
      const spec = vocab.attributes[name];

      if (!spec) {
        if (name.startsWith('data-sn-')) continue;
        const guess = closest(name, attrNames);
        if (guess) report(at, 'warning', 'TS104', `${name} is not a tinystyle attribute. Did you mean ${guess}?`);
        continue;
      }
      if (dynamic) continue;
      if (spec.boolean) {
        if (value !== undefined && value !== '' && value !== name)
          report(at, 'error', 'TS102', `${name} is a boolean attribute. Write it without a value: ${name}`);
        continue;
      }
      const allowed = Object.keys(spec.values);
      if (value === undefined || value === '') {
        report(at, 'error', 'TS101', `${name} needs a value: ${allowed.join(', ')}.`);
        continue;
      }
      if (allowed.includes(value)) continue;
      let hint = '';
      const other = Object.entries(vocab.attributes).find(([n, s]) => n !== name && s.values && value in s.values);
      if (other) hint = ` Did you mean ${other[0]}="${value}"?`;
      else if (name === 'data-variant' && value === 'primary') hint = ' Leave data-variant out for the primary button.';
      else { const g = closest(value, allowed); if (g) hint = ` Did you mean "${g}"?`; }
      report(at, 'error', 'TS101', `${name}="${value}" is not valid.${hint} (allowed: ${allowed.join(', ')})`);
    }
    // An empty close button in a dialog header shows a drawn ×, but still needs a label.
    if (tag[1] === 'button' && /\scommand\s*=\s*["']?(close|hide-popover)|popovertargetaction\s*=\s*["']?hide/.test(tag[2])
        && text.startsWith('</button>', tag.index + tag[0].length) && !/aria-label/.test(tag[2]))
      report(tag.index, 'error', 'TS103', '<button> closes something but has no text. Add aria-label (e.g. aria-label="Close").');
    for (const [name, spec] of Object.entries(vocab.attributes)) {
      if (!spec.requires || !seen.has(name)) continue;
      // Labels bound by a framework (data-sn-attr="{'aria-label': …}", :aria-label, [attr.aria-label]) count too.
      if (!spec.requires.some(r => seen.has(r)) && !/aria-label/.test(tag[2]))
        report(tag.index, 'error', 'TS103', `<${tag[1]} ${name}> has no visible text. Add ${spec.requires.map(r => r).join(' or ')}.`);
    }
  }
  return out;
}

export function checkStyles(text, file = '<input>') {
  const out = [];
  const report = (index, severity, code, message) => out.push({ file, ...position(text, index), severity, code, message });
  const tokens = Object.keys(vocab.tokens);
  for (const m of text.matchAll(/var\(\s*(--ts-[a-z0-9-]+)/g)) {
    if (tokens.includes(m[1])) continue;
    const g = closest(m[1], tokens, 4);
    report(m.index, 'error', 'TS201', `${m[1]} is not a tinystyle token.${g ? ` Did you mean ${g}?` : ''}`);
  }
  for (const m of text.matchAll(/(?<![\w-])(--ts-[a-z0-9-]+)\s*:/g)) {
    const spec = vocab.tokens[m[1]];
    if (!spec) report(m.index, 'warning', 'TS202', `${m[1]} uses the reserved --ts- prefix but is not a tinystyle token. Use your own prefix.`);
    else if (spec.derived) report(m.index, 'warning', 'TS203', `${m[1]} is derived by tinystyle. Set its inputs instead.`);
  }
  return out;
}

// Svelte/Vue/Astro files contain both markup and <style> blocks.
export function checkFile(file) {
  const text = readFileSync(file, 'utf8');
  const ext = extname(file);
  if (STYLES.has(ext)) return checkStyles(text, file);
  const out = checkMarkup(text, file);
  if (ext !== '.html' && ext !== '.htm' || /<style/.test(text)) out.push(...checkStyles(text, file));
  return out;
}

export function* walk(path) {
  const st = statSync(path);
  if (st.isFile()) { yield path; return; }
  for (const entry of readdirSync(path)) {
    if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue;
    const full = join(path, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (MARKUP.has(extname(entry)) || STYLES.has(extname(entry))) yield full;
  }
}

export function check(paths) {
  const out = [];
  for (const p of paths) for (const f of walk(p)) out.push(...checkFile(f));
  return out;
}
