// Vite plugin.
// 1. Runs temper check as part of the build, so problems show up in `npm run build` (errors fail it;
//    the dev server only prints them, on start and for every changed file).
// 2. Optional icons: `icons: { dir: 'src/icons', lucide: true }` serves `virtual:temper-icons.css` with
//    - every SVG in `dir` (file name = icon name; it replaces a default icon of the same name), and
//    - every Lucide icon your markup uses (needs `lucide-static` installed), and nothing else.
//    All Lucide names then pass the checker.
//
//   import temper from '@tiaforge-ui/temper/vite';
//   export default { plugins: [temper({ icons: { dir: 'src/icons' } })] };
//   // in your entry: import 'virtual:temper-icons.css';
//
// 3. Optional progressive enhancements (SPEC §1.5): `enhance: ['customizable-select']` or `enhance: 'all'`
//    appends their CSS to temper's core.css or all.css wherever your code imports it. Without the plugin,
//    import '@tiaforge-ui/temper/enhance/<id>.css' after core.css instead.
//
// 4. Optional pruning: `prune: true` drops, in builds only, temper rules for data-* attributes and values your
//    project never uses (unused tones, variants, icons, modules' attributes). It scans every source file under the
//    Vite root (not just `paths`), or `prune: { paths: [...] }`. Values computed in a way it cannot resolve keep
//    all values of that attribute, and data-* names in scripts (dataset.tone) keep the whole attribute.
//
// 5. Optional rendered-page audit in dev: `inspect: true` (needs @tiaforge-ui/temper-inspect installed) adds the
//    temper-inspect audit to the page the dev server serves. It runs in your browser tab after load, after every hot
//    update and when the page changes, and prints what it finds (overflow, contrast, clipped text) in the terminal
//    next to the static check's diagnostics, once per change. It audits the page as it is now: it does not open
//    dialogs or resize the window (temper-inspect does, in headless Chrome), but a dialog or popover you open in the
//    page is checked as its own state. In dev, elements get a data-tm-src="file:line" attribute (inspect: { source: false }
//    turns that off) so each finding names the source line. Never in builds.
//
// Options: paths (default: the Vite root), warningsFail (default false), icons, enhance, prune and inspect (see above).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { check, walk, definedIcons, importedModules } from './check.js';
import { resolveEnhancements, enhancementCss, ENTRY_FILES } from './enhance.js';
import { iconCss, folderIcons, lucideIconsDir, lucideIcon, lucideNames, LUCIDE_BANNER } from './icons.js';
import { projectUsage, pruneCss } from './prune.js';
import { stampSources } from './source.js';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));

const CHECKED = /\.(html?|svelte|astro|vue|jsx|tsx|css|scss|sass|less)$/;
const MARKUP = /\.(html?|svelte|astro|vue|jsx|tsx)$/;
const VIRTUAL = 'virtual:temper-icons.css';
const RESOLVED = '/__temper-icons.css';
const INSPECT_VIRTUAL = 'virtual:temper-inspect-client';
const INSPECT_RESOLVED = '\0' + INSPECT_VIRTUAL;

