// The wall-clock tag for dev console lines. HH:MM:SS.mmm, local time. Every dev-console channel
// prefixes its lines with this so timing reads at a glance without opening the Performance panel.
// Parameter stays injectable so tests pin a fixed Date; this is console instrumentation, never render output.

const PAD_UNIT = 2;
const PAD_MS = 3;

/** HH:MM:SS.mmm local wall-clock tag for dev console lines. */
export function logClock(d: Date = new Date(performance.timeOrigin + performance.now())): string {
  const p = (n: number, w: number = PAD_UNIT): string => String(n).padStart(w, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), PAD_MS)}`;
}
