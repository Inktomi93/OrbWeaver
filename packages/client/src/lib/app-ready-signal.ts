// Shared production readiness; the dev bridge observes the same Promise and DOM marker.
// The bounded fallback releases waiters as degraded. Late settlement upgrades the marker.
// This module must not import development instrumentation.

import type { QueryClient } from "@tanstack/react-query";
import { bootReads } from "./boot-reads.ts";
import { perfMeasureFromLoad } from "./perf-marks.ts";

const READY_ATTR = "data-app-ready";
// The grace before the first "no initial reads at all" check. An app that never fetches is ready here.
const READY_GRACE_MS = 3000;
// The hard ceiling. Past this the flag goes up REGARDLESS so no waiter ever hangs — but it goes up carrying
// `degraded`, because at that point the reads have NOT settled and the flag is no longer a settle claim.
const READY_CEILING_MS = 20_000;
/** `data-app-ready` values. Presence means "stop waiting"; the VALUE is whether that was a real settle. */
const READY_SETTLED = "";
const READY_DEGRADED = "degraded";

/** Resolves at initial settlement or the bounded degraded fallback. The DOM marker can later recover
 * from degraded; the dev bridge exposes this same one-shot Promise. */
const appReadyState = Promise.withResolvers<void>();
export const appReady: Promise<void> = appReadyState.promise;

/** Read the same DOM marker `installAppReadySignal` owns. */
export function isAppReady(): boolean {
  return document.documentElement.hasAttribute(READY_ATTR);
}

/** The readiness signal's view of ROUTE RESOLUTION — a narrow port, not the router itself: `lib/` is the
 *  floor tier and may not reach up into `routes/`. A route is RESOLVING from a navigation's start until its
 *  `beforeLoad` guard, loader and lazy component chunk have all landed; the app's adapter is
 *  `routeResolution` in `routes/router.tsx`. A host with no router (a CT story) supplies its own. */
export interface RouteResolution {
  /** Is a route still resolving right now? While TRUE, an idle query cache proves nothing. */
  readonly isResolving: () => boolean;
  /** Fire `onChange` whenever resolution state may have changed; returns the unsubscribe. */
  readonly subscribe: (onChange: () => void) => () => void;
}

export function installAppReadySignal(queryClient: QueryClient, routeResolution: RouteResolution): void {
  const el = document.documentElement;
  const cache = queryClient.getQueryCache();
  let settled = false;
  let announced = false;
  const unsubscribers: (() => void)[] = [];
  const finish = (state: string): void => {
    if (settled) {
      return;
    }
    el.setAttribute(READY_ATTR, state);
    if (!announced) {
      announced = true;
      perfMeasureFromLoad("app-ready");
      appReadyState.resolve();
    }
    if (state === READY_SETTLED) {
      settled = true;
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
    }
  };
  // IDLE IS NOT READY UNTIL A READ HAS BEEN SEEN. An idle cache means two different things — "the initial
  // reads have drained" and "they have not started yet" — and only the first is readiness. The old shape
  // guessed between them by waiting two frames before the first check, which is a race against however long
  // the router/Suspense takes to kick the first read off (a CT drove the wrong side of it on the first run).
  // Track it instead: once ANY fetch has been observed, an idle cache is a real settle.
  let sawFetch = false;
  let graced = false;
  let graceTimer: ReturnType<typeof setTimeout> | null = null;
  const check = (): void => {
    if (queryClient.isFetching() > 0) {
      sawFetch = true;
      return;
    }
    // A route still resolving has not MOUNTED the component that owns the initial reads, so its idle cache
    // carries no information at all — neither arm below may fire (issue #145). The 20s ceiling still covers
    // a route that never resolves, and it hands over `degraded`, which is the truth about that capture.
    if (routeResolution.isResolving()) {
      return;
    }
    // A BOOT-CRITICAL DEPENDENT read is still resolving (#282). The selected theme is CHAINED off
    // `settings.getUserSettings`, so between the parent settling and the child fetch STARTING the cache is
    // momentarily idle — settling here lifted the boot veil onto the base palette a beat before the resolved
    // theme swapped it (the cold-cache polarity flash). Wait for it, exactly as for an in-flight fetch. It is
    // bounded: this only DELAYS settlement and the 20s ceiling still fires `degraded` if a
    // registered read never resolves (`boot-reads.ts`).
    if (bootReads.isPending()) {
      return;
    }
    // Idle with no read ever seen is only "ready" once the grace has passed — the genuine no-initial-reads
    // app, which is the single case the old unconditional fallback existed to answer.
    if (sawFetch || graced) {
      finish(READY_SETTLED);
    }
  };
  unsubscribers.push(cache.subscribe(check), bootReads.subscribe(check));
  requestAnimationFrame(() => {
    requestAnimationFrame(check);
  });
  // THE GRACE IS A CHECK, NOT A HAND-OUT (2026-08-09). It used to `finish()` unconditionally at 3s, so an
  // app whose initial reads were still running got the SETTLED flag anyway — and every instrument that waits
  // on it (snap's readiness gate, design-audit, motion-audit, the e2e actors) captured a mid-hydration app
  // while reporting a clean wait. That is how `snap --isolated` came to screenshot the Corpus home stuck on
  // "Loading your corpus…" and read as a product defect: a five-deep Suspense waterfall on a cold stage
  // simply takes longer than 3s. The grace now only unlocks the no-reads-at-all arm; it never overrides an
  // in-flight one.
  //
  // AND ITS WINDOW STARTS AT ROUTE RESOLUTION (issue #145), not at install: measured from install it expired
  // while the router was still fetching `/`'s lazy component chunk, and the very next cache tick after that
  // chunk landed found an idle cache with `graced` already true — the flag went up SETTLED before a single
  // read had been issued. Armed from resolution, the 3s is what it always claimed to be: an app that has
  // MOUNTED its route and still issued no read genuinely has none.
  const armGrace = (): void => {
    if (graceTimer !== null || routeResolution.isResolving()) {
      return;
    }
    graceTimer = setTimeout(() => {
      graced = true;
      check();
    }, READY_GRACE_MS);
  };
  unsubscribers.push(
    routeResolution.subscribe(() => {
      armGrace();
      check();
    }),
  );
  armGrace();
  // The ceiling still guarantees "never hang a waiter", but it tells the truth about what it is handing over:
  // reads are STILL in flight, so the flag goes up as `degraded` and anything reading the value knows the
  // capture is mid-flight rather than settled.
  setTimeout(() => {
    finish(READY_DEGRADED);
  }, READY_CEILING_MS);
}
