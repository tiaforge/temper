// Progressive enhancements (SPEC §1.5): CSS for features that are not yet in all three engines.
// Each is one file, dist/enhance/<web-features id>.css, included only when you opt in.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { closest } from './check.js';

export const ENHANCEMENTS = ['customizable-select'];

/** Normalizes the `enhance` option ('all' or a list of ids) and throws on unknown ids, with a suggestion. */
export function resolveEnhancements(option) {
  if (option == null || option === false) return [];
  const ids = option === 'all' ? ENHANCEMENTS : Array.isArray(option) ? option : [option];
  for (const id of ids) {
    if (ENHANCEMENTS.includes(id)) continue;
    const g = closest(String(id), ENHANCEMENTS, 4);
    throw new Error(`tinystyle: unknown enhancement "${id}".${g ? ` Did you mean "${g}"?` : ''} Known: ${ENHANCEMENTS.join(', ')}, or 'all'.`);
  }
  return [...new Set(ids)];
}

const pkg = new URL('..', import.meta.url);
/** The CSS of one enhancement: the built file, or the source in a checkout that has not been built. */
export function enhancementCss(id) {
  for (const dir of ['dist/enhance/', 'src/enhance/']) {
    const file = fileURLToPath(new URL(dir + id + '.css', pkg));
    if (existsSync(file)) return readFileSync(file, 'utf8');
  }
  throw new Error(`tinystyle: ${id}.css is missing from the package`);
}

/** The bundles enhancements get appended to: core.css, or all.css (which contains core). */
export const ENTRY_FILES = ['core.css', 'all.css'].map(f => fileURLToPath(new URL('dist/' + f, pkg)));
