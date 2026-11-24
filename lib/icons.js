// Icon CSS generation, shared by scripts/gen.mjs (the prebuilt src/icons.css) and the Vite plugin
// (your own SVG folder, Lucide icons on demand). Every icon becomes one [data-icon="<name>"] rule:
// --_icon: var(--tm-icon-<name>, url(...)), so --tm-icon-<name> set anywhere (an input) replaces it, and the
// image is written once instead of as a :root property plus a rule that reads it.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, basename } from 'node:path';
import { walk, iconUsage } from './check.js';

/** Turns an SVG file into a compact CSS url() usable as a mask image (shape only, color comes from CSS). */
export function svgToMask(svg) {
  const min = svg
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\?xml[\s\S]*?\?>/g, '')
    .replace(/<svg\b[^>]*>/, tag => tag.replace(/\s(class|width|height|id)="[^"]*"/g, '')) // only on the root <svg>, not on <rect> etc.
    .replace(/\sclass="[^"]*"/g, '')
    .replace(/currentColor/g, 'black')
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .replace(/\s*\/>/g, '/>')
    .replace(/\s+>/g, '>')
    .trim()
    .replace(/"/g, "'");
  const encoded = min.replace(/[<>#%{}\n]/g, c => encodeURIComponent(c));
  return `url("data:image/svg+xml,${encoded}")`;
}

/** CSS for a list of {name, svg}: one rule per data-icon value, with the image as the fallback of --tm-icon-<name>. */
export function iconCss(icons, { layer = 'tm.base', banner = '' } = {}) {
  const body = icons.map(({ name, svg }) => `:where([data-icon="${name}"]) { --_icon: var(--tm-icon-${name}, ${svgToMask(svg)}); }\n`).join('');
  return banner + (layer ? `@layer ${layer} {\n${body}}\n` : body);
}

/** Directory of Lucide's SVGs, resolved from `fromDir` (a project) first, then from temper itself. */
export function lucideIconsDir(fromDir) {
  for (const base of [fromDir && join(fromDir, 'package.json'), import.meta.url].filter(Boolean)) {
    try { return join(dirname(createRequire(base).resolve('lucide-static/package.json')), 'icons'); } catch {}
  }
  return null;
}

export const LUCIDE_BANNER = '/*! Icons from Lucide (https://lucide.dev), ISC License, Copyright (c) Lucide Icons and Contributors. See LICENSE-lucide. */\n';

/** {name, svg} for every .svg in a folder (name = file name without .svg). */
export function folderIcons(dir) {
  if (!dir || !existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.svg')).sort()
    .map(f => ({ name: basename(f, '.svg'), svg: readFileSync(join(dir, f), 'utf8') }));
}

export function lucideIcon(dir, name) {
  const file = dir && join(dir, `${name}.svg`);
  return file && existsSync(file) ? { name, svg: readFileSync(file, 'utf8') } : null;
}

export function lucideNames(dir) {
  return dir && existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.svg')).map(f => basename(f, '.svg')) : [];
}

const MARKUP = /\.(html?|svelte|astro|vue|jsx|tsx)$/;

/**
 * The data-icon names a project's markup uses, for emitting only those (the Vite plugin's icons option).
 * names: every literal, also each one an expression can produce (data-icon={dark ? 'sun' : 'moon'});
 * unresolved: the places whose names cannot be known from the source (data-icon={item.icon}), { file, line, col, source }.
 */
export function usedIcons(paths) {
  const names = new Set(), unresolved = [];
  for (const p of paths) for (const f of walk(p)) {
    if (!MARKUP.test(f)) continue;
    const u = iconUsage(readFileSync(f, 'utf8'), f);
    for (const n of u.names) names.add(n);
    unresolved.push(...u.unresolved);
  }
  return { names, unresolved };
}

/**
 * The notice for icons whose names cannot be known from the source: with on-demand icons they are not emitted
 * and render blank. place(u) formats a location; include: the names already listed in the icons.include option.
 */
export function unresolvedIconsNotice(unresolved, { place = u => `${u.file}:${u.line}:${u.col}`, include = [] } = {}) {
  if (!unresolved.length) return '';
  const lines = unresolved.map(u => `  ${place(u)}  ${u.source}`);
  const what = unresolved.length === 1 ? 'This data-icon is' : `These ${unresolved.length} data-icon values are`;
  return `temper icons: ${what} computed in a way the source does not show, so the Lucide icons ${unresolved.length === 1 ? 'it' : 'they'} can name are not emitted and render blank:\n`
    + lines.join('\n') + '\n'
    + (include.length
      ? `  Make sure the plugin's icons.include (${include.length} name${include.length === 1 ? '' : 's'}) lists every name ${unresolved.length === 1 ? 'it' : 'they'} can have, then add a temper-ignore comment on the line to silence this.`
      : `  Add the names ${unresolved.length === 1 ? 'it' : 'they'} can have to the plugin's icons.include, e.g. temper({ icons: { include: ['rocket', 'star'] } }), or write them as literals (data-icon={done ? 'check' : 'x'}); then add a temper-ignore comment on the line to silence this.`);
}
