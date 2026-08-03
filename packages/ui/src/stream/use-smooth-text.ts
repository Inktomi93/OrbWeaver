import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "#lib";
import { snapToGraphemeBoundary, snapToWordBoundary } from "./snap.ts";

// Adaptive streaming-text pacer: decouples the visual reveal from jittery network chunk cadence by
// lagging a display cursor behind the target on a requestAnimationFrame loop, with a trickle floor
// (`cps`), backlog-proportional catch-up, word-boundary snapping, and grapheme-safe slicing.

const BACKLOG_DRAIN_PER_SEC = 3; // exponential catch-up factor (drains ~95% of a backlog in ~1s)
const MIN_TICK_MS = 30; // ≈33fps state-update ceiling
const MAX_FRAME_DT_SEC = 0.25; // clamp tab-suspend gaps (a background/minimized tab's huge dt)
const MS_PER_SEC = 1000;

export interface UseSmoothTextOptions {
  /** `false` (or reduced-motion) is a strict passthrough: the full `target` is returned every render. */
  readonly enabled: boolean;
  /** The trickle floor, in characters/second, applied while the backlog is small. */
  readonly cps: number;
}

/** Paces the reveal of a growing `target` string at a smoothed rate rather than its raw arrival cadence. */
export function useSmoothText(target: string, opts: UseSmoothTextOptions): string {
  const { cps } = opts;
  const reducedMotion = usePrefersReducedMotion();
  const enabled = opts.enabled && !reducedMotion;
  const [shown, setShown] = useState(0);
  // Float cursor + last-frame timestamp live in refs — they advance sub-character amounts per frame
  // and must not trigger renders themselves.
  const cursorRef = useRef(0);
  const lastFrameRef = useRef<number | null>(null);
  const lastTickRef = useRef(0);

  // Read the LIVE target through a ref instead of depending on `target` — a per-delta effect
  // teardown/re-arm would reset the frame clock every time dense streams outpace vsync.
  const targetRef = useRef(target);
  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const flushToEnd = (): void => {
      cursorRef.current = targetRef.current.length;
      setShown(targetRef.current.length);
    };
    // rAF doesn't fire in hidden tabs, so flush the backlog outright rather than pace an unwatched reveal.
    const onVisibilityChange = (): void => {
      if (document.visibilityState === "hidden") {
        flushToEnd();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    if (document.visibilityState === "hidden") {
      // eslint-disable-next-line react-you-might-not-need-an-effect/no-external-store-subscription -- the visibility subscription drives an IMPERATIVE flush (jump the reveal cursor to the end of the buffer), not a state mirror; useSyncExternalStore has no imperative sink and would have to snapshot a value nothing renders.
      flushToEnd();
    }

    let raf = 0;
    const frame = (now: number): void => {
      const live = targetRef.current;
      if (document.visibilityState === "hidden") {
        flushToEnd();
        raf = requestAnimationFrame(frame);
        return;
      }
      // New stream (or reset): target no longer extends the shown prefix.
      if (live.length < cursorRef.current) {
        cursorRef.current = 0;
        setShown(0);
      }
      const last = lastFrameRef.current ?? now;
      lastFrameRef.current = now;
      const dt = Math.min(MAX_FRAME_DT_SEC, (now - last) / MS_PER_SEC);

      if (cursorRef.current < live.length) {
        const backlog = live.length - cursorRef.current;
        const rate = Math.max(cps, backlog * BACKLOG_DRAIN_PER_SEC);
        cursorRef.current = Math.min(live.length, cursorRef.current + rate * dt);

        if (now - lastTickRef.current >= MIN_TICK_MS || cursorRef.current >= live.length) {
          lastTickRef.current = now;
          const snapped = snapToWordBoundary(live, Math.floor(cursorRef.current));
          setShown((prev) => Math.max(snapped, prev));
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return (): void => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      lastFrameRef.current = null;
    };
  }, [enabled, cps]);

  if (!enabled) {
    return target;
  }
  // Word-snap's cap/CJK paths land on code-unit indices, which can split a surrogate pair or ZWJ sequence.
  return target.slice(0, snapToGraphemeBoundary(target, Math.min(shown, target.length)));
}
