// A node:test reporter for GitHub Actions: every failing test becomes an error annotation on the run page,
// with the assertion message, so a failure is readable without opening (or being allowed to open) the log.
// CI adds it next to the spec reporter through NODE_OPTIONS.
import { relative } from 'node:path';

const esc = s => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const prop = s => esc(s).replace(/:/g, '%3A').replace(/,/g, '%2C');

export default async function* github(source) {
  for await (const { type, data } of source) {
    if (type !== 'test:fail' || data.details?.type === 'suite') continue;
    const err = data.details?.error;
    const cause = err?.cause ?? err;
    const message = (cause?.message ?? String(cause)).slice(0, 3000);
    const file = data.file ? relative(process.cwd(), data.file) : undefined;
    const where = file ? `file=${prop(file)},line=${data.line ?? 1},` : '';
    yield `::error ${where}title=${prop(data.name)}::${esc(message)}\n`;
  }
}
