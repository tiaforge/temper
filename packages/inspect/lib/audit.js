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
  function checkDocument(add) {}

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
        // Without one, an <img> stretches it to the box.
        svgShape.set(u, svg.localName !== 'svg' ? null : ok ? { stretches: /^\s*none/.test(svg.getAttribute('preserveAspectRatio') ?? ''), ratio: vb[2] / vb[3] }
          : { stretches: true, ratio: null });
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
