// Agent/automation bridge — the browser-side introspection seam so Playwright/snap/agent
// browser-driving read app state directly instead of scraping the DOM. Two installs, wired once from
// main.tsx: installAppReadySignal sets `data-app-ready` on <html> once the query cache goes idle after
// initial reads (a stable wait target that never hangs on the never-idle SSE bus); installAgentDebugHandle
// installs dev-only `globalThis.__orb`.
//
// `data-app-ready` is PRESENCE + VALUE: presence means "stop waiting" (every existing waiter selects on
// presence alone and is unaffected); the value is `""` for a real settle and `"degraded"` when the ceiling
// fired with reads still in flight. A waiter that only checks presence still never hangs; an INSTRUMENT is
// obliged to read the value before calling its capture settled.

import type { ChatId } from "@orb/kit/ids";
import type { QueryClient } from "@tanstack/react-query";
import type { BusEventRecord } from "./bus-devlog.ts";
import { busEventRing, busLiveCount } from "./bus-devlog.ts";
import { IS_DEV } from "./dev-flag.ts";
import type { MotionFlagRecord } from "./motion-flaggers.ts";
import { __resetMotionFlags, installMotionFlaggers, motionFlags } from "./motion-flaggers.ts";
import type { AnimationRecord, MotionSnapshot } from "./motion-stats.ts";
import { activeAnimations, installMotionObservers, motionSnapshot } from "./motion-stats.ts";
import { perfMeasureFromLoad, recentMeasures } from "./perf-marks.ts";
import { renderHeatmap } from "./render-stats.ts";

const READY_ATTR = "data-app-ready";
// The grace before the first "no initial reads at all" check. An app that never fetches is ready here.
const READY_GRACE_MS = 3000;
// The hard ceiling. Past this the flag goes up REGARDLESS so no waiter ever hangs — but it goes up carrying
// `degraded`, because at that point the reads have NOT settled and the flag is no longer a settle claim.
const READY_CEILING_MS = 20_000;
/** `data-app-ready` values. Presence means "stop waiting"; the VALUE is whether that was a real settle. */
const READY_SETTLED = "";
const READY_DEGRADED = "degraded";

/** `ready` resolves once the app has hydrated and its initial reads have settled (see installAppReadySignal);
 *  `markReady` is its resolver, called from the settle check. */
const { promise: ready, resolve: markReady } = Promise.withResolvers<void>();

export function installAppReadySignal(queryClient: QueryClient): void {
  const el = document.documentElement;
  const cache = queryClient.getQueryCache();
  let settled = false;
  const finish = (state: string): void => {
    if (settled) {
      return;
    }
    settled = true;
    el.setAttribute(READY_ATTR, state);
    perfMeasureFromLoad("app-ready");
    markReady();
  };
  // IDLE IS NOT READY UNTIL A READ HAS BEEN SEEN. An idle cache means two different things — "the initial
  // reads have drained" and "they have not started yet" — and only the first is readiness. The old shape
  // guessed between them by waiting two frames before the first check, which is a race against however long
  // the router/Suspense takes to kick the first read off (a CT drove the wrong side of it on the first run).
  // Track it instead: once ANY fetch has been observed, an idle cache is a real settle.
  let sawFetch = false;
  let graced = false;
  const check = (): void => {
    if (queryClient.isFetching() > 0) {
      sawFetch = true;
      return;
    }
    // Idle with no read ever seen is only "ready" once the grace has passed — the genuine no-initial-reads
    // app, which is the single case the old unconditional fallback existed to answer.
    if (sawFetch || graced) {
      finish(READY_SETTLED);
    }
  };
  const unsubscribe = cache.subscribe(check);
  void ready.finally(unsubscribe);
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
  setTimeout(() => {
    graced = true;
    check();
  }, READY_GRACE_MS);
  // The ceiling still guarantees "never hang a waiter", but it tells the truth about what it is handing over:
  // reads are STILL in flight, so the flag goes up as `degraded` and anything reading the value knows the
  // capture is mid-flight rather than settled.
  setTimeout(() => {
    finish(READY_DEGRADED);
  }, READY_CEILING_MS);
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
  readonly focus: boolean;
}

