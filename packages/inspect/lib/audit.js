// Runs inside the page (serialized with Function.prototype.toString). Installs window.__tsi, which Node
// drives state by state: prepare(), list() overlays, open(i), check(state) -> findings, close(i).
// Findings: { state, severity: 'error'|'warning'|'info', code, selector, message, src? }
// selector is empty for a finding that is about no element (a stylesheet rule, the document as a whole).
// check() is synchronous. What needs waiting (fetching a stylesheet's source, letting transitions end) registers in
// `prepares` and runs in prepare(), once, before the first check; a caller that never calls prepare() (an older
// Vite client) gets every check that does not depend on it.
// src ("file:line") is there when the page was served with data-tm-src attributes (temper's Vite plugin adds them in dev).
export function install(opts) {
  let findings = [];
  const vw = innerWidth, vh = innerHeight;
  const cs = el => getComputedStyle(el);
  const R = el => el.getBoundingClientRect();
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const frames = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const prepares = []; // async () => void, run by prepare()

  // ── colors ──
  const ctx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
  const rgba = color => {
    ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = 'rgba(0,0,0,0)'; ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data; return { r, g, b, a: a / 255 };
  };
  const lum = ({ r, g, b }) => [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
    .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const blend = (t, u) => ({ r: t.r * t.a + u.r * (1 - t.a), g: t.g * t.a + u.g * (1 - t.a), b: t.b * t.a + u.b * (1 - t.a), a: 1 });
  const hex = c => '#' + [c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  function bgOf(el) {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const s = cs(e);
      if (s.backgroundImage !== 'none' && !s.backgroundImage.startsWith('linear-gradient')) return null; // image: unknown
      const c = rgba(s.backgroundColor);
      if (c.a > 0) { layers.push(c); if (c.a >= 0.999) break; }
    }
    let out = layers.length && layers.at(-1).a >= 0.999 ? layers.pop() : rgba(cs(document.documentElement).backgroundColor);
    if (out.a < 0.999) out = { r: 255, g: 255, b: 255, a: 1 };
    for (const c of layers.reverse()) out = blend(c, out);
    return out;
  }

  // ── describing elements ──
  function sel(el) {
    if (!el || el === document.body) return 'body';
    if (el.id) return `${el.localName}#${el.id}`;
    let s = el.localName;
    const tid = el.getAttribute('data-testid');
    if (tid) return `${s}[data-testid="${tid}"]`;
    s += [...el.attributes].filter(a => a.name.startsWith('data-') && !/^data-(sn|v-|astro|tm-src)/.test(a.name)).slice(0, 2)
      .map(a => a.value ? `[${a.name}="${a.value}"]` : `[${a.name}]`).join('');
    if (el.classList.length) s += '.' + [...el.classList].slice(0, 2).join('.');
    for (const a of ['aria-label', 'name', 'type', 'href']) {
      const v = el.getAttribute(a);
      if (v && !s.includes('[')) { s += `[${a}="${v.slice(0, 40)}"]`; break; }
    }
    const anc = el.parentElement?.closest('[id]');
    if (anc && anc !== document.body) s = `#${anc.id} ${s}`;
    const text = (el.innerText ?? '').trim().replace(/\s+/g, ' ');
    return text ? `${s} "${text.slice(0, 40)}${text.length > 40 ? '…' : ''}"` : s;
  }

  const srcOf = el => el?.closest?.('[data-tm-src]')?.getAttribute('data-tm-src') ?? undefined;

  // ── document checks: once per page, in the 'page' state (doctype, viewport, ids, references, images, fonts) ──
  // add(severity, code, element | selector text | null, message)
  // Settling: a check during a transition describes a moment of it (half-faded text fails contrast, a sliding panel
  // sticks out). Finite animations get up to 2s to end; the ones still running after that are reported below.
  prepares.push(async () => {
    const finite = document.getAnimations().filter(a => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime));
    if (finite.length) await Promise.race([Promise.all(finite.map(a => a.finished.catch(() => {}))), sleep(2000)]);
  });
  const LOAD_SHIFT_WINDOW = 3000; // ms after the load event that still count as loading (the dev client checks long after)
  function checkDocument(add) {
    const root = document.documentElement;
    // the document as a whole
    if (document.compatMode === 'BackCompat')
      add('error', 'doctype', null, 'the page renders in quirks mode (no <!doctype html> as its first line), so sizes, line heights and tables lay out unlike in any other page; add <!doctype html>');
    const vp = [...document.querySelectorAll('meta[name="viewport" i]')].at(-1);
    const vpv = Object.fromEntries((vp?.content ?? '').toLowerCase().split(/[,;]/).map(p => p.split('=').map(s => s.trim())).filter(([k]) => k));
    // initial-scale alone also sets the layout width to the device width
    if (vpv.width !== 'device-width' && !vpv['initial-scale'])
      add('error', 'viewport', vp ?? null, `${vp ? 'the viewport meta tag has no width=device-width' : 'no <meta name="viewport" content="width=device-width, initial-scale=1">'}: a phone lays the page out about 980px wide and scales it down, so text is tiny and the narrow layout never shows. temper-inspect's narrow pass does not emulate that, so its 390px results do not describe a phone for this page`);
    if (vp && (/^(no|0)$/.test(vpv['user-scalable'] ?? '') || parseFloat(vpv['maximum-scale']) < 2))
      add('warning', 'zoom', vp, `the viewport meta tag stops zooming (${['user-scalable', 'maximum-scale'].filter(k => k in vpv).map(k => `${k}=${vpv[k]}`).join(', ')}), so people who need larger text cannot pinch to zoom; remove it`);
    if (!root.getAttribute('lang')?.trim()) add('warning', 'lang', 'html', 'the <html> element has no lang attribute, so screen readers guess the language (and its pronunciation) and hyphenation does not work; add e.g. lang="en"');
    if (!document.title.trim()) add('warning', 'title', null, 'the page has no <title> (or an empty one): tabs, bookmarks, history and screen readers show the URL instead');

    // images whose source did not load (not yet loaded ones, lazy ones below the fold, are not complete)
    for (const img of document.images) {
      if (!img.complete || img.naturalWidth > 0 || !(img.currentSrc || img.getAttribute('src'))) continue;
      const src = img.currentSrc || img.src, shown = src.startsWith(location.origin + '/') ? src.slice(location.origin.length) : src;
      add('error', 'image', img, `its image did not load (${src.startsWith('data:') ? 'a data: URL that does not decode' : shown.length > 100 ? shown.slice(0, 100) + '…' : shown}), so it shows as a broken image`);
      findings.at(-1).resource = src; // the CLI reports the failed request too; this lets it drop that duplicate
    }

    // web fonts that failed (unused ones stay 'unloaded'; the browser falls back silently)
    for (const f of document.fonts ?? []) if (f.status === 'error')
      add('warning', 'font', `@font-face "${f.family.replace(/^["']|["']$/g, '')}"${f.weight !== 'normal' ? ` ${f.weight}` : ''}${f.style !== 'normal' ? ` ${f.style}` : ''}`,
        'this web font failed to load (missing file, wrong URL or format), so text set in it falls back to another font');

    // ids and the attributes that refer to them. Light DOM only: ids inside a shadow root are its own.
    const byId = new Map();
    for (const el of document.querySelectorAll('[id]')) if (el.id) byId.has(el.id) ? byId.get(el.id).push(el) : byId.set(el.id, [el]);
    const named = new Set([...document.querySelectorAll('a[name]')].map(a => a.name)); // old-style anchors are link targets too
    const referenced = new Map(); // id -> how it is referred to, for the duplicate check
    const ids = v => v.trim().split(/\s+/).filter(Boolean);
    // [selector, attribute, severity when it points at nothing]: error where the reference does nothing at all, warning where
    // frameworks often render the target only while it is shown (aria-controls of a closed menu)
    const REFS = [['label[for]', 'for', 'error'], ['[commandfor]', 'commandfor', 'error'], ['[popovertarget]', 'popovertarget', 'error'],
      ['[aria-labelledby]', 'aria-labelledby', 'error'], ['input[list]', 'list', 'error'],
      [':is(button, fieldset, input, object, output, select, textarea)[form]', 'form', 'error'],
      ['[aria-describedby]', 'aria-describedby', 'warning'], ['[aria-controls]', 'aria-controls', 'warning'], ['[aria-owns]', 'aria-owns', 'warning'],
      ['[aria-activedescendant]', 'aria-activedescendant', 'warning'], ['[aria-details]', 'aria-details', 'warning'],
      ['[aria-errormessage]', 'aria-errormessage', 'warning'], [':is(td, th)[headers]', 'headers', 'warning']];
    const NAMES_FROM_CONTENT = 'a[href], button, summary, legend, caption, td, th, h1, h2, h3, h4, h5, h6, [role=button], [role=link], [role=tab], [role=menuitem], [role=option], [role=cell], [role=heading], [role=switch], [role=checkbox], [role=radio], [role=tooltip], [role=treeitem]';
    const COMMANDS = { 'show-modal': 'dialog', close: 'dialog', 'request-close': 'dialog', 'toggle-popover': 'popover', 'show-popover': 'popover', 'hide-popover': 'popover' };
    for (const [selector, attr, severity] of REFS) for (const el of document.querySelectorAll(selector)) {
      const want = ids(el.getAttribute(attr));
      for (const id of want) if (!referenced.has(id)) referenced.set(id, `${el.localName}[${attr}]`);
      const missing = want.filter(id => !byId.has(id));
      const target = want.length === 1 && !missing.length ? byId.get(want[0])[0] : null;
      if (missing.length) {
        let sev = severity;
        // aria-labelledby: the name is lost only when no id resolves and nothing else names the element
        if (attr === 'aria-labelledby' && (missing.length < want.length || el.getAttribute('aria-label')?.trim() || el.title || el.labels?.length
          || (el.matches(NAMES_FROM_CONTENT) && el.textContent.trim()))) sev = 'warning';
        const what = missing.map(id => `"${id}"`).join(', ');
        add(sev, 'ref', el, `${attr}="${el.getAttribute(attr).trim().slice(0, 60)}" points at no element (no id ${what})${
          { for: ', so the label is not attached to any field', commandfor: ', so the button does nothing', popovertarget: ', so the button opens nothing',
            'aria-labelledby': sev === 'error' ? ', so it has no accessible name' : '', list: ', so the field has no suggestions', form: ', so the control belongs to no form' }[attr] ?? ''}`);
      } else if (target) {
        // the element exists but cannot be what the attribute needs
        const command = attr === 'commandfor' ? COMMANDS[el.getAttribute('command')] : null;
        const wrong = attr === 'for' && el.localName === 'label' && !el.control ? 'which is not a field a label can name'
          : attr === 'popovertarget' && !target.hasAttribute('popover') ? 'which has no popover attribute, so the button opens nothing'
          : command === 'dialog' && target.localName !== 'dialog' ? `which is not a <dialog>, so command="${el.getAttribute('command')}" does nothing`
          : command === 'popover' && !target.hasAttribute('popover') ? `which has no popover attribute, so command="${el.getAttribute('command')}" does nothing`
          : attr === 'list' && target.localName !== 'datalist' ? 'which is not a <datalist>, so the field has no suggestions'
          : attr === 'form' && target.localName !== 'form' ? 'which is not a <form>, so the control belongs to no form' : '';
        if (wrong) add('error', 'ref', el, `${attr}="${want[0]}" points at ${sel(target).split(' "')[0]}, ${wrong}`);
      }
    }
    // same-page links; not "#", "#top" (the browser scrolls up), hash-router paths (#/route, #!/route) or text fragments
    for (const a of document.querySelectorAll('a[href^="#"]')) {
      let id = a.getAttribute('href').slice(1);
      try { id = decodeURIComponent(id); } catch {}
      if (!id || id.toLowerCase() === 'top' || /[/!=&?]|^:~:/.test(id)) continue;
      if (!referenced.has(id)) referenced.set(id, 'a[href]');
      if (!byId.has(id) && !named.has(id)) add('warning', 'ref', a, `links to #${id}, but no element has that id, so the link goes nowhere`);
    }
    for (const [id, els] of byId) {
      if (els.length < 2) continue;
      const by = referenced.get(id);
      add(by ? 'error' : 'warning', 'id', els[0], `id "${id}" is on ${els.length} elements (${els.slice(0, 4).map(e => e.localName).join(', ')}${els.length > 4 ? ', …' : ''})${
        by ? `, and ${by} refers to it: it only reaches the first one` : '; ids must be unique, references to it reach only the first one'}`);
    }

    // buttons in forms: a <button> without type is a submit button, and a submit button ignores popovertarget
    for (const b of document.querySelectorAll('button[popovertarget]')) if (b.type === 'submit' && b.form)
      add('error', 'submit', b, `${b.hasAttribute('type') ? 'has type="submit"' : 'has no type'}, so inside ${sel(b.form).split(' "')[0]} it submits the form instead of opening #${b.getAttribute('popovertarget')}; add type="button"`);
    // Chrome: "Buttons associated with forms that include command or commandfor attributes are ambiguous, and require a
    // type=button attribute. No action will be taken." Such a button neither submits nor runs its command.
    for (const b of document.querySelectorAll('button[commandfor]:not([type])')) if (b.form)
      add('error', 'submit', b, `has commandfor but no type, so inside ${sel(b.form).split(' "')[0]} the browser treats it as ambiguous and a click does nothing; add type="button"`);
    for (const form of document.forms) {
      if (form.method === 'dialog') continue; // each button closes the dialog: fine
      const typeless = [...form.elements].filter(b => b.localName === 'button' && b.type === 'submit' && !b.hasAttribute('type') && !b.hasAttribute('popovertarget'));
      if (typeless.length >= 2) add('info', 'submit', form, `has ${typeless.length} buttons without a type, and each one submits it (${typeless.slice(0, 4).map(b => `"${(b.innerText.trim() || b.getAttribute('aria-label') || '…').slice(0, 30)}"`).join(', ')}${typeless.length > 4 ? ', …' : ''}); give the ones that should not submit type="button"`);
    }

    // layout shift while loading: summed over the shifts not caused by input. The dev client checks long after load, so
    // only shifts up to a few seconds after the load event count.
    if (PerformanceObserver.supportedEntryTypes?.includes('layout-shift')) try {
      const o = new PerformanceObserver(() => {});
      o.observe({ type: 'layout-shift', buffered: true });
      const loaded = performance.getEntriesByType('navigation')[0]?.loadEventEnd || performance.now();
      const shifts = o.takeRecords().filter(e => !e.hadRecentInput && e.startTime <= loaded + LOAD_SHIFT_WINDOW);
      o.disconnect();
      const score = shifts.reduce((s, e) => s + e.value, 0);
      if (score >= 0.01) {
        const moved = new Map(); // element -> px moved in total
        for (const e of shifts) for (const s of e.sources ?? []) {
          const el = s.node?.nodeType === 1 ? s.node : s.node?.parentElement;
          if (!el?.isConnected) continue;
          const px = Math.max(Math.abs(s.currentRect.top - s.previousRect.top), Math.abs(s.currentRect.left - s.previousRect.left));
          moved.set(el, (moved.get(el) ?? 0) + px);
        }
        const top = [...moved].sort((a, b) => b[1] - a[1]).slice(0, 3);
        add(score > 0.1 ? 'warning' : 'info', 'shift', top[0]?.[0] ?? null, `the layout shifted while the page loaded (cumulative layout shift ${score.toFixed(2)}${score > 0.1 ? ', above 0.1' : ''})${
          top.length ? `: ${top.map(([el, px]) => `${sel(el).split(' "')[0]} moved ${Math.round(px)}px`).join(', ')}` : ''}; reserve the space of what arrives late (image sizes, min-height, font metrics)`);
      }
    } catch {} // no layout-shift entries outside Chromium

    // still moving when checked (infinite animations; finite ones had their time in prepare()). Busy indicators spin by
    // design (temper's pulse under reduced motion): not a state to wait for.
    const moving = new Map();
    for (const a of document.getAnimations()) {
      const el = a.effect?.target;
      if (a.playState !== 'running' || !(a.timeline instanceof DocumentTimeline) || !el?.isConnected || !el.checkVisibility()) continue;
      if (el.closest('[aria-busy="true"], progress, [role=progressbar]')) continue;
      const name = a.animationName ?? (a.transitionProperty ? `transition of ${a.transitionProperty}` : a.id || 'animation');
      moving.has(el) ? moving.get(el).push(name) : moving.set(el, [name]);
    }
    for (const [el, names] of moving)
      add('info', 'settle', el, `is still animating when checked (${[...new Set(names)].join(', ')}), so findings and screenshots show one moment of it`);
  }

  // ── visibility ──
  let scope = document.body; // a modal dialog limits checks to itself
  function visible(el) {
    if (!scope.contains(el)) return false;
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    const r = R(el);
    return r.width > 0 && r.height > 0;
  }
  const all = () => [...scope.querySelectorAll('*')].filter(e => !['SCRIPT', 'STYLE', 'TEMPLATE', 'svg', 'path'].includes(e.tagName) && !e.closest('svg') && visible(e));

  // ── stylesheet checks: once per page, in the 'page' state (declarations the browser dropped, undefined custom properties) ──
  // Both read the CSS as the author wrote it: the CSSOM has already thrown away what the parser rejected, and has no
  // line numbers. prepare() collects the source text of every stylesheet (a <style>'s text, fetch() for a <link> and
  // for @imports, or what the CLI read over the DevTools protocol where fetch cannot: file:// pages leave in
  // window.__tsiSources); a sheet without source (constructed, filled by insertRule) falls back to the CSSOM's
  // serialization, which is good for custom properties but not for finding dropped declarations.
  // sheets: [{ file, own, text, tree, serialized, base }]; own: the author's (same origin, not under node_modules)
  let sheets = null, unreadable = false;
  const parsed = (window.__tsiParsed ??= new Map()); // source text -> tree, for the page's lifetime (the dev client reinstalls often)
  const treeOf = text => { let t = parsed.get(text); if (!t) { if (parsed.size > 500) parsed.clear(); t = parseCSS(text); parsed.set(text, t); } return t; };
  prepares.push(async () => {
    const ext = window.__tsiSources ?? {}, out = [], seen = new Set();
    const local = u => { try { const x = new URL(u, document.baseURI); return x.origin === location.origin && x.protocol !== 'data:' || x.protocol === 'file:' && location.protocol === 'file:'; } catch { return false; } };
    // a sheet next to the page or below it by its path from there (as the page links it), any other by its path on the server
    const dir = location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '');
    const label = u => { try { const x = new URL(u); return decodeURIComponent(x.href.startsWith(dir) ? x.pathname.slice(new URL(dir).pathname.length) : x.pathname); } catch { return u; } };
    const read = async href => ext[href] ?? (local(href) ? fetch(href, { cache: 'force-cache' }).then(r => r.ok ? r.text() : null, () => null) : null);
    // A dev server (Vite) serves CSS transformed: imports inlined above it, a preprocessor's output. A line in that text
    // is not a line of the file, so none is given; the Vite plugin finds the declaration in the source (finding.decl).
    const devServer = !!document.querySelector('script[src*="/@vite/client"]');
    async function take(text, { file, base, own, serialized = false, line = 1, transformed = devServer }) {
      const tree = treeOf(text);
      out.push({ file, own, text, tree, serialized, base, line, transformed });
      for (const n of tree) {
        if (n.t !== 'at' || n.name !== 'import') continue;
        const m = n.pre.match(/^\s*(?:url\(\s*)?(["']?)([^"')\s]+)\1/i);
        if (!m) continue;
        const href = new URL(m[2], base).href;
        if (seen.has(href)) continue;
        seen.add(href);
        const t = await read(href);
        if (t == null) { unreadable = true; continue; }
        await take(t, { file: label(href), base: href, own: own && local(href) && !href.includes('/node_modules/'), transformed });
      }
    }
    // the line of each inline <style> in the page's HTML: from the CLI over the protocol, or from the page's own text
    let html = null;
    const inline = Object.entries(ext).filter(([k]) => k.startsWith('inline:')).map(([k, text]) => ({ line: +k.slice(7), text }));
    if (!inline.length && local(location.href) && document.querySelector('style:not([data-vite-dev-id])'))
      html = await fetch(location.href, { cache: 'force-cache' }).then(r => r.ok ? r.text() : null, () => null);
    let nth = 0;
    for (const sheet of [...document.styleSheets, ...(document.adoptedStyleSheets ?? [])]) {
      const node = sheet.ownerNode, href = sheet.href;
      let text = null, file, own, serialized = false, line = 1;
      if (href) { if (seen.has(href)) continue; seen.add(href); text = await read(href); file = label(href); own = local(href) && !href.includes('/node_modules/'); }
      else if (node?.localName === 'style') {
        nth++;
        const dev = node.getAttribute('data-vite-dev-id');
        text = node.textContent.trim() ? node.textContent : null;
        own = !dev?.includes('/node_modules/');
        file = dev ? dev.split('?')[0] : `<style> #${nth}`;
        if (!dev && text) {
          const at = inline.find(s => s.text === text)?.line ?? (html?.includes(text) ? html.slice(0, html.indexOf(text)).split('\n').length : 0);
          if (at) { file = label(location.href); line = at; }
        }
      } else own = false; // constructed: the page's script or a library, and nothing to point at
      if (text == null) {
        try { text = [...sheet.cssRules].map(r => r.cssText).join('\n'); serialized = true; }
        catch { unreadable = true; continue; } // another origin without CORS, or file:// from the page
      }
      await take(text, { file, base: href ?? document.baseURI, own, serialized, line, transformed: devServer || !!node?.hasAttribute?.('data-vite-dev-id') });
    }
    sheets = out;
  });

  // A small CSS scanner, enough to find rules and declarations with their lines: it skips comments, strings, url()
  // and balanced (), [] and {}, so a ';' or '}' inside them ends nothing. Items:
  // { t: 'rule', sel, line, body }, { t: 'at', name, pre, line, body | null }, { t: 'decl', prop, value, line }.
  // Comments are left out of selectors and values. Parsing does not depend on context: inside any block, what ends at
  // '{' is a (nested) rule and what ends at ';' or '}' is a declaration; the checks decide what a block may hold.
  function parseCSS(text) {
    const n = text.length, nl = [];
    for (let k = text.indexOf('\n'); k >= 0; k = text.indexOf('\n', k + 1)) nl.push(k);
    const lineAt = p => { let lo = 0, hi = nl.length; while (lo < hi) { const m = (lo + hi) >> 1; if (nl[m] < p) lo = m + 1; else hi = m; } return lo + 1; };
    let i = 0;
    // reads up to a top-level character of `stops` (or the end); returns the text read, comments replaced by a space
    function until(stops) {
      let out = '', from = i;
      const close = [];
      while (i < n) {
        const c = text[i];
        if (c === '/' && text[i + 1] === '*') { out += text.slice(from, i) + ' '; const e = text.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; from = i; continue; }
        if (c === '"' || c === "'") { for (i++; i < n && text[i] !== c && text[i] !== '\n'; i++) if (text[i] === '\\') i++; i++; continue; }
        if (c === '\\') { i += 2; continue; }
        if (!close.length && stops.includes(c)) break;
        if (c === '(' && /url$/i.test(text.slice(i - 3, i)) && !/[\w-]/.test(text[i - 4] ?? '')) {
          let j = i + 1; while (/\s/.test(text[j] ?? '')) j++;
          if (text[j] !== '"' && text[j] !== "'") { // an unquoted url: everything up to ')' is the url
            for (i = j; i < n && text[i] !== ')'; i++) if (text[i] === '\\') i++;
            i++; continue;
          }
        }
        if (c === '(' || c === '[' || c === '{') close.push(c === '(' ? ')' : c === '[' ? ']' : '}');
        else if (c === close.at(-1)) close.pop();
        else if (c === '}' && close.includes('}')) { while (close.pop() !== '}'); } // a block closed inside an unclosed ( or [
        i++;
      }
      return out + text.slice(from, i);
    }
    function block(top) {
      const items = [];
      while (i < n) {
        while (i < n && /\s/.test(text[i])) i++;
        if (text[i] === '/' && text[i + 1] === '*') { const e = text.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
        if (i >= n) break;
        const c = text[i];
        if (c === '}') { i++; if (top) continue; break; }
        if (c === ';') { i++; continue; }
        if (text.startsWith('<!--', i) || text.startsWith('-->', i)) { i += c === '<' ? 4 : 3; continue; }
        const line = lineAt(i);
        if (c === '@') {
          const name = text.slice(i + 1).match(/^[\w-]*/)[0];
          i += 1 + name.length;
          const pre = until(';{}').trim();
          if (text[i] === '{') { i++; items.push({ t: 'at', name: name.toLowerCase().replace(/^-(webkit|moz|ms|o)-/, ''), pre, line, body: block(false) }); }
          else { if (text[i] === ';') i++; items.push({ t: 'at', name: name.toLowerCase(), pre, line, body: null }); }
          continue;
        }
        // a custom property's value may hold {} and ends only at a top-level ';' or '}'
        const custom = /^--[^\s:;{}]*\s*:/.exec(text.slice(i, i + 200));
        const head = custom ? (i += custom[0].length, custom[0] + until(';}')) : until(';{}');
        if (text[i] === '{') { i++; items.push({ t: 'rule', sel: head.trim().replace(/\s+/g, ' '), line, body: block(false) }); continue; }
        if (text[i] === ';') i++;
        const colon = head.indexOf(':');
        if (!top && colon > 0) items.push({ t: 'decl', prop: head.slice(0, colon).trim(), value: head.slice(colon + 1).trim(), line });
      }
      return items;
    }
    return block(true);
  }
  const declsOf = text => parseCSS(`a{${text}\n}`)[0]?.body?.filter(d => d.t === 'decl') ?? [];

  // splits a selector list at its top-level commas
  const splitList = s => { const out = []; let d = 0, q = '', from = 0;
    for (let k = 0; k < s.length; k++) { const c = s[k];
      if (q) { if (c === '\\') k++; else if (c === q) q = ''; } else if (c === '"' || c === "'") q = c;
      else if (c === '(' || c === '[') d++; else if (c === ')' || c === ']') d--; else if (c === ',' && !d) { out.push(s.slice(from, k).trim()); from = k + 1; } }
    out.push(s.slice(from).trim()); return out.filter(Boolean); };
  // a nested rule's selector against its parent's: '&' stands for the parent, no '&' means a descendant of it
  const nest = (child, parent) => { if (parent == null) return child;
    const p = splitList(parent).length > 1 ? `:is(${parent})` : parent;
    return splitList(child).map(c => c.includes('&') ? c.replace(/&/g, p) : `${p} ${c}`).join(', '); };

  // The elements a selector matches, ignoring the states a static page is not in (:hover, :focus, an open popover)
  // and pseudo-elements (whose custom properties are read with getComputedStyle's second argument).
  // null: a selector that cannot be evaluated that way (it is skipped, not guessed at), e.g. :not(:hover).
  const STATES = /:(hover|active|focus-visible|focus-within|focus|visited|target-within|target|playing|paused|seeking|buffering|stalled|muted|popover-open|open|closed|modal|fullscreen|picture-in-picture|user-invalid|user-valid|autofill|-webkit-autofill|placeholder-shown|checked|indeterminate)(?![\w-])/gi;
  const STATE = new RegExp(STATES.source, 'i');
  const PSEUDO = /::[\w-]+(\([^)]*\))?|:(before|after|first-line|first-letter)(?![\w-])/gi;
  const targetCache = new Map();
  function targets(selector) {
    if (targetCache.has(selector)) return targetCache.get(selector);
    let res = { els: [], pseudo: null, stateful: false };
    for (const c of splitList(selector)) {
      for (const [m] of c.matchAll(PSEUDO)) { const p = m.replace(/^:+/, '::').toLowerCase(); res.pseudo = res.pseudo && res.pseudo !== p ? 'mixed' : p; }
      const s = c.replace(PSEUDO, ''), t = s.replace(STATES, '').trim();
      if (t !== s.trim()) res.stateful = true;
      try { res.els.push(...document.querySelectorAll(!t || /[>+~]$/.test(t) ? t + '*' : t)); } catch { res = null; break; }
    }
    targetCache.set(selector, res);
    return res;
  }

  // ── dropped declarations ──
  const known = new Map(); // property -> does Chrome know it
  const isKnown = p => { let k = known.get(p); if (k === undefined) known.set(p, k = CSS.supports(p, 'initial')); return k; };
  let propNames = null; // every property Chrome knows, for suggestions
  const names = () => { // the style object has a camelCase key for every property (webkitX for prefixed ones)
    if (propNames) return propNames;
    const keys = new Set();
    for (const k in document.documentElement.style) keys.add(k === 'cssFloat' ? 'float' : k.replace(/[A-Z]/g, m => '-' + m.toLowerCase()));
    return propNames = [...keys].filter(k => /^[a-z][a-z-]*$/.test(k) && !/^(webkit|moz|ms)-/.test(k) && isKnown(k));
  };
  // edit distance, with a swap of two neighbours as one edit; past `max` it stops early and returns max + 1
  const lev = (a, b, max = 99) => {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let older = null, prev = Array.from({ length: b.length + 1 }, (_, y) => y);
    for (let x = 1; x <= a.length; x++) {
      const cur = [x];
      let low = x;
      for (let y = 1; y <= b.length; y++) {
        let v = Math.min(prev[y] + 1, cur[y - 1] + 1, prev[y - 1] + (a[x - 1] === b[y - 1] ? 0 : 1));
        if (x > 1 && y > 1 && a[x - 1] === b[y - 2] && a[x - 2] === b[y - 1]) v = Math.min(v, older[y - 2] + 1);
        cur.push(v); if (v < low) low = v;
      }
      if (low > max) return max + 1;
      older = prev; prev = cur;
    }
    return prev[b.length];
  };
  function nearProperty(p) {
    const camel = p.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
    if (camel !== p && isKnown(camel)) return camel; // alignItems, as in JavaScript
    const all = names(), parts = p.split('-'), sorted = parts.toSorted().join('-');
    let best = null, bd = p.length > 12 ? 3 : p.length > 5 ? 2 : 1;
    for (const q of all) { const d = lev(p, q, bd); if (d <= bd && (d < bd || !best)) { best = q; bd = d; } }
    if (best) return best;
    return all.find(q => q.split('-').toSorted().join('-') === sorted) // border-radius-top-left
      ?? parts.slice(1).map((_, k) => parts.slice(k + 1).join('-')).find(q => q.length > 2 && isKnown(q)) // font-color, flex-gap
      ?? null;
  }
  const KEYWORDS = `auto none normal block inline inline-block flex inline-flex grid inline-grid contents flow-root table list-item hidden visible
    scroll clip static relative absolute fixed sticky row column row-reverse column-reverse wrap nowrap wrap-reverse start end center flex-start
    flex-end self-start self-end left right top bottom baseline stretch space-between space-around space-evenly justify bold bolder lighter italic
    oblique underline overline line-through uppercase lowercase capitalize solid dashed dotted double groove ridge inset outset transparent
    currentcolor pointer default text move grab grabbing not-allowed help wait crosshair cover contain fill fit-content min-content max-content
    repeat no-repeat round space ease ease-in ease-out ease-in-out linear infinite forwards backwards both alternate reverse paused running
    break-word break-all keep-all anywhere pre pre-wrap pre-line balance pretty ellipsis border-box content-box padding-box collapse separate
    dense smooth thin medium thick small large inherit initial unset revert sans-serif serif monospace system-ui all horizontal vertical
    isolate multiply screen overlay`.split(/\s+/);
  const ALIAS = { middle: ['center'], center: ['middle'], centre: ['center', 'middle'], flexbox: ['flex'], 'inline-flexbox': ['inline-flex'] };
  const UNITS = 'px rem em % vh vw dvh svh lvh vmin vmax ch ex lh rlh cap ic fr ms s deg turn rad cqw cqh cqi pt cm mm in x dpi'.split(' ');
  const code = s => '`' + s + '`';
  const whyCache = new Map();
  const dropped = (prop, value) => { const k = prop + '\0' + value; let w = whyCache.get(k); if (w === undefined) whyCache.set(k, w = whyDropped(prop, value)); return w; };
  // why the browser drops `prop: value`, or null when it keeps it (or when it is not a mistake: see the skips)
  function whyDropped(prop, rawValue) {
    const p = prop.toLowerCase();
    if (p.startsWith('--') || /^[*_]|^-(webkit|moz|ms|o)-/.test(p)) return null; // custom, vendor-prefixed, old IE hacks
    const v = rawValue.replace(/!\s*important\s*$/i, '').trim();
    if (/\\[90]\s*$|expression\(|progid:/i.test(v) || /(^|[\s,(])-(webkit|moz|ms|o)-/i.test(v)) return null;
    if (!isKnown(p)) {
      const near = nearProperty(prop);
      return near ? `unknown property, did you mean ${code(near)}?`
        : 'Chrome knows no such property (a typo, or a property other browsers have and Chrome does not)';
    }
    if (/\bvar\(/i.test(v)) return null; // checked when the value is computed, not when it is parsed
    if (!v) return 'it has no value';
    if (CSS.supports(p, v)) return null;
    // cheap counterfactuals: the smallest change that makes the value valid says what is wrong with it
    const ok = w => CSS.supports(p, w), valid = w => `${code(`${prop}: ${w}`)} would be valid`;
    const bang = v.match(/\s*!\s*([\w-]*)\s*$/);
    if (bang && ok(v.slice(0, bang.index))) return `${code('!' + bang[1])} is not ${code('!important')}`;
    const semi = v.match(/\s([a-z-]+)\s*:\s*\S/i);
    if (semi && ok(v.slice(0, semi.index))) return `a ${code(';')} is missing after ${code(v.slice(0, semi.index).trim())}, so ${code(clip(v.slice(semi.index + 1).trim(), 40))} is swallowed into this value`;
    const num = /(^|[\s,(\/])(-?\d*\.?\d+)(?=$|[\s,)\/])/g;
    if (/(^|[\s,(\/])-?\d*\.?\d+($|[\s,)\/])/.test(v)) for (const unit of ['px', 'ms', 'deg']) {
      const w = v.replace(num, (m, pre, x) => +x === 0 ? m : `${pre}${x}${unit}`);
      if (ok(w)) return `a number needs a unit here: ${valid(w)}`;
    }
    for (const m of v.matchAll(/(?<![\w#.-])(\d*\.?\d+)([a-z]+)(?![\w(-])/gi)) { // a misspelt unit: 1rm, 10pxx
      const u = m[2].toLowerCase(), near = UNITS.filter(x => lev(u, x) <= (u.length > 2 ? 2 : 1)).sort((a, b) => lev(u, a) - lev(u, b));
      for (const x of near) { const w = v.slice(0, m.index) + m[1] + x + v.slice(m.index + m[0].length); if (ok(w)) return `${code(m[2])} is not a unit, did you mean ${code(m[1] + x)}?`; }
    }
    if (/^(["']).*\1$/.test(v) && ok(v.slice(1, -1))) return `the value is quoted: ${valid(v.slice(1, -1))}`;
    if (/url\(\s*[^\s"')][^)]*["'(\s][^)]*\)/i.test(v)) return 'a url() without quotes cannot hold quotes, spaces or parentheses: put the URL in double quotes, url("…")';
    if (v.includes(',') && ok(v.replace(/\s*,\s*/g, ' '))) return `values are separated by spaces here, not commas: ${valid(v.replace(/\s*,\s*/g, ' '))}`;
    const idents = [...v.matchAll(/(?<![\w#.-])[a-z][\w-]*(?![\w(-])/gi)];
    for (const m of idents) {
      const w = m[0].toLowerCase();
      const tries = [...ALIAS[w] ?? [], ...KEYWORDS.filter(k => k !== w && (lev(w, k) <= (w.length > 5 ? 2 : 1) || (Math.min(w.length, k.length) >= 3 && (w.startsWith(k) || k.startsWith(w)))))
        .sort((a, b) => lev(w, a) - lev(w, b))].filter(Boolean);
      for (const k of tries) { const x = v.slice(0, m.index) + k + v.slice(m.index + m[0].length); if (ok(x)) return `${code(m[0])} is not a value of ${prop}, did you mean ${code(k)}?`; }
    }
    return `${code(v.length > 50 ? v.slice(0, 50) + '…' : v)} is not a valid value for ${prop}`;
  }

  const clip = (s, max) => s.length > max ? s.slice(0, max - 1) + '…' : s;
  const ruleText = (sel, prop, value) => `${clip(sel, 80)} { ${prop}: ${clip(value.replace(/\s+/g, ' '), 60)} }`;
  const where = (sheet, line) => sheet.serialized || sheet.transformed ? `(${sheet.file})` : `(${sheet.file}:${sheet.line + line - 1})`;
  // a finding about a declaration in a stylesheet also says which one as data (--json; the Vite plugin looks its line up)
  const from = (sheet, d) => { findings.at(-1).decl = { file: sheet.file, prop: d.prop, value: d.value }; };
  // grouping at-rules: their declarations and rules belong to the rule around them, as if the at-rule were not there
  const GROUPS = new Set(['media', 'layer', 'container', 'scope', 'starting-style', 'document', 'supports']);

  // Walks a tree: visit(decls, { sel, frame, supports, cond }) for each block of declarations of a style rule, a
  // keyframe (frame: true), or a grouping rule nested in a style rule. cond: 'on' when every @media / @supports around
  // the rule applies now, 'off' when one does not, '?' when one cannot be evaluated here (@container, @scope,
  // @starting-style). descriptors(atRule) hears of the at-rules whose blocks hold descriptors, not properties.
  function walk(items, ctx, visit, descriptors) {
    const decls = items.filter(d => d.t === 'decl');
    if (decls.length && ctx.sel != null) visit(decls, ctx);
    for (const n of items) {
      if (n.t === 'rule') walk(n.body, { ...ctx, sel: ctx.keyframes ? `@keyframes ${ctx.keyframes} ${n.sel}` : nest(n.sel, ctx.sel), frame: !!ctx.keyframes, keyframes: null }, visit, descriptors);
      else if (n.t !== 'at' || !n.body) continue;
      else if (n.name === 'keyframes') walk(n.body.filter(k => k.t === 'rule'), { ...ctx, sel: null, keyframes: n.pre }, visit, descriptors);
      else if (GROUPS.has(n.name)) {
        let cond = ctx.cond;
        if (n.name === 'media') { if (cond === 'on' && !matchMedia(n.pre).matches) cond = 'off'; }
        else if (n.name === 'supports') { try { if (cond === 'on' && !CSS.supports(n.pre)) cond = 'off'; } catch { cond = '?'; } }
        else if (n.name !== 'layer') cond = cond === 'off' ? 'off' : '?';
        // @supports, and @-moz-document (a Firefox-only hack): written for some browsers, not mistakes in others
        walk(n.body, { ...ctx, supports: ctx.supports || n.name === 'supports' || n.name === 'document', cond }, visit, descriptors);
      } else descriptors?.(n); // @font-face, @property, @page, @counter-style, @view-transition, @position-try, …
    }
  }

  // The declarations of one block that the browser drops by mistake, each with why: [{ d, why }]. Not a mistake: a
  // rejected declaration next to an accepted one of the same property (a fallback pair, height: 100vh; height: 100dvh),
  // and an unknown property next to an accepted one with the same value and the same last word, the old or new name of
  // a renamed property (color-adjust: exact; print-color-adjust: exact).
  function droppedIn(decls) {
    const out = [], kept = decls.filter(d => !dropped(d.prop, d.value)), same = new Set(kept.map(d => d.prop.toLowerCase()));
    const bare = v => v.replace(/!\s*important\s*$/i, '').trim(), last = p => p.toLowerCase().split('-').at(-1);
    for (const d of decls) {
      const why = dropped(d.prop, d.value);
      if (!why || same.has(d.prop.toLowerCase())) continue;
      if (!isKnown(d.prop.toLowerCase()) && kept.some(k => last(k.prop) === last(d.prop) && bare(k.value) === bare(d.value))) continue;
      out.push({ d, why });
    }
    return out;
  }

  // An error: the browser's own parser rejected it, so the declaration does nothing, and the message says what would
  // work. A warning only for a property Chrome does not know and that is near no known one: it may be a property of
  // another browser, and then there is nothing to fix.
  const certain = why => !why.startsWith('Chrome knows no such property');
  function checkDropped(add) {
    for (const sheet of sheets) {
      if (!sheet.own || sheet.serialized) continue;
      walk(sheet.tree, { sel: null, supports: false, cond: 'on' }, (decls, ctx) => {
        if (ctx.supports) return; // written for browsers that pass the @supports test (or that fail it)
        for (const { d, why } of droppedIn(decls))
        { add(certain(why) ? 'error' : 'warning', 'css', ruleText(ctx.sel, d.prop, d.value), `is not valid CSS, so the browser ignores it: ${why} ${where(sheet, d.line)}`); from(sheet, d); }
      });
    }
    for (const el of document.querySelectorAll('[style]')) {
      if (!visible(el)) continue;
      const found = droppedIn(declsOf(el.getAttribute('style')));
      const bad = found.map(({ d, why }) => `${code(`${d.prop}: ${clip(d.value, 60)}`)} (${why})`);
      if (bad.length) add(found.some(f => certain(f.why)) ? 'error' : 'warning', 'css', el, `has inline style the browser ignores, it is not valid CSS: ${bad.join('; ')}`);
    }
  }

  // ── undefined custom properties ──
  // The var() chains of a value that fail when missing(name) says a name has no value: a var() fails when its name is
  // missing and it has no fallback, or its fallback fails, which only a var() of the fallback's own can make it do.
  // Returns the names of each failing chain, e.g. [['--a'], ['--b', '--c']] for var(--a) var(--b, var(--c)).
  function failing(value, missing) {
    const out = [], re = /\bvar\(/gi;
    for (let m; (m = re.exec(value));) {
      let depth = 0, e = re.lastIndex;
      for (; e < value.length; e++) { if (value[e] === '(') depth++; else if (value[e] === ')' && depth-- === 0) break; }
      const arg = value.slice(re.lastIndex, e), v = arg.match(/^\s*(--[^\s,)]+)\s*(,?)/);
      re.lastIndex = e;
      if (!v || !missing(v[1])) continue;
      if (!v[2]) out.push([v[1]]);
      else { const inner = failing(arg.slice(v[0].length), missing); if (inner.length) out.push([v[1], ...inner[0]]); }
    }
    return out;
  }
  // The declared names closest to an undefined one: a hallucinated token (--tm-color-primary) shares words with the
  // real one (--tm-primary) more often than it is a typo of it, so shared words count as much as a few edits.
  // Only words of 3 letters or more count (not the -l, -h, -00 of a palette). Memoized; past 40 names per page it
  // gives up (a big library's sheet can have hundreds, and the report shows a few per check anyway).
  const nearCache = new Map();
  function nearVars(name, defined) {
    if (nearCache.has(name)) return nearCache.get(name);
    if (nearCache.size >= 40) return [];
    const wordsOf = n => n.slice(2).split('-').filter((w, k) => k === 0 || (w.length >= 3 && !/^\d+$/.test(w)));
    const words = wordsOf(name), typo = Math.max(name.length > 6 ? 2 : 1, name.length >> 2), scored = [];
    for (const d of defined) {
      const q = wordsOf(d);
      const shared = q[0] === words[0] ? words.slice(1).filter(w => q.includes(w)).length : 0;
      const dist = lev(name, d, shared ? 20 : typo);
      if (dist <= typo || shared) scored.push({ d, score: dist - 3 * shared });
    }
    const out = scored.sort((a, b) => a.score - b.score).slice(0, 3).map(s => s.d);
    nearCache.set(name, out);
    return out;
  }
  const or = list => list.length > 1 ? `${list.slice(0, -1).join(', ')} or ${list.at(-1)}` : list[0];
  const effect = prop => prop.startsWith('--') ? `so ${prop} has no value either`
    : `so ${prop} falls back to its inherited or initial value (not to an earlier ${prop} declaration)`;
  const undefinedText = (prop, chain, defined) => { // defined: null for no suggestion
    const near = defined ? nearVars(chain[0], defined) : [];
    return `${chain.length > 1 ? `${chain.join(' and ')} are` : `${chain[0]} is`} not defined anywhere, ${effect(prop)}${near.length ? `; did you mean ${or(near)}?` : ''}`;
  };

  function checkVars(add) {
    // every custom property name the page can see: declared in a rule (of any sheet, third-party ones too), in an inline
    // style (which is also where names set from script end up), or registered with @property
    const defined = new Set(), empty = new Set(), unsure = new Set(), refs = [];
    for (const sheet of sheets) {
      walk(sheet.tree, { sel: null, supports: false, cond: 'on' }, (decls, ctx) => {
        const stateful = ctx.frame || STATE.test(ctx.sel);
        for (const d of decls) {
          if (d.prop.startsWith('--')) {
            defined.add(d.prop);
            if (!d.value || /^initial$/i.test(d.value)) empty.add(d.prop); // a space toggle: no value on purpose
            if (ctx.cond !== 'on' || stateful) unsure.add(d.prop); // set in a state or under a condition the page is not in now
          }
          if (sheet.own && /\bvar\(/i.test(d.value) && (d.prop.startsWith('--') || isKnown(d.prop.toLowerCase()))) refs.push({ sheet, d, ctx });
        }
      }, n => { if (n.name === 'property') defined.add(n.pre.trim()); });
    }
    const styled = [...document.querySelectorAll('[style]')];
    for (const el of styled) for (const p of el.style) if (p.startsWith('--')) { defined.add(p); if (!el.style.getPropertyValue(p).trim()) empty.add(p); }
    const styles = new Map(); // element -> { '' or pseudo-element: its computed style (a live object) }
    const computed = (el, pseudo, name) => {
      let per = styles.get(el);
      if (!per) styles.set(el, per = {});
      return (per[pseudo ?? ''] ??= getComputedStyle(el, pseudo)).getPropertyValue(name).trim();
    };
    // a name the root element has a value for reaches every element (custom properties inherit), so most design
    // tokens need no look at the elements a rule matches
    const html = document.documentElement, atRoot = new Map();
    const onRoot = name => { let v = atRoot.get(name); if (v === undefined) atRoot.set(name, v = !!computed(html, null, name)); return v; };

    for (const { sheet, d, ctx } of refs) {
      // primary: a name declared nowhere, which none of the elements the rule matches has a value for either
      const chains = failing(d.value, name => !defined.has(name));
      const suspect = name => !empty.has(name) && !unsure.has(name) && !onRoot(name);
      if (!chains.length && (ctx.cond !== 'on' || ctx.frame || !failing(d.value, suspect).length)) continue;
      const t = ctx.frame ? null : targets(ctx.sel);
      const pseudo = t && (t.pseudo === '::before' || t.pseudo === '::after') ? t.pseudo : null;
      if (chains.length) {
        for (const chain of chains) {
          if (t?.els.slice(0, 8).some(el => chain.some(n => computed(el, pseudo, n)))) continue;
          if (unreadable && !(t?.els.length && !t.stateful)) continue; // it may be defined in the sheet that could not be read
          // A rule no element matches breaks nothing on this page, and a library's rule may leave a name for another of
          // its sheets to define (temper's core draws icons from --_icon, which icons.css sets): info only, and without
          // the suggestion, which costs the most (a library with a big palette has hundreds of these).
          // an error: the name is defined nowhere and an element on the page is styled by this declaration, which does nothing
          if (t?.els.length) add('error', 'var', ruleText(ctx.sel, d.prop, d.value), `${undefinedText(d.prop, chain, defined)} ${where(sheet, d.line)}`);
          else add('info', 'var', ruleText(ctx.sel, d.prop, d.value), `${undefinedText(d.prop, chain, null)} (no element on this page matches the rule) ${where(sheet, d.line)}`);
          from(sheet, d);
        }
        continue;
      }
      // secondary: every name is declared somewhere, but none of the elements this rule matches gets a value for it
      if (!t || t.stateful || !t.els.length || (t.pseudo && !pseudo)) continue;
      const checked = t.els.slice(0, 8);
      for (const chain of failing(d.value, name => suspect(name) && checked.every(el => !computed(el, pseudo, name))))
        add('info', 'var', ruleText(ctx.sel, d.prop, d.value), `${chain.join(' and ')} ${chain.length > 1 ? 'have' : 'has'} no value on the ${t.els.length > 1 ? `${t.els.length} elements` : 'element'} this rule matches (${chain.length > 1 ? 'they are' : 'it is'} set on other elements), ${effect(d.prop)} ${where(sheet, d.line)}`);
    }
    // inline styles of visible elements
    for (const el of styled) {
      const text = el.getAttribute('style');
      if (!/\bvar\(/i.test(text) || !visible(el)) continue;
      for (const d of declsOf(text)) for (const chain of failing(d.value, name => !defined.has(name) && !computed(el, null, name)))
        add('error', 'var', el, `has inline style ${code(`${d.prop}: ${clip(d.value, 60)}`)}: ${undefinedText(d.prop, chain, defined)}`);
    }
  }

  function checkStyles(add) {
    if (!sheets) return; // prepare() was not called (an older dev client): without the sources there is nothing to read
    checkDropped(add);
    checkVars(add);
  }

  // ── checks ──
  const INTERACTIVE = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=switch], [role=checkbox], [role=tab], [role=menuitem], [tabindex]:not([tabindex="-1"])';

  function check(state) {
    // el: the element the finding is about, or selector text (a stylesheet rule), or null
    const add = (severity, code, el, message) => findings.push({ state, severity, code,
      selector: typeof el === 'string' ? el : el ? sel(el) : '', message, src: typeof el === 'string' ? undefined : srcOf(el) });
    const els = all();

    // horizontal overflow: report the outermost element that sticks out
    if (document.documentElement.scrollWidth > vw + 1) {
      for (const el of els) {
        const r = R(el);
        if (r.right <= vw + 1 && r.left >= -1) continue;
        if (cs(el).position === 'fixed' && (r.right < 0 || r.left > vw)) continue; // off-canvas on purpose
        let clipped = false; // inside a scroll or clip container that itself fits: no page overflow from this element
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          if (cs(a).overflowX !== 'visible') { const ar = R(a); if (ar.right <= vw + 1 && ar.left >= -1) { clipped = true; break; } }
        }
        if (clipped) continue;
        const p = el.parentElement, pr = p && R(p);
        if (p && p !== scope && (pr.right > vw + 1 || pr.left < -1)) continue;
        add('error', 'overflow', el, `sticks out of the viewport by ${Math.round(Math.max(r.right - vw, -r.left))}px and makes the page scroll sideways`);
      }
    }

    // text contrast and clipped text
    for (const el of els) {
      const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      if (!own) continue;
      const s = cs(el);
      if (el.closest(':disabled, [aria-disabled="true"], [aria-busy="true"]') || rgba(s.color).a === 0) continue;
      const bg = bgOf(el);
      if (bg) {
        const fg = blend(rgba(s.color), bg);
        const size = parseFloat(s.fontSize), bold = parseInt(s.fontWeight) >= 700;
        const min = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
        const c = contrast(fg, bg);
        if (c < min) add(c < 3 ? 'error' : 'warning', 'contrast', el, `text contrast ${c.toFixed(2)}:1, needs ${min}:1 (${hex(fg)} on ${hex(bg)})`);
      }
      const clipsX = ['hidden', 'clip'].includes(s.overflowX);
      const visuallyHidden = s.clipPath !== 'none' || R(el).width <= 1 || el.closest('[data-tm-sr-only]');
      if (clipsX && !visuallyHidden && el.scrollWidth > el.clientWidth + 1 && s.textOverflow !== 'ellipsis')
        add('warning', 'clipped', el, 'text is cut off without an ellipsis');
    }

    // controls: names, being covered, tap target size
    for (const el of els.filter(e => e.matches(INTERACTIVE))) {
      const r = R(el);
      const isField = el.matches('input, select, textarea');
      // aria-labelledby names the element only with the text of elements it points at (a dangling id or an empty one: none)
      const name = el.getAttribute('aria-label')?.trim() || (el.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean)
        .map(id => { const t = el.getRootNode().getElementById?.(id) ?? document.getElementById(id); return t ? (t.getAttribute('aria-label') ?? '').trim() || t.textContent.trim() : ''; }).join('')
        || el.getAttribute('title')
        || (isField ? (el.labels?.length ? 'label' : '') : (el.innerText.trim() || el.querySelector('img[alt]:not([alt=""]), svg title')?.textContent || el.querySelector('img[alt]')?.alt));
      if (!name && !(isField && ['submit', 'reset', 'button'].includes(el.type) && el.value)) {
        if (isField && el.placeholder) add('warning', 'label', el, 'has only a placeholder, no label');
        else add('error', 'label', el, 'has no accessible name (add text, a label or aria-label)');
      }
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      // only where the center is actually on screen and not scrolled out of view inside a scroll container
      let onScreen = x >= 0 && y >= 0 && x < vw && y < vh;
      for (let a = el.parentElement; onScreen && a && a !== document.documentElement; a = a.parentElement) {
        if (cs(a).overflowY === 'visible' && cs(a).overflowX === 'visible') continue;
        const ar = R(a);
        if (x < ar.left || x > ar.right || y < ar.top || y > ar.bottom) onScreen = false;
      }
      if (onScreen) {
        const top = document.elementFromPoint(x, y);
        const tiny = r.width <= 2 || r.height <= 2 || cs(el).pointerEvents === 'none';
        if (!tiny && top && top !== el && !el.contains(top) && !(el.labels && [...el.labels].some(l => l.contains(top))))
          add('warning', 'covered', el, top.contains(el)
            ? `its center is covered by a pseudo-element of ${sel(top)}, so clicks go there`
            : `its center is covered by ${sel(top)}, so clicks go there`);
      }
      // effective target: a covering ::after/::before (stretched link) or the field's label
      const pseudoCovers = ['::after', '::before'].some(p => { const ps = getComputedStyle(el, p); return ps.content !== 'none' && ps.position === 'absolute'; });
      const target = isField && el.labels?.length ? [...el.labels].map(R).reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b)) : r;
      if (!pseudoCovers && vw < 768 && (target.width < 24 || target.height < 24) && cs(el).display !== 'inline')
        add('info', 'target', el, `tap target ${Math.round(r.width)}×${Math.round(r.height)}px, under 24×24`);
    }

    // images
    for (const img of els.filter(e => e.localName === 'img' && !e.hasAttribute('alt'))) add('error', 'alt', img, 'image has no alt attribute');

    // rows that wrapped (info): flex rows whose children end up on several lines
    for (const el of els) {
      const s = cs(el);
      if (!s.display.endsWith('flex') || !s.flexDirection.startsWith('row') || s.flexWrap === 'nowrap') continue;
      const kids = [...el.children].filter(visible);
      if (kids.length < 2) continue;
      const lines = new Set(kids.map(k => Math.round(R(k).top / 4))).size;
      const tops = kids.map(k => R(k).top), h = Math.min(...kids.map(k => R(k).height));
      if (Math.max(...tops) - Math.min(...tops) > h * 0.75) add('info', 'wrapped', el, `row wrapped onto ${lines} lines`);
    }

    // One group failing on an unusual page must not cost the report of the others.
    const group = (name, fn) => { try { fn(); } catch (e) { add('warning', 'internal', null, `temper-inspect's ${name} checks failed on this page and were skipped (${String(e?.message ?? e).slice(0, 160)}); the other checks ran. Please report it`); } };
    if (!current) { group('document', () => checkDocument(add)); group('stylesheet', () => checkStyles(add)); }
    group('geometry', () => checkGeometry(add, els));
  }

  function checkOverlay(state, el) {
    const r = R(el);
    if (el.scrollWidth > el.clientWidth + 1)
      findings.push({ state, severity: 'error', code: 'overflow', selector: sel(el), message: `content is ${el.scrollWidth - el.clientWidth}px wider than the ${el.localName === 'dialog' ? 'dialog' : 'overlay'} and gets cut off or scrolls sideways` , src: srcOf(el) });
    if (r.left <= 1 && r.top <= 1 && r.width < vw - 2 && r.height < vh - 2)
      findings.push({ state, severity: 'error', code: 'position', selector: sel(el), message: 'sits in the top-left corner (missing margin: auto or anchor position?)' , src: srcOf(el) });
    if (r.right > vw + 1 || r.bottom > vh + 1 || r.left < -1 || r.top < -1)
      findings.push({ state, severity: 'error', code: 'position', selector: sel(el), message: `extends outside the viewport (${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)})` , src: srcOf(el) });
  }

  // ── geometry checks: in every state (overlapping text, content poking out of its box, squeezed text, distorted images) ──
  // els: the visible elements of the state being checked (all()), in document order
  // Each check measures what is painted, and stays silent when in doubt: a finding should be something a person
  // looking at a screenshot would call broken.
  const svgShape = new Map(); // SVG image URL -> { stretches, ratio } | null, read in prepare(): see distorted below
  prepares.push(async () => {
    const urls = [...new Set([...document.images].map(i => i.currentSrc).filter(u => /^data:image\/svg\+xml|\.svg([?#]|$)/i.test(u)))];
    await Promise.all(urls.slice(0, 50).map(async u => {
      try {
        const text = await (await fetch(u)).text();
        const svg = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;
        const vb = svg.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
        const ok = vb?.length === 4 && vb[2] > 0 && vb[3] > 0;
        // With a viewBox, the drawing keeps its shape inside any box (preserveAspectRatio meet) unless it says none.
        // Without one, an <img> stretches it to the box when it has a width and a height (the browser takes those as
        // its viewBox), and draws it unscaled when it has neither (measured in Chrome): then nothing is stretched.
        const sized = ['width', 'height'].every(a => parseFloat(svg.getAttribute(a)) > 0 && !/%$/.test(svg.getAttribute(a).trim()));
        svgShape.set(u, svg.localName !== 'svg' ? null : ok ? { stretches: /^\s*none/.test(svg.getAttribute('preserveAspectRatio') ?? ''), ratio: vb[2] / vb[3] }
          : { stretches: sized, ratio: null });
      } catch { svgShape.set(u, null); }
    }));
  });

  function checkGeometry(add, els) {
    const styles = new Map(), st = el => { let s = styles.get(el); if (!s) styles.set(el, s = cs(el)); return s; };
    // colors are parsed by drawing them, which is slow, and a page uses few of them
    const colors = new Map(), color = c => { let v = colors.get(c); if (!v) colors.set(c, v = rgba(c)); return v; };
    // what is painted behind an element's content, as bgOf() tells it (null: an image), memoized along the ancestors
    const behinds = new Map(), behind = el => {
      if (!el) { const root = color(cs(document.documentElement).backgroundColor); return root.a >= 0.999 ? root : { r: 255, g: 255, b: 255, a: 1 }; }
      let v = behinds.get(el);
      if (v !== undefined) return v;
      const s = st(el), c = color(s.backgroundColor);
      if (s.backgroundImage !== 'none' && !s.backgroundImage.startsWith('linear-gradient')) v = null;
      else if (c.a >= 0.999) v = c;
      else { const under = behind(el.parentElement); v = under && (c.a > 0 ? blend(c, under) : under); }
      behinds.set(el, v);
      return v;
    };
    const rect = new Map(), box = el => { let r = rect.get(el); if (!r) rect.set(el, r = R(el)); return r; };
    const px = n => Math.round(n);
    // sel() with its quoted text shortened, for naming a second element inside a message
    const short = el => { const s = sel(el), i = s.indexOf(' "'); return i < 0 || s.length - i < 26 ? s : s.slice(0, i + 22) + '…"'; };
    const SKIP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'SELECT', 'OPTION', 'OPTGROUP', 'TEXTAREA', 'DATALIST', 'svg', 'math', 'IFRAME', 'CANVAS', 'VIDEO', 'AUDIO', 'OBJECT']);
    const REPLACED = /^(IMG|svg|VIDEO|CANVAS|IFRAME|INPUT|SELECT|TEXTAREA|OBJECT|EMBED|PROGRESS|METER)$/;
    const isInline = el => st(el).display === 'inline' && !REPLACED.test(el.tagName);

    // ── what is painted where: the clip region of an element's content ──
    // An element is clipped by its ancestors whose overflow is not visible (and their scroll position, which the
    // rectangles already include), except those an absolutely or fixed positioned element escapes because its
    // containing block lies above them. Regions are {l, t, r, b}.
    const NOCLIP = { l: -Infinity, t: -Infinity, r: Infinity, b: Infinity };
    const meet = (a, b) => ({ l: Math.max(a.l, b.l), t: Math.max(a.t, b.t), r: Math.min(a.r, b.r), b: Math.min(a.b, b.b) });
    const holdsFixed = s => s.transform !== 'none' || s.perspective !== 'none' || s.filter !== 'none' || s.backdropFilter !== 'none'
      || /paint|layout|strict|content/.test(s.contain) || /size/.test(s.containerType) || /transform|perspective|filter/.test(s.willChange);
    const holdsAbs = s => s.position !== 'static' || holdsFixed(s);
    const inside = new Map();
    function clipFor(el) {
      const pos = st(el).position;
      let a = el.parentElement;
      if (pos === 'absolute' || pos === 'fixed') while (a && a !== document.body && !(pos === 'fixed' ? holdsFixed : holdsAbs)(st(a))) a = a.parentElement;
      return a && a !== document.body && a !== document.documentElement ? clipInside(a) : NOCLIP;
    }
    function clipInside(a) {
      let c = inside.get(a);
      if (c) return c;
      c = clipFor(a);
      const s = st(a);
      if (s.display !== 'inline') {
        const r = box(a), l = r.left + a.clientLeft, t = r.top + a.clientTop;
        if (s.overflowX !== 'visible') c = meet(c, { l, t: -Infinity, r: l + a.clientWidth, b: Infinity });
        if (s.overflowY !== 'visible') c = meet(c, { l: -Infinity, t, r: Infinity, b: t + a.clientHeight });
        if (s.clipPath !== 'none' || s.clip !== 'auto' || /paint|strict|content/.test(s.contain)) c = meet(c, { l: r.left, t: r.top, r: r.right, b: r.bottom });
      }
      inside.set(a, c);
      return c;
    }
    // Visually hidden on purpose (the sr-only pattern), as the clipped check tells it.
    const srOnly = el => { const s = st(el); return s.clipPath !== 'none' || s.clip !== 'auto' || box(el).width <= 1 || !!el.closest('[data-tm-sr-only]'); };
    const opac = new Map(), opacity = el => { // effective opacity, ancestors included
      if (!el || el === document.documentElement) return 1;
      let o = opac.get(el);
      if (o === undefined) opac.set(el, o = parseFloat(st(el).opacity) * opacity(el.parentElement));
      return o;
    };
    const range = document.createRange();
    // The painted rectangles of an element's own text (its direct text nodes), one per line fragment, clipped.
    function ownText(el) {
      const out = [], clip = clipInside(el);
      for (const n of el.childNodes) {
        if (n.nodeType !== 3 || !n.textContent.trim()) continue;
        range.selectNodeContents(n);
        for (const q of range.getClientRects()) {
          const c = meet({ l: q.left, t: q.top, r: q.right, b: q.bottom }, clip);
          if (c.r - c.l >= 1 && c.b - c.t >= 1) out.push(c);
        }
      }
      return out;
    }
    const paints = new Map(), painted = el => {
      let v = paints.get(el);
      if (v !== undefined) return v;
      const s = st(el);
      v = (color(s.webkitTextFillColor).a > 0 || /text/.test(s.backgroundClip + s.webkitBackgroundClip)) && opacity(el) >= 0.15 && !srOnly(el);
      paints.set(el, v);
      return v;
    };
    const textEls = els.filter(el => !SKIP.has(el.tagName) && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()));

    // ── overlapping text ──
    {
      const items = [];
      const lineHigh = new Set();
      textEls.forEach((el, i) => {
        if (!painted(el)) return;
        const fs = parseFloat(st(el).fontSize);
        const rs = ownText(el);
        for (const q of rs) items.push({ ...q, i, fs, h: q.b - q.t });
        // lines of one element on top of each other: only through a line-height far below the font size
        const lh = parseFloat(st(el).lineHeight);
        if (lh < fs * 0.75 && rs.some(q => rs.some(p => p.t >= q.b - (q.b - q.t) * 0.8 && p.t < q.b && Math.min(p.r, q.r) - Math.max(p.l, q.l) > 3))) lineHigh.add(el);
      });
      for (const el of lineHigh) add('warning', 'overlap', el, `its lines of text overlap each other: line-height ${px(parseFloat(st(el).lineHeight))}px is far below the font size ${px(parseFloat(st(el).fontSize))}px (use line-height: 1.1 or more)`);
      // sort and sweep: by top, keeping the rectangles that still reach below the current one's top
      items.sort((a, b) => a.t - b.t);
      const pairs = new Map(), active = [];
      for (const x of items) {
        for (let k = active.length - 1; k >= 0; k--) if (active[k].b <= x.t) active.splice(k, 1);
        for (const y of active) {
          if (y.i === x.i) continue;
          const w = Math.min(x.r, y.r) - Math.max(x.l, y.l), h = Math.min(x.b, y.b) - Math.max(x.t, y.t);
          // a real intersection: not touching edges, not the slight overlap of line boxes with a tight line-height
          if (w < Math.max(3, 0.25 * Math.min(x.fs, y.fs)) || h < Math.max(3, 0.4 * Math.min(x.h, y.h))) continue;
          const key = x.i < y.i ? `${x.i} ${y.i}` : `${y.i} ${x.i}`, p = pairs.get(key);
          if (!p || w * h > p.w * p.h) pairs.set(key, { a: Math.min(x.i, y.i), b: Math.max(x.i, y.i), w, h, x: (Math.max(x.l, y.l) + Math.min(x.r, y.r)) / 2, y: (Math.max(x.t, y.t) + Math.min(x.b, y.b)) / 2 });
        }
        active.push(x);
      }
      const opaque = e => { const s = st(e); return /^(IMG|VIDEO|CANVAS|IFRAME|svg)$/.test(e.tagName) || color(s.backgroundColor).a >= 0.5 || s.backgroundImage !== 'none' || s.backdropFilter !== 'none'; };
      const layered = (e, top) => { for (; e && e !== top; e = e.parentElement) { const s = st(e); if (s.position !== 'static' || s.transform !== 'none' || s.float !== 'none' || s.zIndex !== 'auto') return true; } return false; };
      // Covered, not overlapping: an opaque layer (a fixed bar, a badge, a menu) lies between the two texts in paint
      // order, so only one of them shows. On screen, hit testing gives the paint order; below the fold, an opaque
      // positioned box on either side that covers the spot counts as covering.
      function covered(A, B, x, y) {
        let top = A.parentElement; while (top && !top.contains(B)) top = top.parentElement;
        const side = e => e.contains(A) && !e.contains(B) ? 'A' : e.contains(B) && !e.contains(A) ? 'B' : e.contains(A) ? 'both' : 'other';
        if (x >= 0 && y >= 0 && x < vw && y < vh) {
          let upper = null, cover = false;
          for (const e of document.elementsFromPoint(x, y)) {
            const s = side(e);
            if (s === 'both') break;
            if (upper && s !== 'other' && s !== upper) return cover;
            if (!upper && (s === 'A' || s === 'B')) upper = s;
            if (opaque(e)) cover = true;
            if (cover && !upper) return true; // something unrelated covers both
          }
        }
        for (const [from, other] of [[A, B], [B, A]])
          for (let e = from; e && e !== top && !e.contains(other); e = e.parentElement) {
            const r = box(e);
            if (opaque(e) && layered(e, top) && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
          }
        return false;
      }
      const byEl = new Map();
      for (const p of pairs.values()) {
        const A = textEls[p.a], B = textEls[p.b];
        if (A.contains(B) || B.contains(A) || covered(A, B, p.x, p.y)) continue;
        const list = byEl.get(B) ?? byEl.set(B, []).get(B);
        list.push({ other: A, ...p });
      }
      for (const [el, list] of byEl) {
        list.sort((a, b) => b.w * b.h - a.w * a.h);
        const p = list[0], more = list.length - 1;
        add('warning', 'overlap', el, `its text is painted over the text of ${short(p.other)} (${px(p.w)}×${px(p.h)}px)${more ? ` and of ${more} other element${more > 1 ? 's' : ''}` : ''}: check fixed heights, negative margins and absolute positioning`);
      }
    }

    // ── content poking out of its box ──
    {
      const reported = new Set(findings.filter(f => f.code === 'overflow' || f.code === 'clipped').map(f => f.selector));
      const edgeColor = (w, style, c) => parseFloat(w) >= 1 && style !== 'none' && style !== 'hidden' && color(c).a > 0.1;
      // The sides of el that show an edge: all four for a background that differs from what is behind it, a
      // background image or a shadow; otherwise the sides with a border.
      function edges(el) {
        const s = st(el);
        let fill = s.backgroundImage !== 'none' || s.boxShadow !== 'none';
        const c = color(s.backgroundColor);
        if (!fill && c.a > 0.05) {
          const back = el.parentElement && behind(el.parentElement);
          if (!back) fill = c.a >= 0.5;
          else { const mix = blend(c, back); fill = Math.max(Math.abs(mix.r - back.r), Math.abs(mix.g - back.g), Math.abs(mix.b - back.b)) >= 10; }
        }
        const side = k => fill || edgeColor(s[`border${k}Width`], s[`border${k}Style`], s[`border${k}Color`]);
        return { left: side('Left'), top: side('Top'), right: side('Right'), bottom: side('Bottom') };
      }
      // The in-flow content of an element as painted, without its own box: the boxes of its children and the line
      // boxes of its text, and theirs in turn. Not counted: positioned, transformed or offset descendants (badges,
      // close buttons, dropdowns, things moved on purpose), a side a negative margin pulls a child out on, the content
      // of a child that clips or scrolls, and what is not painted. For each side, the element that reaches furthest
      // (by) and whether that is its text (text).
      const ext = new Map(), SIDES = ['left', 'top', 'right', 'bottom'];
      function extent(el) {
        let e = ext.get(el);
        if (e) return e;
        e = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity, by: {}, text: {} };
        ext.set(el, e);
        const further = (k, v) => k === 'left' || k === 'top' ? v < e[k] : v > e[k];
        const grow = (q, who, keep, text) => { for (const k of SIDES) if (keep[k] && further(k, q[k])) { e[k] = q[k]; e.by[k] = who; e.text[k] = text; } };
        const all4 = { left: true, top: true, right: true, bottom: true };
        const s0 = st(el), lh = parseFloat(s0.lineHeight);
        for (const n of el.childNodes) {
          if (n.nodeType === 3) {
            if (!n.textContent.trim() || !painted(el)) continue;
            range.selectNodeContents(n);
            for (const q of range.getClientRects()) {
              if (q.width < 1) continue;
              // the line box, not the font's content area, which sticks out of it whenever line-height is below ~1.2
              const pad = lh < q.height ? (q.height - lh) / 2 : 0;
              grow({ left: q.left, right: q.right, top: q.top + pad, bottom: q.bottom - pad }, el, all4, true);
            }
            continue;
          }
          if (n.nodeType !== 1 || SKIP.has(n.tagName) && n.localName !== 'svg' && !REPLACED.test(n.tagName)) continue;
          const s = st(n);
          if (s.display === 'none' || s.position === 'absolute' || s.position === 'fixed' || s.position === 'sticky') continue;
          if (s.transform !== 'none' || s.translate !== 'none' || s.rotate !== 'none' || s.scale !== 'none' || s.offsetPath !== 'none') continue;
          if (s.position === 'relative' && ['top', 'right', 'bottom', 'left'].some(k => s[k] !== 'auto' && parseFloat(s[k]) !== 0)) continue;
          // not painted: hidden, transparent, clipped away (sr-only), or the content of a closed <details>
          if (s.visibility !== 'visible' || s.opacity === '0' || s.clipPath !== 'none' || s.clip !== 'auto' || !n.checkVisibility()) continue;
          const keep = { left: parseFloat(s.marginLeft) >= 0, top: parseFloat(s.marginTop) >= 0, right: parseFloat(s.marginRight) >= 0, bottom: parseFloat(s.marginBottom) >= 0 };
          if (s.display !== 'contents' && !isInline(n)) {
            const r = box(n);
            if (r.width > 0 && r.height > 0) grow(r, n, keep, false);
          }
          if (s.display === 'contents' || (s.overflowX === 'visible' && s.overflowY === 'visible' && !REPLACED.test(n.tagName) && n.localName !== 'svg')) {
            const x = extent(n);
            for (const k of SIDES) if (x.by[k] && keep[k] && further(k, x[k])) { e[k] = x[k]; e.by[k] = x.by[k]; e.text[k] = x.text[k]; }
          }
        }
        return e;
      }
      const found = [];
      for (const el of els) {
        const s = st(el);
        if (!el.firstChild || el === document.body || el === document.documentElement || el === scope || s.display === 'inline' || s.display === 'contents' || REPLACED.test(el.tagName) || SKIP.has(el.tagName)) continue;
        if (s.overflowX !== 'visible' && s.overflowY !== 'visible') continue;
        const ed = edges(el);
        if (!ed.left && !ed.top && !ed.right && !ed.bottom) continue;
        const e = extent(el), r = box(el), clip = clipInside(el);
        const out = {
          left: s.overflowX === 'visible' && ed.left ? r.left - Math.max(e.left, clip.l) : 0,
          right: s.overflowX === 'visible' && ed.right ? Math.min(e.right, clip.r) - r.right : 0,
          top: s.overflowY === 'visible' && ed.top ? r.top - Math.max(e.top, clip.t) : 0,
          bottom: s.overflowY === 'visible' && ed.bottom ? Math.min(e.bottom, clip.b) - r.bottom : 0,
        };
        let worst = null;
        for (const k of ['right', 'bottom', 'left', 'top']) {
          const who = e.by[k];
          // text rectangles carry glyph side bearings and italics: give them a bit more room than boxes
          if (!who || out[k] < (e.text[k] ? 3 : 2)) continue;
          if (!worst || out[k] > worst.px) worst = { side: k, px: out[k], who, text: e.text[k] };
        }
        if (worst) found.push({ el, ...worst });
      }
      for (const f of found) {
        // the innermost box the same element pokes out of; and nothing the overflow or clipped check reported
        if (found.some(g => g !== f && g.who === f.who && f.el.contains(g.el))) continue;
        let dup = reported.has(sel(f.el));
        for (let e = f.who; !dup && e && e !== f.el; e = e.parentElement) dup = reported.has(sel(e));
        if (dup) continue;
        const what = f.who === f.el ? 'its own text' : `${f.text ? 'the text of ' : ''}${short(f.who)}`;
        const fix = !f.text && st(f.who).float !== 'none' ? 'a float the box does not contain: display: flow-root on the box'
          : f.side === 'top' || f.side === 'bottom' ? 'a fixed height? use min-height'
          : f.text ? 'a long word or URL? overflow-wrap: anywhere breaks it' : 'a child wider than the box: max-width: 100%, or min-width: 0 on flex and grid items';
        add('warning', 'spill', f.el, `${what} pokes out of its ${f.side} edge by ${px(f.px)}px, over its border or background (overflow is visible): ${fix}`);
      }
    }

    // ── squeezed text ──
    {
      // A text block shrunk to a sliver: one or two words per line (1.75 on average at most), or words broken in the middle, in a box a few
      // characters wide. The words and lines of its inline content (text in block children is theirs).
      function lines(el) {
        let text = '', brs = 0;
        const rs = [];
        const walk = p => {
          for (const n of p.childNodes) {
            if (n.nodeType === 3) {
              text += n.textContent;
              if (!n.textContent.trim()) continue;
              range.selectNodeContents(n);
              for (const q of range.getClientRects()) if (q.width >= 1) rs.push(q);
            } else if (n.nodeType === 1) {
              if (n.localName === 'br') { brs++; text += ' '; }
              else if (isInline(n) && !SKIP.has(n.tagName)) walk(n);
              else text += ' ';
            }
          }
        };
        walk(el);
        if (/pre|break-spaces/.test(st(el).whiteSpace)) brs += (text.trim().match(/\n/g) ?? []).length;
        rs.sort((a, b) => (a.top + a.bottom) - (b.top + b.bottom));
        let count = 0, last = -Infinity;
        for (const q of rs) { const mid = (q.top + q.bottom) / 2; if (mid - last > q.height * 0.5) { count++; last = mid; } }
        const words = text.trim().split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w));
        return { count: count - brs, words: words.length, pieces: words.flatMap(w => w.split(/(?<=[-‐/])/)).length, text: text.trim().replace(/\s+/g, ' ') };
      }
      // Only a box the layout squeezed counts: a flex or grid item, a table cell or a shrink-to-fit positioned box (el, or
      // an ancestor up to three levels up that is hardly wider). A block given a narrow width is narrow by design.
      function squeezer(el) {
        const w = box(el).width;
        for (let item = el, k = 0; item && k < 4 && box(item).width <= w + 48; item = item.parentElement, k++) {
          const s = st(item);
          if (s.display === 'table-cell' || s.position === 'absolute' || s.position === 'fixed') return item;
          if (item.parentElement && /flex|grid/.test(st(item.parentElement).display)) return item;
        }
        return null;
      }
      // What squeezes it, when it is cheap to tell: a shrinking flex item next to siblings that do not shrink, a grid
      // column, a table column, the room a positioned box has left. Text that may break anywhere has no minimum width.
      function why(el, item, broken) {
        const anywhere = broken && (st(el).overflowWrap === 'anywhere' || st(el).wordBreak === 'break-all')
          ? ` Its text may break anywhere (${st(el).wordBreak === 'break-all' ? 'word-break: break-all' : 'overflow-wrap: anywhere'}), so it has no minimum width.` : '';
        const ps = item.parentElement && st(item.parentElement);
        const s = st(item);
        if (s.display === 'table-cell') return `${anywhere} It sits in a table column ${px(box(item).width)}px wide: give the column a min-width, or the text white-space: nowrap.`;
        if (s.position === 'absolute' || s.position === 'fixed') return `${anywhere} It is positioned (${s.position}) and shrinks to the room left beside its position: give it a width or min-width.`;
        if (!ps) return anywhere;
        const p = item.parentElement;
        if (/flex/.test(ps.display) && ps.flexDirection.startsWith('row') && parseFloat(st(item).flexShrink) > 0) {
          const rigid = [...p.children].filter(c => c !== item && visible(c) && (parseFloat(st(c).flexShrink) === 0 || st(c).whiteSpace === 'nowrap'));
          const name = item === el ? 'It is a flex item' : `It sits in a flex item (${short(item)})`;
          return rigid.length ? `${anywhere} ${name} that shrinks (flex-shrink: ${st(item).flexShrink}) next to ${rigid.length > 1 ? `${rigid.length} siblings` : 'a sibling'} that do${rigid.length > 1 ? '' : 'es'} not (${rigid.slice(0, 2).map(short).join(', ')}): give it a min-width, let the row wrap, or let the others shrink.`
            : `${anywhere} ${name} in a row too narrow for it: give it a min-width or let the row wrap (flex-wrap: wrap).`;
        }
        if (/grid/.test(ps.display)) return `${anywhere} It sits in a grid column ${px(box(item).width)}px wide (grid-template-columns: ${ps.gridTemplateColumns.slice(0, 60)}): give that column a minimum (minmax(10rem, 1fr)).`;
        return anywhere;
      }
      for (const el of els) {
        const s = st(el);
        if (s.display === 'inline' || s.display === 'contents' || SKIP.has(el.tagName) || REPLACED.test(el.tagName)) continue;
        const fs = parseFloat(s.fontSize), w = box(el).width;
        if (w >= Math.min(8 * fs, 200) || !s.writingMode.startsWith('horizontal') || srOnly(el) || !painted(el)) continue;
        // in a flex or grid container each run of text is an item of its own, often stacked on purpose
        if (/flex|grid/.test(s.display) && [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).length > 1) continue;
        const { count, words, pieces, text } = lines(el);
        const item = count >= 3 && squeezer(el);
        if (!item) continue;
        // a table header of a few words stacked in a narrow column is normal; hyphens: auto breaks words on purpose
        const perWord = words >= (st(item).display === 'table-cell' ? 6 : 4) && count >= Math.max(4, words / 1.75);
        // (Chinese, Japanese, Korean and Thai wrap between any two characters; that is not breaking a word)
        const broken = count > pieces && w < (s.hyphens === 'auto' ? 3 : 6) * fs && !/[\u0e00-\u0e7f\u3000-\u9fff\uac00-\ud7af\uf900-\ufaff]/.test(text);
        if (!perWord && !broken) continue;
        add('warning', 'squeezed', el, `squeezed to ${px(w)}px wide: ${words} word${words > 1 ? 's' : ''} on ${count} lines${broken ? ', broken mid-word' : ''}.${why(el, item, broken)}`);
      }
      // a flex or grid item with text, shrunk to no width at all (not in els, which has only elements with a box)
      for (const p of els) {
        if (!/flex|grid/.test(st(p).display)) continue;
        for (const c of p.children) {
          const r = box(c), s = st(c);
          if (r.width >= 1 || SKIP.has(c.tagName) || s.position === 'absolute' || s.position === 'fixed' || !/[\p{L}\p{N}]/u.test(c.textContent)) continue;
          if (!c.checkVisibility({ opacityProperty: true, visibilityProperty: true }) || s.overflowX !== 'visible' || s.clipPath !== 'none' || s.clip !== 'auto' || c.closest('[data-tm-sr-only]')) continue;
          const { count, words } = lines(c);
          if (count < 2) continue;
          add('warning', 'squeezed', c, `squeezed to 0px wide: ${words} word${words > 1 ? 's' : ''} on ${count} lines, running out over the elements next to it.${why(c, c)}`);
        }
      }
    }

    // ── distorted and upscaled images ──
    for (const img of els) {
      if (img.localName !== 'img' || !img.complete || !img.naturalWidth || !img.naturalHeight) continue;
      const s = st(img), r = box(img);
      const w = r.width - parseFloat(s.borderLeftWidth) - parseFloat(s.borderRightWidth) - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
      const h = r.height - parseFloat(s.borderTopWidth) - parseFloat(s.borderBottomWidth) - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom);
      if (w < 1 || h < 1) continue;
      const url = img.currentSrc, svg = /^data:image\/svg\+xml|\.svg([?#]|$)/i.test(url);
      let nw = img.naturalWidth, nh = img.naturalHeight;
      if (svg) {
        // An SVG with a viewBox keeps its shape inside a box of another shape; its natural size can be a placeholder (300×150).
        const shape = svgShape.get(url);
        if (!shape?.stretches) continue;
        if (shape.ratio) nh = nw / shape.ratio;
      }
      if (s.objectFit === 'fill') {
        const shown = w / h, own = nw / nh;
        // a relative and an absolute threshold: a few px of rounding on a small icon is not a distortion
        const off = Math.max(Math.abs(h - w / own), Math.abs(w - h * own));
        if (Math.abs(Math.log(shown / own)) > Math.log(1.05) && off >= 3)
          add('warning', 'distorted', img, `image is stretched: shown at ${px(w)}×${px(h)} (${shown.toFixed(2)}:1), its own shape is ${svg ? '' : `${nw}×${nh}, `}${own.toFixed(2)}:1 (add object-fit: cover, or set only one of width and height and leave the other auto)`);
      }
      // pixel art, and a blurred low-resolution placeholder, are meant to be shown large
      if (svg || /pixelated|crisp-edges/.test(s.imageRendering) || /blur/.test(s.filter) || nw < 8 || nh < 8) continue;
      const fit = s.objectFit, sx = w / nw, sy = h / nh;
      const scale = fit === 'cover' ? Math.max(sx, sy) : fit === 'contain' ? Math.min(sx, sy) : fit === 'none' ? 1 : fit === 'scale-down' ? Math.min(1, sx, sy) : Math.max(sx, sy);
      if (scale >= 1.5 && Math.max(w - nw, h - nh) >= 40)
        add('info', 'upscaled', img, `image is shown ${scale.toFixed(1)}× its natural size (${nw}×${nh} shown at ${px(w)}×${px(h)}), so it looks blurry: use a larger file or srcset`);
    }
  }

  // ── states: the page, then every dialog and every closed popover, opened one at a time ──
  const overlays = () => [
    ...[...document.querySelectorAll('dialog:not([open])')].map(el => ({ kind: 'dialog', el })),
    ...[...document.querySelectorAll('[popover]')].filter(p => !p.matches(':popover-open') && !p.checkVisibility()).map(el => ({ kind: 'popover', el })),
  ];
  // Overlays are opened the way a user opens them: by clicking a visible opener (commandfor/command,
  // popovertarget), so the app sets its state first (e.g. which contact a detail dialog shows). An opener
  // inside another closed overlay opens that one first. Only when there is no usable opener is the overlay
  // opened directly, and the report says so.
  const isOpen = el => el.matches('dialog') ? el.open : el.matches(':popover-open');
  const openersOf = el => {
    if (!el.id) return [];
    const id = CSS.escape(el.id);
    return [...document.querySelectorAll(el.matches('dialog')
      ? `[commandfor="${id}"]:is([command="show-modal"], [command="show"])`
      : `[popovertarget="${id}"]:not([popovertargetaction="hide"]), [commandfor="${id}"]:is([command="toggle-popover"], [command="show-popover"])`)];
  };
  // A user can reach an opener that renders and is on the page: not moved off it (an off-canvas drawer translated
  // past the edge) or outside an ancestor that clips without scrolling. One below the fold counts (the page scrolls).
  const reachable = op => {
    if (!op.checkVisibility()) return false;
    const r = R(op), page = document.scrollingElement;
    if (r.width < 1 || r.height < 1 || r.right <= 0 || r.left >= innerWidth) return false;
    if (r.bottom + page.scrollTop <= 0 || r.top + page.scrollTop >= page.scrollHeight) return false;
    for (let a = op.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a), b = R(a);
      if (/hidden|clip/.test(cs.overflowX) && (r.right <= b.left || r.left >= b.right)) return false;
      if (/hidden|clip/.test(cs.overflowY) && (r.bottom <= b.top || r.top >= b.bottom)) return false;
    }
    return true;
  };
  let list = [], current = null, stack = [];

  async function openOverlay(el, depth) {
    let clicked = 0; // openers that were clicked and did not open it (a submit button in a form, a handler that prevents it)
    for (const op of openersOf(el)) {
      if (!reachable(op)) {
        const outer = op.parentElement?.closest('dialog:not([open]), [popover]:not(:popover-open)');
        if (!outer || depth >= 3 || !(await openOverlay(outer, depth + 1))) continue;
        if (!reachable(op)) continue;
      }
      op.click();
      await frames(); await sleep(opts.overlayWait);
      if (isOpen(el)) { stack.push(el); return { via: op }; }
      clicked++;
    }
    if (depth > 0) return null; // only the inspected overlay itself may be opened directly
    try { el.matches('dialog') ? el.showModal() : el.showPopover(); } catch { return null; }
    await frames(); await sleep(opts.overlayWait);
    if (!isOpen(el)) return null;
    stack.push(el);
    return { direct: true, openers: openersOf(el).length, clicked };
  }

  let prepared = null;
  window.__tsi = {
    /** Runs what the checks need to wait for. Call it once before the first check(); calling it again is free. */
    prepare() { return prepared ??= Promise.all(prepares.map(f => f().catch(() => {}))).then(() => {}); },
    list() { list = opts.overlays ? overlays() : []; return list.length; },
    check(state) {
      findings = [];
      if (current) {
        scope = current.el;
        const box = R(current.el);
        if (box.width < 1 || box.height < 1) {
          // e.g. a dialog inside a pane that is hidden at this width: nothing to check
          findings.push({ state, severity: 'info', code: 'state', selector: sel(current.el).split(' "')[0], message: 'not rendered at this width (it sits inside a hidden part of the page)' });
          scope = document.body;
          return findings;
        }
        // a popover opened without its button has no anchor, so its position says nothing
        if (!(current.how.direct && current.kind === 'popover')) checkOverlay(state, current.el);
        else if (current.el.scrollWidth > current.el.clientWidth + 1) checkOverlay(state, current.el);
        if (current.how.via) findings.push({ state, severity: 'info', code: 'opened', selector: sel(current.how.via), message: 'opened by clicking this' });
        if (current.how.direct) {
          const text = (current.el.innerText ?? '').replace(/\s+/g, ' ').trim();
          const why = current.how.clicked ? 'clicking its button did not open it'
            : current.how.openers ? 'its button is hidden or off-screen at this width' : 'no button opens it via commandfor or popovertarget';
          if (text.length < 25) findings.push({ state, severity: 'warning', code: 'state', selector: sel(current.el).split(' "')[0],
            message: `opened directly because ${why}, and it is nearly empty: its content probably depends on app state, so this check says little about it` });
          else findings.push({ state, severity: 'info', code: 'state', selector: sel(current.el).split(' "')[0], message: `opened directly because ${why}` });
        }
      }
      check(state);
      scope = document.body;
      return findings;
    },
    async open(i) {
      const o = list[i];
      if (isOpen(o.el)) return null; // opened as part of an earlier chain
      stack = [];
      const how = await openOverlay(o.el, 0);
      if (!how) { for (const el of stack.reverse()) el.matches('dialog') ? el.close() : el.hidePopover(); stack = []; return null; }
      current = { ...o, how };
      return `${o.kind} ${sel(o.el).split(' "')[0]}`;
    },
    // The overlays that are open right now (a user opened them), each checked as its own state, the way open(i) does.
    checkOpen() {
      const out = [];
      for (const el of document.querySelectorAll('dialog[open], [popover]:popover-open')) {
        const kind = el.matches('dialog') ? 'dialog' : 'popover', state = `${kind} ${sel(el).split(' "')[0]}`;
        current = { el, kind, how: {} };
        out.push({ state, findings: window.__tsi.check(state) });
      }
      current = null; scope = document.body;
      return out;
    },
    async close() {
      for (const el of stack.reverse()) { try { el.matches('dialog') ? el.close() : el.hidePopover(); } catch {} }
      stack = []; current = null;
      await frames();
    },
  };
}
