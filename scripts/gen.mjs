// Generates llms.txt and html-custom-data.json from vocab.json.
// Usage: node scripts/gen.mjs [--check]   (--check fails if the generated files are out of date)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const vocab = JSON.parse(readFileSync(root + 'vocab.json', 'utf8'));

export function renderLlms(vocab, template) {
  const attrs = Object.entries(vocab.attributes).map(([name, a]) => {
    const mod = a.module && a.module !== 'core' ? ` Needs \`${a.module}.css\`.` : '';
    const head = `### \`${name}\`${a.boolean ? ' (boolean, no value)' : ''}\n\nOn: ${a.on}. ${a.description}${mod}`;
    if (a.boolean) return head + (a.requires ? `\nRequires one of: ${a.requires.map(r => `\`${r}\``).join(', ')}.` : '');
    const values = Object.entries(a.values).map(([v, d]) => `- \`${v}\`${d ? `: ${d}` : ''}`).join('\n');
    return `${head}\n\n${values}`;
  }).join('\n\n');
  const kinds = {};
  for (const [name, t] of Object.entries(vocab.tokens)) (kinds[t.kind] ??= []).push([name, t]);
  const titles = { input: 'Inputs (set these)', color: 'Colors', space: 'Space', radius: 'Radius', text: 'Text sizes', shadow: 'Shadows', density: 'Density (read only)' };
  const tokens = Object.entries(kinds).map(([kind, list]) =>
    `### ${titles[kind] ?? kind}\n\n` + list.map(([n, t]) => `- \`${n}\`: ${t.description}${t.derived ? ' (derived, read only)' : ''}`).join('\n')
  ).join('\n\n');
  return template.replace('{{attributes}}', attrs).replace('{{tokens}}', tokens);
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

const outputs = {
  'llms.txt': renderLlms(vocab, readFileSync(root + 'docs/llms.template.md', 'utf8')),
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