/** Loud outcome of a `__orb.nav.*` action — `ok:true` on success, `ok:false` + a human reason on a
 *  rejected/invalid target. NEVER a silent no-op (a snap step reddens its exit on `ok:false`). */
export type NavResult = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/** The two seedable game shapes: `d20` = the classic six-attribute grid + level + everything; `freeform` =
 *  the same rich planes MINUS the attribute grid (freeform has no attribute vocabulary — the sparser Sheet). */
export type SeedProfile = "d20" | "freeform";

/** Dev-only rpg game seeder: stand up a fully-populated game (character + chat + game(profile) + config +
 *  rich content across EVERY plane) in ONE call, so audits/demos/live-verify passes stop hand-rolling tRPC
 *  seeders. Built at the composition root under IS_DEV (drives the real `rpg.*` verbs through the wire
 *  client), injected into `installAgentDebugHandle`. Returns the created chatId — feed it to `nav.openChat`. */
export interface OrbSeedHandle {
  /** Seed one fully-populated game of `profile` and return its chatId (open it with `nav.openChat`). */
  readonly game: (args: { profile: SeedProfile; title?: string }) => Promise<{ readonly chatId: ChatId }>;
  /** Convenience: `game({ profile })` with `profile` defaulting to `freeform` (lite's create default). */
  readonly richGame: (profile?: SeedProfile) => Promise<{ readonly chatId: ChatId }>;
}

/** Dev-only SPA-navigation bridge: drive the app's client-state navigation (rail section, modals,
 *  settings category, context tab, open chat) through the SAME store actions the real UI calls — the app
 *  has only `/` + `/login` as URL routes, so this is how a harness reaches every surface without a click
 *  chain. Built at the composition tier (`client/src/agent-nav/`, a door-owned dir module that may legally
 *  compose #state/#features/#data — the lib/ floor may not) and injected into `installAgentDebugHandle`. */
export interface OrbNavHandle {
  /** Switch the active rail section (validated against SECTION_IDS). */
  readonly section: (id: string) => NavResult;
  /** Open a rail modal by slot (validated against MODAL_SLOT_IDS). */
  readonly openModal: (slot: string) => NavResult;
  /** Open the settings modal at a category (validated against SETTINGS_CATEGORY_IDS). */
  readonly openSettings: (category: string) => NavResult;
  /** Ask the active content's context surface to open a named tab (opaque string; always ok). */
  readonly contextTab: (name: string) => NavResult;
  /** Switch to the Chats section + make an existing chat active by chat id OR exact display title, OR the
   *  positional sentinels `"first"`/`"latest"` (the list's TOP row — `listChats` is newest-updated-first, so
   *  both spellings name the most recent chat; a chat actually titled that is reachable by id). Resolves
   *  against the chat-list query cache (fetching it first if not loaded). Rejects loudly on no match, an
   *  ambiguous title, or an empty list. The section switch is part of the arm: reporting `ok` for a
   *  selection nothing on screen reflects is a lie a caller cannot detect. */
  readonly openChat: (idOrTitleOrPosition: string) => Promise<NavResult>;
  /** Switch to the Characters section + select a character by id OR name — resolves against the character
   *  list query. Rejects loudly on no match OR an ambiguous name. */
  readonly openCharacter: (idOrName: string) => Promise<NavResult>;
  /** Close any open modal. */
  readonly closeModal: () => NavResult;
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
  /** The motion FLAGGER ring — every [anim]/[css]/[drop]/[space] defect raised this session, deduped
   *  per offender. The pull half of the push channels in `motion-flaggers.ts`: a harness that cannot
   *  read the console still gets the offender list. */
  readonly flags: () => readonly MotionFlagRecord[];
  /** Clear the flag ring + its per-offender dedupe. Call between the STEPS of a driven flow: without
   *  it, step 1's offenders suppress the identical ones in step 2 and the later steps read clean. */
  readonly resetFlags: () => void;
  /** One-call overview for a quick `preview_eval("__orb.snap()")`. */
  readonly snap: () => Record<string, unknown>;
  /** Dev-only SPA-navigation actions (see OrbNavHandle) — reach any surface without a click chain. */
  readonly nav: OrbNavHandle;
  /** Dev-only rpg game seeder (see OrbSeedHandle) — spin up a fully-populated game in one call. */
  readonly seed: OrbSeedHandle;
}

