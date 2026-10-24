import { useSyncExternalStore } from "react";
import { MEDIA_QUERIES } from "#tokens";

// The ONE sanctioned `(pointer: coarse)` media query on the tree (#1182), in both spellings: the point-in-time
// `coarsePointerNow()` (SSR/absent-safe, no subscription — an imperative "is this a touch device right now"
// read, the shape of `reduced-motion-now.ts`) and the subscribed `useCoarsePointer()` (the shape of
// `use-prefers-reduced-motion.ts`) for two surfaces that must agree on one answer and re-render together when
// the pointer type flips.
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
  readonly addEventListener?: (type: "change", listener: () => void) => void;
  readonly removeEventListener?: (type: "change", listener: () => void) => void;
}

/** `true` when the primary pointer is coarse (touch, stylus without hover) per `(pointer: coarse)`,
 *  read fresh at call time. `false` when `matchMedia` doesn't exist (SSR / non-browser test runners). */
export function coarsePointerNow(): boolean {
  const globals = globalThis as { matchMedia?: (query: string) => CoarsePointerQuery };
  return typeof globals.matchMedia === "function" && globals.matchMedia(MEDIA_QUERIES["pointer-coarse"]).matches;
}

/** `true` when the primary pointer is fine (mouse, trackpad) per `(pointer: fine)`, read fresh at call time.
 *  Not the inverse of {@link coarsePointerNow}: a `pointer: none` device matches neither. `false` when
 *  `matchMedia` doesn't exist. */
export function finePointerNow(): boolean {
  const globals = globalThis as { matchMedia?: (query: string) => CoarsePointerQuery };
  return typeof globals.matchMedia === "function" && globals.matchMedia(MEDIA_QUERIES["pointer-fine"]).matches;
}

const coarsePointerQuery: CoarsePointerQuery | null = ((): CoarsePointerQuery | null => {
  const globals = globalThis as { matchMedia?: (query: string) => CoarsePointerQuery };
  return typeof globals.matchMedia === "function" ? globals.matchMedia(MEDIA_QUERIES["pointer-coarse"]) : null;
})();

function subscribeCoarsePointer(onChange: () => void): () => void {
  coarsePointerQuery?.addEventListener?.("change", onChange);
  return (): void => coarsePointerQuery?.removeEventListener?.("change", onChange);
}

function getCoarsePointerSnapshot(): boolean {
  return coarsePointerQuery === null ? false : coarsePointerQuery.matches;
}

/** Whether the primary pointer is coarse, kept in sync via `useSyncExternalStore`. */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(subscribeCoarsePointer, getCoarsePointerSnapshot);
}
