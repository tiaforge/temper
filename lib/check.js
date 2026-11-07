// temper check: validates temper attributes in markup and --tm-* tokens in CSS.
// Diagnostics: { file, line, col, severity: 'error' | 'warning', code, message }
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const VOCAB = JSON.parse(readFileSync(new URL('../vocab.json', import.meta.url), 'utf8'));

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

/** The closest candidate only when no other is equally close (safe to apply automatically). */
export function closestUnique(word, candidates, max = 2) {
  const ds = [...new Set(candidates)].map(c => [c, distance(word, c)]).filter(([, d]) => d <= max);
  const best = Math.min(...ds.map(([, d]) => d));
  const at = ds.filter(([, d]) => d === best);
  return at.length === 1 ? at[0][0] : undefined;
}

export function closest(word, candidates, max = 2) {
  let best, bestD = max + 1;
  for (const c of candidates) { const dd = distance(word, c); if (dd < bestD) { best = c; bestD = dd; } }
  return best;
}

function position(text, index) {
  const before = text.slice(0, index);
  const line = before.split('\n').length;
  return { line, col: index - before.lastIndexOf('\n') };
}

// ───────────── scanning markup ─────────────

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'textarea', 'title']);
// opening one of these closes an open sibling of the same kind (HTML's optional end tags)
const AUTO_CLOSE = new Set(['li', 'dt', 'dd', 'tr', 'td', 'th', 'option', 'p']);
const TRANSPARENT = new Set(['', 'template', 'svelte:fragment', 'svelte:boundary', 'Fragment']);

