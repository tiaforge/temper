// Generated from vocab.json by scripts/gen.mjs. Do not edit.
// temper's data-* attributes and their allowed values, so values computed at runtime are type-checked
// like static ones are by `temper check`. Use a framework file (svelte, react, vue, astro, sinter),
// which plugs this into the framework's own element types.

/** The icon names temper ships. Any other string is accepted too (your own icons, Lucide via the Vite plugin). */
export type TemperIcon =
  | 'mail'
  | 'inbox'
  | 'send'
  | 'calendar'
  | 'calendar-plus'
  | 'clock'
  | 'users'
  | 'user'
  | 'user-plus'
  | 'search'
  | 'bell'
  | 'settings'
  | 'log-out'
  | 'log-in'
  | 'menu'
  | 'plus'
  | 'minus'
  | 'x'
  | 'check'
  | 'pencil'
  | 'trash-2'
  | 'share-2'
  | 'copy'
  | 'download'
  | 'upload'
  | 'paperclip'
  | 'link'
  | 'external-link'
  | 'star'
  | 'heart'
  | 'filter'
  | 'refresh-cw'
  | 'ellipsis'
  | 'ellipsis-vertical'
  | 'chevron-down'
  | 'chevron-up'
  | 'chevron-left'
  | 'chevron-right'
  | 'arrow-left'
  | 'arrow-right'
  | 'house'
  | 'info'
  | 'circle-alert'
  | 'triangle-alert'
  | 'circle-check'
  | 'eye'
  | 'eye-off'
  | 'lock'
  | 'map-pin'
  | 'phone'
  | 'archive'
  | 'folder'
  | 'file'
  | 'image'
  | 'sun'
  | 'moon';

/**
 * `Removes`: the value that removes an attribute besides null and undefined: false in sinter.
 * Svelte, React, Vue and Astro render false as data-x="false", which still matches [data-x], so it is not allowed
 * there: write `cond || null` (or `cond ? '' : null`) instead of a bare boolean.
 * `Empty`: a non-string value that renders the attribute without a value: true in sinter. Elsewhere true renders
 * "true", which is fine for boolean attributes but not a valid value for the others.
 */
