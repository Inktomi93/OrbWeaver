import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "#lib";
import { snapToGraphemeBoundary, snapToWordBoundary } from "./snap.ts";

// Adaptive streaming-text pacer: decouples the visual reveal from jittery network chunk cadence by
// lagging a display cursor behind the target on a requestAnimationFrame loop, with a trickle floor
// (`cps`), backlog-proportional catch-up, word-boundary snapping, and grapheme-safe slicing.

const BACKLOG_DRAIN_PER_SEC = 3; // exponential catch-up factor (drains ~95% of a backlog in ~1s)
// #42: commits land ~12×/s so each reveals a 1-3 word batch whose 220ms `[data-orb-reveal]` fade
// (markdown seal) overlaps the next batch's — fades BRIDGE the commit gaps (the Claude-app feel)
// while the per-commit whole-text re-parse work drops ~2.5× vs the old 30ms tick (measured 79
// over-budget region:content commits per turn at 30ms — D168 D4).
const MIN_TICK_MS = 85;
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
  // A SECOND STREAM STARTS AT ZERO. `shown`/`cursorRef` are per-MOUNT, and the ghost row outlives a turn:
  // with the cursor left where the last stream ENDED, the first paint of the next one showed that many of
  // its characters at once (and the in-loop rewind below could not help — it only fires when the new
  // target is SHORTER than the old cursor, and it needs a frame that has not happened yet). Rewinding
  // `shown` DURING the enabling render is what keeps that paint from ever reaching the screen; the cursor
  // itself is a ref, so it is rewound in the effect below (refs are not written during render).
  const [pacing, setPacing] = useState(enabled);
  if (pacing !== enabled) {
    setPacing(enabled);
    setShown(0);
  }
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

  // The cursor half of the rewind above: the render-phase `setShown(0)` cannot touch a ref, and the pacing
  // effect below deliberately does NOT reset it (it re-arms on a `cps` change too, and rewinding an
  // in-flight reveal to zero would blank text a reader is mid-sentence on).
  useEffect(() => {
    if (enabled) {
      cursorRef.current = 0;
      lastFrameRef.current = null;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const flushToEnd = (): void => {
      cursorRef.current = targetRef.current.length;
      setShown(targetRef.current.length);
    };

    let raf = 0;
    const frame = (now: number): void => {
      const live = targetRef.current;
      raf = 0;
      if (document.visibilityState === "hidden") {
        flushToEnd();
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

    const stop = (): void => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const start = (): void => {
      if (raf === 0) {
        raf = requestAnimationFrame(frame);
      }
    };
    // rAF doesn't fire in hidden tabs, so flush the backlog outright rather than pace an unwatched reveal —
    // and STOP the loop rather than re-arm it (the `frame` branch above returns for the same reason). A tab
    // whose frames keep coming while `visibilityState` reads hidden — screen capture, a headless browser —
    // otherwise re-flushed and re-armed forever, burning a callback per vsync on a reveal nobody watches.
    // Coming back visible re-arms here, with the frame clock re-zeroed so the gap isn't charged as `dt`.
    const onVisibilityChange = (): void => {
      if (document.visibilityState === "hidden") {
        stop();
        flushToEnd();
        return;
      }
      lastFrameRef.current = null;
      start();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    if (document.visibilityState === "hidden") {
      // eslint-disable-next-line react-you-might-not-need-an-effect/no-external-store-subscription -- the visibility subscription drives an IMPERATIVE flush (jump the reveal cursor to the end of the buffer), not a state mirror; useSyncExternalStore has no imperative sink and would have to snapshot a value nothing renders.
      flushToEnd();
    } else {
      start();
    }
    return (): void => {
      stop();
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