declare global {
  // `var` is required: ambient global augmentation must use var to attach to globalThis.
  var __orb: OrbDebugHandle | undefined;
}

/** The compact motion line for snap(): ring depth + the headline jank numbers + the count of active
 *  animations that aren't compositor-clean. `observedCls` rides beside `cls` because the CWV metric
 *  excludes input-adjacent shifts and therefore reads ~0 through the exact interaction-driven relayout
 *  storms this line exists to surface (motion-stats.ts header) — a summary carrying only `cls` says
 *  "clean" about a shell that is thrashing. */
function motionSummary(): {
  loafs: number;
  worstBlocking: number;
  cls: number;
  observedCls: number;
  dirtyAnimations: number;
} {
  const m = motionSnapshot();
  return {
    loafs: m.loafs.length,
    worstBlocking: m.worstBlocking,
    cls: m.cls,
    observedCls: m.observedCls,
    dirtyAnimations: activeAnimations().filter((a) => !a.compositorClean).length,
  };
}

/** Raised motion flags counted per channel, for `snap()`'s one-call overview. The ring itself is the
 *  actionable artifact (`__orb.flags()`); this is the "is anything wrong at all" line. */
function flagCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const flag of motionFlags()) {
    counts[flag.tag] = (counts[flag.tag] ?? 0) + 1;
  }
  return counts;
}

export function installAgentDebugHandle(queryClient: QueryClient, nav: OrbNavHandle, seed: OrbSeedHandle): void {
  if (!IS_DEV) {
    return;
  }
  installMotionObservers();
  installMotionFlaggers();
  const isReady = (): boolean => document.documentElement.hasAttribute(READY_ATTR);
  const shell = (): ShellSnapshot => ({
    section: document.querySelector('[aria-current="page"]')?.getAttribute("aria-label") ?? null,
    panels: [...document.querySelectorAll(".shell-panel")].map((p) => ({
      side: p.getAttribute("data-panel-side"),
      mode: p.getAttribute("data-panel-mode"),
    })),
    chatOpen: document.querySelectorAll('[role="article"]').length > 0,
    focus: document.querySelector(".shell-grid")?.getAttribute("data-focus-mode") === "true",
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
    // Raised motion defects, by channel — a zero here is the only cheap "the surface is clean" read.
    flags: flagCounts(),
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
    flags: motionFlags,
    resetFlags: __resetMotionFlags,
    snap,
    nav,
    seed,
  };
  console.info(
    "%c[orb]%c dev introspection ready → %cwindow.__orb%c.snap() · .queries() · .bus() · .perf() · .renders() · .motion() · .animations() · .flags()/.resetFlags() · .shell() · .nav.section/openModal/openSettings/contextTab/openChat/openCharacter/closeModal · .seed.game({profile:'d20'|'freeform'})/richGame;  wait on %chtml[data-app-ready]%c.  Docs: packages/client/src/lib/agent-tools.README.md",
    "color:#e0a; font-weight:bold",
    "color:#888",
    "color:#0a7; font-weight:bold",
    "color:#888",
    "color:#06c",
    "color:#888",
  );
}
