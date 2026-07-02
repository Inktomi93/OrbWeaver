import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { snapToGraphemeBoundary, snapToWordBoundary } from "./snap";

// ── useSmoothText — adaptive streaming-text pacer (ui-package-design §6.3.1, layer 2) ────────────
// Decouples the VISUAL reveal from network chunk cadence. Deltas arrive as jittery bursts (fat
// multi-word chunks from some runners, single-token dribbles from others, batched by the network);
// rendering the accumulated target directly makes the display jump. This hook lags a display cursor
// behind the target and advances it on a requestAnimationFrame loop:
//
//   • Trickle floor — at least `cps` chars/second, so text always flows while a stream is live.
//   • Adaptive catch-up — rate also scales with the backlog (BACKLOG_DRAIN_PER_SEC × behind), an
//     exponential drain that keeps the visual lag bounded (~⅓s time-constant) no matter how fast the
//     source produces. A slow source reads as a calm trickle; a fast one stays near-realtime.
//   • Word snapping — the cursor only lands on whitespace boundaries (capped lookahead for unbroken
//     runs/CJK), so per-word reveal never mounts a fragment. The trailing partial word of a
//     still-growing target is held back until the next chunk completes it (or the stream finishes —
//     `enabled` flips off and the strict passthrough returns the full text).
//   • Grapheme-cluster safety — the final slice snaps to a grapheme boundary, so a torn surrogate
//     pair or ZWJ sequence never flashes mid-reveal.
//   • Tick throttle — state updates at most every MIN_TICK_MS (re-rendering at 60fps is wasted work;
//     ~30fps is visually indistinguishable for text reveal).
//
// `enabled: false` is a strict passthrough (returns `target` with zero lag/state), so callers can
// gate on a user pref + streaming status without conditional hooks. When a new stream starts (the
// target no longer extends what's shown), the cursor resets and paces the new text from zero.

const BACKLOG_DRAIN_PER_SEC = 3; // exponential catch-up factor (drains ~95% of a backlog in ~1s)
const MIN_TICK_MS = 30; // ≈33fps state-update ceiling
const MAX_FRAME_DT_SEC = 0.25; // clamp tab-suspend gaps (a background/minimized tab's huge dt)
const MS_PER_SEC = 1000;

// ── prefers-reduced-motion ────────────────────────────────────────────────────────────────────
// The paced reveal IS motion; under reduced-motion the hook degrades to the strict passthrough
// (full text immediately, exactly like `enabled: false`).
const reducedMotionQuery: MediaQueryList | null =
  typeof globalThis.matchMedia === "function"
    ? globalThis.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

function subscribeReducedMotion(cb: () => void): () => void {
  reducedMotionQuery?.addEventListener("change", cb);
  return () => reducedMotionQuery?.removeEventListener("change", cb);
}

function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, () => reducedMotionQuery?.matches ?? false);
}

export interface UseSmoothTextOptions {
  /** `false` (or reduced-motion) is a strict passthrough: the full `target` is returned every render. */
  readonly enabled: boolean;
  /** The trickle floor, in characters/second, applied while the backlog is small. */
  readonly cps: number;
}

/**
 * Paces the reveal of a growing `target` string at a smoothed rate rather than the raw, jittery
 * cadence it arrives at (ui-package-design §6.3.1 layer 2 — "the genuinely best-of-best layer,"
 * ported from neo's `use-smooth-text.ts` with the chat-domain `<speaker>`-tag hold-back stripped;
 * see `snap.ts`). Pure string-math + `requestAnimationFrame`; feed its output into a markdown
 * renderer or plain text — `useSmoothText` has no opinion on either.
 *
 * Usage: `const paced = useSmoothText(accumulatedText, { enabled: isStreaming, cps: 40 });`
 */
export function useSmoothText(target: string, opts: UseSmoothTextOptions): string {
  const { cps } = opts;
  const reducedMotion = useReducedMotion();
  const enabled = opts.enabled && !reducedMotion;
  const [shown, setShown] = useState(0);
  // Float cursor + last-frame timestamp live in refs — they advance sub-character amounts per frame
  // and must not trigger renders themselves.
  const cursorRef = useRef(0);
  const lastFrameRef = useRef<number | null>(null);
  const lastTickRef = useRef(0);

  // The frame loop reads the LIVE target through a ref instead of depending on `target` — dense
  // streams can deliver deltas faster than vsync, and a per-delta effect teardown/re-arm would reset
  // the frame clock every time (dt computed as 0 → the cursor barely advances while chunks arrive).
  // One persistent loop per stream keeps dt honest regardless of chunk cadence.
  const targetRef = useRef(target);
  // Post-commit mirror (refs must not be written during render). The rAF loop only reads between
  // frames, always after the commit that updated this — no staleness window that matters.
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
    // Hidden-tab flush: rAF doesn't fire in hidden tabs, so pacing a backlog there is pure debt — the
    // user isn't watching the reveal anyway. Flush on entry-while-hidden AND on every visibility flip
    // to hidden; the frame loop below also flushes if it ever runs while hidden (belt+braces).
    const onVisibilityChange = (): void => {
      if (document.visibilityState === "hidden") {
        flushToEnd();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    if (document.visibilityState === "hidden") {
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
      // New stream (or a reset): the target no longer extends the shown prefix.
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
      // Keep the loop alive while the stream is live — `enabled` flipping off (stream ends / the
      // pref flips) tears it down via cleanup. Idle frames while caught-up are a ref-read + two
      // compares; the alternative (re-arming per delta) is the dt-reset bug this loop exists to fix.
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
  // Grapheme snap at the slice: the word-snap's cap/CJK paths land on code-unit indices, which can
  // split a surrogate pair or ZWJ sequence — never emit a torn cluster.
  return target.slice(0, snapToGraphemeBoundary(target, Math.min(shown, target.length)));
}
