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
  function checkStyles(add) {}

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

    if (!current) { checkDocument(add); checkStyles(add); }
    checkGeometry(add, els);
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
  function checkGeometry(add, els) {}

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
    for (const op of openersOf(el)) {
      if (!reachable(op)) {
        const outer = op.parentElement?.closest('dialog:not([open]), [popover]:not(:popover-open)');
        if (!outer || depth >= 3 || !(await openOverlay(outer, depth + 1))) continue;
        if (!reachable(op)) continue;
      }
      op.click();
      await frames(); await sleep(opts.overlayWait);
      if (isOpen(el)) { stack.push(el); return { via: op }; }
    }
    if (depth > 0) return null; // only the inspected overlay itself may be opened directly
    try { el.matches('dialog') ? el.showModal() : el.showPopover(); } catch { return null; }
    await frames(); await sleep(opts.overlayWait);
    if (!isOpen(el)) return null;
    stack.push(el);
    return { direct: true, openers: openersOf(el).length };
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
          const why = current.how.openers ? 'its button is hidden or off-screen at this width' : 'no button opens it via commandfor or popovertarget';
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
