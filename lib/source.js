// Dev only: stamps every HTML element in a markup file with data-tm-src="file:line", so the rendered-page audit
// (the Vite plugin's inspect option) can say where in your source a finding comes from. Only plain, known HTML
// elements are stamped (never components, custom elements or <svelte:…>), and only where an attribute can go.
import { extname } from 'node:path';
import { blank, scanTags } from './check.js';

// elements that render something: no html/head/meta/link/script/style, which have nothing to audit
const HTML = new Set(`a abbr address article aside audio b bdi bdo blockquote body button canvas caption cite code col colgroup data datalist dd del details
dfn dialog div dl dt em fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr i iframe img input ins kbd label legend li main mark menu
meter nav object ol optgroup option output p picture pre progress q rp rt ruby s samp search section select small source span strong sub summary sup table
tbody td template textarea tfoot th thead time tr track u ul var video wbr`.split(/\s+/));
HTML.delete('template');

/**
 * `text` with ` data-tm-src="label:line"` added to each plain HTML element's opening tag.
 * label: what to show as the file (a path relative to the project).
 */
export function stampSources(text, file, label) {
  const ext = extname(file);
  const t = blank(text, ext === '.jsx' || ext === '.tsx');
  let from = 0, to = t.length;
  if (ext === '.vue') { // only the template block is markup
    from = t.search(/<template\b/);
    to = t.lastIndexOf('</template');
    if (from < 0 || to < 0) return text;
  }
  const edits = [];
  let line = 1, seen = 0;
  for (const tag of scanTags(t)) {
    if (tag.closing || tag.start < from || tag.start > to || !HTML.has(tag.name)) continue;
    if (tag.attrs.some(a => a.raw === 'data-tm-src')) continue;
    for (let i = t.indexOf('\n', seen); i >= 0 && i < tag.start; i = t.indexOf('\n', i + 1)) { line++; seen = i + 1; }
    edits.push({ at: tag.start + 1 + tag.name.length, text: ` data-tm-src="${label.replace(/"/g, '')}:${line}"` });
  }
  let out = '', last = 0;
  for (const e of edits) { out += text.slice(last, e.at) + e.text; last = e.at; }
  return out + text.slice(last);
}
