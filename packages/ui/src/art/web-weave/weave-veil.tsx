// WeaveVeil — the fullscreen boot/blocking veil that owns the ST-style exit (design §4.3, §9.4).
// ONE layer carries the whole beat: content fades IN on mount (--motion-layout — the owner's
// 300-400ms band), holds while `open`, and on `open=false` DISSOLVES (opacity + blur, the ST
// hideOverlay quality) — then unmounts itself on the real `transitionend`, never a hardcoded
// timeout (a hidden-tab safety timer is the only fallback, because transitions don't run there).
//
// The exit is INTERRUPT-DRIVEN by design (§9.3): the host flips `open` the instant the app is
// ready; the veil never waits for the weave to finish. Reduced motion = instant mount/unmount
// (guide §3.9 REMOVE) — no fade, no blur, `onExited` fires synchronously with the close.
//
// Not a Base UI surface (nothing to trap or restore — it's a paint-over, not a dialog), so the
// starting/ending idiom is hand-stamped: `data-entered` / `data-ending` presence attributes that
// variants.ts keys the transition off, mirroring `data-starting-style`/`data-ending-style`.

import type { ReactElement, ReactNode, TransitionEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { cn, usePrefersReducedMotion } from "#lib";
import { weaveVeilVariants } from "./variants.ts";

export interface WeaveVeilProps {
  /** TRUE while the wait is real; flip FALSE the instant the gate opens — the veil dissolves and unmounts. */
  open: boolean;
  /** Fired once, after the dissolve completes and the veil has unmounted itself. */
  onExited?: () => void;
  /** Accessible name for the `role="status"` live region (the veil IS the loading affordance). */
  label: string;
  children?: ReactNode;
  className?: string;
}

const VEIL_STAGES = ["enter", "open", "ending", "gone"] as const;
type VeilStage = (typeof VEIL_STAGES)[number];

/** Hidden tabs never fire `transitionend` (transitions don't run) — force-finish so a boot that
 *  completes in a background tab doesn't pin the veil (and its rAF weave) until the tab is seen. */
const EXIT_SAFETY_MS = 1200;

/** The fullscreen weave veil. Mount it whenever the wait exists; drive `open` from the real gate. */
export function WeaveVeil({ open, onExited, label, children, className }: WeaveVeilProps): ReactElement | null {
  const slots = weaveVeilVariants();
  const reduced = usePrefersReducedMotion();
  const [stage, setStage] = useState<VeilStage>("enter");
  const onExitedRef = useRef(onExited);
  useEffect(() => {
    onExitedRef.current = onExited;
  });

  // Derived-during-render transitions (the prev-state pattern — no setState in an effect body):
  // a close request moves enter/open → ending (or straight to gone under reduced motion — §3.9,
  // there is no dissolve to wait for); a re-open resurrects a gone/ending veil into a fresh enter.
  if (!open && (stage === "enter" || stage === "open")) {
    setStage(reduced ? "gone" : "ending");
  }
  if (open && (stage === "ending" || stage === "gone")) {
    setStage("enter");
  }

  // The enter beat: mount at opacity 0, then stamp `data-entered` a frame later so the fade-in
  // actually transitions (same-frame stamping would skip it). Under reduced motion the veil renders
  // entered straight from the `enter` stage (see `entered` below) — no rAF, no fade.
  useEffect(() => {
    if (stage !== "enter" || reduced) {
      return;
    }
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setStage("open"));
    });
    return (): void => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [stage, reduced]);

  // The ending beat's hidden-tab fallback: transitions don't run in a hidden tab, so a boot that
  // completes there would otherwise pin the veil until the tab is next seen.
  useEffect(() => {
    if (stage !== "ending") {
      return;
    }
    const timer = setTimeout(() => setStage("gone"), EXIT_SAFETY_MS);
    return (): void => clearTimeout(timer);
  }, [stage]);

  // `onExited` fires from the ONE place the veil is known gone — regardless of which path (the
  // transitionend, the safety timer, or the reduced-motion instant close) got it there.
  useEffect(() => {
    if (stage === "gone") {
      onExitedRef.current?.();
    }
  }, [stage]);

  if (stage === "gone") {
    return null;
  }

  const finishExit = (event: TransitionEvent<HTMLDivElement>): void => {
    if (stage === "ending" && event.target === event.currentTarget && event.propertyName === "opacity") {
      setStage("gone");
    }
  };

  // Reduced motion renders the resting (entered) look straight from `enter` — REMOVE, not shorten.
  const entered = stage === "open" || (reduced && stage === "enter");

  return (
    <div
      role="status"
      aria-label={label}
      data-slot="weave-veil"
      data-entered={entered ? "" : undefined}
      data-ending={stage === "ending" ? "" : undefined}
      className={cn(slots.root(), className)}
      onTransitionEnd={finishExit}
    >
      <div data-slot="weave-veil-content" className={slots.content()}>
        {children}
      </div>
    </div>
  );
}
