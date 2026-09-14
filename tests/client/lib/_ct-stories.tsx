// Story module for the lib-tier CTs (Spine-Testing §7 — CT mounts ONLY from a non-test module).
// NotifyToastStory reproduces the EXACT main.tsx wiring of the `notify` seam's render half (F1): the
// D54 QueryCache/MutationCache `errorToast` channel (data/query-client.ts) → the `notify` facade →
// the toast manager bound at the composition root → `<ToastProvider>`/`<Toaster>` pixels. Before F1
// this middle was missing, so every errorToast-meta failure was console-only. The story mints the app
// QueryClient (the one whose MutationCache.onError reads `meta.errorToast`), binds `notify` to a real
// toast manager, and fires a mutation whose `meta.errorToast` message must reach a rendered toast.

import { createAppQueryClient } from "@orb/client/data";
import { AppToaster } from "@orb/client/features/app-shell";
import { bindNotify, createToastNotify, notify } from "@orb/client/lib";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Select } from "@orb/ui/select";
import { createToastManager, ToastProvider } from "@orb/ui/toast";
import { QueryClient, QueryClientProvider, useMutation } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { OrbAgentHandles } from "../../../packages/client/src/lib/agent-bridge.ts";
import { installAgentDebugHandle } from "../../../packages/client/src/lib/agent-bridge.ts";
// Deep, not `@orb/client/lib`: production readiness and the dev bridge stay OUT of the barrel. Keeping
// their homes separate is the production boot boundary (#995); a barrel re-export could reconnect them.
import type { RouteResolution } from "../../../packages/client/src/lib/app-ready-signal.ts";
import { appReady, installAppReadySignal } from "../../../packages/client/src/lib/app-ready-signal.ts";
import { __resetBootReads, setBootReadPending } from "../../../packages/client/src/lib/boot-reads.ts";
import { busInvalidate, busSubscribe, busUnsubscribe } from "../../../packages/client/src/lib/bus-devlog.ts";
// Deep, not `@orb/client/lib`: motion-stats is deliberately OUT of the barrel (its header — a barrel
// re-export would drag the dev observers into the prod bundle), so the only way to reach it is the path.
import { __resetLongTaskEvidence, installLongTaskTracer } from "../../../packages/client/src/lib/long-task-tracer.ts";
import { installAnimationLifecycleRecorder } from "../../../packages/client/src/lib/motion-animation-record.ts";
import { setFrameDropTrackingPaused } from "../../../packages/client/src/lib/motion-animation-state.ts";
import { installDeadClassFlagger, motionFlaggersDrain, motionFlaggersSettled } from "../../../packages/client/src/lib/motion-dead-class-flagger.ts";
import { __resetMotionFlags, installMotionFlaggers, MOTION_BUDGETS, motionFlags } from "../../../packages/client/src/lib/motion-flaggers.ts";
import {
  __resetMotionStats,
  installMotionObservers,
  markAgentNavigation,
  motionSnapshot,
  subscribeLongAnimationFrames,
} from "../../../packages/client/src/lib/motion-stats.ts";
import { perfMeasureFromLoad } from "../../../packages/client/src/lib/perf-marks.ts";
import { recordRender } from "../../../packages/client/src/lib/render-stats.ts";
import { blockMainThread } from "../../support/node/block-main-thread.ts";

// Minted OUTSIDE React and bound ONCE — exactly the main.tsx posture. Fresh browser context per CT
// test (ct-data-providers.tsx header) → module state starts clean, so the bind is per-test-clean.
// `createToastNotify` is the PRODUCTION mapping (lib/toast-notify.ts), not a hand-copy: the copy this
// story used to carry had already drifted (no `warn` channel, no description/action/timeout), which is
// exactly how a CT goes green against a toast the app never renders.
const toastManager = createToastManager();
bindNotify(createToastNotify(toastManager));

// The REAL app QueryClient — its MutationCache.onError is the D54 errorToast→notify channel under test.
const queryClient = createAppQueryClient();

/** The failure message the mutation's `meta.errorToast` carries — must appear verbatim in the toast. */
const FAIL_MESSAGE = "Couldn't save your changes.";

/** Fires a mutation that always rejects, carrying an `errorToast` meta — the D54 global channel. */
function FailingMutationButton(): ReactElement {
  const mutation = useMutation<unknown, Error, void>({
    mutationFn: (): Promise<never> => Promise.reject(new Error("boom")),
    meta: { errorToast: FAIL_MESSAGE },
  });
  return (
    <button type="button" onClick={(): void => mutation.mutate()}>
      save
    </button>
  );
}

export function NotifyToastStory(): ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
      <CtToastSurface>
        <FailingMutationButton />
      </CtToastSurface>
    </QueryClientProvider>
  );
}

/** The chat degrade the INFRA-WARN-DEAF review measured, driven through the WHOLE seam: a split notice
 *  with an action, on the `warn` channel. The button labels are the story's controls; everything the
 *  assertions read is what `notify` put on screen. */
function WarnNoticeButton(): ReactElement {
  return (
    <button
      type="button"
      onClick={(): void => {
        notify.warn({
          action: { label: "Open Connections", onClick: (): void => notify.success("Connections opened.") },
          description: "OpenRouter ignores them. They apply only on a Custom OpenAI-compatible connection.",
          title: "Your preset's custom parameters weren't sent",
        });
      }}
    >
      warn
    </button>
  );
}

export function NotifyNoticeStory(): ReactElement {
  return (
    <CtToastSurface>
      <WarnNoticeButton />
    </CtToastSurface>
  );
}

/** The CLS-flagger stage (motion-stats.ts): a spacer whose growth pushes a marked block DOWN, which is
 *  exactly what a layout shift is. Two controls, because the flagger's whole design claim is that the
 *  CWV metric's `hadRecentInput` exclusion hides real defects:
 *   · "shift now"    — grows inside the click handler, so the entry carries `hadRecentInput: true`; the
 *                      spec metric must stay 0 while the flagger still names it;
 *   · "shift later"  — schedules the growth past the 500ms input window, so the entry is `unexpected` and
 *                      DOES count. This is the "async data arrival" shape §4.3 rule 7 bans.
 *  The observers install on mount (main.tsx installs them via agent-bridge under IS_DEV — the CT is the
 *  only place that wiring can be exercised, since a node test has no layout to shift). */