/** Replaces comments, <script>/<style> contents and Astro frontmatter with spaces, keeping offsets. */
function blank(text, jsx) {
  const sp = s => s.replace(/[^\n]/g, ' ');
  if (jsx) return text.replace(/\/\*[\s\S]*?\*\//g, sp);
  return text
    .replace(/^\s*---\n[\s\S]*?\n---/, sp)
    .replace(/<!--[\s\S]*?-->/g, sp)
    .replace(/(<(script|style)\b[^>]*>)([\s\S]*?)(?=<\/\2\s*>)/gi, (m, open, _, body) => open + sp(body));
}

/** Index after the `}` matching the `{` at i (strings skipped), or -1. */
function skipBraces(t, i) {
  let depth = 0;
  for (let j = i; j < t.length; j++) {
    const c = t[j];
    if (c === '"' || c === "'" || c === '`') {
      for (j++; j < t.length && t[j] !== c; j++) if (t[j] === '\\') j++;
    } else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return j + 1;
  }
  return -1;
}

const NAME = /[A-Za-z][\w:.-]*/y;
/** Opening and closing tags with their attributes. Braced values ({…}) may nest and contain > and quotes. */
function* scanTags(t) {
  const n = t.length;
  for (let i = t.indexOf('<'); i >= 0; i = t.indexOf('<', i + 1)) {
    if (t[i + 1] === '/') {
      NAME.lastIndex = i + 2;
      const m = NAME.exec(t), close = t.indexOf('>', i);
      if (close < 0) return;
      yield { closing: true, name: m ? m[0] : '', start: i };
      i = close;
      continue;
    }
    if (t[i + 1] === '>') { yield { name: '', start: i, end: i + 2, attrs: [], raw: '' }; i++; continue; } // JSX fragment
    NAME.lastIndex = i + 1;
    const m = NAME.exec(t);
    if (!m) continue;
    const name = m[0], nameEnd = NAME.lastIndex, attrs = [];
    let j = nameEnd, ok = false, self = false;
    while (j < n) {
      const c = t[j];
      if (/\s/.test(c)) { j++; continue; }
      if (c === '>') { ok = true; j++; break; }
      if (c === '/' && t[j + 1] === '>') { ok = self = true; j += 2; break; }
      if (c === '<') break; // not a tag after all (a comparison in code)
      if (c === '{') { // {...spread} or Svelte's {name} shorthand
        const e = skipBraces(t, j);
        if (e < 0) break;
        attrs.push({ raw: null, at: j, expr: t.slice(j + 1, e - 1), valueAt: j + 1 });
        j = e;
        continue;
      }
      const s = j;
      while (j < n && !/[\s=>"'`{}<]/.test(t[j]) && !(t[j] === '/' && t[j + 1] === '>')) j++;
      if (j === s) { j++; continue; }
      const a = { raw: t.slice(s, j), at: s };
      let k = j;
      while (/\s/.test(t[k])) k++;
      if (t[k] === '=') {
        k++;
        while (/\s/.test(t[k])) k++;
        const q = t[k];
        if (q === '"' || q === "'") {
          const e = t.indexOf(q, k + 1);
          if (e < 0) break;
          a.value = t.slice(k + 1, e); a.valueAt = k + 1; j = e + 1;
        } else if (q === '{') {
          const e = skipBraces(t, k);
          if (e < 0) break;
          a.expr = t.slice(k + 1, e - 1); a.valueAt = k + 1; j = e;
        } else {
          const s2 = k;
          while (k < n && !/[\s>]/.test(t[k])) k++;
          a.value = t.slice(s2, k); a.valueAt = s2; j = k;
        }
      }
      a.end = j;
      attrs.push(a);
    }
    if (!ok) continue;
    yield { name, start: i, end: j, attrs, self, raw: t.slice(nameEnd, j) };
    if (RAW.has(name.toLowerCase())) {
      const re = new RegExp(`</${name}\\s*>`, 'ig');
      re.lastIndex = j;
      const c = re.exec(t);
      i = (c ? c.index : n) - 1;
    } else i = j - 1;
  }
}

// ───────────── what an expression can evaluate to ─────────────

const UNKNOWN = Symbol('unknown'); // anything: a variable, a call
const FALSY = Symbol('falsy'); // the falsy left side of `a && b`: false, 0, '' or null

/** Calls fn(i) for every index of src outside strings and brackets; stops when fn returns true. */
function eachTop(src, fn) {
  let depth = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') { for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++; continue; }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (depth === 0 && fn(i)) return;
  }
}

function splitTop(src, ops) {
  const parts = [], kinds = [];
  let last = 0;
  eachTop(src, i => {
    const op = ops.find(o => src.startsWith(o, i));
    if (!op || (op === '||' && src[i + 2] === '=') || (op === '&&' && src[i + 2] === '=') || (op === '??' && src[i + 2] === '=')) return;
    parts.push(src.slice(last, i)); kinds.push(op); last = i + op.length;
  });
  parts.push(src.slice(last));
  return { parts, kinds };
}

const falsy = v => v === false || v === null || v === undefined || v === '' || v === 0 || v === FALSY;

/** The values a JS expression can have, as far as its literals tell. Conditions are not evaluated. */
export function outcomes(src) {
  let s = src.trim();
  while (s.startsWith('(') && skipParen(s) === s.length) s = s.slice(1, -1).trim();
  if (!s) return [UNKNOWN];
  // a ? b : c
  let q = -1;
  eachTop(s, i => s[i] === '?' && s[i + 1] !== '?' && s[i + 1] !== '.' && s[i - 1] !== '?' ? (q = i, true) : false);
  if (q >= 0) {
    let level = 0, colon = -1;
    eachTop(s, i => {
      if (i <= q) return false;
      if (s[i] === '?' && s[i + 1] !== '?' && s[i + 1] !== '.' && s[i - 1] !== '?') level++;
      else if (s[i] === ':') { if (level === 0) { colon = i; return true; } level--; }
      return false;
    });
    if (colon > 0) return [...outcomes(s.slice(q + 1, colon)), ...outcomes(s.slice(colon + 1))];
    return [UNKNOWN];
  }
  // a || b, a ?? b: the left sides contribute what passes through
  const or = splitTop(s, ['||', '??']);
  if (or.parts.length > 1) {
    const out = [];
    or.parts.forEach((p, k) => {
      const vals = outcomes(p);
      if (k === or.parts.length - 1) out.push(...vals);
      else out.push(...vals.filter(v => or.kinds[k] === '??' ? v !== null && v !== undefined : !falsy(v) || v === UNKNOWN));
    });
    return out;
  }
  // a && b: a's falsy value, or b
  const and = splitTop(s, ['&&']);
  if (and.parts.length > 1) {
    const out = [];
    and.parts.forEach((p, k) => {
      const vals = outcomes(p);
      if (k === and.parts.length - 1) out.push(...vals);
      else for (const v of vals) if (v === UNKNOWN) out.push(FALSY); else if (falsy(v)) out.push(v);
    });
    return out;
  }
  let m;
  if ((m = /^(['"])((?:\\.|(?!\1).)*)\1$/s.exec(s))) return [m[2].replace(/\\(.)/g, '$1')];
  if ((m = /^`([^`$\\]*)`$/.exec(s))) return [m[1]];
  if (/^-?\d+(\.\d+)?$/.test(s)) return [Number(s)];
  if (s === 'true') return [true];
  if (s === 'false') return [false];
  if (s === 'null') return [null];
  if (s === 'undefined') return [undefined];
  // !x and comparisons are booleans
  if (/^!(?!=)/.test(s)) return [true, false];
  let cmp = false;
  eachTop(s, i => (cmp = /^(?:===?|!==?|<=|>=)/.test(s.slice(i)) && s[i - 1] !== '=' && s[i - 1] !== '!' && s[i - 1] !== '<' && s[i - 1] !== '>'));
  if (cmp) return [true, false];
  return [UNKNOWN];
}

function skipParen(s) {
  let depth = 0, end = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'" || c === '`') { for (i++; i < s.length && s[i] !== c; i++) if (s[i] === '\\') i++; continue; }
    if (c === '(') depth++;
    else if (c === ')' && --depth === 0) { end = i + 1; break; }
  }
  return end;
}

/** `{a: x, 'data-tone': y}` → [{ key, expr, offset }] for literal keys. */
function objectEntries(src) {
  const s = src.trim();
  if (!s.startsWith('{') || !s.endsWith('}')) return [];
  const lead = src.indexOf('{') + 1, body = s.slice(1, -1), out = [];
  let last = 0;
  const take = end => {
    const part = body.slice(last, end), m = /^\s*(?:(['"])([^'"]+)\1|([\w$-]+))\s*:/.exec(part);
    const expr = part.slice(m?.[0].length);
    if (m) out.push({ key: m[2] ?? m[3], expr, offset: lead + last + m[0].length + expr.length - expr.trimStart().length });
    last = end + 1;
  };
  eachTop(body, i => { if (body[i] === ',') take(i); return false; });
  take(body.length);
  return out;
}

// ───────────── context rules ─────────────

const selCache = new Map();
function parseSelector(s) {
  if (!selCache.has(s)) {
    const m = /^([a-z][\w-]*)?((?:\[[^\]]+\])*)$/.exec(s);
    selCache.set(s, { tag: m[1], attrs: [...m[2].matchAll(/\[([^=\]]+)(?:=([^\]]+))?\]/g)].map(x => ({ name: x[1], values: x[2]?.split('|') })) });
  }
  return selCache.get(s);
}
function matches(el, s) {
  const sel = parseSelector(s);
  if (sel.tag && el.name.toLowerCase() !== sel.tag) return false;
  return sel.attrs.every(a => {
    const v = el.attrs.get(a.name);
    return v && (!a.values || v.dynamic || a.values.includes(v.value ?? ''));
  });
}
const showSelector = s => {
  const sel = parseSelector(s);
  const attrs = sel.attrs.map(a => a.values ? `${a.name}="${a.values.join('|')}"` : a.name).join(' ');
  return sel.tag ? `<${sel.tag}${attrs ? ' ' + attrs : ''}>` : `[${attrs}]`;
};
const showList = list => list.map(showSelector).join(', ').replace(/, ([^,]*)$/, ' or $1');
const plain = el => el.kind === 'element' && /^[a-z][a-z0-9]*$/.test(el.name);
/** The nearest real parent: element, 'unknown' (a component or custom element) or 'root'. */
function parentOf(el) {
  for (let p = el.parent; ; p = p.parent) {
    if (!p) return 'root';
    if (p.kind === 'transparent') continue;
    return p.kind === 'unknown' ? 'unknown' : p;
  }
}
function kindOf(name) {
  if (TRANSPARENT.has(name)) return 'transparent';
  if (/^[A-Z]|[:.-]/.test(name) || name === 'slot') return 'unknown';
  return 'element';
}

// ───────────── checking markup ─────────────

// ctx.icons: extra valid data-icon names (from the project's CSS, an icon folder, or Lucide via the Vite plugin)
// ctx.modules: the temper modules the project imports (null: unknown, not checked)
// ctx.vocab: another vocabulary (tests)
// Diagnostics may carry fix: { start, end, text }, a safe edit that temper check --fix applies.
export function checkMarkup(text, file = '<input>', ctx = {}) {
  const vocab = ctx.vocab ?? VOCAB;
  const out = [];
  const report = (index, severity, code, message, fix) => out.push({ file, ...position(text, index), severity, code, message, ...(fix ? { fix } : {}) });
  // a static, unprefixed attribute whose value can be edited in place
  const editable = a => a && a.expr === undefined && a.value !== undefined && a.raw === a.name && a.valueAt !== undefined;
  const removal = a => { let s = a.at; while (s > 0 && /[ \t]/.test(text[s - 1])) s--; return { start: s, end: a.end, text: '' }; };
  const attrNames = Object.keys(vocab.attributes);
  const ext = extname(file);
  const jsx = ext === '.jsx' || ext === '.tsx';
  const t = blank(text, jsx);
  // what `false` and `true` render in this file's framework (null: unknown, not checked)
  const braces = ['.svelte', '.jsx', '.tsx', '.astro'].includes(ext) ? { falseRenders: true, trueEmpty: false } : { falseRenders: null, trueEmpty: null };
  const bound = ext === '.vue' ? { falseRenders: true, trueEmpty: false } : { falseRenders: null, trueEmpty: null }; // Vue :attr; Alpine elsewhere
  const sinter = { falseRenders: false, trueEmpty: true };
  const isDocument = /<body[\s>]/i.test(t);
  const modulesSeen = new Set();
  const stack = [];
  const fields = [];

  // a: the attribute (static values only, for fixes); el: its element
  const checkValue = (name, spec, value, at, how, a, el) => {
    const fixable = how === 'static' && editable(a);
    const setValue = v => fixable ? { start: a.valueAt, end: a.valueAt + value.length, text: v } : undefined;
    const renamed = vocab.deprecated?.values?.[name]?.[value];
    if (renamed !== undefined) {
      report(at, 'warning', 'TM112', `${name}="${value}" is deprecated. Use ${name}="${renamed}".`, setValue(renamed));
      return;
    }
    if (name === 'data-icon') {
      if (value === '' || value in spec.values || ctx.icons?.has(value)) return;
      const known = [...Object.keys(spec.values), ...(ctx.icons ?? [])];
      const g = closest(value, known, 3), u = closestUnique(value, known, 2);
      report(at, 'error', 'TM105', `data-icon="${value}" is not a known icon.${g ? ` Did you mean "${g}"?` : ''} Icon names follow Lucide (see llms.txt, Icons); add your own with --tm-icon-${value} or the Vite plugin's icons option.`, u && u === g ? setValue(u) : undefined);
      return;
    }
    if (spec.freeText || (spec.allowEmpty && value === '')) return;
    if (spec.boolean) {
      if (value !== '' && value !== name)
        report(at, 'error', 'TM102', how === 'static' ? `${name} is a boolean attribute. Write it without a value: ${name}`
          : `${name} is a boolean attribute; this expression can set it to "${value}". Use '' for on and null for off.`,
          fixable ? { start: a.at, end: a.end, text: name } : undefined);
      return;
    }
    const allowed = Object.keys(spec.values);
    if (value === '') { report(at, 'error', 'TM101', `${name} needs a value: ${allowed.join(', ')}.`); return; }
    if (allowed.includes(value)) return;
    let hint = '', fix;
    const other = Object.entries(vocab.attributes).find(([n, s]) => n !== name && s.values && value in s.values);
    if (other) {
      hint = ` Did you mean ${other[0]}="${value}"?`;
      // move it to the right axis, unless that axis is already set
      if (fixable && !el?.attrs.has(other[0])) fix = { start: a.at, end: a.at + a.raw.length, text: other[0] };
    } else if (name === 'data-variant' && value === 'primary') {
      hint = ' Leave data-variant out for the primary button.';
      if (fixable) fix = removal(a);
    } else {
      const g = closest(value, allowed);
      if (g) { hint = ` Did you mean "${g}"?`; if (closestUnique(value, allowed) === g) fix = setValue(g); }
    }
    report(at, 'error', 'TM101', `${name}="${value}" is not valid${how === 'static' ? '' : ' (a value of this expression)'}.${hint} (allowed: ${allowed.join(', ')})`, fix);
  };

  const checkExpr = (name, spec, src, at, sem) => {
    const vals = new Set(outcomes(src));
    for (const v of vals) {
      if (v === UNKNOWN || v === null || v === undefined) continue;
      if (v === false || v === FALSY) {
        if (sem.falseRenders)
          report(at, 'error', 'TM111', v === FALSY
            ? `${name}: \`a && b\` renders ${name}="false" (or "0") when a is falsy, and the attribute still counts as set. Use a ternary with null: a ? b : null.`
            : `${name}: false renders ${name}="false" here, and the attribute still counts as set. Use null to leave it out.`);
        continue;
      }
      if (v === true) {
        if (spec.boolean || sem.trueEmpty || sem.trueEmpty === null) continue;
        report(at, 'error', 'TM101', `${name}: true renders ${name}="true" here, which is not a valid value. Use '' for the attribute without a value.`);
        continue;
      }
      checkValue(name, spec, String(v), at, 'expr');
    }
    // a bare boolean variable on a boolean attribute: false renders the attribute
    if (spec.boolean && sem.falseRenders && vals.size === 1 && vals.has(UNKNOWN) && /^!?[\w$.?]+$/.test(src.trim()) && !/^(true|null|undefined)$/.test(src.trim()))
      report(at, 'warning', 'TM111', `${name}={${src.trim()}}: if this is a boolean, false renders ${name}="false", and the attribute still counts as set. Write ${src.trim()} || null.`);
  };

  const rename = (a, to, el) => a.raw === a.name && !el.attrs.has(to) ? { start: a.at, end: a.at + a.raw.length, text: to } : undefined;
  /** Checks one temper attribute; attr = { name, raw, value, expr, at, end, valueAt, sem } */
  const checkAttr = (a, el) => {
    const newName = vocab.deprecated?.attributes?.[a.name];
    if (newName) {
      report(a.at, 'warning', 'TM112', `${a.name} is deprecated. Use ${newName}.`, rename(a, newName, el));
      a = { ...a, name: newName, raw: null };
    }
    const spec = vocab.attributes[a.name];
    if (!spec) {
      if (a.name.startsWith('data-sn-')) return;
      const max = a.name.length >= 12 ? 2 : 1; // data-drop is not a typo of data-wrap
      const guess = closest(a.name, attrNames, max);
      if (guess) report(a.at, 'warning', 'TM104', `${a.name} is not a temper attribute. Did you mean ${guess}?`,
        closestUnique(a.name, attrNames, max) === guess ? rename(a, guess, el) : undefined);
      return;
    }
    if (ctx.modules && spec.module && !ctx.modules.has(spec.module) && !modulesSeen.has(spec.module)) {
      modulesSeen.add(spec.module);
      report(a.at, 'error', 'TM110', `${a.name} needs ${spec.module}.css, which this project does not import. Add import '@tiaforge-ui/temper/${spec.module}.css' (or use all.css).`);
    }
    if (a.expr !== undefined) { checkExpr(a.name, spec, a.expr, a.valueAt ?? a.at, a.sem); return; }
    if (a.value === undefined) { if (!spec.boolean && !spec.allowEmpty && a.name !== 'data-icon') checkValue(a.name, spec, '', a.at, 'static'); return; }
    if (/[{}]|\$\{/.test(a.value)) return; // interpolated
    checkValue(a.name, spec, a.value, a.at, 'static', a, el);
  };

  for (const tag of scanTags(t)) {
    if (tag.closing) {
      const k = stack.findLastIndex(e => e.name === tag.name);
      if (k >= 0) stack.length = k;
      continue;
    }
    const lower = tag.name.toLowerCase();
    if (AUTO_CLOSE.has(lower) && stack.at(-1)?.name.toLowerCase() === lower) stack.pop();
    const el = { name: tag.name, kind: kindOf(tag.name), parent: stack.at(-1) ?? null, attrs: new Map() };
    const ours = [];
    for (const a of tag.attrs) {
      if (a.raw === null) continue;
      const b = /^(?::|v-bind:|x-bind:)(.+)$/.exec(a.raw);
      const name = b ? b[1] : a.raw;
      let expr = a.expr, sem = braces;
      if (b && a.value !== undefined) { expr = a.value; sem = bound; }
      else if (expr === undefined && a.value !== undefined && /^\{[^]*\}$/.test(a.value.trim()) && skipBraces(a.value.trim(), 0) === a.value.trim().length) {
        expr = a.value.trim().slice(1, -1); sem = braces; // Svelte: data-x="{expr}"
      }
      const dynamic = expr !== undefined || (a.value !== undefined && /[{}]|\$\{/.test(a.value));
      el.attrs.set(name, { value: a.value, dynamic });
      if (name.startsWith('data-')) ours.push({ name, raw: a.raw, value: a.value, expr, at: a.at, end: a.end, valueAt: a.valueAt, sem });
      // sinter: data-sn-attr="{'data-tone': expr, …}"
      if (name === 'data-sn-attr' && a.value !== undefined) {
        for (const e of objectEntries(a.value)) {
          el.attrs.set(e.key, { value: undefined, dynamic: true });
          if (e.key.startsWith('data-') && !e.key.startsWith('data-sn-')) ours.push({ name: e.key, expr: e.expr, at: a.valueAt + e.offset, valueAt: a.valueAt + e.offset, sem: sinter });
        }
      }
    }
    for (const a of ours) checkAttr(a, el);
    const style = tag.attrs.find(a => a.raw === 'style' && a.value !== undefined && !/[{}]/.test(a.value));
    if (style && ctx.lint !== false) lintCss(`x{${style.value}}`, style.valueAt - 2, report, { inline: true });
    contextRules(el, ours, tag);
    labelRules(el, tag);
    if (/^(input|select|textarea)$/.test(lower)) fields.push({ el, tag });
    if (!tag.self && !(el.kind === 'element' && VOID.has(lower))) stack.push(el);
  }

  function contextRules(el, ours, tag) {
    const missing = {};
    contextRulesEach(el, ours, tag, missing);
    for (const [need, names] of Object.entries(missing))
      report(tag.start, 'warning', 'TM107', `${names.join(', ')} ${names.length > 1 ? 'have' : 'has'} no effect without ${need} on the same element.`);
  }
  function contextRulesEach(el, ours, tag, missing) {
    for (const a of ours) {
      const spec = vocab.attributes[a.name];
      if (!spec) continue;
      // tags: only on elements it works on
      if (spec.tags && plain(el)) {
        const static_ = a.expr === undefined && a.value !== undefined && !/[{}]/.test(a.value);
        const list = static_ && spec.tagsFor?.[a.value] ? spec.tagsFor[a.value]
          : static_ ? spec.tags : [...spec.tags, ...Object.values(spec.tagsFor ?? {}).flat()];
        if (!list.some(s => matches(el, s))) {
          const near = list.map(parseSelector).find(s => s.tag === el.name.toLowerCase());
          const fix = near ? ` Add ${near.attrs.map(x => x.values ? `${x.name}="${x.values[0]}"` : x.name).join(' ')}.` : '';
          report(a.at, 'error', 'TM108', `${a.name}${static_ && spec.tagsFor?.[a.value] ? `="${a.value}"` : ''} has no effect on <${el.name}>; it works on ${showList([...new Set(list)])}.${fix}`);
        }
      }
      if (spec.notTags?.includes(el.name.toLowerCase()) && plain(el))
        report(a.at, 'error', 'TM108', `${a.name} on <${el.name}> changes its display, so it stops being part of the table. Wrap the content in a <div ${a.name}…> instead.`);
      // with: needs another attribute on the same element
      if (spec.with) for (const [need, values] of Object.entries(spec.with)) {
        const v = el.attrs.get(need);
        if (!v) (missing[need + (values ? `="${values.join('|')}"` : '')] ??= []).push(a.name);
        else if (values && !v.dynamic && !values.includes(v.value ?? ''))
          report(a.at, 'warning', 'TM107', `${a.name} has no effect with ${need}="${v.value}"; it needs ${need}="${values.join('|')}".`);
      }
      if (jsx) continue; // code in JSX files makes the element tree unreliable
      // parent: what the direct parent must be
      if (spec.parent) {
        const p = parentOf(el);
        if (p !== 'root' && p !== 'unknown' && plain(p) && !spec.parent.some(s => matches(p, s)) && !(spec.loose && (p.attrs.has('class') || p.attrs.has('style') || p.attrs.has('className'))))
          report(a.at, spec.loose ? 'warning' : 'error', 'TM109', spec.loose
            ? `${a.name} only works in a flex or grid parent, such as one with data-layout; its parent <${p.name}> has none.`
            : `${a.name} must be a direct child of ${showList(spec.parent)}; here its parent is <${p.name}>.`);
      }
      // inside: an ancestor it needs
      if (spec.inside) {
        let found = false, known = true;
        for (let p = el.parent; p; p = p.parent) {
          if (p.kind === 'unknown') { known = false; break; }
          if (p.kind === 'element' && spec.inside.some(s => matches(p, s))) { found = true; break; }
        }
        if (!found && known && isDocument)
          report(a.at, spec.loose ? 'warning' : 'error', 'TM109', `${a.name} only works inside ${showList(spec.inside)}.`);
      }
    }
  }

  function labelRules(el, tag) {
    const raw = tag.raw, has = n => el.attrs.has(n);
    const after = (n) => t.startsWith(`</${n}>`, tag.end);
    // text bound at runtime (sinter data-sn-text/-html, Vue v-text/v-html, Alpine x-text/x-html) counts as content
    const boundText = /\s(?:data-sn-(?:text|html)|v-(?:text|html)|x-(?:text|html))\s*=/.test(raw);
    // labels bound by a framework (data-sn-attr="{'aria-label': …}", :aria-label, [attr.aria-label]) count too
    const labelled = has('aria-label') || has('aria-labelledby') || /aria-label/.test(raw);
    // An empty close button in a dialog header shows a drawn ×, but still needs a label.
    if (el.name === 'button' && /\scommand\s*=\s*["']?(close|hide-popover)|popovertargetaction\s*=\s*["']?hide/.test(raw)
        && after('button') && !labelled && !boundText)
      report(tag.start, 'error', 'TM103', '<button> closes something but has no text. Add aria-label (e.g. aria-label="Close").');
    // Icon-only buttons and links (data-icon without a value, or with a value and nothing inside) need a label.
    if (has('data-icon') && /^(button|a)$/.test(el.name) && !labelled) {
      const icon = el.attrs.get('data-icon'), v = icon.dynamic ? '' : icon.value;
      if ((!(v || icon.dynamic) || after(el.name)) && !((v || icon.dynamic) && boundText))
        report(tag.start, 'error', 'TM103', `<${el.name} data-icon${v ? `="${v}"` : ''}> has no visible text. Add aria-label.`);
    }
    // An empty data-tooltip shows the aria-label.
    if (has('data-tooltip') && !el.attrs.get('data-tooltip').dynamic && !el.attrs.get('data-tooltip').value && !labelled)
      report(tag.start, 'error', 'TM103', '<' + el.name + ' data-tooltip> without a value shows the aria-label, and there is none. Add aria-label (or give data-tooltip a text).');
    for (const [name, spec] of Object.entries(vocab.attributes)) {
      if (name === 'data-icon' || !spec.requires || !has(name)) continue;
      if (!spec.requires.some(r => has(r)) && !/aria-label/.test(raw))
        report(tag.start, 'error', 'TM103', `<${el.name} ${name}> has no visible text. Add ${spec.requires.join(' or ')}.`);
    }
  }

  // Fields without a label (warning): not inside <label>, not referenced by label[for], no aria-label,
  // aria-labelledby or title (framework-bound labels count, they mention aria-label).
  const labelFor = new Set([...t.matchAll(/<label\b[^>]*\bfor\s*=\s*["']([^"']+)/g)].map(m => m[1]));
  for (const { el, tag } of fields) {
    const raw = tag.raw;
    if (/\btype\s*=\s*["']?(hidden|submit|button|reset|image)\b/.test(raw) || /aria-label|\stitle\s*=/.test(raw)) continue;
    const id = el.attrs.get('id')?.value;
    if (id && labelFor.has(id)) continue;
    let inLabel = false;
    for (let p = el.parent; p; p = p.parent) if (p.name === 'label' || (p.kind === 'unknown' && /label/i.test(p.name))) { inLabel = true; break; }
    if (inLabel || (jsx && insideLabelText(t, tag.start))) continue;
    report(tag.start, 'warning', 'TM106', `<${el.name}> has no label. Wrap it in <label>, or add aria-label${/placeholder/.test(raw) ? ' (a placeholder is not a label)' : ''}.`);
  }
  return out;
}

/**
 * Adds the data-* attributes a markup file uses to `usage` (name → Set of values, '' for none, or 'any' when a
 * value is computed in a way that does not reduce to literals). Used to prune unused CSS.
 */
export function attributeUsage(text, file, usage = new Map()) {
  const jsx = /\.(jsx|tsx)$/.test(file);
  const add = (name, value) => {
    if (usage.get(name) === 'any') return;
    if (value === 'any') { usage.set(name, 'any'); return; }
    if (!usage.has(name)) usage.set(name, new Set());
    usage.get(name).add(value);
  };
  const addExpr = (name, src) => {
    for (const v of outcomes(src)) {
      if (v === UNKNOWN) { add(name, 'any'); return; }
      if (typeof v === 'string' || typeof v === 'number') add(name, String(v));
      else if (v === true) { add(name, ''); add(name, 'true'); }
    }
  };
  for (const tag of scanTags(blank(text, jsx))) {
    if (tag.closing) continue;
    for (const a of tag.attrs) {
      if (a.raw === null) continue;
      const b = /^(?::|v-bind:|x-bind:)(.+)$/.exec(a.raw), name = b ? b[1] : a.raw;
      if (name === 'data-sn-attr' && a.value !== undefined) { for (const e of objectEntries(a.value)) if (e.key.startsWith('data-')) addExpr(e.key, e.expr); continue; }
      if (!name.startsWith('data-')) continue;
      if (a.expr !== undefined) addExpr(name, a.expr);
      else if (b && a.value !== undefined) addExpr(name, a.value);
      else if (a.value === undefined) add(name, '');
      else if (/^\{[^]*\}$/.test(a.value.trim())) addExpr(name, a.value.trim().slice(1, -1));
      else if (/[{}]|\$\{/.test(a.value)) add(name, 'any');
      else add(name, a.value);
    }
  }
  return usage;
}

/** For JSX, where the element tree is not tracked: is index i between an open <label> and its </label>? */
function insideLabelText(t, i) {
  const before = t.slice(0, i);
  return (before.match(/<label\b/g) ?? []).length > (before.match(/<\/label\s*>/g) ?? []).length;
}

export function checkStyles(text, file = '<input>', ctx = {}) {
  const vocab = ctx.vocab ?? VOCAB;
  const out = [];
  const report = (index, severity, code, message, fix) => out.push({ file, ...position(text, index), severity, code, message, ...(fix ? { fix } : {}) });
  const tokens = Object.keys(vocab.tokens);
  const renamed = vocab.deprecated?.tokens ?? {};
  for (const m of text.matchAll(/var\(\s*(--tm-[a-z0-9-]+)/g)) {
    const start = m.index + m[0].length - m[1].length, swap = to => ({ start, end: start + m[1].length, text: to });
    if (renamed[m[1]]) { report(start, 'warning', 'TM112', `${m[1]} is deprecated. Use ${renamed[m[1]]}.`, swap(renamed[m[1]])); continue; }
    if (tokens.includes(m[1]) || m[1].startsWith('--tm-icon-')) continue;
    const g = closest(m[1], tokens, 4), u = closestUnique(m[1], tokens, 2);
    report(m.index, 'error', 'TM201', `${m[1]} is not a temper token.${g ? ` Did you mean ${g}?` : ''}`, u && u === g ? swap(u) : undefined);
  }
  for (const m of text.matchAll(/(?<![\w-])(--tm-[a-z0-9-]+)\s*:/g)) {
    if (m[1].startsWith('--tm-icon-')) continue; // defining or replacing an icon
    if (renamed[m[1]]) { report(m.index, 'warning', 'TM112', `${m[1]} is deprecated. Use ${renamed[m[1]]}.`, { start: m.index, end: m.index + m[1].length, text: renamed[m[1]] }); continue; }
    const spec = vocab.tokens[m[1]];
    if (!spec) report(m.index, 'warning', 'TM202', `${m[1]} uses the reserved --tm- prefix but is not a temper token. Use your own prefix.`);
    else if (spec.derived) report(m.index, 'warning', 'TM203', `${m[1]} is derived by temper. Set its inputs instead.`);
  }
  if (ctx.lint !== false) lintCss(blankComments(STYLES.has(extname(file)) || file === '<input>' ? text : styleBlocks(text)), 0, report);
  return out;
}

// ───────────── app CSS: does it follow the library's rules? (warnings) ─────────────

/** Declarations in CSS (comments already blanked): { prop, value, at, valueAt, rule } with rule the selector. */
function* declarations(css) {
  const stack = [];
  let last = 0, parens = 0;
  const decl = function* (end) {
    if (!stack.length) return;
    const m = /^(\s*)([-\w]+)\s*:/.exec(css.slice(last, end));
    if (!m || /^(--|\$|@)/.test(m[2])) return;
    const valueAt = last + m[0].length;
    yield { prop: m[2].toLowerCase(), value: css.slice(valueAt, end), at: last + m[1].length, valueAt, rule: stack.at(-1) ?? '' };
  };
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '"' || c === "'") { for (i++; i < css.length && css[i] !== c; i++) if (css[i] === '\\') i++; continue; }
    if (c === '(') parens++;
    else if (c === ')') parens--;
    else if (parens > 0) continue;
    else if (c === '{') { stack.push(css.slice(last, i).trim()); last = i + 1; }
    else if (c === '}') { yield* decl(i); stack.pop(); last = i + 1; }
    else if (c === ';') { yield* decl(i); last = i + 1; }
  }
}

const COLOR_PROPS = /^(color|background(-color)?|border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-color)?|outline(-color)?|fill|stroke|text-decoration(-color)?|caret-color|accent-color|column-rule(-color)?)$/;
const NAMED = 'white|black|red|green|blue|gray|grey|silver|maroon|navy|orange|yellow|purple|pink|teal|olive|lime|aqua|fuchsia|brown|gold|indigo|violet|crimson|tomato|coral|salmon|beige|ivory|khaki|lightgray|lightgrey|darkgray|darkgrey|whitesmoke|gainsboro|dimgray|dimgrey|slategray|slategrey';
const LITERAL_COLOR = new RegExp(`#[0-9a-f]{3,8}\\b|\\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\\(|(?<![\\w-])(?:${NAMED})(?![\\w-])`, 'i');
const SCALE = { xs: [4, 0.25], sm: [8, 0.5], md: [16, 1], lg: [24, 1.5], xl: [40, 2.5] };
const SPACE_PROPS = /^(padding|gap|row-gap|column-gap)(-|$)/;
const RESTYLED = ['data-variant', 'data-tone', 'data-size', 'data-badge', 'data-callout', 'data-avatar', 'data-fab', 'data-toast'];
const VISUAL_PROPS = /^(color|background|border|padding|font|box-shadow|outline|height|block-size|min-height)/;
const colorHint = prop => /^(color|caret|text-decoration)/.test(prop) ? 'var(--tm-text) or var(--tm-text-muted)'
  : /^(border|outline|column-rule)/.test(prop) ? 'var(--tm-border) or var(--tm-border-strong)'
  : 'var(--tm-surface), var(--tm-fill) or var(--tm-tone-soft)';

/**
 * Lints declarations against the library's rules. inline: from a style="" attribute (stricter about space).
 * report(index, severity, code, message, fix)
 */
function lintCss(css, offset, report, { inline = false } = {}) {
  const flagged = new Set();
  for (const d of declarations(css)) {
    const at = offset + d.at, value = d.value;
    if (/!important/i.test(value))
      report(at, 'warning', 'TM204', `!important is not needed: your CSS already wins over temper (it lives in @layer tm.*). Use a plain selector.`);
    if (COLOR_PROPS.test(d.prop) && !/var\(/.test(value) && LITERAL_COLOR.test(value))
      report(at, 'warning', 'TM205', `${d.prop}: ${value.trim()} is a fixed color, so it ignores dark mode and the palette. Use a token, e.g. ${colorHint(d.prop)}${inline ? ', or style="--tm-tone: …" with data-tone' : ''}; for a brand color, define it once as a custom property with light-dark().`);
    const margin = /^margin(-|$)/.test(d.prop);
    if (margin && /(?<![\w.-])(?:\d*\.)?\d*[1-9]\d*(?:\.\d+)?(px|rem|em|%|vh|vw|ch)?\b/.test(value.replace(/var\([^)]*\)/g, '')) && !/^\s*(auto|0|inherit|initial|unset)\s*$/.test(value))
      report(at, 'warning', 'TM206', `${d.prop}: ${value.trim()}: nothing in temper has an outer margin; the parent spaces its children. Use data-layout with data-gap on the parent${inline ? '' : ' (or gap in your own layout CSS)'}.`);
    else if (inline && /^padding(-|$)/.test(d.prop))
      report(at, 'warning', 'TM206', `${d.prop} in a style attribute: use data-pad="xs|sm|md|lg|xl" instead.`);
    else if (SPACE_PROPS.test(d.prop)) {
      // a value that is exactly a step of the space scale: use the token, so it follows the theme
      for (const m of value.matchAll(/(?<![\w.(-])(\d*\.?\d+)(px|rem)\b/g)) {
        const n = Number(m[1]), step = Object.entries(SCALE).find(([, [px, rem]]) => (m[2] === 'px' ? px : rem) === n);
        if (!step || /var\(/.test(value.slice(0, m.index))) continue;
        const start = offset + d.valueAt + m.index;
        report(start, 'warning', 'TM207', `${m[0]} is the ${step[0]} space step. Use var(--tm-space-${step[0]})${inline ? ` or data-pad="${step[0]}"` : ''}.`,
          { start, end: start + m[0].length, text: `var(--tm-space-${step[0]})` });
      }
    }
    // restyling a temper component instead of setting its tokens
    if (!inline && VISUAL_PROPS.test(d.prop) && !flagged.has(d.rule)) {
      const subjects = d.rule.split(',').map(sel => sel.trim().split(/\s*[\s>+~]\s*/).at(-1));
      const hit = RESTYLED.find(attr => subjects.some(sub => sub.includes(`[${attr}`)));
      if (hit) {
        flagged.add(d.rule);
        report(at, 'warning', 'TM208', `This rule restyles temper's [${hit}]. Set its tokens instead (--tm-tone, --tm-radius, --tm-control-h, …), or style your own class, so other variants and both color schemes keep working.`);
      }
    }
  }
}

/** Keeps only the contents of <style> blocks (other text becomes spaces, offsets stay). */
function styleBlocks(text) {
  let out = text.replace(/[^\n]/g, ' ');
  for (const m of text.matchAll(/(<style\b[^>]*>)([\s\S]*?)<\/style\s*>/gi)) {
    const start = m.index + m[1].length;
    out = out.slice(0, start) + m[2] + out.slice(start + m[2].length);
  }
  return out;
}
const blankComments = css => css.replace(/\/\*[\s\S]*?\*\/|(?<![:'"\w])\/\/[^\n]*/g, c => c.replace(/[^\n]/g, ' '));

// Svelte/Vue/Astro files contain both markup and <style> blocks.
export function checkFile(file, ctx = {}) {
  const text = readFileSync(file, 'utf8');
  const ext = extname(file);
  const out = STYLES.has(ext) ? checkStyles(text, file, ctx) : checkMarkup(text, file, ctx);
  if (!STYLES.has(ext) && (ext !== '.html' && ext !== '.htm' || /<style/.test(text))) out.push(...checkStyles(text, file, ctx));
  return ignored(text, out);
}

/** A temper-ignore comment on a line, or on the line before, silences that line. */
function ignored(text, diagnostics) {
  if (!text.includes('temper-ignore')) return diagnostics;
  const lines = text.split('\n');
  return diagnostics.filter(d => !/temper-ignore/.test(lines[d.line - 1] ?? '') && !/temper-ignore/.test(lines[d.line - 2] ?? ''));
}

/** Applies the fixes of a file's diagnostics (later ones first; overlapping ones are skipped). */
export function applyFixes(text, diagnostics) {
  const fixes = diagnostics.map(d => d.fix).filter(Boolean).sort((a, b) => b.start - a.start);
  let applied = 0, limit = Infinity;
  for (const f of fixes) {
    if (f.end > limit) continue;
    text = text.slice(0, f.start) + f.text + text.slice(f.end);
    limit = f.start;
    applied++;
  }
  return { text, applied };
}

export function* walk(path, exts = null) {
  const st = statSync(path);
  if (st.isFile()) { yield path; return; }
  for (const entry of readdirSync(path)) {
    if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue;
    const full = join(path, entry);
    if (statSync(full).isDirectory()) yield* walk(full, exts);
    else if (exts ? exts.has(extname(entry)) : MARKUP.has(extname(entry)) || STYLES.has(extname(entry))) yield full;
  }
}

const MODULES = new Set(Object.values(VOCAB.attributes).map(a => a.module).filter(Boolean));
const SOURCES = new Set([...MARKUP, ...STYLES, '.js', '.mjs', '.cjs', '.ts', '.mts', '.cts']);
/**
 * The temper modules a project imports (JS/CSS imports, <link> tags, CDN URLs), or null when it imports
 * none we can see (then TM110 is not checked). all.css counts as every module.
 */
export function importedModules(paths) {
  const found = new Set();
  for (const p of paths) for (const f of walk(p, SOURCES)) {
    for (const m of readFileSync(f, 'utf8').matchAll(/@tiaforge-ui\/temper(?:@[\w.^~-]+)?(?:\/(?:dist\/|src\/)?([a-z-]+)(?:\.css)?)?(?=["'`)\s?])/g)) {
      const name = m[1] ?? 'core';
      if (name === 'all') for (const x of MODULES) found.add(x);
      else if (MODULES.has(name)) found.add(name);
    }
  }
  return found.size ? found : null;
}

/** Icon names a project defines itself: [data-icon="name"] rules and --tm-icon-name declarations in its CSS. */
export function definedIcons(paths) {
  const names = new Set();
  for (const p of paths) for (const f of walk(p)) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/\[data-icon=["']?([a-z0-9-]+)|--tm-icon-([a-z0-9-]+)\s*:/g)) names.add(m[1] ?? m[2]);
  }
  return names;
}

export function check(paths, ctx = {}) {
  const icons = new Set([...(ctx.icons ?? []), ...definedIcons(paths)]);
  const modules = ctx.modules === undefined ? importedModules(paths) : ctx.modules;
  const out = [];
  for (const p of paths) for (const f of walk(p)) out.push(...checkFile(f, { ...ctx, icons, modules }));
  return out;
}
