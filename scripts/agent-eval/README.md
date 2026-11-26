# Agent eval

Measures how well an agent builds UI with temper when it has only temper's documentation. The numbers in the
top-level README come from here.

- `tasks.md`: ten UI tasks from a calendar and mail app. It names no temper attribute, so the same file serves any
  library.
- `grade.mjs`: opens each page in headless Chrome at 1024×768, in light and dark mode, and measures it: colours as
  painted, WCAG contrast, OKLCH hue, alignment, sizes, gaps, accessible names. A task is fully correct when every
  one of its checks passes (82 checks in all). It also counts the classes the pages use.
- `reference/`: a hand-written solution. It must score 10 / 10; run it after changing a check.

## Running it

1. Make a directory per run with a copy of `tasks.md`, the docs (`llms.txt`, `llms-full.txt`) and an empty `out/`.
2. Give a fresh agent only that directory, with these instructions: write the ten pages of `tasks.md` into `out/`,
   load the library with `<link rel="stylesheet" href="/lib/all.css">` and nothing else from the network, read
   nothing outside the run directory, no browser or screenshots. Half the runs may also run
   `node bin/temper.js check <dir>`; the other half may not run any tool on their pages.
3. `npm run build`, then `node scripts/agent-eval/grade.mjs <run>/out ...` (`--json` for every check). The grader
   serves `dist/` as `/lib/`.

To grade another library, serve its CSS under `/lib/` instead (change `serve()` in `grade.mjs`) and give the agents
its docs.