export function MotionShiftFlaggerStory(): ReactElement {
  const [pushed, setPushed] = useState(false);
  useEffect(() => {
    installMotionObservers();
    // The accessor is published from HERE, not re-imported by the spec: a `page.evaluate` dynamic import
    // resolves its own URL specifier and would hand the test a SECOND module instance with zero totals —
    // a green that proves nothing. The story owns the instance under test, so it owns the read.
    // @orb-waive no-test-fabrication(unknown): a browser-context probe slot, written and read by this story's CT alone. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const probes = globalThis as unknown as { __motionRead: typeof motionSnapshot | undefined };
    probes.__motionRead = motionSnapshot;
    return (): void => {
      probes.__motionRead = undefined;
    };
  }, []);
  return (
    <div>
      <button type="button" onClick={(): void => setPushed(true)}>
        shift now
      </button>
      <button
        type="button"
        onClick={(): void => {
          markAgentNavigation();
          setPushed(true);
        }}
      >
        agent-driven shift
      </button>
      <button
        type="button"
        onClick={(): void => {
          // 900ms > the spec's 500ms input window, so the resulting shift is NOT input-attributed.
          setTimeout(() => setPushed(true), 900);
        }}
      >
        shift later
      </button>
      <button type="button" onClick={__resetMotionStats}>
        reset evidence
      </button>
      {/* The spacer IS the shift: 0 → 200px pushes everything after it down the page. */}
      <div style={{ height: pushed ? 200 : 0 }} />
      <div data-testid="cls-victim" style={{ height: 300, background: "#ccc" }}>
        pushed block
      </div>
    </div>
  );
}

/** The VIRTUALIZED half of the CLS split (issue #109). Same mechanics as MotionShiftFlaggerStory, but the
 *  whole shift happens INSIDE a `[data-slot="message-list-viewport"]` box — the marker `sourcesAreVirtualized`
 *  keys on — and the box is fixed-height/overflow-hidden so nothing OUTSIDE it moves (one non-virtualized
 *  source would flip the record's classification and the story would prove the opposite of its name). The
 *  growth lands 900ms after the click, past the 500ms input window, so it reaches `cls` at all: an
 *  input-adjacent shift never enters the total this arm is about.
 *
 *  "settle rows now" is the #1071 twin: the SAME virtualized shift INSIDE the 500ms window, which the
 *  spec metric zeroes entirely. It exists to prove `observedVirtualizedCls` accrues there — the field
 *  motion-audit subtracts before gating an interaction, so a click that settles a message list is not
 *  charged as an app defect. */
export function MotionVirtualizedShiftStory(): ReactElement {
  const [pushed, setPushed] = useState(false);
  useEffect(() => {
    installMotionObservers();
    // @orb-waive no-test-fabrication(unknown): a browser-context probe slot, written and read by this story's CT alone. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const probes = globalThis as unknown as { __motionRead: typeof motionSnapshot | undefined };
    probes.__motionRead = motionSnapshot;
    return (): void => {
      probes.__motionRead = undefined;
    };
  }, []);
  return (
    <div>
      <button
        type="button"
        onClick={(): void => {
          setTimeout(() => setPushed(true), 900);
        }}
      >
        settle rows later
      </button>
      <button type="button" onClick={(): void => setPushed(true)}>
        settle rows now
      </button>
      <div data-slot="message-list-viewport" style={{ height: 400, overflow: "hidden" }}>
        <div style={{ height: pushed ? 200 : 0 }} />
        <div data-testid="virtual-row" style={{ height: 300 }}>
          reconciled row
        </div>
      </div>
    </div>
  );
}

/** A real sealed anchored portal for the LoAF first-mount classifier. Both accessors come from the
 * story's module instance; a page-side import would read a second empty ring. */
export function MotionAnchoredPortalStory(): ReactElement {
  const styleTargetRef = useRef<HTMLDivElement>(null);
  const [blockSelectOpen, setBlockSelectOpen] = useState(false);
  useEffect(() => {
    installMotionObservers();
    const probes = globalThis as typeof globalThis & {
      __motionRead: typeof motionSnapshot | undefined;
      __motionReset: typeof __resetMotionStats | undefined;
    };
    probes.__motionRead = motionSnapshot;
    probes.__motionReset = __resetMotionStats;
    return (): void => {
      probes.__motionRead = undefined;
      probes.__motionReset = undefined;
    };
  }, []);
  return (
    <div style={{ width: 240 }}>
      <div onPointerDownCapture={blockSelectOpen ? (): void => blockMainThread(120) : undefined}>
        <Select
          aria-label="Anchored portal control"
          items={[
            { label: "Alpha", value: "alpha" },
            { label: "Beta", value: "beta", description: "A described option exercises the production popup anatomy." },
            { label: "Gamma", value: "gamma" },
          ]}
        />
      </div>
      <button type="button" onClick={(): void => setBlockSelectOpen(true)}>
        arm Select blocking
      </button>
      <button type="button" onClick={(): void => blockMainThread(120)}>
        plant app blocking
      </button>
      <button
        type="button"
        onClick={(): void => {
          const target = styleTargetRef.current;
          if (target === null) {
            return;
          }
          // Run outside the click dispatch so this is an ordinary app-owned style frame, not the one
          // bounded input-dispatch layout frame motion-audit deliberately exempts. Leave the write dirty
          // for the frame tail; reading offsetWidth here would consume the very render work under test.
          setTimeout(() => {
            target.style.width = "180px";
            blockMainThread(60);
          }, 0);
        }}
      >
        plant app style
      </button>
      <div ref={styleTargetRef}>style target</div>
    </div>
  );
}

/** The `[space]` flagger stage (motion-flaggers.ts task #39/#40 fix): an `<img>` with no width/height
 *  attributes, no aspect-ratio, and a blocked src — the honest "unreserved replaced-element box" shape
 *  the flagger exists to catch. Rendered on a click (not on mount) so the story controls exactly when
 *  the element enters the DOM, which is what the throttled `MutationObserver` reacts to. */
export function MotionFlaggersSpaceStory(): ReactElement {
  const [showImg, setShowImg] = useState(false);
  const [nudge, setNudge] = useState(false);
  useEffect(() => {
    installMotionFlaggers();
  }, []);
  return (
    <div>
      <button
        type="button"
        onClick={(): void => {
          setShowImg(true);
          // The `[space]` sweep throttle is untouched by task #40 (only `hasReservedBox`'s DETECTION
          // was fixed) — it still only rescans on the NEXT mutation once its window clears, so this
          // spec's own follow-up mutation is what surfaces the img already sitting unreserved in the
          // DOM. Scoped to this story; not a production behavior change.
          setTimeout(() => setNudge(true), 2200);
        }}
      >
        add image
      </button>
      {/* A src that never resolves: the flagger judges the BOX (attrs/CSS), never whether content loaded. */}
      {showImg ? <img data-testid="unreserved-img" src="/__ct_blocked__.png" alt="" /> : null}
      {/* THE OUT-OF-FLOW ARM (#516) — the login backdrop's exact anatomy: a `relative` host with an
          `absolute inset-0` full-bleed canvas carrying no width/height attrs and no aspect-ratio. It is
          removed from normal flow, so nothing lays out against it and its content can shift nothing; the
          flagger accused it anyway, once per boot, on `/login`. It shares this stage with the unreserved
          `<img>` above ON PURPOSE: that flag is the positive control that proves the sweep ran, without
          which the silence asserted here would pass for free. */}
      {showImg ? (
        <div style={{ position: "relative", width: 120, height: 60 }}>
          <canvas data-testid="out-of-flow-canvas" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
        </div>
      ) : null}
      {nudge ? <div data-testid="rescan-nudge" /> : null}
    </div>
  );
}

