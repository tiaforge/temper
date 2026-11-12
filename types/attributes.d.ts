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
  'data-variant'?: 'secondary' | 'outline' | 'ghost' | 'link' | 'item' | null | Removes;
  /** Color, independent of the style; for any other color use style="--tm-tone: …". */
  'data-tone'?: 'accent' | 'neutral' | 'danger' | 'success' | 'warning' | 'info' | null | Removes;
  /** Control size relative to the current density. */
  'data-size'?: 'sm' | 'md' | 'lg' | null | Removes;
  /** Icon by Lucide name; an empty button with it is a square icon-only button (needs aria-label). */
  'data-icon'?: TemperIcon | (string & {}) | '' | Empty | null | Removes;
  /** Lays out the element's children (overrides its own display). */
  'data-layout'?: 'stack' | 'row' | 'grid' | 'split' | 'center' | null | Removes;
  /** Exactly this many equal grid columns. */
  'data-cols'?: '2' | '3' | '4' | '5' | '6' | '7' | 2 | 3 | 4 | 5 | 6 | 7 | null | Removes;
  /** Space between the children of a data-layout element. */
  'data-gap'?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | null | Removes;
  /** Padding inside the element, on all sides. */
  'data-pad'?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | null | Removes;
  /** Cross-axis alignment of children (align-items). */
  'data-align'?: 'start' | 'center' | 'end' | 'stretch' | null | Removes;
  /** Main-axis distribution of children (justify-content). */
  'data-justify'?: 'start' | 'center' | 'end' | 'between' | null | Removes;
  /** Aligns this one child (e.g. data-self="start" keeps a button in a stack from stretching). */
  'data-self'?: 'start' | 'center' | 'end' | 'stretch' | null | Removes;
  /** Whether a row wraps onto more lines. */
  'data-wrap'?: 'wrap' | 'none' | null | Removes;
  /** This child takes the remaining space in its row or stack. */
  'data-grow'?: true | '' | null | Removes;
  /** Scroll container: sideways by default, "y" vertical (panes), "both". */
  'data-scroll'?: 'y' | 'both' | '' | Empty | null | Removes;
  /** Control height and padding for everything inside. */
  'data-density'?: 'comfortable' | 'compact' | null | Removes;
  /** Forces light or dark mode. */
  'data-theme'?: 'light' | 'dark' | null | Removes;
  /** Small status label (counts, tags, states). */
  'data-badge'?: true | '' | null | Removes;
  /** Tinted message box. */
  'data-callout'?: true | '' | null | Removes;
  /** Secondary text color. */
  'data-muted'?: true | '' | null | Removes;
  /** Single line, cut off with an ellipsis. */
  'data-truncate'?: true | '' | null | Removes;
  /** On the container of a long list: its rows far off screen skip layout and paint. */
  'data-lazy'?: true | '' | null | Removes;
  /** Ellipsis after this many lines. */
  'data-clamp'?: '2' | '3' | 2 | 3 | null | Removes;
  /** A colored bar on the start edge in the element's tone. */
  'data-bar'?: true | '' | null | Removes;
  /** Hidden visually, still read by screen readers. */
  'data-sr-only'?: true | '' | null | Removes;
  /** Shows dt/dd pairs as a two-column label/value grid. */
  'data-pairs'?: true | '' | null | Removes;
  /** Radio group drawn as a segmented control (labels with radios). */
  'data-segmented'?: true | '' | null | Removes;
  /** Small, muted label text (captions, group headings). */
  'data-caption'?: true | '' | null | Removes;
  /** One bordered box; its children are rows separated by lines. */
  'data-list'?: true | '' | null | Removes;
  /** A horizontal line with the element's text in the middle, e.g. */
  'data-divider'?: true | '' | null | Removes;
  /** Round avatar with initials, or an <img> child that fills it. */
  'data-avatar'?: true | '' | null | Removes;
  /** Makes the whole card clickable through this element. */
  'data-stretch'?: true | '' | null | Removes;
  /** App shell (rail + main); data-shell="fixed" fills the viewport and main scrolls inside. Needs app.css. */
  'data-shell'?: 'fixed' | '' | Empty | null | Removes;
  /** Navigation rail next to <main>; with popover it is a drawer on narrow screens. Needs app.css. */
  'data-rail'?: true | '' | null | Removes;
  /** Icon-only rail, set in the markup (e.g. Needs app.css. */
  'data-collapsed'?: true | '' | null | Removes;
  /** Collapse toggle drawn as a chevron icon button. Needs app.css. */
  'data-rail-collapse'?: true | '' | null | Removes;
  /** Hidden while the rail is collapsed (e.g. Needs app.css. */
  'data-rail-label'?: true | '' | null | Removes;
  /** Floating action button fixed in the bottom-right corner. Needs app.css. */
  'data-fab'?: true | '' | null | Removes;
  /** Shows the element only on narrow (< 48rem) or wide screens. Needs app.css. */
  'data-show'?: 'narrow' | 'wide' | null | Removes;
  /** Menu of buttons, links and checkbox labels; as a [popover] it opens under its button. Needs menu.css. */
  'data-menu'?: true | '' | null | Removes;
  /** Wraps a field and its suggestion list (data-menu, role="listbox"), which opens under it. Needs menu.css. */
  'data-combo'?: true | '' | null | Removes;
  /** Toast region (one per page, role="status"); holds data-toast children. Needs feedback.css. */
  'data-toasts'?: true | '' | null | Removes;
  /** A toast inside data-toasts; data-tone colors its bar. Needs feedback.css. */
  'data-toast'?: true | '' | null | Removes;
  /** Tooltip: the given text, or the aria-label when empty. Needs feedback.css. */
  'data-tooltip'?: string | Empty | null | Removes;
  /** Number cell: right-aligned, tabular figures (on th and every td of the column). Needs table.css. */
  'data-num'?: true | '' | null | Removes;
}
