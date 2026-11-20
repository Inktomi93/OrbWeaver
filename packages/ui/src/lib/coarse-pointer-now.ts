import { useSyncExternalStore } from "react";
import { MEDIA_QUERIES } from "#tokens";

// The primary input's capability reads: the ONE sanctioned `(pointer: coarse)` media query on the tree (#1182) and the
// `(hover: hover)` query that `hover-capable` compiles to, each in two spellings: a point-in-time read (SSR/absent-safe, no
// subscription, the shape of `reduced-motion-now.ts`) and a subscribed hook for surfaces that must re-render together when
// the input changes.
//
// Pointer size and hover are separate facts. A stylus or a pen tablet can be fine and unable to hover, so a decision about
// whether a hover reveal is reachable reads `useHoverCapable`, never `useCoarsePointer` (ui-surface-and-interaction-rules §4.1).
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
interface MediaQuery {
  readonly matches: boolean;
  readonly addEventListener?: (type: "change", listener: () => void) => void;
  readonly removeEventListener?: (type: "change", listener: () => void) => void;
}

function matchMediaNow(query: string): MediaQuery | null {
  const globals = globalThis as { matchMedia?: (query: string) => MediaQuery };
  return typeof globals.matchMedia === "function" ? globals.matchMedia(query) : null;
}

/** `true` when the primary pointer is coarse (touch, stylus without hover) per `(pointer: coarse)`,
 *  read fresh at call time. `false` when `matchMedia` doesn't exist (SSR / non-browser test runners). */
export function coarsePointerNow(): boolean {
  return matchMediaNow(MEDIA_QUERIES["pointer-coarse"])?.matches === true;
}

/** `true` when the primary pointer is fine (mouse, trackpad) per `(pointer: fine)`, read fresh at call time.
 *  Not the inverse of {@link coarsePointerNow}: a `pointer: none` device matches neither. `false` when
 *  `matchMedia` doesn't exist. */
export function finePointerNow(): boolean {
  return matchMediaNow(MEDIA_QUERIES["pointer-fine"])?.matches === true;
}

/** One subscribed media query: the `useSyncExternalStore` pair, with `absent` as the answer where `matchMedia` does not exist. */
function mediaQueryStore(query: string, absent: boolean): { readonly subscribe: (onChange: () => void) => () => void; readonly snapshot: () => boolean } {
  const list = matchMediaNow(query);
  return {
    subscribe: (onChange: () => void): (() => void) => {
      list?.addEventListener?.("change", onChange);
      return (): void => list?.removeEventListener?.("change", onChange);
    },
    snapshot: (): boolean => (list === null ? absent : list.matches),
  };
}

const coarsePointer = mediaQueryStore(MEDIA_QUERIES["pointer-coarse"], false);
// Absent `matchMedia` answers `true`, the desktop default the server-rendered and node worlds assume.
const hoverCapable = mediaQueryStore(MEDIA_QUERIES["hover-capable"], true);

/** Whether the primary pointer is coarse, kept in sync via `useSyncExternalStore`. */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(coarsePointer.subscribe, coarsePointer.snapshot);
}

/** Whether the primary input can hover per `(hover: hover)`, the query `hover-capable` compiles to, kept in sync via
 *  `useSyncExternalStore`. Where it cannot, a hover reveal must show at rest. */
export function useHoverCapable(): boolean {
  return useSyncExternalStore(hoverCapable.subscribe, hoverCapable.snapshot);
}
