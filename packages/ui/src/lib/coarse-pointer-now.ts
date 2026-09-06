// The point-in-time (non-reactive) coarse-pointer read — the ONE sanctioned `(pointer: coarse)` media
// query on the tree (#1182). Mirrors `reduced-motion-now.ts`'s shape (SSR/absent-safe, no subscription,
// no hook) rather than `use-prefers-reduced-motion.ts`'s live-updating one: nothing on the tree needs a
// pointer-type flip to re-render mid-session, only an imperative "is this a touch device right now" read.
//
// Before this file, the only place that answered "is this a touch device" was
// `navigator.maxTouchPoints > 0` (`bug-report-capture.ts`), which is an adjacent signal honestly named
// for what it reads, NOT a `(pointer: coarse)` read — a device can report touch points while its active
// input is a mouse (touchscreen laptop), and `(pointer: coarse)` answers the CSS question directly. Both
// facts are now reported side by side in the bug-report bundle so a reader sees the two disagree when they
// do, instead of one silently standing in for the other.
//
// `lib/` compiles without the DOM lib, so matchMedia is accessed through a minimal structural type — the
// same posture as `reduced-motion-now.ts`'s header explains in full.
interface CoarsePointerQuery {
  readonly matches: boolean;
}

/** `true` when the primary pointer is coarse (touch, stylus without hover) per `(pointer: coarse)`,
 *  read fresh at call time. `false` when `matchMedia` doesn't exist (SSR / non-browser test runners). */
export function coarsePointerNow(): boolean {
  const globals = globalThis as { matchMedia?: (query: string) => CoarsePointerQuery };
  return typeof globals.matchMedia === "function" && globals.matchMedia("(pointer: coarse)").matches;
}
