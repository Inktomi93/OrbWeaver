// `logClock` — the wall-clock tag for dev console lines (UI-Arch §2.1 lib/: cross-cutting display
// util). HH:MM:SS.mmm, local time. Every surfaced dev-console channel ([trpc], [perf]) prefixes its
// lines with this so timing reads at a glance — "did the refetch land before or after the commit?"
// without opening the Performance panel. Chrome's own "Show timestamps" setting is per-machine and
// off by default; baking the clock into the line means probe/console-capture transcripts carry it
// too. CLOCK SOURCE: `performance.timeOrigin + performance.now()` → `new Date(ms)` — the sanctioned
// wall-clock for observability metadata where no injected clock exists (the exact precedent:
// server foundation/observability/middleware.ts; `no-raw-clock` gate-clean). The parameter stays
// injectable so tests pin a fixed Date; this is console instrumentation, never render output.

const PAD_UNIT = 2;
const PAD_MS = 3;

/** HH:MM:SS.mmm local wall-clock tag for dev console lines. */
export function logClock(d: Date = new Date(performance.timeOrigin + performance.now())): string {
  const p = (n: number, w: number = PAD_UNIT): string => String(n).padStart(w, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), PAD_MS)}`;
}
