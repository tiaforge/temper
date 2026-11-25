// Types for @tiaforge-ui/temper/vite (lib/vite.js). Written by hand; keep in step with lib/vite.js.
// They do not import from 'vite', so they compile whether or not vite is installed; the plugin object is
// assignable to Vite's Plugin and PluginOption.

/** The opt-in enhancements (SPEC §1.5), by web-features id; see src/enhance/. */
export type TemperEnhancement = 'customizable-select';

export interface TemperIconsOptions {
  /** A folder of SVG files, relative to the Vite root: file name = icon name (it replaces a default of the same name). */
  dir?: string;
  /** Every Lucide icon by name, only the used ones emitted (needs lucide-static installed). Default true. */
  lucide?: boolean;
  /**
   * Icon names to emit although the markup does not show them, such as data-icon={item.icon} from a data array.
   * The plugin prints a notice with file and line for each such place.
   */
  include?: readonly string[];
  /**
   * The stroke width of the Lucide icons, from 0.5 to 3 (Lucide's own is 2): 1.5 draws them thinner, for lighter
   * type. Applied when the plugin emits them; your folder's SVGs stay as they are.
   */
  strokeWidth?: number;
}

export interface TemperPruneOptions {
  /** The sources to scan for used attributes and values, relative to the Vite root. Default: the whole root. */
  paths?: readonly string[];
}

export interface TemperInspectOptions {
  /** false: do not stamp elements with data-tm-src="file:line" in dev. Default true. */
  source?: boolean;
  /** Milliseconds to wait after a change before auditing the page. Default 600. */
  delay?: number;
  /** The temper-inspect audit module to use instead of the installed @tiaforge-ui/temper-inspect/audit. */
  audit?: string;
}

export interface TemperOptions {
  /** What to check, relative to the working directory or absolute. Default: the Vite root. */
  paths?: readonly string[];
  /** Fail the build on warnings too. Default false. */
  warningsFail?: boolean;
  /** Serve virtual:temper-icons.css with your SVG folder and the Lucide icons the markup uses. */
  icons?: TemperIconsOptions;
  /** Opt-in enhancements appended to core.css and all.css: a list of ids, one id, or 'all'. */
  enhance?: readonly TemperEnhancement[] | TemperEnhancement | 'all' | false | null;
  /** In builds, drop temper rules for data-* attributes and values the project never uses. Default false. */
  prune?: boolean | TemperPruneOptions;
  /** In dev, run the temper-inspect audit in the served page (needs @tiaforge-ui/temper-inspect). Default false. */
  inspect?: boolean | TemperInspectOptions;
}

/**
 * The plugin object. Its hooks are Vite's (configResolved, configureServer, transformIndexHtml, resolveId, load,
 * transform, generateBundle, buildStart, handleHotUpdate); they are typed loosely here so this file needs no types from Vite.
 */
export interface TemperPlugin {
  name: 'temper';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [hook: string]: any;
}

/** temper check in every build (errors fail it, the dev server warns), plus the options above. */
export default function temper(options?: TemperOptions): TemperPlugin;

/** A finding of the rendered-page audit (temper-inspect). */
export interface InspectFinding {
  severity: 'error' | 'warning' | 'info';
  code: string;
  selector: string;
  message: string;
  /** The page, or the dialog or popover that was open. */
  state?: string;
  /** file:line of the element in the source (dev only). */
  src?: string;
}

/** Terminal text for the findings of one page: warnings and errors, at most `limit` per kind, each once. */
export function inspectReport(page: string, findings: readonly InspectFinding[], limit?: number): { list: InspectFinding[]; text: string };
