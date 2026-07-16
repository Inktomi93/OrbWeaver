// Agent/automation bridge — the browser-side introspection seam so Playwright/snap/agent
// browser-driving read app state directly instead of scraping the DOM. Two installs, wired once from
// main.tsx: installAppReadySignal sets `data-app-ready` on <html> once the query cache goes idle after
// initial reads (a stable wait target that never hangs on the never-idle SSE bus); installAgentDebugHandle
// installs dev-only `globalThis.__orb`.

import type { QueryClient } from "@tanstack/react-query";
import type { BusEventRecord } from "./bus-devlog";
import { busEventRing, busLiveCount } from "./bus-devlog";
import { IS_DEV } from "./dev-flag";
import type { AnimationRecord, MotionSnapshot } from "./motion-stats";
import { activeAnimations, installMotionObservers, motionSnapshot } from "./motion-stats";
import { perfMeasureFromLoad, recentMeasures } from "./perf-marks";
import { renderHeatmap } from "./render-stats";

const READY_ATTR = "data-app-ready";
const READY_FALLBACK_MS = 3000;

let markReady = (): void => undefined;
/** Resolves once the app has hydrated and its initial reads have settled (see installAppReadySignal). */
const ready: Promise<void> = new Promise<void>((resolve) => {
  markReady = resolve;
});

export function installAppReadySignal(queryClient: QueryClient): void {
  const el = document.documentElement;
  const cache = queryClient.getQueryCache();
  let settled = false;
  const finish = (): void => {
    if (settled) {
      return;
    }
    settled = true;
    el.setAttribute(READY_ATTR, "");
    perfMeasureFromLoad("app-ready");
    markReady();
  };
  const check = (): void => {
    if (queryClient.isFetching() === 0) {
      finish();
    }
  };
  const unsubscribe = cache.subscribe(check);
  void ready.finally(unsubscribe);
  // Give Suspense two frames to kick off the initial reads before the first idle check, so we don't
  // fire on the pre-fetch idle window.
  requestAnimationFrame(() => {
    requestAnimationFrame(check);
  });
  // An app with no initial reads is still "ready" after the grace — never hang a waiter.
  setTimeout(finish, READY_FALLBACK_MS);
}

interface QuerySummary {
  readonly key: unknown;
  readonly status: string;
  readonly fetch: string;
  readonly stale: boolean;
  readonly updatedAt: number;
}

interface ShellSnapshot {
  readonly section: string | null;
  readonly panels: ReadonlyArray<{ side: string | null; mode: string | null }>;
  readonly chatOpen: boolean;
}

interface OrbDebugHandle {
  /** Resolves when `data-app-ready` is set (initial reads settled). */
  readonly ready: Promise<void>;
  readonly isReady: () => boolean;
  /** The full query cache as plain rows (key · status · fetchStatus · stale · updatedAt). */
  readonly queries: () => readonly QuerySummary[];
  /** The chat-bus: live subscription count + the recent canon-event ring (bus-devlog). */
  readonly bus: () => { readonly live: number; readonly events: readonly BusEventRecord[] };
  /** DOM-derived shell state (active section · panel modes · whether a chat room is open). */
  readonly shell: () => ShellSnapshot;
  /** The recorded `orb:*` User Timing measures (name → ms): app-ready, turn latency/TTFT, etc. */
  readonly perf: () => ReadonlyArray<{ name: string; ms: number }>;
  /** The render heatmap: which <Profiler>-wrapped surfaces re-render, how often, how expensive. */
  readonly renders: () => ReturnType<typeof renderHeatmap>;
  /** LoAF ring + CLS/worst-blocking/worst-shift — the "what blocks the frame / instability" signals. */
  readonly motion: () => MotionSnapshot;
  /** Active animations, each classified compositor-clean (transform/opacity/filter) or a jank risk. */
  readonly animations: () => readonly AnimationRecord[];
  /** One-call overview for a quick `preview_eval("__orb.snap()")`. */
  readonly snap: () => Record<string, unknown>;
}

declare global {
  // `var` is required: ambient global augmentation must use var to attach to globalThis.
  var __orb: OrbDebugHandle | undefined;
}

/** The compact motion line for snap(): ring depth + the two headline jank numbers + the count of
 *  active animations that aren't compositor-clean. */
function motionSummary(): {
  loafs: number;
  worstBlocking: number;
  cls: number;
  dirtyAnimations: number;
} {
  const m = motionSnapshot();
  return {
    loafs: m.loafs.length,
    worstBlocking: m.worstBlocking,
    cls: m.cls,
    dirtyAnimations: activeAnimations().filter((a) => !a.compositorClean).length,
  };
}

export function installAgentDebugHandle(queryClient: QueryClient): void {
  if (!IS_DEV) {
    return;
  }
  installMotionObservers();
  const isReady = (): boolean => document.documentElement.hasAttribute(READY_ATTR);
  const shell = (): ShellSnapshot => ({
    section: document.querySelector('[aria-current="page"]')?.getAttribute("aria-label") ?? null,
    panels: [...document.querySelectorAll(".shell-panel")].map((p) => ({
      side: p.getAttribute("data-panel-side"),
      mode: p.getAttribute("data-panel-mode"),
    })),
    chatOpen: document.querySelectorAll('[role="article"]').length > 0,
  });
  const queries = (): readonly QuerySummary[] =>
    queryClient
      .getQueryCache()
      .getAll()
      .map(
        (q): QuerySummary => ({
          key: q.queryKey,
          status: q.state.status,
          fetch: q.state.fetchStatus,
          stale: q.isStale(),
          updatedAt: q.state.dataUpdatedAt,
        }),
      );
  const bus = (): { readonly live: number; readonly events: readonly BusEventRecord[] } => ({
    live: busLiveCount(),
    events: busEventRing(),
  });
  const snap = (): Record<string, unknown> => ({
    ready: isReady(),
    shell: shell(),
    bus: { live: busLiveCount(), events: busEventRing().length },
    queries: {
      total: queryClient.getQueryCache().getAll().length,
      fetching: queryClient.isFetching(),
    },
    perf: recentMeasures(),
    renders: renderHeatmap(),
    motion: motionSummary(),
  });
  globalThis.__orb = {
    ready,
    isReady,
    queries,
    bus,
    shell,
    perf: recentMeasures,
    renders: renderHeatmap,
    motion: motionSnapshot,
    animations: activeAnimations,
    snap,
  };
  console.info(
    "%c[orb]%c dev introspection ready → %cwindow.__orb%c.snap() · .queries() · .bus() · .perf() · .renders() · .motion() · .animations() · .shell();  wait on %chtml[data-app-ready]%c.  Docs: packages/client/src/lib/agent-tools.README.md",
    "color:#e0a; font-weight:bold",
    "color:#888",
    "color:#0a7; font-weight:bold",
    "color:#888",
    "color:#06c",
    "color:#888",
  );
}