/** The §3.7 INTERACTIVE-STATE CARVE-OUT stage (owner ruling 2026-08-22, #456). Two surfaces, one hover
 * each, so the exemption and the thing it must NOT weaken are proven on the same mount:
 *  · `carve-out-colour-card` reproduces the ratified Card primitive affordance
 *    (`@orb/ui` card/variants.ts — `transition-colors` + `hover:bg-accent`): a paint-only colour
 *    transition driven by `:hover`. The flagger must stay silent on BOTH legs (hover in AND out).
 *  · `carve-out-geometry-card` is the POSITIVE CONTROL: the identical `:hover` trigger driving `width`,
 *    which moves geometry and is exactly what §3.7 still forbids. It must still fire, or the carve-out
 *    has blinded the channel instead of narrowing it.
 * Real `:hover` CSS rules (not inline styles) because the trigger IS the subject. */
export function MotionFlaggersInteractiveColourStory(): ReactElement {
  useEffect(() => {
    installMotionFlaggers();
  }, []);
  return (
    <div>
      <style>
        {`.orb-ct-colour-card { background-color: rgb(0 0 255); transition: background-color 120ms linear; width: 120px; height: 40px }
          .orb-ct-colour-card:hover { background-color: rgb(255 0 0) }
          .orb-ct-geometry-card { background-color: rgb(0 0 255); transition: width 120ms linear; width: 120px; height: 40px }
          .orb-ct-geometry-card:hover { width: 260px }`}
      </style>
      <div className="orb-ct-colour-card" data-testid="carve-out-colour-card" />
      <div className="orb-ct-geometry-card" data-testid="carve-out-geometry-card" />
    </div>
  );
}

/** The RATIFIED-LIFECYCLE ALLOWANCE stage (#1069 — the console twin of #953's audit-side allowance). Two
 * surfaces on one mount, so the allowance and the thing it must NOT weaken are proven together:
 *  · the REAL `@orb/ui` Collapsible, whose panel is guide §4.2 item 3's BUILT height lifecycle
 *    (`h-(--collapsible-panel-height)` from `data-starting-style:h-0`). A hand-rolled height transition
 *    would not do: the allowance is about Base UI's `data-starting-style` lifecycle, which only the real
 *    primitive produces, and the whole finding was the flagger convicting THIS component.
 *  · `dirty-height-target` is the POSITIVE CONTROL: the same PROPERTY, animated by the application with
 *    no library lifecycle behind it. It must still print OVER BUDGET, or the allowance has blinded the
 *    channel by property name instead of sanctioning a lifecycle.
 * The lifecycle recorder is installed alongside the flaggers exactly as `agent-bridge.ts` wires the app. */
export function MotionFlaggersRatifiedHeightStory(): ReactElement {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    installAnimationLifecycleRecorder();
    installMotionFlaggers();
    // @orb-waive no-test-fabrication(unknown): a browser-context probe slot, written and read by this story's CT alone. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const probes = globalThis as unknown as { __motionFlagsRead: typeof motionFlags | undefined };
    probes.__motionFlagsRead = motionFlags;
    return (): void => {
      probes.__motionFlagsRead = undefined;
    };
  }, []);
  return (
    <div>
      <Collapsible>
        <CollapsibleTrigger>Reveal the panel</CollapsibleTrigger>
        <CollapsiblePanel data-testid="ratified-panel">The ratified height lifecycle.</CollapsiblePanel>
      </Collapsible>
      <button type="button" onClick={(): void => setGrown(true)}>
        grow the box
      </button>
      <div data-testid="dirty-height-target" style={{ height: grown ? 200 : 40, transition: "height 150ms linear", background: "#ccc" }} />
    </div>
  );
}

/** A deliberately dirty color transition. Under the global reduced-motion floor (`transition-property:
 * none !important`, #257) the colour change emits no transition at all, so the flagger has nothing to
 * judge — which is what the reduced-motion spec asserts. */
export function MotionFlaggersReducedMotionStory(): ReactElement {
  const [active, setActive] = useState(false);
  useEffect(() => {
    installMotionObservers();
    installMotionFlaggers();
    // The PULL half of the channel, published from the story's own module instance (a page-side dynamic
    // import would resolve a SECOND instance with an empty ring — the MotionShiftFlaggerStory precedent).
    // @orb-waive no-test-fabrication(unknown): a browser-context probe slot, written and read by this story's CT alone. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const probes = globalThis as unknown as { __motionFlagsRead: typeof motionFlags | undefined };
    probes.__motionFlagsRead = motionFlags;
    return (): void => {
      probes.__motionFlagsRead = undefined;
    };
  }, []);
  return (
    <div>
      <button type="button" onClick={(): void => setActive(true)}>
        change color
      </button>
      <div data-testid="dirty-color-transition" style={{ color: active ? "red" : "blue", transition: "color 100ms linear" }}>
        color target
      </div>
    </div>
  );
}

/** A visible animation that can outlive an evidence reset. The reset button is the real checkpoint seam;
 * a later blocked frame must not be charged to motion that began before that checkpoint. */
export function MotionFlaggersCheckpointStory(): ReactElement {
  const [active, setActive] = useState(false);
  useEffect(() => {
    installMotionObservers();
    installMotionFlaggers();
  }, []);
  return (
    <div>
      <style>{"@keyframes orb-ct-checkpoint-motion { from { transform: translateX(0) } to { transform: translateX(20px) } }"}</style>
      <button type="button" onClick={(): void => setActive(true)}>
        start animation
      </button>
      <button type="button" onClick={__resetMotionFlags}>
        reset evidence
      </button>
      <div data-testid="checkpoint-animation" style={active ? { animation: "orb-ct-checkpoint-motion 2s linear" } : undefined}>
        moving target
      </div>
    </div>
  );
}

/** A long compositor-safe transition whose first frame is deliberately blocked. The `[drop]` flagger
 * must retain this signal without globally resolving every animation or scheduling its own rAF loop. */
export function MotionFlaggersDropStory(): ReactElement {
  const [active, setActive] = useState(false);
  const targetRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    installMotionObservers();
    installMotionFlaggers();
    const target = targetRef.current;
    const onStart = (): void => blockMainThread(80);
    target?.addEventListener("transitionstart", onStart);
    return (): void => target?.removeEventListener("transitionstart", onStart);
  }, []);
  return (
    <div>
      <button type="button" onClick={(): void => setActive(true)}>
        start blocked animation
      </button>
      <div
        ref={targetRef}
        data-testid="blocked-animation"
        style={{ transform: active ? "translateX(20px)" : "translateX(0)", transition: "transform 2s linear" }}
      >
        moving target
      </div>
    </div>
  );
}

