// A strict vite.config.ts and a script using the checker, without vite installed (see test/types.test.js).
import temper, { type TemperOptions, type TemperPlugin } from '@tiaforge-ui/temper/vite';
import { check, checkMarkup, checkStyles, applyFixes, closest, type Diagnostic, type CheckContext } from '@tiaforge-ui/temper/check';

const options: TemperOptions = {
  paths: ['src', 'contacts'],
  warningsFail: true,
  icons: { dir: 'src/icons', lucide: true, include: ['rocket', 'star'] },
  enhance: ['customizable-select'],
  prune: { paths: ['src'] },
  inspect: { source: false, delay: 300 },
};
const plugins: TemperPlugin[] = [temper(), temper(options), temper({ enhance: 'all', prune: true, inspect: true })];
export default { plugins };

const ctx: CheckContext = { icons: new Set(['rocket']), modules: null };
const found: Diagnostic[] = [...check(['src'], { icons: ['rocket'] }), ...checkMarkup('<b data-tm-tone="x">', 'a.html', ctx), ...checkStyles('.x{}')];
const first = found[0];
const where: string = `${first.file}:${first.line}:${first.col} ${first.severity === 'error' ? 'E' : 'W'} ${first.code}`;
const fixed: string = applyFixes('<b data-tm-tone="x">', found).text;
const guess: string | undefined = closest('stak', ['stack', 'row']);
console.log(where, fixed, guess);

temper({ icons: { include: 'rocket' } }); // expect: include is a list
temper({ enhance: ['customisable-select'] }); // expect: not an enhancement
temper({ warningsFail: 'yes' }); // expect: a boolean
const sev: 'info' = first.severity; // expect: error or warning
checkMarkup(42); // expect: text
