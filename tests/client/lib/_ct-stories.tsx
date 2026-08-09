// Story module for the lib-tier CTs (Spine-Testing §7 — CT mounts ONLY from a non-test module).
// NotifyToastStory reproduces the EXACT main.tsx wiring of the `notify` seam's render half (F1): the
// D54 QueryCache/MutationCache `errorToast` channel (data/query-client.ts) → the `notify` facade →
// the toast manager bound at the composition root → `<ToastProvider>`/`<Toaster>` pixels. Before F1
// this middle was missing, so every errorToast-meta failure was console-only. The story mints the app
// QueryClient (the one whose MutationCache.onError reads `meta.errorToast`), binds `notify` to a real
// toast manager, and fires a mutation whose `meta.errorToast` message must reach a rendered toast.

import { createAppQueryClient } from "@orb/client/data";
import { bindNotify, createToastNotify, notify } from "@orb/client/lib";
import { createToastManager, Toaster, ToastProvider } from "@orb/ui/toast";
// @orb-gate-ignore query-machine-seals(useMutation): test-tier code the gate's `\.test\.tsx?$` scope
// cannot see — Spine-Testing §7 requires a CT to mount from a NON-test story module, so every
// `_ct-stories` file is test-tier while carrying a production filename. The raw `useMutation` is the
// SUBJECT: this story reproduces main.tsx's D54 MutationCache.onError→errorToast→notify channel, and
// createEntityMutation would put the client's own belt between the CT and the global channel under test.
// ENDS WHEN: query-machine-seals widens its test scope to `_ct-stories` modules, or this story is
// deleted. §4.3a position-named — an import line can carry BOTH sealed hooks, and a bare marker here
// would silently absolve a future `useInfiniteQuery` on the same line.
import { QueryClient, QueryClientProvider, useMutation } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useState } from "react";
// Deep, not `@orb/client/lib`: agent-bridge is OUT of the barrel too (main.tsx imports it by path — a
// re-export would drag the dev-only introspection handle into the prod bundle).
import { installAppReadySignal } from "../../../packages/client/src/lib/agent-bridge.ts";
// Deep, not `@orb/client/lib`: motion-stats is deliberately OUT of the barrel (its header — a barrel
// re-export would drag the dev observers into the prod bundle), so the only way to reach it is the path.
import { installMotionFlaggers } from "../../../packages/client/src/lib/motion-flaggers.ts";
import { installMotionObservers, motionSnapshot } from "../../../packages/client/src/lib/motion-stats.ts";

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
    // FABRICATION-OK: a browser-context probe slot, written and read by this story's CT alone.
    (globalThis as unknown as { __motionRead?: typeof motionSnapshot }).__motionRead = motionSnapshot;
  }, []);
  return (
    <div>
      <button type="button" onClick={(): void => setPushed(true)}>
        shift now
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
      {/* The spacer IS the shift: 0 → 200px pushes everything after it down the page. */}
      <div style={{ height: pushed ? 200 : 0 }} />
      <div data-testid="cls-victim" style={{ height: 300, background: "#ccc" }}>
        pushed block
      </div>
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
      {nudge ? <div data-testid="rescan-nudge" /> : null}
    </div>
  );
}

/** The `[css]` trailing-edge stage: adds a single dead class ONCE (no second mutation follows), so the
 *  only way the flagger can ever see it is a TRAILING scan scheduled for when the throttle window
 *  clears — a dropping throttle would leave this silent forever. */
export function MotionFlaggersCssTrailingStory(): ReactElement {
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
      <div className={deadClassOn ? "orb-ct-dead-class-marker" : undefined}>content</div>
    </div>
  );
}

// Just past agent-bridge's 3s readiness GRACE. The marker is a settled RENDERED state, not a sleep: the CT
// barriers on it, then asks what the flag did — which is the only way to observe a timer's decision without
// a fixed wait.
const GRACE_MARKER_MS = 3500;

/** The `data-app-ready` signal under a read that is STILL RUNNING when the grace fires — the exact shape that
 *  made every waiting instrument lie. `installAppReadySignal` is timer + query-cache wiring on the real
 *  `<html>` element, so a CT is the only tier that can observe it (same reason as MotionShiftFlaggerStory).
 *  The story owns a query that never resolves until its button is pressed, so the test controls the settle. */
export function AppReadySignalStory(): ReactElement {
  const [graceElapsed, setGraceElapsed] = useState(false);
  const [client] = useState(() => new QueryClient());
  const [gate] = useState(() => Promise.withResolvers<string>());
  useEffect(() => {
    installAppReadySignal(client);
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

/** The bare toast surface — the same manager/bind as above, for any OTHER feature story whose behavior under
 *  test ends in a `notify.*` call (the toast pixels are its only observable consequence). Homed here, not in a
 *  new support module, because `bindNotify` sets a MODULE-GLOBAL: a second module binding a second manager
 *  would race on import order and the loser's toasts would vanish. One manager, one bind, every toast story. */
export function CtToastSurface({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <ToastProvider toastManager={toastManager}>
      {children}
      <Toaster />
    </ToastProvider>
  );
}
