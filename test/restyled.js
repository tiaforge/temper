// Shared by the restyle-count tests (perf, overlay, forms, layout-extra): how many elements a change restyles,
// from the elementCount of Chrome's UpdateLayoutTree trace events. Not a test file (no .test.js).

/**
 * Runs `expression` (synchronous; it must force a style update, e.g. by reading offsetHeight) under a trace and
 * returns the number of elements restyled by it. Only the style updates between two console.timeStamp marks around
 * the expression count: those are the ones the change itself causes, run synchronously when it is read back. Frames
 * that run while the trace is on but outside the expression (a fade or scale transition of a popover or dialog
 * still running from the previous step, or starting after this one) used to be counted too, and how many of them
 * fell into the trace depended on the machine's load (opening a menu counted 27 to 33). A style update still pending
 * from before (a transition frame due) is flushed before the start mark, so it is not counted either.
 */
export async function restyled(page, expression) {
  const events = [];
  const offData = page.on('Tracing.dataCollected', p => events.push(...p.value));
  let offDone;
  const complete = new Promise(r => { offDone = page.on('Tracing.tracingComplete', r); });
  await page.send('Tracing.start', { traceConfig: { includedCategories: ['devtools.timeline'] }, transferMode: 'ReportEvents' });
  // a frame in the page first: Tracing.start can answer before the page records, and a mark was then lost under load
  await page.evaluate('new Promise(r => requestAnimationFrame(() => setTimeout(r)))');
  try {
    await page.evaluate(`(() => { document.body.offsetHeight; console.timeStamp('tm-restyle-start'); const r = (${expression}); console.timeStamp('tm-restyle-end'); return r; })()`);
    // and one after, before ending: a trace ended right away under load could lose the end mark
    await page.evaluate('new Promise(r => requestAnimationFrame(() => setTimeout(r)))');
  } finally { await page.send('Tracing.end'); await complete; offData(); offDone(); }
  const mark = m => events.find(e => e.name === 'TimeStamp' && e.args?.data?.message === m)?.ts;
  const start = mark('tm-restyle-start'), end = mark('tm-restyle-end');
  if (start == null || end == null) throw new Error(`restyled: the trace lost its ${start == null ? 'start' : 'end'} mark (${events.length} events)`);
  return events.filter(e => e.name === 'UpdateLayoutTree' && e.args?.elementCount != null && e.ts >= start && e.ts <= end)
    .reduce((n, e) => n + e.args.elementCount, 0);
}
