// The shape of astro/astro-jsx.d.ts that types/astro.d.ts merges into (astro is too large for a devDependency;
// the real thing was checked with astro check).
declare namespace astroHTML.JSX {
  interface HTMLAttributes { [key: `data-${string}`]: any; class?: string | null }
}
