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
    const values = name === 'data-icon' ? 'an icon name (see Icons), or none'
      : a.boolean ? '(boolean)' : Object.keys(a.values).join(', ');
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
    const entries = Object.entries(a.values);
    // values without descriptions read best as one line (and keep llms.txt short)
    const values = entries.every(([, d]) => !d)
      ? `Values: ${entries.map(([v]) => `\`${v}\``).join(', ')}.`
      : entries.map(([v, d]) => `- \`${v}\`${d ? `: ${d}` : ''}`).join('\n');
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
