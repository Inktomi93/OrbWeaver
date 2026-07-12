// Agent / automation bridge (UI-Arch §2.1 lib/ — cross-cutting util) — the BROWSER-side introspection
// seam so Playwright, the `snap` probe, and agent browser-driving read app state directly instead of
// scraping the DOM. The server observability (`foundation/observability`) covers the server; this is
// its client peer. Two installs, wired once from `main.tsx`:
//
//   • installAppReadySignal — sets `data-app-ready` on <html> the first time the query cache goes idle
//     AFTER the initial reads have started. SSE subscriptions are NOT queries, so this fires with the
//     chat-bus stream still open: a stable wait target (`page.waitForSelector("html[data-app-ready]")`,
//     `pnpm snap / --wait "html[data-app-ready]"`) that never hangs on the never-idle SSE connection —
//     the exact friction that timed out live screenshots. Also resolves the `ready` promise. Installed
//     in BOTH dev + prod (a tiny attribute that also serves CI e2e); a 3s fallback means it never hangs.
//
//   • installAgentDebugHandle — DEV-ONLY `globalThis.__orb`: one eval returns the shell/query/bus
//     snapshot, bridging the existing `[bus]` ring (bus-devlog.ts) + the QueryClient. IS_DEV-folded out.

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
export const ready: Promise<void> = new Promise<void>((resolve) => {
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
    // `orb:app-ready` = navigation-start → hydrated-and-settled (User Timing track + __orb.perf()).
    perfMeasureFromLoad("app-ready");
    markReady();
  };
  const check = (): void => {
    if (queryClient.isFetching() === 0) {
      finish();
    }
  };
  const unsubscribe = cache.subscribe(check);
  // Stop listening once ready is reached (via the settle path OR the fallback timer).
  void ready.finally(unsubscribe);
  // Give Suspense two frames to kick off the initial reads (isFetching → >0) before the first idle
  // check, so we don't fire on the pre-fetch idle window. rAF²≈ after the first paint + effects.
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

export interface OrbDebugHandle {
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
  // `var` is required here: ambient global augmentation must use `var` to attach to `globalThis`
  // (let/const do not) — the sanctioned pattern for a `globalThis.__orb` handle.
  var __orb: OrbDebugHandle | undefined;
}

/** The compact motion line for snap(): ring depth + the two headline jank numbers + the count of active
 *  animations that AREN'T compositor-clean. Full detail lives behind .motion()/.animations(). */
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
  // LoAF + layout-shift observers feeding motion-stats' rings — the DATA behind __orb.motion(). Installed
  // here (dev-only path) so they cost nothing in prod, same as the rest of this handle.
  installMotionObservers();
  const isReady = (): boolean => document.documentElement.hasAttribute(READY_ATTR);
  const shell = (): ShellSnapshot => ({
    section: document.querySelector('[aria-current="page"]')?.getAttribute("aria-label") ?? null,
    panels: [...document.querySelectorAll(".shell-panel")].map((p) => ({
      side: p.getAttribute("data-panel-side"),
      mode: p.getAttribute("data-panel-mode"),
    })),
    // biome-ignore lint/security/noSecrets: a CSS attribute selector, not a credential (entropy false-positive).
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
    // One-line motion summary: LoAF count + the two headline jank numbers + how many active animations
    // are NOT compositor-clean (at risk of per-frame layout). Full detail via .motion()/.animations().
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
  // One-line discovery hint on load (dev only) so this isn't a forgotten seam — the console channels
  // ([bus]/[trpc]/[perf]) + this handle are easy to miss otherwise. Points at the README for the rest.
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