export interface TemperAttributes<Removes = never, Empty = never> {
  /** Button style; leave it out for the solid main button. */
  'data-tm-variant'?: 'secondary' | 'outline' | 'ghost' | 'link' | 'item' | null | Removes;
  /** Color, independent of the style; for any other color use style="--tm-tone: …". */
  'data-tm-tone'?: 'accent' | 'neutral' | 'danger' | 'success' | 'warning' | 'info' | null | Removes;
  /** Control size relative to the current density. */
  'data-tm-size'?: 'sm' | 'md' | 'lg' | null | Removes;
  /** Icon by Lucide name; an empty button with it is a square icon-only button (needs aria-label). */
  'data-tm-icon'?: TemperIcon | (string & {}) | '' | Empty | null | Removes;
  /** Lays out the element's children (overrides its own display). */
  'data-tm-layout'?: 'stack' | 'row' | 'grid' | 'split' | 'center' | null | Removes;
  /** Exactly this many equal grid columns. */
  'data-tm-cols'?: '2' | '3' | '4' | '5' | '6' | '7' | 2 | 3 | 4 | 5 | 6 | 7 | null | Removes;
  /** Space between the children of a data-tm-layout element. */
  'data-tm-gap'?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | null | Removes;
  /** Padding inside the element, on all sides. */
  'data-tm-pad'?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | null | Removes;
  /** Cross-axis alignment of children (align-items). */
  'data-tm-align'?: 'start' | 'center' | 'end' | 'stretch' | null | Removes;
  /** Main-axis distribution of children (justify-content). */
  'data-tm-justify'?: 'start' | 'center' | 'end' | 'between' | null | Removes;
  /** Aligns this one child (e.g. data-tm-self="start" keeps a button in a stack from stretching). */
  'data-tm-self'?: 'start' | 'center' | 'end' | 'stretch' | null | Removes;
  /** Whether a row wraps onto more lines. */
  'data-tm-wrap'?: 'wrap' | 'none' | null | Removes;
  /** This child takes the remaining space in its row or stack. */
  'data-tm-grow'?: true | '' | null | Removes;
  /** Scroll container: sideways by default, "y" vertical (panes), "both". */
  'data-tm-scroll'?: 'y' | 'both' | '' | Empty | null | Removes;
  /** Reserves the scrollbar space: no sideways shift. */
  'data-tm-gutter'?: true | '' | null | Removes;
  /** Control height and padding for everything inside. */
  'data-tm-density'?: 'comfortable' | 'compact' | null | Removes;
  /** Forces light or dark mode. */
  'data-tm-theme'?: 'light' | 'dark' | null | Removes;
  /** Small status label (counts, tags, states). */
  'data-tm-badge'?: true | '' | null | Removes;
  /** Tinted message box. */
  'data-tm-callout'?: true | '' | null | Removes;
  /** Secondary text color. */
  'data-tm-muted'?: true | '' | null | Removes;
  /** Single line, cut off with an ellipsis. */
  'data-tm-truncate'?: true | '' | null | Removes;
  /** On the container of a long list: its rows far off screen skip layout and paint. */
  'data-tm-lazy'?: true | '' | null | Removes;
  /** Ellipsis after this many lines. */
  'data-tm-clamp'?: '2' | '3' | 2 | 3 | null | Removes;
  /** A colored bar on the start edge in the element's tone. */
  'data-tm-bar'?: true | '' | null | Removes;
  /** Hidden visually, still read by screen readers. */
  'data-tm-sr-only'?: true | '' | null | Removes;
  /** Shows dt/dd pairs as a two-column label/value grid. */
  'data-tm-pairs'?: true | '' | null | Removes;
  /** Radio group drawn as a segmented control (labels with radios). */
  'data-tm-segmented'?: true | '' | null | Removes;
  /** Small, muted label text (captions, group headings). */
  'data-tm-caption'?: true | '' | null | Removes;
  /** One bordered box; its children are rows separated by lines. */
  'data-tm-list'?: true | '' | null | Removes;
  /** A horizontal line with the element's text in the middle, e.g. */
  'data-tm-divider'?: true | '' | null | Removes;
  /** Round avatar with initials, or an <img> child that fills it. */
  'data-tm-avatar'?: true | '' | null | Removes;
  /** Makes the whole card clickable through this element. */
  'data-tm-stretch'?: true | '' | null | Removes;
  /** Sticks to the top or bottom of the nearest scroll container (header, toolbar, save bar). */
  'data-tm-sticky'?: 'top' | 'bottom' | null | Removes;
  /** Joins its children (buttons, fields) into one unit with shared borders. */
  'data-tm-join'?: true | '' | null | Removes;
  /** App shell (rail + main); data-tm-shell="fixed" fills the viewport and main scrolls inside. Needs app.css. */
  'data-tm-shell'?: 'fixed' | '' | Empty | null | Removes;
  /** Navigation rail next to <main>; with popover it is a drawer on narrow screens. Needs app.css. */
  'data-tm-rail'?: true | '' | null | Removes;
  /** Icon-only rail, set in the markup (e.g. Needs app.css. */
  'data-tm-collapsed'?: true | '' | null | Removes;
  /** Collapse toggle drawn as a chevron icon button. Needs app.css. */
  'data-tm-rail-collapse'?: true | '' | null | Removes;
  /** Hidden while the rail is collapsed (e.g. Needs app.css. */
  'data-tm-rail-label'?: true | '' | null | Removes;
  /** Floating action button fixed in the bottom-right corner. Needs app.css. */
  'data-tm-fab'?: true | '' | null | Removes;
  /** Shows the element only on narrow (< 48rem) or wide screens, or panes (data-tm-container). Needs app.css. */
  'data-tm-show'?: 'narrow' | 'wide' | null | Removes;
  /** A pane whose width data-tm-show inside follows, not the screen's. Needs app.css. */
  'data-tm-container'?: true | '' | null | Removes;
  /** Menu of buttons, links and checkbox labels; as a [popover] it opens under its button. Needs menu.css. */
  'data-tm-menu'?: true | '' | null | Removes;
  /** Wraps a field and its suggestion list (data-tm-menu, role="listbox"), which opens under it. Needs menu.css. */
  'data-tm-combo'?: true | '' | null | Removes;
  /** Toast region (one per page, role="status"); holds data-tm-toast children. Needs feedback.css. */
  'data-tm-toasts'?: true | '' | null | Removes;
  /** A toast inside data-tm-toasts; data-tm-tone colors its bar. Needs feedback.css. */
  'data-tm-toast'?: true | '' | null | Removes;
  /** Tooltip: the given text, or the aria-label when empty. Needs feedback.css. */
  'data-tm-tooltip'?: string | Empty | null | Removes;
  /** Number cell: right-aligned, tabular figures (on th and every td of the column). Needs table.css. */
  'data-tm-num'?: true | '' | null | Removes;
  /** Long-form text (Markdown, CMS, mail): spacing between blocks, reading width. Needs prose.css. */
  'data-tm-prose'?: true | '' | null | Removes;
  /** One field around an input and its icon, text (<span>€</span>) or end button. Needs forms.css. */
  'data-tm-field'?: true | '' | null | Removes;
  /** Dialog as a sheet sliding in from an edge: side panel (end, start) or bottom sheet. Needs sheet.css. */
  'data-tm-sheet'?: 'end' | 'start' | 'bottom' | 'narrow' | null | Removes;
  /** Drag handle button (grip, grab cursor); "quiet" shows on hover only. Needs drag.css. */
  'data-tm-handle'?: 'quiet' | '' | Empty | null | Removes;
  /** The row or card being moved: raised surface and shadow. Needs drag.css. */
  'data-tm-lifted'?: true | '' | null | Removes;
  /** Drop place while dragging: a line before or after the element, or an outline inside it. Needs drag.css. */
  'data-tm-drop'?: 'before' | 'after' | 'inside' | null | Removes;
  /** Background as a material: glass, gradient, mesh, or a wash at the top. Needs expressive.css. */
  'data-tm-surface'?: 'glass' | 'gradient' | 'mesh' | 'wash' | null | Removes;
  /** Faint film grain over the background. Needs expressive.css. */
  'data-tm-grain'?: true | '' | null | Removes;
  /** Brand-tinted shadow: raised or floating. Needs expressive.css. */
  'data-tm-elevation'?: 'raised' | 'floating' | null | Removes;
  /** Soft accent glow around the element. Needs expressive.css. */
  'data-tm-halo'?: true | '' | null | Removes;
  /** Display type: hero, xl, lg. Needs expressive.css. */
  'data-tm-display'?: 'hero' | 'xl' | 'lg' | null | Removes;
  /** Gradient text (gradient). Needs expressive.css. */
  'data-tm-ink'?: 'gradient' | null | Removes;
  /** A big number (stat tiles). Needs expressive.css. */
  'data-tm-figure'?: true | '' | null | Removes;
  /** Centered hero column with generous padding. Needs expressive.css. */
  'data-tm-hero'?: true | '' | null | Removes;
  /** Bento grid (with data-tm-layout="grid"); tiles take data-tm-span. Needs expressive.css. */
  'data-tm-bento'?: true | '' | null | Removes;
  /** Bento tile size: wide, tall, large, full. Needs expressive.css. */
  'data-tm-span'?: 'wide' | 'tall' | 'large' | 'full' | null | Removes;
  /** Display font pairing: editorial, grotesk. Needs expressive.css. */
  'data-tm-pairing'?: 'editorial' | 'grotesk' | null | Removes;
  /** Seeded gradient fill, 0–11. Needs expressive.css. */
  'data-tm-seed'?: '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | null | Removes;
}
