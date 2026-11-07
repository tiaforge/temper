// Vite plugin: runs tinystyle check as part of the build, so agents see problems in the output of
// `npm run build` instead of needing a separate command. Errors fail the build; in the dev server
// they are only printed (on start and for every changed file).
//
//   import tinystyle from '@tiaforge-ui/tinystyle/vite';
//   export default { plugins: [tinystyle()] };
//
// Options: paths (default: the Vite root), warningsFail (default false).
import { relative } from 'node:path';
import { check, checkFile } from './check.js';

const CHECKED = /\.(html?|svelte|astro|vue|jsx|tsx|css|scss|sass|less)$/;

export default function tinystyle({ paths, warningsFail = false } = {}) {
  let root = process.cwd(), isBuild = false, logger = console;
  const line = d => `${relative(root, d.file)}:${d.line}:${d.col} ${d.severity} ${d.code} ${d.message}`;

  return {
    name: 'tinystyle-check',
    configResolved(config) {
      root = config.root;
      isBuild = config.command === 'build';
      logger = config.logger ?? console;
    },
    buildStart() {
      const results = check(paths ?? [root]);
      if (!results.length) return;
      const errors = results.filter(d => d.severity === 'error').length;
      const failing = errors || (warningsFail && results.length);
      const summary = `tinystyle check: ${errors} error(s), ${results.length - errors} warning(s)\n` + results.map(line).join('\n');
      if (isBuild && failing) this.error(summary);
      else logger.warn(summary);
    },
    handleHotUpdate({ file }) {
      if (!CHECKED.test(file) || file.includes('/node_modules/')) return;
      const results = checkFile(file);
      if (results.length) logger.warn(results.map(line).join('\n'));
    },
  };
}
