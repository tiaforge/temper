// Generates llms.txt and html-custom-data.json from vocab.json.
// Usage: node scripts/gen.mjs [--check]   (--check fails if the generated files are out of date)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { iconCss, lucideIconsDir, lucideIcon, LUCIDE_BANNER } from '../lib/icons.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const vocab = JSON.parse(readFileSync(root + 'vocab.json', 'utf8'));

const firstSentence = t => (t.match(/^.*?[.!?](?=\s|$)/) ?? [t])[0];

/** One table row per attribute: name, values, first sentence of the description. */
function compactAttributes(vocab) {
  const rows = Object.entries(vocab.attributes).map(([name, a]) => {
    const values = name === 'data-icon' ? 'an icon name (see Icons), or none' : a.freeText ? 'any text, or none'
      : a.boolean ? '(boolean)' : (a.allowEmpty ? '(none), ' : '') + Object.keys(a.values).join(', ');
    const mod = a.module && a.module !== 'core' ? ` (${a.module}.css)` : '';
    return `| \`${name}\`${mod} | ${values} | ${a.short ?? firstSentence(a.description)} |`;
  });
  return '| Attribute | Values | What it does |\n|---|---|---|\n' + rows.join('\n');
}

/** Token names grouped by kind, names only. */
function compactTokens(vocab) {
  const kinds = {};
  for (const [name, t] of Object.entries(vocab.tokens)) if (!t.derived || t.kind === 'color') (kinds[t.kind] ??= []).push(name);
  const titles = { input: 'Inputs (set these)', color: 'Colors', space: 'Space', radius: 'Radius', text: 'Text sizes', shadow: 'Shadows', density: 'Density' };
  return Object.entries(kinds).map(([k, names]) => `- ${titles[k] ?? k}: ${names.map(n => `\`${n}\``).join(', ')}`).join('\n');
}

/** Renders llms.txt (short) or llms-full.txt from the template: <!-- full -->/<!-- short --> blocks select content. */
export function renderLlms(vocab, template, { full = true } = {}) {
  const keep = full ? 'full' : 'short', drop = full ? 'short' : 'full';
  template = template
    .replace(new RegExp(`<!-- ${drop} -->[\\s\\S]*?<!-- /${drop} -->\\n?`, 'g'), '')
    .replace(new RegExp(`<!-- /?${keep} -->\\n?`, 'g'), '');
  const iconNames = Object.keys(vocab.attributes['data-icon'].values).join(', ');
  if (!full) return template.replace('{{attributes}}', compactAttributes(vocab)).replace('{{tokens}}', compactTokens(vocab)).replace('{{iconNames}}', iconNames);
  const attrs = Object.entries(vocab.attributes).map(([name, a]) => {
    const mod = a.module && a.module !== 'core' ? ` Needs \`${a.module}.css\`.` : '';
    const head = `### \`${name}\`${a.boolean ? ' (boolean, no value)' : ''}\n\nOn: ${a.on}. ${a.description}${mod}`;
    if (a.boolean) return head + (a.requires ? `\nRequires one of: ${a.requires.map(r => `\`${r}\``).join(', ')}.` : '');
    if (a.freeText) return `${head}\n\nValue: any text, or none.`;
    const entries = Object.entries(a.values);
    // values without descriptions read best as one line (and keep llms.txt short)
    const optional = a.allowEmpty ? 'Also valid without a value.\n\n' : '';
    const values = optional + (entries.every(([, d]) => !d)
      ? `Values: ${entries.map(([v]) => `\`${v}\``).join(', ')}.`
      : entries.map(([v, d]) => `- \`${v}\`${d ? `: ${d}` : ''}`).join('\n'));
    return `${head}\n\n${values}`;
  }).join('\n\n');
  const kinds = {};
  for (const [name, t] of Object.entries(vocab.tokens)) (kinds[t.kind] ??= []).push([name, t]);
  const titles = { input: 'Inputs (set these)', color: 'Colors', space: 'Space', radius: 'Radius', text: 'Text sizes', shadow: 'Shadows', density: 'Density (read only)' };
  const tokens = Object.entries(kinds).map(([kind, list]) =>
    `### ${titles[kind] ?? kind}\n\n` + list.map(([n, t]) => `- \`${n}\`: ${t.description}${t.derived ? ' (derived, read only)' : ''}`).join('\n')
  ).join('\n\n');
  return template.replace('{{attributes}}', attrs).replace('{{tokens}}', tokens).replace('{{iconNames}}', iconNames);
}

