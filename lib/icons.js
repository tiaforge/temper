// Icon CSS generation, shared by scripts/gen.mjs (the prebuilt src/icons.css) and the Vite plugin
// (your own SVG folder, Lucide icons on demand). Every icon becomes an overridable custom property
// --ts-icon-<name> plus a [data-icon="<name>"] rule that points the element at it.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, basename } from 'node:path';

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

/** CSS for a list of {name, svg}. `root` declares the properties, `rules` maps data-icon values to them. */
export function iconCss(icons, { layer = 'ts.base', banner = '' } = {}) {
  const props = icons.map(({ name, svg }) => `  --ts-icon-${name}: ${svgToMask(svg)};`).join('\n');
  const rules = icons.map(({ name }) => `:where([data-icon="${name}"]) { --_icon: var(--ts-icon-${name}); }`).join('\n');
  const body = `:root {\n${props}\n}\n${rules}\n`;
  return banner + (layer ? `@layer ${layer} {\n${body}}\n` : body);
}

/** Directory of Lucide's SVGs, resolved from `fromDir` (a project) first, then from tinystyle itself. */
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