/** Motion-audit owns dropped-frame truth through CDP while its trace is active. This stage proves its
 * narrow pause skips the duplicate in-page CSS/WAAPI lifetime work, then resumes ordinary diagnostics. */
export function MotionFlaggersAuditPauseStory(): ReactElement {
  const [active, setActive] = useState(false);
  const [cdpActive, setCdpActive] = useState(false);
  const [settled, setSettled] = useState(false);
  const targetRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    installMotionObservers();
    installMotionFlaggers();
    void motionFlaggersSettled().then(() => setSettled(true));
    const target = targetRef.current;
    const onStart = (): void => blockMainThread(100);
    target?.addEventListener("transitionstart", onStart);
    return (): void => {
      setFrameDropTrackingPaused(false);
      target?.removeEventListener("transitionstart", onStart);
    };
  }, []);
  return (
    <div>
      <div data-testid="audit-pause-flaggers-settled">{settled ? "settled" : "pending"}</div>
      <button type="button" onClick={(): void => setFrameDropTrackingPaused(true)}>
        pause audit drop tracking
      </button>
      <button type="button" onClick={(): void => setFrameDropTrackingPaused(false)}>
        resume audit drop tracking
      </button>
      <button type="button" onClick={(): void => setActive((value) => !value)}>
        plant CSS drop
      </button>
      <button type="button" onClick={(): void => setCdpActive((value) => !value)}>
        plant CDP drop
      </button>
      <button
        type="button"
        onClick={(): void => {
          targetRef.current?.animate({ opacity: [1, 0.5] }, { duration: 2000 });
          blockMainThread(100);
        }}
      >
        plant WAAPI drop
      </button>
      <div
        data-testid="audit-pause-animation"
        ref={targetRef}
        style={{ transform: active ? "translateX(20px)" : "translateX(0)", transition: "transform 2s linear" }}
      >
        moving target
      </div>
      <div
        // biome-ignore lint/suspicious/noUnknownAttribute: React supports transition lifecycle events absent from Biome's DOM allowlist.
        onTransitionStart={(): void => {
          // Begin blocking after Chromium has presented the first layout-bound animation frame. A
          // transform can keep running on the compositor and is not a dropped-frame positive control.
          requestAnimationFrame(() => requestAnimationFrame(() => blockMainThread(250)));
        }}
        style={{ width: cdpActive ? 120 : 100, transition: "width 2s linear" }}
      >
        layout-bound moving target
      </div>
    </div>
  );
}

/** The app's sortable drop settle uses WAAPI, which has no CSS animation lifecycle events. Exercise the
 * dev-only Element.animate boundary directly: one arm proves finish/cancel retire both effects; the other
 * keeps an effect live across a blocked frame so `[drop]` must still fire.
 *
 * THE RETIRED ARM'S STAGING IS LAW, NOT DECORATION (#422). `motion-animation-state.ts` releases a WAAPI
 * target SYNCHRONOUSLY inside the `finish`/`cancel` listener it registers at `Element.animate()` time
 * (`retireTarget`), and from then on attributes an ended lifetime by EXACT interval overlap: a frame is
 * blamed iff `endTime >= frame.startTime` (`targetsOverlapping`). So a blocked frame that STARTED before
 * the animation ended is an HONEST `[drop]`, and this story only tests retirement when its blocked frame
 * begins strictly after the retirement instant. Two things buy that determinism:
 *   1. The block is scheduled as a TASK from inside a rendering update (`requestAnimationFrame` →
 *      `setTimeout`). WAAPI finish/cancel events dispatch during the rendering update's "update
 *      animations and send events" step; a timer task cannot run inside that same update, so the blocked
 *      frame's first task — i.e. its LoAF `startTime` — is strictly later than the retirement instant.
 *      The nested-rAF wait this replaced left a MEASURED 0.1ms margin (probe, 2026-08-22: retire 663.8,
 *      blocked frame start 663.9), which is a coin flip, and collapsing the hop reproduced the issue's
 *      verbatim line with a frame starting 13.5ms BEFORE the retirement. The rendering update's rAF
 *      timestamp is the ordering boundary: unlike `Event.timeStamp` (when the event was created), it is
 *      sampled after both retirement listeners have run and before the timer task can start.
 *   2. The ordering verdict is rendered from THE app's single LoAF observer
 *      (`subscribeLongAnimationFrames` — never a second PerformanceObserver), so the test can barrier on
 *      a SETTLED state: the blocked frame observed AND classified. Without it `expect(lines).toEqual([])`
 *      ran before the observer delivered and passed vacuously — verified: the planted overlap above went
 *      green under the old assertion while the console carried the accusing line. */
export function MotionFlaggersWaapiDropStory(): ReactElement {
  const targetRef = useRef<HTMLDivElement>(null);
  const [retired, setRetired] = useState(false);
  const [blockedFrameOrder, setBlockedFrameOrder] = useState<string | null>(null);
  const retiredAtRef = useRef<number | null>(null);
  useEffect(() => {
    installMotionObservers();
    installMotionFlaggers();
    return subscribeLongAnimationFrames((frame) => {
      const retiredAt = retiredAtRef.current;
      // Frames that ended before the retirement (this story's own mount work) carry no verdict; the
      // first over-budget frame that REACHES the retirement instant is the plant.
      if (retiredAt === null || frame.duration <= MOTION_BUDGETS.frameGapMs || frame.startTime + frame.duration < retiredAt) {
        return;
      }
      setBlockedFrameOrder((current) => current ?? (frame.startTime > retiredAt ? "after" : "overlap"));
    });
  }, []);
  return (
    <div>
      <button
        type="button"
        onClick={(): void => {
          const target = targetRef.current;
          if (target === null) {
            return;
          }
          const finished = target.animate({ transform: ["translateX(0)", "translateX(20px)"] }, { duration: 2000 });
          const canceled = target.animate({ opacity: [1, 0.5] }, { duration: 2000 });
          const finishEvent = new Promise<void>((resolve) => finished.addEventListener("finish", () => resolve(), { once: true }));
          const cancelEvent = new Promise<void>((resolve) => canceled.addEventListener("cancel", () => resolve(), { once: true }));
          finished.finish();
          canceled.cancel();
          void Promise.all([finishEvent, cancelEvent]).then(() => {
            // Both flagger listeners were registered inside the `Element.animate` wrapper, so they ran
            // BEFORE these. The next rendering update is therefore a conservative post-retirement
            // boundary; its callback timestamp belongs to that update, while Event.timeStamp belongs to
            // event creation and can precede the flagger listener's retirement bookkeeping.
            requestAnimationFrame((postRetirementAt) => {
              retiredAtRef.current = postRetirementAt;
              setTimeout(() => {
                blockMainThread(80);
                setRetired(true);
              }, 0);
            });
          });
        }}
      >
        retire WAAPI effects
      </button>
      <button
        type="button"
        onClick={(): void => {
          targetRef.current?.animate({ transform: ["translateX(0)", "translateX(20px)"] }, { duration: 2000 });
          blockMainThread(80);
        }}
      >
        start blocked WAAPI
      </button>
      <div ref={targetRef} data-testid="waapi-animation">
        moving target
      </div>
      <div data-testid="waapi-blocked-frame-order">{blockedFrameOrder ?? "pending"}</div>
      {retired ? <div data-testid="waapi-effects-retired">retired</div> : null}
    </div>
  );
}

