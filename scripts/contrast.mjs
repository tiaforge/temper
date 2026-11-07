#!/usr/bin/env node
// Contrast validator: sweeps the accent hue 0–360 (and a few neutral tints) in light and dark mode,
// lets headless Chrome resolve every role token, and checks WCAG AA for each text/background pair.
// It also finds, per hue, the highest accent chroma that still passes ("chroma cap").
//
// Usage: node scripts/contrast.mjs [--step 5] [--chroma 0.19] [--tints 0,0.02]
//          [--css extra.css ...] [--root data-example-theme=ink] [--own] [--browser cmd] [--json]
// --own checks the palette as its CSS sets it (its own hue, chroma and tint) instead of sweeping hues and tints.
// Exit code 1 when a pair fails at the chosen settings.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { launch, findBrowser } from '../packages/inspect/lib/cdp.js';

const root = fileURLToPath(new URL('..', import.meta.url));

/** Runs inside the page. Returns { results, caps }. */
function sweep({ hues, chroma, tints, capFrom, capTo, capStep }) {
  const html = document.documentElement;
  const ctx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
  const rgba = color => {
    ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = 'rgba(0,0,0,0)'; ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data; return { r, g, b, a: a / 255 };
  };
  const lum = ({ r, g, b }) => [r, g, b].map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
    .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const blend = (t, u) => ({ r: t.r * t.a + u.r * (1 - t.a), g: t.g * t.a + u.g * (1 - t.a), b: t.b * t.a + u.b * (1 - t.a), a: 1 });
  const hex = c => '#' + [c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  // A fresh probe per read: Chrome can return a stale computed color for a reused element whose style was replaced.
  const read = (expr, tone) => {
    const probe = document.body.appendChild(document.createElement('div'));
    if (tone === 'primary') probe.style.setProperty('--ts-tone', 'var(--ts-primary)');
    else if (tone) probe.dataset.tone = tone;
    probe.style.color = `var(${expr})`;
    const c = rgba(getComputedStyle(probe).color);
    probe.remove();
    return c;
  };
  const ratio = (fg, bg, tone) => {
    const b = blend(read(bg, tone), { r: 255, g: 255, b: 255, a: 1 }), f = blend(read(fg, tone), b);
    const [x, y] = [lum(f), lum(b)].sort((p, q) => q - p);
    return { ratio: (x + 0.05) / (y + 0.05), fg: hex(f), bg: hex(b) };
  };

  // [group, label, fg, bg, tone, minimum]. 4.5 = WCAG AA body text, 3 = non-text UI (1.4.11).
  const text = [['--ts-bg', 'bg'], ['--ts-surface', 'surface'], ['--ts-surface-raised', 'raised'], ['--ts-fill', 'fill']];
  const tonePairs = tone => [
    ...text.slice(0, 3).map(([bg, n]) => [`${tone} text on ${n}`, '--ts-tone-ink', bg, tone, 4.5]),
    [`${tone} text on ${tone}-soft`, '--ts-tone-ink', '--ts-tone-soft', tone, 4.5],
    [`${tone} solid button`, '--ts-tone-on', '--ts-tone', tone, 4.5],
  ];
  const checks = {
    neutral: [
      ...text.map(([bg, n]) => [`text on ${n}`, '--ts-text', bg, null, 4.5]),
      ...text.map(([bg, n]) => [`muted text on ${n}`, '--ts-text-muted', bg, null, 4.5]),
      ['muted text on field (placeholder)', '--ts-text-muted', '--ts-field', null, 4.5],
      ['main button', '--ts-tone-on', '--ts-tone', 'primary', 4.5],
    ],
    accent: [
      ...tonePairs('accent'),
      ['text on accent-soft (selected row)', '--ts-text', '--ts-tone-soft', 'accent', 4.5],
      ['accent on bg (focus ring, checked box)', '--ts-accent', '--ts-bg', null, 3],
      ['accent on surface (focus ring, checked box)', '--ts-accent', '--ts-surface', null, 3],
    ],
    status: ['danger', 'success', 'warning', 'info'].flatMap(tonePairs),
  };

  const set = (name, v) => v == null ? html.style.removeProperty(name) : html.style.setProperty(name, String(v));
  const run = (group, scheme, at) => checks[group].map(([label, fg, bg, tone, min]) => ({ group, label, scheme, ...at, min, ...ratio(fg, bg, tone) }));
  const results = [], caps = [];
  for (const scheme of ['light', 'dark']) {
    html.dataset.theme = scheme;
    set('--ts-chroma', chroma);
    for (const tint of tints) {
      set('--ts-neutral-tint', tint);
      for (const hue of hues) { set('--ts-hue', hue); results.push(...run('neutral', scheme, { hue, tint })); }
    }
    set('--ts-neutral-tint', null);
    for (const hue of hues) { set('--ts-hue', hue); results.push(...run('accent', scheme, { hue })); }
    set('--ts-hue', null);
    results.push(...run('status', scheme, {}));
  }
  // chroma cap: the highest chroma (scanning upward) at which every accent pair passes in both schemes
  for (const hue of hues) {
    set('--ts-hue', hue);
    let cap = null;
    for (let c = capFrom; c <= capTo + 1e-9; c += capStep) {
      set('--ts-chroma', c.toFixed(3));
      const ok = ['light', 'dark'].every(s => { html.dataset.theme = s; return run('accent', s, {}).every(r => r.ratio >= r.min); });
      if (!ok) break;
      cap = +c.toFixed(3);
    }
    caps.push({ hue, cap });
  }
  set('--ts-hue', null); set('--ts-chroma', null); html.removeAttribute('data-theme');
  return { results, caps, chroma: chroma != null ? String(chroma) : getComputedStyle(html).getPropertyValue('--ts-chroma').trim() };
}

export async function validate({ step = 5, hues, chroma, tints = [0, 0.02], css = [], rootAttrs = [], browser,
  capFrom = 0.02, capTo = 0.37, capStep = 0.01 } = {}) {
  const sheets = [readFileSync(`${root}src/core.css`, 'utf8'), ...css.map(f => readFileSync(f, 'utf8'))];
  hues ??= Array.from({ length: Math.ceil(360 / step) }, (_, i) => i * step); // null entries keep the stylesheet's value
  const b = await launch(browser ? browser.split(' ') : findBrowser());
  try {
    const page = await b.newPage();
    await page.goto('about:blank', { width: 400, height: 300, scheme: 'light', settle: 0 });
    await page.evaluate(`(() => {
      for (const [k, v] of ${JSON.stringify(rootAttrs)}) document.documentElement.setAttribute(k, v);
      for (const text of ${JSON.stringify(sheets)}) document.head.appendChild(document.createElement('style')).textContent = text;
    })()`);
    return await page.evaluate(`(${sweep.toString()})(${JSON.stringify({ hues, chroma, tints, capFrom, capTo, capStep })})`);
  } finally { await b.close(); }
}

/** Groups failures and lowest ratios per check into a short text report. */
export function report({ results, caps, chroma }) {
  const lines = [], fails = results.filter(r => r.ratio < r.min);
  const ranges = hs => {
    const out = [];
    for (const h of [...new Set(hs)].sort((a, b) => a - b)) {
      const last = out.at(-1);
      if (last && h - last[1] <= 5) last[1] = h; else out.push([h, h]);
    }
    return out.map(([a, z]) => a === z ? `${a}` : `${a}–${z}`).join(', ');
  };
  const by = new Map();
  for (const r of results) {
    const k = `${r.scheme}\u0000${r.label}`;
    const e = by.get(k) ?? { ...r, worst: r, hues: [] };
    if (r.ratio < e.worst.ratio) e.worst = r;
    if (r.ratio < r.min && r.hue != null) e.hues.push(r.hue);
    by.set(k, e);
  }
  lines.push(`Contrast sweep at chroma ${chroma}: ${results.length} pairs, ${fails.length} below WCAG AA.`, '');
  for (const scheme of ['light', 'dark']) {
    lines.push(`${scheme}:`);
    for (const e of [...by.values()].filter(e => e.scheme === scheme)) {
      const w = e.worst, bad = w.ratio < w.min;
      const at = w.hue != null ? ` at hue ${w.hue}${w.tint ? `, tint ${w.tint}` : ''}` : '';
      lines.push(`  ${bad ? '✗' : '✓'} ${e.label.padEnd(44)} min ${w.ratio.toFixed(2).padStart(5)} / ${w.min}${at} (${w.fg} on ${w.bg})` +
        (bad && e.hues.length ? `; fails at hues ${ranges(e.hues)}` : ''));
    }
    lines.push('');
  }
  const current = parseFloat(chroma);
  const capped = caps.filter(c => c.cap == null || c.cap < current);
  lines.push(capped.length ? `Hues that need a chroma cap below ${chroma} (highest chroma that passes):` : `No hue needs a chroma cap below ${chroma}.`);
  const groups = [];
  for (const c of capped) {
    const g = groups.at(-1);
    if (g && g.cap === c.cap && c.hue - g.to <= 5) g.to = c.hue; else groups.push({ from: c.hue, to: c.hue, cap: c.cap });
  }
  for (const g of groups) lines.push(`  ${g.from == null ? 'own hue' : `hue ${g.from === g.to ? g.from : `${g.from}–${g.to}`}`}: ${g.cap ?? 'none passes'}`);
  return { text: lines.join('\n'), failed: fails.length > 0 };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), opts = { css: [], rootAttrs: [] };
  let json = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i], v = () => args[++i];
    if (a === '--step') opts.step = +v();
    else if (a === '--chroma') opts.chroma = +v();
    else if (a === '--tints') opts.tints = v().split(',').map(Number);
    else if (a === '--css') opts.css.push(v());
    else if (a === '--root') { const [k, ...rest] = v().split('='); opts.rootAttrs.push([k, rest.join('=')]); }
    else if (a === '--own') { opts.hues = [null]; opts.tints = [null]; }
    else if (a === '--browser') opts.browser = v();
    else if (a === '--json') json = true;
    else { console.error(`Unknown option ${a}`); process.exit(2); }
  }
  const data = await validate(opts);
  const { text, failed } = report(data);
  console.log(json ? JSON.stringify(data, null, 2) : text);
  process.exitCode = failed ? 1 : 0;
}
