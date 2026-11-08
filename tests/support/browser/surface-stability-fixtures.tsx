import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { CtIsolation } from "./ct-isolated-subject.tsx";

const SURFACE_STABILITY_SHIFTS = ["still", "late-notice", "late-notice-under-fade", "transform-loop", "linear-transition", "container-scroll"] as const;
export type SurfaceStabilityShift = (typeof SURFACE_STABILITY_SHIFTS)[number];

// Each period is shorter than the settle window, so a sampled window always holds a change whenever readiness was declared.
const LATE_NOTICE_PERIOD_MS = 250;
// A linear transition has to finish and rest inside one period, so its last step lands in a frame of its own.
const TRANSITION_PERIOD_MS = 500;
const TRANSITION_MS = 220;
const SHIFT_PX = 48;
const SCROLL_PX = 40;
const PERIODS: Readonly<Record<SurfaceStabilityShift, number | null>> = {
  still: null,
  "late-notice": LATE_NOTICE_PERIOD_MS,
  "late-notice-under-fade": LATE_NOTICE_PERIOD_MS,
  "transform-loop": null,
  "linear-transition": TRANSITION_PERIOD_MS,
  "container-scroll": LATE_NOTICE_PERIOD_MS,
};

/** A ready witness that stays put, is pushed by late content, or moves only by authored motion or a scroll. */
export function SurfaceStabilityStory({ shift }: { readonly shift: SurfaceStabilityShift }): ReactElement {
  const [phase, setPhase] = useState(false);
  const motion = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const period = PERIODS[shift];
    const timer = period === null ? undefined : setInterval(() => setPhase((on) => !on), period);
    return (): void => clearInterval(timer);
  }, [shift]);
  useEffect(() => {
    const keyframes: Record<SurfaceStabilityShift, Keyframe[] | null> = {
      still: null,
      "late-notice": null,
      "late-notice-under-fade": [{ opacity: 0.82 }, { opacity: 1 }],
      "transform-loop": [{ transform: "translateY(0)" }, { transform: `translateY(${String(SHIFT_PX)}px)` }],
      "linear-transition": null,
      "container-scroll": null,
    };
    const frames = keyframes[shift];
    const animation =
      frames === null ? undefined : motion.current?.animate(frames, { duration: 600, iterations: Number.POSITIVE_INFINITY, direction: "alternate" });
    return (): void => animation?.cancel();
  }, [shift]);
  useEffect(() => {
    if (shift === "container-scroll") {
      scroller.current?.scrollTo({ top: phase ? SCROLL_PX : 0, behavior: "instant" });
    }
  }, [shift, phase]);
  const notice = phase && (shift === "late-notice" || shift === "late-notice-under-fade");
  const transition =
    shift === "linear-transition" ? { transition: `translate ${String(TRANSITION_MS)}ms linear`, translate: phase ? `0 ${String(SHIFT_PX)}px` : "0 0" } : {};
  return (
    <CtIsolation subject="Post-ready witness movement" isolates="Planted late layout changes, authored motion and scrolling need no application services.">
      <main>
        <Stack gap="section" padding="section">
          <h1>Stability control</h1>
          <div ref={motion}>
            {notice ? <p style={{ blockSize: SHIFT_PX, margin: 0 }}>Late notice</p> : null}
            <div ref={scroller} style={shift === "container-scroll" ? { blockSize: 160, overflowY: "auto" } : {}}>
              <div style={{ ...transition, ...(shift === "container-scroll" ? { paddingBlockStart: SCROLL_PX * 2, blockSize: 480 } : {}) }}>
                <Button>Ready witness</Button>
              </div>
            </div>
          </div>
        </Stack>
      </main>
    </CtIsolation>
  );
}