/** An injected TanStack-devtools subtree with the same unreserved image shape as the app defect story.
 *  The dev observer must ignore it: auditing the auditor buries first-party findings in vendor noise. */
export function MotionFlaggersExternalDevtoolsStory(): ReactElement {
  const [show, setShow] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    installMotionFlaggers();
  }, []);
  return (
    <div>
      <button
        type="button"
        onClick={(): void => {
          setShow(true);
          setTimeout(() => setDone(true), 2600);
        }}
      >
        inject devtools
      </button>
      {show ? (
        <div data-testid="tsd-main-panel">
          <img src="/__ct_blocked_devtool__.png" alt="" />
        </div>
      ) : null}
      {done ? <div data-testid="devtool-scan-complete">scan complete</div> : null}
    </div>
  );
}

/** The `[css]` trailing-edge stage: adds a single dead class ONCE (no second mutation follows), so the
 *  only way the flagger can ever see it is a TRAILING scan scheduled for when the throttle window
 *  clears — a dropping throttle would leave this silent forever. */
export function MotionFlaggersCssTrailingStory({ initialMarker = false }: { readonly initialMarker?: boolean } = {}): ReactElement {
  const [deadClassOn, setDeadClassOn] = useState(false);
  useEffect(() => {
    installMotionFlaggers();
  }, []);
  return (
    <div>
      <button type="button" onClick={(): void => setDeadClassOn(true)}>
        add dead class
      </button>
      {/* A class no stylesheet defines — the dead-token shape `[css]` exists to catch. */}
      {initialMarker ? <div className="orb-ct-initial-dead-class-marker">initial census marker</div> : null}
      <div className={deadClassOn ? "orb-ct-dead-class-marker" : undefined}>content</div>
    </div>
  );
}

/** A mutation subtree larger than one dead-class idle slice. The undefined token is deliberately on the
 * final descendant, so a test-controlled short deadline must resume the lazy walk across callbacks. */
const DEAD_CLASS_BATCH_ROWS = Array.from({ length: 96 }, (_, index) => ({ id: `dead-class-batch-${index}`, final: index === 95 }));

export function MotionFlaggersCssBatchStory(): ReactElement {
  const [show, setShow] = useState(false);
  const [drains, setDrains] = useState<readonly unknown[] | null>(null);
  useEffect(() => {
    installMotionFlaggers();
  }, []);
  useEffect(() => {
    if (!show) {
      return;
    }
    void motionFlaggersDrain().then(async (first) => {
      const second = await motionFlaggersDrain();
      setDrains([first, second]);
    });
  }, [show]);
  return (
    <div>
      <button type="button" onClick={(): void => setShow(true)}>
        add batched dead class
      </button>
      <div className="orb-ct-initial-dead-class-marker">initial census marker</div>
      {show ? (
        <div>
          {DEAD_CLASS_BATCH_ROWS.map((row) => (
            <span className={row.final ? "orb-ct-batched-dead-class-marker" : undefined} key={row.id}>
              {row.id}
            </span>
          ))}
        </div>
      ) : null}
      <div data-testid="dead-class-drain-receipts">{drains === null ? "pending" : JSON.stringify(drains)}</div>
    </div>
  );
}

/** The class the confirm-before-report harness arms: shaped like a real vendor token, defined by nothing
 *  in this page's CSS — so whether it is REPORTED depends purely on what the second CSSOM read answers. */
const LATE_DEFINED_TOKEN = "orb-ct-late-defined-marker";

/** #852 — the CONFIRM-BEFORE-REPORT harness. Drives `installDeadClassFlagger` DIRECTLY (not through
 *  `installMotionFlaggers`), with the CSSOM read INJECTED: the first call is the stale cache and, when
 *  `lateDefine` is set, every later call is the fresh read that now carries the rule — which is exactly
 *  the shipped ordering, where Base UI's ScrollArea hoists its `<style>` around the commit that mounts
 *  the element wearing the class. A real stylesheet cannot be made to land inside a draining slice on
 *  demand, which is why the read is a seam rather than a live `<style>` append. */
export function DeadClassConfirmStory({ lateDefine }: { readonly lateDefine: boolean }): ReactElement {
  const [reported, setReported] = useState<readonly string[]>([]);
  const [armed, setArmed] = useState(false);
  const [drain, setDrain] = useState<unknown>(null);
  useEffect(() => {
    let reads = 0;
    installDeadClassFlagger({
      scanIntervalMs: 10,
      onDeadClass: (token: string): void => {
        setReported((prev) => (prev.includes(token) ? prev : [...prev, token]));
      },
      readDefined: (): ReadonlySet<string> => {
        reads += 1;
        return new Set<string>(lateDefine && reads > 1 ? [LATE_DEFINED_TOKEN] : []);
      },
    });
  }, [lateDefine]);
  useEffect(() => {
    if (armed) {
      void motionFlaggersDrain().then(setDrain);
    }
  }, [armed]);
  return (
    <div>
      <button type="button" onClick={(): void => setArmed(true)}>
        arm late class
      </button>
      <div className={armed ? LATE_DEFINED_TOKEN : undefined}>content</div>
      {/* The control token arrives in the SAME mutation batch and nothing ever defines it, so its report
          is the barrier that proves the post-arm scan RAN — without it, "the late token was not reported"
          is satisfied by a scan that simply had not happened yet. */}
      <div className={armed ? "orb-ct-always-dead-marker" : undefined}>control</div>
      <div data-testid="dead-class-reports">{reported.join(",")}</div>
      <div data-testid="dead-class-drain-receipt">{drain === null ? "pending" : JSON.stringify(drain)}</div>
    </div>
  );
}

/** The probe checkpoint rail: initial dev-instrument work must expose a real completion promise. */
export function MotionFlaggersSettleStory(): ReactElement {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    installMotionFlaggers();
    void motionFlaggersSettled().then(() => setSettled(true));
  }, []);
  return <div data-testid="motion-flaggers-settled">{settled ? "settled" : "pending"}</div>;
}

/** One deliberately slow click. Event Timing emits a family of DOM entries for it; the tracer should
 *  collapse that family to one actionable `[input]` warning. */
const SLOW_INPUT_WORK_ITERATIONS = 300_000_000;

export function MotionFlaggersSlowInputStory(): ReactElement {
  const [turns, setTurns] = useState(0);
  useEffect(() => {
    installLongTaskTracer();
  }, []);
  return (
    <div>
      <button
        type="button"
        onClick={(): void => {
          let spins = 0;
          // A fixed workload makes the real browser interaction slow without consulting an ambient
          // clock. The Event Timing observer still measures browser time; the fixture stays deterministic.
          for (let index = 0; index < SLOW_INPUT_WORK_ITERATIONS; index += 1) {
            spins = Math.imul(spins + index, 16_777_619);
          }
          setTurns(spins);
        }}
      >
        slow input {turns}
      </button>
    </div>
  );
}