/** Static data-icon values used in the project's markup. */
function usedIcons(paths) {
  const names = new Set();
  for (const p of paths) for (const f of walk(p)) {
    if (!MARKUP.test(f)) continue;
    for (const m of readFileSync(f, 'utf8').matchAll(/data-icon\s*=\s*["']([a-z0-9-]+)["']/g)) names.add(m[1]);
  }
  return names;
}

/** The module that runs in the dev page: temper-inspect's audit, run after load, hot updates, page changes and
 * whenever a dialog or popover is opened (each open one is checked as its own state, like temper-inspect does). */
function inspectClient(installSource, delay) {
  return `const install = ${installSource};
let timer, reset = true; // reset: a new page or new source, so what was found in other states is stale
const run = () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      if (document.querySelector('vite-error-overlay')) return; // the page is showing a build error: nothing to audit
      install({ overlays: false, overlayWait: 0 });
      const t = window.__tsi, open = t.checkOpen();
      // a modal dialog covers the page, so checking the page now would only report that; what the page showed before stands
      const modal = document.querySelector('dialog:modal');
      const page = modal ? [] : t.check('page');
      const findings = [...page, ...open.flatMap(o => o.findings)];
      import.meta.hot?.send('temper:inspect', { page: location.pathname, states: [...(modal ? [] : ['page']), ...open.map(o => o.state)], findings, reset });
      reset = false;
    } catch (e) { console.warn('temper inspect:', e); }
  }, ${delay});
};
if (document.readyState === 'complete') run(); else addEventListener('load', run);
import.meta.hot?.on('vite:afterUpdate', () => { reset = true; run(); });
document.addEventListener('toggle', run, true); // a popover opened or closed
new MutationObserver(run).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] }); // a dialog opened or closed
`;
}

/** Terminal text for the findings of one page: warnings and errors, at most `limit` per kind, each once. */
export function inspectReport(page, findings, limit = 8) {
  const seen = new Set(), list = [];
  for (const f of findings) {
    const key = [f.code, f.selector, f.message].join('\0'); // the page check also sees what an open dialog shows
    if (f.severity === 'info' || seen.has(key)) continue;
    seen.add(key);
    list.push(f);
  }
  const errors = list.filter(f => f.severity === 'error').length;
  const lines = [];
  for (const group of Map.groupBy(list, f => f.code).values()) {
    for (const f of group.slice(0, limit))
      lines.push(`  ${f.src ? f.src + ' ' : ''}${f.severity} ${f.code}: ${f.selector} ${f.message}${f.state && f.state !== 'page' ? ` [${f.state}]` : ''}`);
    if (group.length > limit) lines.push(`  … ${group.length - limit} more ${group[0].code} findings`);
  }
  return { list, text: `temper inspect ${page}: ${errors} error(s), ${list.length - errors} warning(s)\n${lines.join('\n')}` };
}

export default function temper({ paths, warningsFail = false, icons, enhance, prune = false, inspect = false } = {}) {
  const enhancements = resolveEnhancements(enhance); // throws on unknown ids, before Vite starts
  let root = process.cwd(), isBuild = false, logger = console, server;
  const roots = () => paths ?? [root];
  const iconsDir = () => icons?.dir ? resolve(root, icons.dir) : null;
  const lucideDir = () => (icons && icons.lucide !== false ? lucideIconsDir(root) : null);
  let lastUsed = '', usage = null;
  let auditFile = null; // the audit module of @tiaforge-ui/temper-inspect, when the inspect option is on and it is installed
  const reported = new Map(); // page → what was last printed, so only changes are
  const states = new Map(); // page → (state → its findings): the page and every dialog or popover seen open

  const iconNames = () => new Set([...folderIcons(iconsDir()).map(i => i.name), ...lucideNames(lucideDir())]);
  // What a check needs beyond the file: icon names (the icons option plus the project's own CSS) and the modules the
  // project imports. The same context for the build and for every hot update, so dev and build report the same.
  const context = () => ({ icons: new Set([...(icons ? iconNames() : []), ...definedIcons(roots())]), modules: importedModules(roots()) });
  const line = d => `${relative(root, d.file)}:${d.line}:${d.col} ${d.severity} ${d.code} ${d.message}`;

  function iconsModule() {
    const own = folderIcons(iconsDir());
    const ownNames = new Set(own.map(i => i.name));
    const used = usedIcons(roots());
    lastUsed = [...used].sort().join(',');
    const dir = lucideDir();
    const fromLucide = [...used].filter(n => !ownNames.has(n)).map(n => lucideIcon(dir, n)).filter(Boolean);
    // Unlayered, so folder icons override the prebuilt icons.css defaults.
    return `/* temper icons: generated by the Vite plugin from ${own.length ? 'your icon folder and ' : ''}the icons your markup uses. */\n`
      + iconCss([...own, ...fromLucide], { layer: null, banner: fromLucide.length ? LUCIDE_BANNER : '' });
  }

  return {
    name: 'temper',
    configResolved(config) {
      root = config.root;
      isBuild = config.command === 'build';
      logger = config.logger ?? console;
      if (inspect && !isBuild) {
        try { auditFile = inspect.audit ?? createRequire(root + '/').resolve('@tiaforge-ui/temper-inspect/audit'); }
        catch { logger.warn('temper: the inspect option needs @tiaforge-ui/temper-inspect (npm install -D @tiaforge-ui/temper-inspect); skipped.'); }
      }
      if (icons && icons.lucide !== false && !lucideIconsDir(root))
        logger.warn('temper: icons.lucide needs the lucide-static package (npm install -D lucide-static); only your icon folder is used.');
    },
    configureServer(s) {
      server = s;
      if (!auditFile) return;
      s.ws.on('temper:inspect', ({ page, findings, states: checked = ['page'], reset }) => {
        // the states checked now replace their earlier findings; other states keep theirs (a dialog closed again)
        const entry = reset || !states.has(page) ? new Map() : states.get(page);
        states.set(page, entry);
        for (const st of checked) entry.set(st, []);
        for (const f of findings) (entry.get(f.state ?? 'page') ?? entry.set(f.state ?? 'page', []).get(f.state ?? 'page')).push(f);
        const { list, text } = inspectReport(page, [...entry.values()].flat());
        const before = reported.get(page);
        if (before === text) return;
        reported.set(page, text);
        if (list.length) logger.warn(text);
        else if (before) logger.info(`temper inspect ${page}: no problems`);
      });
    },
    transformIndexHtml: {
      order: 'pre', // before Vite rewrites the page, so line numbers are the file's
      handler(html, ctx) {
        if (!auditFile) return;
        const tags = [{ tag: 'script', attrs: { type: 'module', src: `/@id/__x00__${INSPECT_VIRTUAL}` }, injectTo: 'head' }];
        return ctx?.filename && inspect.source !== false ? { html: stampSources(html, ctx.filename, relative(root, ctx.filename)), tags } : tags;
      },
    },
    resolveId(id) {
      if (id === VIRTUAL) return RESOLVED;
      if (id === INSPECT_VIRTUAL || id === INSPECT_RESOLVED) return INSPECT_RESOLVED;
    },
    load(id) {
      if (id === RESOLVED) return iconsModule();
      if (id === INSPECT_RESOLVED && auditFile)
        return import(pathToFileURL(auditFile).href).then(({ install }) => inspectClient(install.toString(), inspect.delay ?? 600));
    },
    transform: {
      order: 'pre', // before Vite's CSS plugins turn the file into a JS module
      handler(code, id) {
        const file = id.split('?')[0];
        let out = code;
        // dev: say where in the source each element is (data-tm-src), so the audit's findings can name a file and line
        if (auditFile && inspect.source !== false && id === file && /\.(svelte|vue|astro|jsx|tsx)$/.test(file) && !file.includes('/node_modules/'))
          out = stampSources(out, file, relative(root, file));
        if (enhancements.length && ENTRY_FILES.includes(file)) out += '\n' + enhancements.map(enhancementCss).join('\n');
        if (prune && isBuild && file.startsWith(DIST) && file.endsWith('.css')) {
          usage ??= projectUsage(prune.paths?.map(p => resolve(root, p)) ?? [root]);
          const before = out.length;
          out = pruneCss(out, usage);
          logger.info?.(`temper: pruned ${relative(DIST, file)} from ${before} to ${out.length} bytes (minified, before compression)`);
        }
        return out === code ? undefined : { code: out, map: null };
      },
    },
    buildStart() {
      const results = check(roots(), context());
      if (!results.length) return;
      const errors = results.filter(d => d.severity === 'error').length;
      const failing = errors || (warningsFail && results.length);
      const summary = `temper check: ${errors} error(s), ${results.length - errors} warning(s)\n` + results.map(line).join('\n');
      if (isBuild && failing) this.error(summary);
      else logger.warn(summary);
    },
    handleHotUpdate({ file }) {
      if (file.includes('/node_modules/')) return;
      if (CHECKED.test(file)) {
        const results = check([file], context());
        if (results.length) logger.warn(results.map(line).join('\n'));
      }
      // new icons in the markup or the icon folder: regenerate the icon CSS
      if (icons && server && (MARKUP.test(file) || (iconsDir() && file.startsWith(iconsDir())))) {
        const used = [...usedIcons(roots())].sort().join(',');
        if (used !== lastUsed || file.endsWith('.svg')) {
          const mod = server.moduleGraph.getModuleById(RESOLVED);
          if (mod) { server.moduleGraph.invalidateModule(mod); return [mod]; }
        }
      }
    },
  };
}
