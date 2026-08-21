// The in-page collector. Raw string, not a function — see _shared/browser.ts.
export const METER_INIT_JS = `(() => {
  const m = (window.__perfMeter = {
    longTasks: [],   // {t, dur}
    events: [],      // {t, type, inputDelay, processing, dur}
    shifts: [],      // {t, value}
    rafGaps: [],     // {t, gap}
    stepMarks: [],   // {idx, label, t}
    markStep(idx, label) { this.stepMarks.push({ idx, label, t: performance.now() }); },
  });
  // Prefer LoAF (attributed, not deprecated) over the coarse \`longtask\` type — same pattern as
  // packages/client/src/lib/long-task-tracer.ts: LoAF reports blockingDuration + per-script
  // attribution and doesn't emit a deprecation notice per entry; \`longtask\` is the fallback ONLY
  // where LoAF is unsupported. Never observe both.
  if (PerformanceObserver.supportedEntryTypes.includes("long-animation-frame")) {
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) {
          const worst = (e.scripts ?? []).reduce((a, b) => (b.duration > (a?.duration ?? -1) ? b : a), null);
          m.longTasks.push({
            t: e.startTime,
            dur: e.duration,
            blockingDuration: e.blockingDuration,
            worstScript: worst === null ? null : (worst.sourceFunctionName ?? worst.invoker ?? worst.name ?? null),
          });
        }
      }).observe({ type: "long-animation-frame", buffered: true });
    } catch (_e) { /* long-animation-frame unsupported despite the feature check — the bucket just stays empty */ }
  } else {
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) m.longTasks.push({ t: e.startTime, dur: e.duration, blockingDuration: null, worstScript: null });
      }).observe({ type: "longtask", buffered: true });
    } catch (_e) { /* longtask unsupported — the bucket just stays empty */ }
  }
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        m.events.push({
          t: e.startTime,
          type: e.name,
          inputDelay: Math.max(0, e.processingStart - e.startTime),
          processing: Math.max(0, e.processingEnd - e.processingStart),
          dur: e.duration,
        });
      }
    }).observe({ type: "event", durationThreshold: 16, buffered: true });
  } catch (_e) { /* event timing unsupported */ }
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        if (!e.hadRecentInput) m.shifts.push({ t: e.startTime, value: e.value });
      }
    }).observe({ type: "layout-shift", buffered: true });
  } catch (_e) { /* layout-shift unsupported */ }
  // Kept alongside LoAF: LoAF only reports frames >50ms, so this 33ms-threshold rAF-gap loop is
  // the only detector for the 34-49ms dropped-frame band (a full frame budget at 30fps).
  let last = performance.now();
  const loop = (now) => {
    const gap = now - last;
    if (gap > 33) m.rafGaps.push({ t: now, gap });
    last = now;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
})();`;