// The `[css]` FALSE-POSITIVE fence for the kit tokenizer (`@orb/kit/dead-css`). Tailwind v4 emits its
// variant/arbitrary utilities as ESCAPED class selectors, and the ONLY thing that makes `.sm\:max-w-dialog-lg`
// match the live `classList` token `sm:max-w-dialog-lg` is the tokenizer's un-escape step. A regression
// there does not go quiet — it flags every escaped utility in the app as dead, which buries the one real
// finding under thousands of false accusations. Both arms ship in one stage: escaped-and-DEFINED utilities
// that must stay silent, and one genuinely undefined token that must still be flagged (the positive
// control — without it a broken scan would pass the silence assertion for free).
const ESCAPED_UTILITY_SHEET = ".sm\\:max-w-dialog-lg { max-width: 40rem } .w-\\[2px\\] { width: 2px } .hover\\:bg-x\\/50 { opacity: 1 }";

export function MotionFlaggersCssEscapedTokenStory(): ReactElement {
  useEffect(() => {
    installMotionFlaggers();
  }, []);
  return (
    <div>
      <style>{ESCAPED_UTILITY_SHEET}</style>
      <div className="sm:max-w-dialog-lg w-[2px] hover:bg-x/50">escaped utilities — every one is defined by the sheet above</div>
      <div className="orb-ct-escaped-arm-dead-marker">the positive control: no rule defines this token</div>
    </div>
  );
}

/** The `[drop]` RE-ARM seam. Two mechanisms have to survive a checkpoint for a driven multi-step probe to
 *  read step 2 honestly: `raise()` dedupes per `tag|offender` for the whole session, and
 *  `resetFrameDropFlagger` drops every tracked animation lifetime. So a SECOND real stutter on the SAME
 *  surface after `__resetMotionFlags` reads as silence unless the reset re-arms both the dedupe set and
 *  the lifetime accounting. Same blocked-transition plant as MotionFlaggersDropStory, made restartable. */
export function MotionFlaggersDropRearmStory(): ReactElement {
  const [active, setActive] = useState(false);
  const targetRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    installMotionObservers();
    installMotionFlaggers();
    const target = targetRef.current;
    const onStart = (): void => blockMainThread(80);
    target?.addEventListener("transitionstart", onStart);
    return (): void => target?.removeEventListener("transitionstart", onStart);
  }, []);
  return (
    <div>
      <button type="button" onClick={(): void => setActive((value) => !value)}>
        plant stutter
      </button>
      <button type="button" onClick={__resetMotionFlags}>
        reset evidence
      </button>
      <div
        ref={targetRef}
        data-testid="rearm-animation"
        style={{ transform: active ? "translateX(20px)" : "translateX(0)", transition: "transform 2s linear" }}
      >
        moving target
      </div>
    </div>
  );
}

// A block well past `MOTION_BUDGETS.longFrameMs` (100ms), so the frame is `[frame]`-actionable with a
// non-zero blockingDuration rather than a headless presentation stretch.
const LONG_FRAME_PLANT_MS = 260;
// Enough write→read pairs that the forced synchronous layout dominates; each pair is a REAL reflow, not a
// synthesized PerformanceObserver entry.
const REFLOW_THRASH_ITERATIONS = 200;
const REFLOW_THRASH_SPIN_MS = 2;
const REFLOW_WIDTH_BASE_PX = 100;
const REFLOW_WIDTH_SPREAD_PX = 40;

/** The `[frame]`/`[reflow]` channels of `long-task-tracer.ts`, POST-P7. The tracer no longer observes
 *  `long-animation-frame` itself — it SUBSCRIBES to the ONE observer `motion-stats.ts` installs — so both
 *  installs are now required for either channel to say anything, and that new coupling is exactly what this
 *  stage exists to catch (MotionFlaggersSlowInputStory installs the tracer ALONE and can only ever exercise
 *  `[input]`). It also publishes the motion snapshot, so one test can prove the shared LoAF ring RECEIVED
 *  the frame it is judging. THREE plants, because `[reflow]` is a two-armed claim: a pure blocking script;
 *  the same block interleaved with write→read style thrash so a script FORCES synchronous layout
 *  (`forcedStyleAndLayoutDuration` > 0); and — the negative arm — a style WRITE with no read back, which
 *  makes the frame run style/layout at its end (`styleAndLayoutStart` > 0) while no script forced
 *  anything. That third shape is what every ordinary rendering frame looks like, and it is what the
 *  `styleAndLayoutStart`-gated `[reflow]` line mis-accused (#432). */
export function MotionFrameReflowStory(): ReactElement {
  const thrashRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    installMotionObservers();
    installLongTaskTracer();
    // Published from HERE for the reason MotionShiftFlaggerStory states: a page-side import would resolve
    // a second module instance whose ring is always empty.
    // @orb-waive no-test-fabrication(unknown): a browser-context probe slot, written and read by this story's CT alone. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const probes = globalThis as unknown as { __motionRead: typeof motionSnapshot | undefined };
    probes.__motionRead = motionSnapshot;
    return (): void => {
      probes.__motionRead = undefined;
    };
  }, []);
  return (
    <div>
      <button type="button" onClick={(): void => blockMainThread(LONG_FRAME_PLANT_MS)}>
        plant long frame
      </button>
      <button
        type="button"
        onClick={(): void => {
          const target = thrashRef.current;
          if (target === null) {
            return;
          }
          let measured = 0;
          for (let index = 0; index < REFLOW_THRASH_ITERATIONS; index += 1) {
            target.style.width = `${REFLOW_WIDTH_BASE_PX + (index % REFLOW_WIDTH_SPREAD_PX)}px`;
            // The read IMMEDIATELY after the write is the forced synchronous layout — the defect class.
            measured += target.offsetWidth;
            blockMainThread(REFLOW_THRASH_SPIN_MS);
          }
          // Consumed so no engine can elide the layout-forcing reads above.
          target.dataset["reflowMeasured"] = String(measured);
        }}
      >
        plant forced reflow
      </button>
      <button
        type="button"
        onClick={(): void => {
          const target = thrashRef.current;
          if (target === null) {
            return;
          }
          // A style WRITE and NOTHING read back: the browser runs style/layout for this frame at its end
          // (so `styleAndLayoutStart` > 0), but no script forced a synchronous layout, so every script's
          // `forcedStyleAndLayoutDuration` stays 0. The block is what makes the frame long enough to be
          // published at all — the frame is otherwise an ordinary render.
          target.style.width = `${REFLOW_WIDTH_BASE_PX + REFLOW_WIDTH_SPREAD_PX}px`;
          blockMainThread(LONG_FRAME_PLANT_MS);
        }}
      >
        plant render frame
      </button>
      <button
        type="button"
        onClick={(): void => {
          // BOTH floors: motion-stats owns the ring + the publish floor, the tracer owns its own console
          // floor on top. The negative arm needs a checkpoint so a mount-time frame cannot answer for the
          // frame the test plants.
          __resetMotionStats();
          __resetLongTaskEvidence();
        }}
      >
        reset frame evidence
      </button>
      <div ref={thrashRef} data-testid="reflow-target" style={{ width: REFLOW_WIDTH_BASE_PX }}>
        reflow target
      </div>
    </div>
  );
}

