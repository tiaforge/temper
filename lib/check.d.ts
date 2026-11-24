// Types for @tiaforge-ui/temper/check (lib/check.js): temper check as a library. Written by hand; keep in step
// with lib/check.js.

/** A safe edit that `temper check --fix` (applyFixes) applies: replace text[start, end) with `text`. */
export interface Fix {
  start: number;
  end: number;
  text: string;
}

/** One finding. line and col are 1-based. */
export interface Diagnostic {
  file: string;
  line: number;
  col: number;
  severity: 'error' | 'warning';
  /** TM1xx: markup, TM2xx: CSS. */
  code: `TM${number}`;
  message: string;
  fix?: Fix;
}

/** What a check needs to know beyond the file. */
export interface CheckContext {
  /** Extra valid data-icon names (an icon folder, Lucide names, the project's own --tm-icon-* rules). */
  icons?: ReadonlySet<string>;
  /** The temper modules the project imports ('core', 'app', …); null or undefined: unknown, TM110 is not checked. */
  modules?: ReadonlySet<string> | null;
  /** false: skip the app-CSS rules (TM204–TM208). */
  lint?: boolean;
  /** Another vocabulary in the shape of vocab.json (for tests). */
  vocab?: object;
}

/** Like CheckContext, but check() also finds the project's own icons and imported modules itself. */
export interface ProjectCheckContext extends Omit<CheckContext, 'icons'> {
  icons?: Iterable<string>;
}

/**
 * Checks every markup and CSS file under the paths (files or folders; node_modules, dist and dot folders are
 * skipped). Unless ctx.modules is given, the imported modules are found in the project's sources.
 */
export function check(paths: readonly string[], ctx?: ProjectCheckContext): Diagnostic[];

/** Checks one file from disk; temper-ignore comments apply. */
export function checkFile(file: string, ctx?: CheckContext): Diagnostic[];

/** Checks markup text. The file name's extension selects the syntax (.html, .svelte, .vue, .astro, .jsx, .tsx). */
export function checkMarkup(text: string, file?: string, ctx?: CheckContext): Diagnostic[];

/** Checks CSS text: --tm-* tokens, and (unless ctx.lint is false) the app-CSS rules. */
export function checkStyles(text: string, file?: string, ctx?: CheckContext): Diagnostic[];

/** Applies the fixes of one file's diagnostics, later ones first; overlapping fixes are skipped. */
export function applyFixes(text: string, diagnostics: readonly Diagnostic[]): { text: string; applied: number };

/** The files under a path (or the path itself if it is a file): markup and CSS files, or those with the given extensions. */
export function walk(path: string, exts?: ReadonlySet<string> | null): Generator<string, void, undefined>;

/** The temper modules the project's sources import, or null when none is visible. all.css counts as every module. */
export function importedModules(paths: readonly string[]): Set<string> | null;

/** Icon names the project defines itself in CSS: [data-icon="name"] rules and --tm-icon-name declarations. */
export function definedIcons(paths: readonly string[]): Set<string>;

/**
 * Adds the data-* attributes a markup file uses to `usage`: name → the values seen ('' for none), or 'any' when a
 * value is computed in a way that does not reduce to literals.
 */
export function attributeUsage(text: string, file: string, usage?: Map<string, Set<string> | 'any'>): Map<string, Set<string> | 'any'>;

/** The candidate closest to `word` within `max` edits, or undefined. */
export function closest(word: string, candidates: Iterable<string>, max?: number): string | undefined;

/** Like closest, but only when no other candidate is equally close (safe to apply automatically). */
export function closestUnique(word: string, candidates: Iterable<string>, max?: number): string | undefined;
