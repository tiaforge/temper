// Vite plugin.
// 1. Runs temper check as part of the build, so problems show up in `npm run build` (errors fail it;
//    the dev server only prints them, on start and for every changed file).
// 2. Optional icons: `icons: { dir: 'src/icons', lucide: true }` serves `virtual:temper-icons.css` with
//    - every SVG in `dir` (file name = icon name; it replaces a default icon of the same name), and
//    - every Lucide icon your markup uses (needs `lucide-static` installed), and nothing else: static names and
//      every name an expression can produce (data-tm-icon={dark ? 'sun' : 'moon'}), plus `include: ['rocket', …]`
//      for names the source does not show (data-tm-icon={item.icon}). Such places get a notice naming file and line.
//    `strokeWidth: 1.5` draws the Lucide icons thinner (0.5 to 3; Lucide's own is 2); folder icons stay as they are.
//    All Lucide names then pass the checker. A build also reads its own pages: a data-tm-icon value there that no icon
//    rule in the built CSS draws (a name bound from data, such as sinter's data-sn-attr over a JSON file, whose SVG
//    is missing) is reported with page and line, as a warning (warningsFail makes it fail the build).
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
//    Vite root, or under `prune: { paths: [...] }` instead, and always every entry of `paths` too (a component
//    library's folder in node_modules, say), since markup the plugin checks can use temper's attributes. Values
//    computed in a way it cannot resolve keep all values of that attribute, and data-* names in scripts
//    (dataset.tmTone) keep the whole attribute.
//
//    Icons, enhancements and pruning also work when a CSS file does the importing (@import 'virtual:temper-icons.css',
//    @import '@tiaforge-ui/temper/core.css'). Vite resolves and reads a CSS @import itself, past every plugin, so the
//    plugin writes what that @import should get into Vite's cache folder (temper/) and points the @import there. The
//    icon CSS is written when the config resolves, and resolve.alias points virtual:temper-icons.css at it, so tools
//    that compile project CSS with Vite's preprocessCSS (sinter reads image sizes that way) find it too.
//    Sass, Less and Stylus resolve their own imports, which the plugin cannot reach: import temper from JS there.
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
//
// Component libraries: node_modules is never scanned on its own, so markup that ships in a package (a sinter
// component library's .html files, for example) is neither checked nor scanned for icons. Name its folder in paths,
// next to your own sources (paths replaces the default root); pruning scans it too:
//   const lib = 'node_modules/@tiavision/sinter-alloy/sinter/components';
//   temper({ paths: ['src', lib], icons: { lucide: true }, prune: true })
// Its icons are then emitted and its attributes kept; its markup is checked like yours.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { check, walk, definedIcons, importedModules } from './check.js';
import { resolveEnhancements, enhancementCss, ENTRY_FILES } from './enhance.js';
import { iconCss, folderIcons, lucideIconsDir, lucideIcon, lucideNames, usedIcons, unresolvedIconsNotice, LUCIDE_BANNER } from './icons.js';
import { closest } from './check.js';
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
// a CSS @import: its specifier (quoted, or in url()), and where the specifier starts and ends
const CSS_IMPORT = /@import\s+(?:url\(\s*)?(["'])([^"']+)\1/g;
const PREPROCESSED = /\.(scss|sass|less|styl|stylus)$/;

const text = source => typeof source === 'string' ? source : Buffer.from(source).toString('utf8');

/**
 * The data-tm-icon values of a build's pages that no icon rule in its CSS (or the pages' own <style>) draws:
 * [{ file, line, name, count }], one per page and name. Nothing when the build has no icon rules at all (its CSS is
 * not among the emitted files, as in a library build), since then nothing can be told.
 */
export function missingIcons(bundle) {
  const assets = Object.values(bundle ?? {}).filter(a => a.type === 'asset' && /\.(html?|css)$/.test(a.fileName));
  const drawn = new Set();
  for (const a of assets) for (const m of text(a.source).matchAll(/\[data-tm-icon=(["']?)([^"'\]\s]+)\1\]/g)) drawn.add(m[2]);
  if (!drawn.size) return [];
  const found = new Map();
  for (const a of assets) {
    if (!/\.html?$/.test(a.fileName)) continue;
    const html = text(a.source);
    for (const m of html.matchAll(/<[a-zA-Z][^>]*?\sdata-tm-icon\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
      const name = (m[1] ?? m[2] ?? m[3]).trim();
      if (!name || name === 'true' || drawn.has(name)) continue;
      const key = a.fileName + '\0' + name;
      if (found.has(key)) { found.get(key).count++; continue; }
      found.set(key, { file: a.fileName, line: html.slice(0, m.index).split('\n').length, name, count: 1 });
    }
  }
  return [...found.values()];
}

/**
 * The audit module of @tiaforge-ui/temper-inspect, or null (with a warning saying why) when the package is not installed
 * or too old: it must have the ./audit export and checkOpen(), which came in the same release as the inspect option.
 */
function findAudit(root, explicit, logger) {
  const require = createRequire(root + '/');
  let file = explicit, version;
  try { version = JSON.parse(readFileSync(require.resolve('@tiaforge-ui/temper-inspect/package.json'), 'utf8')).version; } catch {}
  if (!file) {
    try { file = require.resolve('@tiaforge-ui/temper-inspect/audit'); }
    catch {
      logger.warn(version
        ? `temper: the inspect option needs a newer @tiaforge-ui/temper-inspect than the installed ${version} (it has no ./audit export). Update it to the version that matches @tiaforge-ui/temper; skipped.`
        : 'temper: the inspect option needs @tiaforge-ui/temper-inspect (npm install -D @tiaforge-ui/temper-inspect); skipped.');
      return null;
    }
  }
  if (!readFileSync(file, 'utf8').includes('checkOpen')) {
    logger.warn(`temper: the inspect option needs a newer @tiaforge-ui/temper-inspect than ${version ? `the installed ${version}` : file} (its audit cannot check open dialogs). Update it to the version that matches @tiaforge-ui/temper; skipped.`);
    return null;
  }
  return file;
}

/** The module that runs in the dev page: temper-inspect's audit, run after load, hot updates, page changes and
 * whenever a dialog or popover is opened (each open one is checked as its own state, like temper-inspect does). */
function inspectClient(installSource, delay) {
  return `const install = ${installSource};
let timer, reset = true; // reset: a new page or new source, so what was found in other states is stale
const run = () => {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    try {
      if (document.querySelector('vite-error-overlay')) return; // the page is showing a build error: nothing to audit
      install({ overlays: false, overlayWait: 0 });
      const t = window.__tsi;
      await t.prepare?.(); // what the checks wait for (stylesheet sources); an older temper-inspect has none
      const open = t.checkOpen();
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

/**
 * Gives a stylesheet finding of the dev page its source line (`src`, as element findings have). The page cannot know
 * it: the dev server serves CSS transformed (imports inlined above it, a preprocessor's output), so temper-inspect
 * sends the declaration (`decl`: file, prop, value) and it is searched in the file here. Found once: that line; more
 * than once or not at all (a preprocessor wrote it differently): the file alone.
 */
export function locateDecl(root, page, f) {
  if (!f.decl || f.src) return f;
  const { file, prop, value } = f.decl;
  const dir = page.endsWith('/') ? page : dirname(page);
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|[\\s;{])${esc(prop)}\\s*:\\s*${value.trim().split(/\s+/).map(esc).join('\\s+')}`);
  for (const path of isAbsolute(file) && file.startsWith(root + sep) ? [file] : [join(root, dir, file), join(root, file)]) {
    let lines;
    try { lines = readFileSync(path, 'utf8').split('\n'); } catch { continue; }
    const at = lines.flatMap((l, i) => re.test(l) ? [i + 1] : []);
    const src = relative(root, path).split(sep).join('/');
    const message = f.message.endsWith(` (${file})`) ? f.message.slice(0, -file.length - 3) : f.message;
    return { ...f, message, src: at.length === 1 ? `${src}:${at[0]}` : src };
  }
  return f;
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
      lines.push(`  ${f.src ? f.src + ' ' : ''}${f.severity} ${f.code}: ${f.selector ? f.selector + ' ' : ''}${f.message}${f.state && f.state !== 'page' ? ` [${f.state}]` : ''}`);
    if (group.length > limit) lines.push(`  … ${group.length - limit} more ${group[0].code} findings`);
  }
  return { list, text: `temper inspect ${page}: ${errors} error(s), ${list.length - errors} warning(s)\n${lines.join('\n')}` };
}

export default function temper({ paths, warningsFail = false, icons, enhance, prune = false, inspect = false } = {}) {
  const enhancements = resolveEnhancements(enhance); // throws on unknown ids, before Vite starts
  if (icons?.include !== undefined && (!Array.isArray(icons.include) || icons.include.some(n => typeof n !== 'string')))
    throw new Error('temper: icons.include must be an array of icon names, e.g. { include: [\'rocket\', \'star\'] }');
  const include = [...new Set(icons?.include ?? [])];
  const strokeWidth = icons?.strokeWidth;
  if (strokeWidth !== undefined && !(typeof strokeWidth === 'number' && strokeWidth >= 0.5 && strokeWidth <= 3))
    throw new Error(`temper: icons.strokeWidth must be a number from 0.5 to 3 (Lucide's own is 2), e.g. { strokeWidth: 1.5 }; got ${JSON.stringify(strokeWidth)}`);
  let root = process.cwd(), isBuild = false, logger = console, server;
  const roots = () => paths ?? [root];
  const iconsDir = () => icons?.dir ? resolve(root, icons.dir) : null;
  const lucideDir = () => (icons && icons.lucide !== false ? lucideIconsDir(root) : null);
  let lastUsed = '', usage = null;
  let genDir = resolve(root, 'node_modules/.vite/temper'); // where the files for CSS @imports go (in Vite's cacheDir)
  let aliased = false; // the config hook pointed virtual:temper-icons.css at genDir/icons.css, so genDir stays put
  const cssImporters = new Set(); // CSS files that @import virtual:temper-icons.css, to refresh on icon changes
  const warnedPreprocessed = new Set();
  const noticed = new Set(); // unresolved data-tm-icon places already reported
  let auditFile = null; // the audit module of @tiaforge-ui/temper-inspect, when the inspect option is on and it is installed
  const reported = new Map(); // page → what was last printed, so only changes are
  const states = new Map(); // page → (state → its findings): the page and every dialog or popover seen open

  const iconNames = () => new Set([...folderIcons(iconsDir()).map(i => i.name), ...lucideNames(lucideDir())]);
  // What a check needs beyond the file: icon names (the icons option plus the project's own CSS) and the modules the
  // project imports. The same context for the build and for every hot update, so dev and build report the same.
  const context = () => ({ icons: new Set([...(icons ? iconNames() : []), ...definedIcons(roots())]), modules: importedModules(roots()) });
  const line = d => `${relative(root, d.file)}:${d.line}:${d.col} ${d.severity} ${d.code} ${d.message}`;

  // the icons to emit: every name the markup can produce (literals, also in expressions) and icons.include
  const wanted = (found = usedIcons(roots())) => new Set([...found.names, ...include]);
  // data-tm-icon values whose names the source does not show: with Lucide on demand they would render blank, silently
  function noticeUnresolved(found) {
    if (!icons || !lucideDir()) return;
    const fresh = found.unresolved.filter(u => {
      const key = `${u.file}:${u.line}:${u.col}`;
      return !noticed.has(key) && noticed.add(key);
    });
    const text = unresolvedIconsNotice(fresh, { place: u => `${relative(root, u.file)}:${u.line}:${u.col}`, include });
    if (text) logger.warn(text);
  }

  function iconsModule() {
    const own = folderIcons(iconsDir());
    const ownNames = new Set(own.map(i => i.name));
    const used = wanted();
    lastUsed = [...used].sort().join(',');
    const dir = lucideDir();
    const fromLucide = [...used].filter(n => !ownNames.has(n)).map(n => lucideIcon(dir, n, { strokeWidth })).filter(Boolean);
    // Unlayered, so folder icons override the prebuilt icons.css defaults.
    return `/* temper icons: generated by the Vite plugin from ${own.length ? 'your icon folder and ' : ''}the icons your markup uses. */\n`
      + iconCss([...own, ...fromLucide], { layer: null, banner: fromLucide.length ? LUCIDE_BANNER : '' });
  }

  // A temper dist file as the project gets it: with the enhancements (core.css, all.css) and, in builds, pruned.
  function distCss(css, file) {
    let out = css;
    if (enhancements.length && ENTRY_FILES.includes(file)) out += '\n' + enhancements.map(enhancementCss).join('\n');
    if (prune && isBuild && file.endsWith('.css')) {
      // its own scan set plus the plugin's paths: markup the plugin checks can use temper's attributes too
      usage ??= projectUsage([...new Set([...(prune.paths?.map(p => resolve(root, p)) ?? [root]), ...(paths ?? []).map(p => resolve(p))])]);
      const before = out.length;
      out = pruneCss(out, usage);
      logger.info?.(`temper: pruned ${relative(DIST, file)} from ${before} to ${out.length} bytes (minified, before compression)`);
    }
    return out;
  }

  // Writes a file into the plugin's cache folder (only when its content changed) and returns its path.
  function generated(name, css) {
    const file = join(genDir, name);
    let before;
    try { before = readFileSync(file, 'utf8'); } catch {}
    if (before !== css) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, css); }
    return file;
  }

  // the file an @import specifier names: through Vite's resolver when there is one, else Node's
  async function resolveImport(ctx, spec, id, file) {
    try { const r = await ctx?.resolve?.(spec, id, { skipSelf: true }); if (r?.id) return r.id.split('?')[0]; } catch {}
    if (/^\.\.?\//.test(spec)) return resolve(dirname(file), spec);
    try { return createRequire(file).resolve(spec); } catch { return null; }
  }

  // Vite reads a CSS @import itself, past every plugin: the virtual icons module would not be found, and temper's own
  // files would arrive without enhancements and unpruned. Point such @imports at files written for them instead.
  async function rewriteImports(code, id, file) {
    const found = [...code.matchAll(CSS_IMPORT)];
    if (!found.length) return null;
    let out = '', at = 0;
    for (const m of found) {
      const spec = m[2];
      let target = null;
      if (spec === VIRTUAL) {
        if (!icons) continue; // without the icons option there is no such module: Vite's error says so
        target = writeIcons();
        cssImporters.add(file);
      } else if (spec.includes('temper') || /^\.\.?\//.test(spec)) {
        const dist = await resolveImport(this, spec, id, file);
        if (!dist?.startsWith(DIST) || !dist.endsWith('.css')) continue;
        const css = readFileSync(dist, 'utf8'), processed = distCss(css, dist);
        if (processed === css) continue; // nothing to add or drop: the @import can read temper's file
        target = generated(relative(DIST, dist), processed);
      } else continue;
      let rel = relative(dirname(file), target).split(sep).join('/');
      if (!rel.startsWith('.')) rel = './' + rel;
      const start = m.index + m[0].length - 1 - spec.length; // the specifier, between its quotes
      out += code.slice(at, start) + rel;
      at = start + spec.length;
    }
    return at ? { code: out + code.slice(at), map: null } : null;
  }

  // Sass, Less and Stylus inline their own imports: the plugin cannot rewrite them, so say what to do instead
  function warnPreprocessed(code, file) {
    if (warnedPreprocessed.has(file)) return;
    const specs = [...code.matchAll(CSS_IMPORT)].map(m => m[2]);
    const what = specs.includes(VIRTUAL) && icons ? 'virtual:temper-icons.css'
      : (prune || enhancements.length) && specs.some(s => /@tiaforge-ui\/temper\b/.test(s)) ? 'temper\'s CSS with prune or enhance on' : null;
    if (!what) return;
    warnedPreprocessed.add(file);
    logger.warn(`temper: ${relative(root, file)} imports ${what}, which the plugin cannot reach inside ${file.split('.').pop()}. Import it from a JS entry (import '@tiaforge-ui/temper/core.css') or from a plain .css file.`);
  }

  // the icon CSS as a real file, for every reader: Vite's CSS @import, JS imports, and tools that compile project CSS
  // with Vite's preprocessCSS (sinter, for image sizes), which resolves through resolve.alias and never asks a plugin
  const writeIcons = () => generated('icons.css', iconsModule());

  return {
    name: 'temper',
    config(user) {
      if (!icons) return;
      const base = resolve(user.root ?? process.cwd());
      genDir = join(user.cacheDir ? resolve(base, user.cacheDir) : join(base, 'node_modules/.vite'), 'temper');
      aliased = true;
      return { resolve: { alias: [{ find: /^virtual:temper-icons\.css$/, replacement: join(genDir, 'icons.css') }] } };
    },
    configResolved(config) {
      root = config.root;
      isBuild = config.command === 'build';
      logger = config.logger ?? console;
      if (!aliased) genDir = join(config.cacheDir ?? resolve(root, 'node_modules/.vite'), 'temper');
      if (inspect && !isBuild) {
        auditFile = findAudit(root, inspect.audit, logger);
      }
      if (icons && icons.lucide !== false && !lucideIconsDir(root))
        logger.warn('temper: icons.lucide needs the lucide-static package (npm install -D lucide-static); only your icon folder is used.');
      if (include.length) {
        const known = iconNames(), unknown = include.filter(n => !known.has(n));
        for (const n of unknown) {
          const g = closest(n, known, 3);
          logger.warn(`temper: icons.include has "${n}", which is neither ${lucideDir() ? 'a Lucide icon nor ' : ''}an SVG in your icon folder, so it is not emitted.${g ? ` Did you mean "${g}"?` : ''}`);
        }
      }
      if (aliased) writeIcons(); // before anything reads it
    },
    configureServer(s) {
      server = s;
      if (!auditFile) return;
      s.ws.on('temper:inspect', ({ page, findings, states: checked = ['page'], reset }) => {
        // the states checked now replace their earlier findings; other states keep theirs (a dialog closed again)
        const entry = reset || !states.has(page) ? new Map() : states.get(page);
        states.set(page, entry);
        for (const st of checked) entry.set(st, []);
        for (const f of findings.map(f => locateDecl(root, page, f))) (entry.get(f.state ?? 'page') ?? entry.set(f.state ?? 'page', []).get(f.state ?? 'page')).push(f);
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
        if (file.startsWith(DIST)) out = distCss(out, file);
        else if (!file.includes('/node_modules/') && out.includes('@import')) {
          if (/\.css$/.test(file) || /\.css$/.test(id)) return rewriteImports.call(this, out, id, file).then(r => r ?? (out === code ? undefined : { code: out, map: null }));
          if (PREPROCESSED.test(file)) warnPreprocessed(out, file);
        }
        return out === code ? undefined : { code: out, map: null };
      },
    },
    // The built pages know every data-tm-icon value, also those bound from data (sinter's data-sn-attr over a JSON
    // file) that no source check can see: each one needs an icon rule in the built CSS, or it renders blank.
    // post: after the plugins that write or change the pages (Vite's own, sinter's), before anything is written
    generateBundle: { order: 'post', handler(options, bundle) {
      const missing = missingIcons(bundle);
      if (!missing.length) return;
      const out = options?.dir ? relative(root, options.dir) : '';
      const text = `temper: ${missing.length === 1 ? 'this data-tm-icon has' : `these ${missing.length} data-tm-icon values have`} no icon in the built CSS, so ${missing.length === 1 ? 'it renders' : 'they render'} blank:\n`
        + missing.map(m => `  ${join(out, m.file).split(sep).join('/')}:${m.line} data-tm-icon="${m.name}"${m.count > 1 ? ` (and ${m.count - 1} more on this page)` : ''}`).join('\n')
        + `\n  Add the SVG to your icon folder${icons && lucideDir() ? ', list the Lucide name in icons.include' : ''}, or fix the name where the value comes from.`;
      if (warningsFail) this.error(text);
      else logger.warn(text);
    } },
    buildStart() {
      if (icons) noticeUnresolved(usedIcons(roots()));
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
        const found = usedIcons(roots());
        noticeUnresolved(found);
        const used = [...wanted(found)].sort().join(',');
        if (used !== lastUsed || file.endsWith('.svg')) {
          // the icon CSS (the virtual module, or the written file the alias points to: it sits in node_modules,
          // unwatched) and every CSS file that @imports it
          const written = writeIcons();
          const byFile = f => [...(server.moduleGraph.getModulesByFile(f) ?? [])];
          const mods = [server.moduleGraph.getModuleById(RESOLVED), ...byFile(written), ...[...cssImporters].flatMap(byFile)].filter(Boolean);
          for (const mod of mods) server.moduleGraph.invalidateModule(mod);
          if (mods.length) return mods;
        }
      }
    },
  };
}