// Just past app-ready-signal's 3s readiness GRACE. The marker is a settled RENDERED state, not a sleep: the CT
// barriers on it, then asks what the flag did — which is the only way to observe a timer's decision without
// a fixed wait.
const GRACE_MARKER_MS = 3500;

/** A route that is ALREADY resolved — the readiness port for the stories whose subject is the query-cache
 *  half of the contract. Not exported: a `_ct-stories` module may export components only (playwright-ct
 *  rewrites its named imports into generated component consts, and a mixed import fails to parse). */
const SETTLED_ROUTE: RouteResolution = {
  isResolving: (): boolean => false,
  subscribe: (): (() => void) => (): void => undefined,
};

/** A route whose resolution the story owns — `resolving` flips on the click, then every subscriber is
 *  notified, exactly as `routes/router.tsx`'s adapter does on the router's `onRendered` event. */
interface StoryRoute {
  readonly port: RouteResolution;
  readonly resolve: () => void;
}

function createStoryRoute(): StoryRoute {
  const listeners = new Set<() => void>();
  let resolving = true;
  return {
    port: {
      isResolving: (): boolean => resolving,
      subscribe: (onChange: () => void): (() => void) => {
        listeners.add(onChange);
        return (): void => {
          listeners.delete(onChange);
        };
      },
    },
    resolve: (): void => {
      resolving = false;
      for (const onChange of listeners) {
        onChange();
      }
    },
  };
}

/** The "route component" — it is the thing that owns the initial read, so the read cannot exist before it
 *  mounts. That ordering IS the defect's shape: on a cold stage the router was still fetching this
 *  component's chunk when the readiness grace expired. */
function StoryRouteComponent({ client, read }: { readonly client: QueryClient; readonly read: Promise<string> }): ReactElement {
  useEffect(() => {
    void client.fetchQuery({ queryKey: ["ct-route-read"], queryFn: () => read });
  }, [client, read]);
  return <div data-testid="route-mounted">route mounted</div>;
}

/** The ROUTE-RESOLUTION half of the readiness contract (issue #145) — the exact `snap --isolated` shape:
 *  the router is still fetching `/`'s ~4.9 MB lazy component chunk, so at the 3s grace NO query exists at
 *  all. Under the install-armed grace the flag went up SETTLED on the boot glyph and every instrument
 *  screenshotted it while reporting a clean wait. The story's route mounts — and only then issues its read —
 *  on a click, so the test owns both beats and never sleeps on a timer. */
export function AppReadyRouteResolutionStory(): ReactElement {
  const [graceElapsed, setGraceElapsed] = useState(false);
  const [routeMounted, setRouteMounted] = useState(false);
  const [client] = useState(() => new QueryClient());
  const [gate] = useState(() => Promise.withResolvers<string>());
  const [route] = useState(createStoryRoute);
  useEffect(() => {
    installAppReadySignal(client, route.port);
    const marker = setTimeout(() => setGraceElapsed(true), GRACE_MARKER_MS);
    return (): void => {
      clearTimeout(marker);
    };
  }, [client, route]);
  return (
    <div>
      {graceElapsed ? <div data-testid="grace-elapsed">grace elapsed</div> : null}
      <button
        type="button"
        onClick={(): void => {
          route.resolve();
          setRouteMounted(true);
        }}
      >
        resolve the route
      </button>
      <button
        type="button"
        onClick={(): void => {
          gate.resolve("the read finally landed");
        }}
      >
        land the read
      </button>
      {routeMounted ? <StoryRouteComponent client={client} read={gate.promise} /> : null}
    </div>
  );
}

/** The `data-app-ready` signal under a read that is STILL RUNNING when the grace fires — the exact shape that
 *  made every waiting instrument lie. `installAppReadySignal` is timer + query-cache wiring on the real
 *  `<html>` element, so a CT is the only tier that can observe it (same reason as MotionShiftFlaggerStory).
 *  The story owns a query that never resolves until its button is pressed, so the test controls the settle. */
export function AppReadySignalStory(): ReactElement {
  const [graceElapsed, setGraceElapsed] = useState(false);
  const [client] = useState(() => new QueryClient());
  const [gate] = useState(() => Promise.withResolvers<string>());
  useEffect(() => {
    installAppReadySignal(client, SETTLED_ROUTE);
    // fetchQuery, not a hook: the subject reads `queryClient.isFetching()` and the cache subscription only,
    // so driving the cache directly keeps the story free of the sealed query machinery it does not test.
    void client.fetchQuery({ queryKey: ["ct-app-ready"], queryFn: () => gate.promise });
    const marker = setTimeout(() => setGraceElapsed(true), GRACE_MARKER_MS);
    return (): void => {
      clearTimeout(marker);
    };
  }, [client, gate]);
  return (
    <div>
      {graceElapsed ? <div data-testid="grace-elapsed">grace elapsed</div> : null}
      <button
        type="button"
        onClick={(): void => {
          gate.resolve("the read finally landed");
        }}
      >
        land the read
      </button>
    </div>
  );
}

/** The `data-app-ready` signal under a BOOT-CRITICAL DEPENDENT read that is still pending after the parent
 *  query has settled (#282) — the chained-query false-idle the boot-read gate closes. A boot read is
 *  registered pending from the start (the theme, chained off settings); the parent query lands on a click,
 *  which idles the cache, but the flag must NOT go up until the dependent read is resolved (the second
 *  button). Under the OLD signal an idle cache + a seen fetch settled here, lifting the boot veil onto the
 *  base theme polarity a beat before the resolved theme swapped it. */
export function AppReadyBootReadStory(): ReactElement {
  const [graceElapsed, setGraceElapsed] = useState(false);
  const [client] = useState(() => new QueryClient());
  const [parentGate] = useState(() => Promise.withResolvers<string>());
  useEffect(() => {
    __resetBootReads();
    // The dependent (theme-shaped) read is pending from boot — it is chained off the parent below.
    setBootReadPending("ct-boot", true);
    installAppReadySignal(client, SETTLED_ROUTE);
    void client.fetchQuery({ queryKey: ["ct-boot-parent"], queryFn: () => parentGate.promise });
    const marker = setTimeout(() => setGraceElapsed(true), GRACE_MARKER_MS);
    return (): void => {
      clearTimeout(marker);
      __resetBootReads();
    };
  }, [client, parentGate]);
  return (
    <div>
      {graceElapsed ? <div data-testid="grace-elapsed">grace elapsed</div> : null}
      <button type="button" onClick={(): void => parentGate.resolve("parent landed")}>
        land the parent read
      </button>
      <button type="button" onClick={(): void => setBootReadPending("ct-boot", false)}>
        resolve the dependent read
      </button>
    </div>
  );
}

