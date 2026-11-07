// Runs inside the page (serialized with Function.prototype.toString). Returns findings:
// { state, severity: 'error'|'warning'|'info', code, selector, message }
export async function audit(opts) {
  const findings = [];
  const vw = innerWidth, vh = innerHeight;
  const cs = el => getComputedStyle(el);
  const R = el => el.getBoundingClientRect();
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const frames = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

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
    s += [...el.attributes].filter(a => a.name.startsWith('data-') && !/^data-(sn|v-|astro)/.test(a.name)).slice(0, 2)
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

  // ── visibility ──
  let scope = document.body; // a modal dialog limits checks to itself
  function visible(el) {
    if (!scope.contains(el)) return false;
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    const r = R(el);
    return r.width > 0 && r.height > 0;
  }
  const all = () => [...scope.querySelectorAll('*')].filter(e => !['SCRIPT', 'STYLE', 'TEMPLATE', 'svg', 'path'].includes(e.tagName) && !e.closest('svg') && visible(e));

  // ── checks ──
  const INTERACTIVE = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=switch], [role=checkbox], [role=tab], [role=menuitem], [tabindex]:not([tabindex="-1"])';

  function check(state) {
    const add = (severity, code, el, message) => findings.push({ state, severity, code, selector: el ? sel(el) : '', message });
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
      if (clipsX && el.scrollWidth > el.clientWidth + 1 && s.textOverflow !== 'ellipsis')
        add('warning', 'clipped', el, 'text is cut off without an ellipsis');
    }

    // controls: names, being covered, tap target size
    for (const el of els.filter(e => e.matches(INTERACTIVE))) {
      const r = R(el);
      const isField = el.matches('input, select, textarea');
      const name = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title')
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
      if (vw < 768 && (r.width < 24 || r.height < 24) && cs(el).display !== 'inline')
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
  }

  function checkOverlay(state, el) {
    const r = R(el);
    if (r.left <= 1 && r.top <= 1 && r.width < vw - 2 && r.height < vh - 2)
      findings.push({ state, severity: 'error', code: 'position', selector: sel(el), message: 'sits in the top-left corner (missing margin: auto or anchor position?)' });
    if (r.right > vw + 1 || r.bottom > vh + 1 || r.left < -1 || r.top < -1)
      findings.push({ state, severity: 'error', code: 'position', selector: sel(el), message: `extends outside the viewport (${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)})` });
  }

  // ── states: the page, then every dialog and every closed popover opened in turn ──
  check('page');
  if (opts.overlays) {
    for (const d of document.querySelectorAll('dialog:not([open])')) {
      try { d.showModal(); } catch { continue; }
      await frames(); await sleep(opts.overlayWait);
      scope = d;
      const state = `dialog ${sel(d).split(' "')[0]}`;
      checkOverlay(state, d); check(state);
      scope = document.body;
      d.close(); await frames();
    }
    for (const p of document.querySelectorAll('[popover]')) {
      if (p.matches(':popover-open') || p.checkVisibility()) continue; // already shown (e.g. a rail on wide screens)
      const invoker = document.querySelector(`[popovertarget="${CSS.escape(p.id)}"], [commandfor="${CSS.escape(p.id)}"][command$="popover"]`);
      try { invoker && invoker.checkVisibility() ? invoker.click() : p.showPopover(invoker ? { source: invoker } : undefined); } catch { continue; }
      await frames(); await sleep(opts.overlayWait);
      if (!p.matches(':popover-open')) continue;
      const state = `popover ${sel(p).split(' "')[0]}${invoker && !invoker.checkVisibility() ? ' (its button is hidden at this width)' : ''}`;
      scope = p;
      checkOverlay(state, p); check(state);
      scope = document.body;
      p.hidePopover(); await frames();
    }
  }
  return findings;
}
