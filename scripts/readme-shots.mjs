#!/usr/bin/env node
// Screenshots for the README: 2560×1440 (a 1280×720 viewport at 2× pixel density) of the kitchen
// sink and the app shell demo. Writes docs/screenshots/*.png. Usage: node scripts/readme-shots.mjs [--browser cmd]
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, findBrowser } from '../packages/inspect/lib/cdp.js';
import { serve } from './visual.mjs';

const out = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));
// [file, page + query, element to scroll to the top (optional)]
const SHOTS = [
  ['mail-light', 'index.html?t=light'],
  ['mail-dark', 'index.html?t=dark'],
  ['reference-light', 'index.html?t=light', 'main > section:nth-of-type(3)'],
  ['reference-dark', 'index.html?t=dark', 'main > section:nth-of-type(3)'],
  ['app-light', 'app.html?t=light&menu'],
  ['app-dark', 'app.html?t=dark&dialog'],
];

const args = process.argv.slice(2), bi = args.indexOf('--browser');
const server = await serve(), base = `http://127.0.0.1:${server.address().port}/kitchen-sink/`;
const b = await launch(bi >= 0 ? args[bi + 1].split(' ') : findBrowser());
mkdirSync(out, { recursive: true });
try {
  const page = await b.newPage();
  for (const [name, url, scrollTo] of SHOTS) {
    const scheme = url.includes('t=dark') ? 'dark' : 'light';
    await page.goto(base + url, { width: 1280, height: 720, scheme, settle: 300 });
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 2, mobile: false });
    await page.evaluate(`(async () => {
      document.querySelector('header.topbar')?.remove(); // the kitchen sink's switcher bar
      ${scrollTo ? `scrollTo(0, document.querySelector(${JSON.stringify(scrollTo)}).getBoundingClientRect().top + scrollY - 32);` : ''}
      await document.fonts.ready;
      await new Promise(r => setTimeout(r, 400)); // let open popovers and dialogs finish their entry animation
      document.activeElement?.blur(); // showModal focuses the close button; no focus ring in a screenshot
    })()`);
    const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(out, `${name}.png`), Buffer.from(data, 'base64'));
    console.log(`docs/screenshots/${name}.png`);
  }
} finally { await b.close(); server.close(); }