/** The toast surface — the same manager/bind as above, for any OTHER feature story whose behavior under
 *  test ends in a `notify.*` call (the toast pixels are its only observable consequence). Homed here, not in a
 *  new support module, because `bindNotify` sets a MODULE-GLOBAL: a second module binding a second manager
 *  would race on import order and the loser's toasts would vanish. One manager, one bind, every toast story.
 *
 *  It mounts `AppToaster`, the PRODUCTION outlet, not the bare `Toaster` (#193): where the stack paints is
 *  a decision — the shell's notice band when a shell is mounted, the fixed overlay when there is none — and
 *  a story that hand-rolled the overlay half would go green against a placement the app never renders. A
 *  story with no shell in it lands on `overlay`, which is exactly what such a surface gets in production. */
export function CtToastSurface({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <ToastProvider toastManager={toastManager}>
      {children}
      <AppToaster />
    </ToastProvider>
  );
}

const BRIDGE_CHAT_ID = mintTypeId(ID_PREFIX.chat);

/** Real `installAgentDebugHandle` mount for the #894 completeness/ring contract. External composition
 * handles are inert fakes; every lib-owned capability and reset is the production implementation. */
export function AgentBridgeStory(): ReactElement {
  const [client] = useState(() => new QueryClient());
  const cssStateRef = useRef({ calls: 0 });
  const [motionActive, setMotionActive] = useState(false);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [sharedReady, setSharedReady] = useState(false);
  const [visibleChat, setVisibleChat] = useState(false);
  const motionTargetRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handles = {
      nav: {
        capabilities: () => ({
          sections: [],
          modalSlots: [],
          configGroups: [],
          contextTabs: [],
          contextTabNames: [],
          contextTabsPublished: true,
          chatPositions: [],
        }),
        section: () => ({ ok: true as const }),
        openModal: () => ({ ok: true as const }),
        openConfig: () => ({ ok: true as const }),
        contextTab: async () => ({ ok: true as const }),
        openChat: async () => ({ ok: true as const }),
        openCharacter: async () => ({ ok: true as const }),
        closeModal: () => ({ ok: true as const }),
        panel: async () => ({ ok: true as const }),
        focus: () => ({ ok: true as const }),
      },
      seed: { game: async () => ({ chatId: BRIDGE_CHAT_ID }), richGame: async () => ({ chatId: BRIDGE_CHAT_ID }) },
      rpg: async () => ({ chatId: null, game: null, tracker: null, journal: [], turnToolCalls: [] }),
      pluginLog: async () => ({ ok: true as const, plugins: [] }),
      css: {
        read: () => ({ enabled: true, calls: cssStateRef.current.calls, conflictCalls: 0, deduplicatedConflictCalls: 0, receipts: [], status: "ok" as const }),
        reset: () => {
          cssStateRef.current.calls = 0;
        },
      },
      durableLocalUserId: () => null,
    } satisfies OrbAgentHandles;
    installAgentDebugHandle(client, handles);
    installAppReadySignal(client, SETTLED_ROUTE);
    void client.fetchQuery({ queryKey: ["ct-agent-bridge-ready"], queryFn: async () => "ready" });
    globalThis.__orb?.resetEvidence();
    // The REAL bus doors, not a test plant: their evidence bookkeeping is unconditional, so a
    // production-mode CT bundle drives the same counter `use-chat-bus.ts` drives (#1847).
    busSubscribe(BRIDGE_CHAT_ID, false);
    const motionTarget = motionTargetRef.current;
    const blockStartedAnimation = (): void => blockMainThread(120);
    motionTarget?.addEventListener("animationstart", blockStartedAnimation);
    let live = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (live) {
          // The identity check is time-invariant after the handle install (appReady is a module const
          // and installAppReadySignal never touches __orb) — read here so the setState lives in a
          // callback, not the effect body (react-hooks/set-state-in-effect).
          setSharedReady(globalThis.__orb?.ready === appReady);
          setBridgeReady(true);
        }
      });
    });
    return (): void => {
      live = false;
      motionTarget?.removeEventListener("animationstart", blockStartedAnimation);
      busUnsubscribe(BRIDGE_CHAT_ID);
      globalThis.__orb = undefined;
    };
  }, [client]);
  return (
    <div>
      {bridgeReady ? <div data-testid="bridge-installed">installed</div> : null}
      <div data-testid="bridge-ready-shared">{sharedReady ? "shared" : "forked"}</div>
      <section data-testid="retained-chat-section" style={{ display: "none" }}>
        <article aria-label="Retained inactive chat">retained chat</article>
      </section>
      <button type="button" onClick={(): void => setVisibleChat((open) => !open)}>
        toggle visible chat
      </button>
      {visibleChat ? (
        <section style={{ visibility: "hidden" }}>
          <article aria-label="Active chat" style={{ visibility: "visible" }}>
            active chat
          </article>
        </section>
      ) : null}
      <style>{"@keyframes orb-ct-bridge-dirty { from { width: 80px } to { width: 160px } }"}</style>
      <button
        type="button"
        onClick={(): void => {
          busInvalidate("ct.bridge", BRIDGE_CHAT_ID, ["chat.list"]);
          recordRender("ct:bridge", "mount", 7);
          cssStateRef.current.calls = 1;
          perfMeasureFromLoad("ct-bridge");
          setMotionActive(true);
        }}
      >
        seed bridge evidence
      </button>
      <div
        ref={motionTargetRef}
        data-testid="bridge-motion"
        style={{ width: 80, height: 20, animation: motionActive ? "orb-ct-bridge-dirty 10s linear" : undefined }}
      />
      {/* #1122 · THE PANEL-ROW TRI-STATE `shell()` MUST CARRY. `shell()` is DOM-derived, so these three
          asides ARE its input: a pane whose section declares it (`true`), one whose section declares it
          UNAVAILABLE (`false` — indistinguishable from the middle one by `data-panel-mode` alone, which is
          the whole reason the attribute exists), and one publishing NO declaration, which must read `null`
          and never default to `true`. Raw `.shell-panel` markup rather than a real shell is deliberate: the
          unit here is the bridge's READER; `app-shell.ct.tsx` pins that the real shell publishes it. */}
      <aside className="shell-panel" data-panel-available="true" data-panel-mode="docked" data-panel-side="list" />
      <aside className="shell-panel" data-panel-available="false" data-panel-mode="collapsed" data-panel-side="context" />
      <aside className="shell-panel" data-panel-mode="collapsed" data-panel-side="undeclared" />
    </div>
  );
}