export function renderCustomData(vocab) {
  return {
    version: 1.1,
    globalAttributes: Object.entries(vocab.attributes).map(([name, a]) => ({
      name,
      description: `tinystyle${a.module && a.module !== 'core' ? ` (${a.module}.css)` : ''}. On: ${a.on}. ${a.description}`,
      ...(a.boolean ? { valueSet: 'v' } : {
        values: Object.entries(a.values).map(([v, d]) => ({ name: v, ...(d ? { description: d } : {}) })),
      }),
    })),
  };
}

/**
 * types/attributes.d.ts: every attribute with its allowed values, for values computed at runtime.
 * Frameworks differ in what false and true render (see the generated comment), hence the two parameters.
 */
export function renderAttributeTypes(vocab) {
  const q = v => `'${v.replace(/'/g, "\\'")}'`;
  const icons = Object.keys(vocab.attributes['data-icon'].values);
  const props = Object.entries(vocab.attributes).map(([name, a]) => {
    let type;
    if (name === 'data-icon') type = `TinystyleIcon | (string & {}) | '' | Empty`;
    else if (a.freeText) type = `string | Empty`;
    else if (a.boolean) type = `true | ''`;
    else {
      const values = Object.keys(a.values);
      type = values.map(q).join(' | ');
      if (values.every(v => /^\d+$/.test(v))) type += ' | ' + values.join(' | ');
      if (a.allowEmpty) type += ` | '' | Empty`;
    }
    const old = Object.keys(vocab.deprecated?.values?.[name] ?? {});
    if (old.length) type += ' | ' + old.map(q).join(' | ') + ' /* deprecated */';
    const doc = (a.short ?? firstSentence(a.description)).replace(/\*\//g, '*\\/');
    const mod = a.module && a.module !== 'core' ? ` Needs ${a.module}.css.` : '';
    return `  /** ${doc}${mod} */\n  '${name}'?: ${type} | null | Removes;`;
  });
  for (const [oldName, newName] of Object.entries(vocab.deprecated?.attributes ?? {}))
    props.push(`  /** @deprecated Use ${newName}. */\n  '${oldName}'?: TinystyleAttributes<Removes, Empty>['${newName}'];`);
  return `// Generated from vocab.json by scripts/gen.mjs. Do not edit.
// tinystyle's data-* attributes and their allowed values, so values computed at runtime are type-checked
// like static ones are by \`tinystyle check\`. Use a framework file (svelte, react, vue, astro, sinter),
// which plugs this into the framework's own element types.

/** The icon names tinystyle ships. Any other string is accepted too (your own icons, Lucide via the Vite plugin). */
export type TinystyleIcon =\n${icons.map(i => `  | ${q(i)}`).join('\n')};

/**
 * \`Removes\`: the value that removes an attribute besides null and undefined: false in sinter.
 * Svelte, React, Vue and Astro render false as data-x="false", which still matches [data-x], so it is not allowed
 * there: write \`cond || null\` (or \`cond ? '' : null\`) instead of a bare boolean.
 * \`Empty\`: a non-string value that renders the attribute without a value: true in sinter. Elsewhere true renders
 * "true", which is fine for boolean attributes but not a valid value for the others.
 */
export interface TinystyleAttributes<Removes = never, Empty = never> {
${props.join('\n')}
}
`;
}

const typeFiles = {
  'types/svelte.d.ts': `// Generated by scripts/gen.mjs. Types tinystyle's data-* attributes in svelte/elements, so props of components
// that pass them on (let { ...rest }: HTMLAttributes<HTMLSpanElement> = $props()) are checked by svelte-check.
// svelte-check never types data-* attributes written on elements; tinystyle check covers those.
// Reference it once, for example in src/app.d.ts:  /// <reference types="@tiaforge-ui/tinystyle/svelte" />
import type { TinystyleAttributes } from './attributes.js';

declare module 'svelte/elements' {
  interface HTMLAttributes<T extends EventTarget> extends TinystyleAttributes {}
}
export {};
`,
  'types/react.d.ts': `// Generated by scripts/gen.mjs. Types tinystyle's data-* attributes in React JSX.
// Reference it once, for example in src/env.d.ts:  /// <reference types="@tiaforge-ui/tinystyle/react" />
import type { TinystyleAttributes } from './attributes.js';

declare module 'react' {
  interface HTMLAttributes<T> extends TinystyleAttributes {}
}
export {};
`,
  'types/vue.d.ts': `// Generated by scripts/gen.mjs. Types tinystyle's data-* attributes in Vue templates (vue-tsc, Vue - Official).
// Reference it once, for example in src/env.d.ts:  /// <reference types="@tiaforge-ui/tinystyle/vue" />
import type { TinystyleAttributes } from './attributes.js';

declare module '@vue/runtime-dom' {
  interface HTMLAttributes extends TinystyleAttributes {}
}
export {};
`,
  'types/astro.d.ts': `// Generated by scripts/gen.mjs. Types tinystyle's data-* attributes in .astro files (astro check, the Astro editor extension).
// Reference it once, for example in src/env.d.ts:  /// <reference types="@tiaforge-ui/tinystyle/astro" />
import type { TinystyleAttributes } from './attributes.js';

declare global {
  namespace astroHTML.JSX {
    interface HTMLAttributes extends TinystyleAttributes {}
  }
}
export {};
`,
  'types/sinter.d.ts': `// Generated by scripts/gen.mjs. Types tinystyle's data-* attributes in sinter's data-sn-attr="{…}" (sinter check).
// Import it once from your sinter types module (src/sinter.types.ts):  import type {} from '@tiaforge-ui/tinystyle/sinter';
// In sinter, false and null remove an attribute and true writes it without a value.
import type { TinystyleAttributes } from './attributes.js';

declare global {
  interface SinterAttributes extends TinystyleAttributes<false, true> {}
}
export {};
`,
};

const lucide = lucideIconsDir();
const defaultIcons = Object.keys(vocab.attributes['data-icon'].values).map(name => {
  const icon = lucideIcon(lucide, name);
  if (!icon) throw new Error(`Lucide has no icon named ${name}`);
  return icon;
});

const outputs = {
  'src/icons.css': '/* tinystyle icons: the default set, generated from vocab.json by scripts/gen.mjs. Do not edit. */\n'
    + iconCss(defaultIcons, { banner: LUCIDE_BANNER }),
  'LICENSE-lucide': readFileSync(lucide + '/../LICENSE', 'utf8'),
  'llms.txt': renderLlms(vocab, readFileSync(root + 'docs/llms.template.md', 'utf8'), { full: false }),
  'llms-full.txt': renderLlms(vocab, readFileSync(root + 'docs/llms.template.md', 'utf8'), { full: true }),
  'html-custom-data.json': JSON.stringify(renderCustomData(vocab), null, 2) + '\n',
  'types/attributes.d.ts': renderAttributeTypes(vocab),
  ...typeFiles,
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  let stale = false;
  for (const [file, content] of Object.entries(outputs)) {
    let current = '';
    try { current = readFileSync(root + file, 'utf8'); } catch {}
    if (current === content) continue;
    if (check) { console.error(`${file} is out of date. Run npm run gen.`); stale = true; }
    else { writeFileSync(root + file, content); console.log(`wrote ${file}`); }
  }
  if (stale) process.exit(1);
}
