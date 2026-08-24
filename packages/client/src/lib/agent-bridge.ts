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
//
// READINESS IS JUDGED AGAINST ROUTE RESOLUTION, NOT THE CLOCK (issue #145). The settle check reads an idle
// query cache, and an idle cache means THREE things, not two: the reads drained · they have not started ·
// the component that owns them has not mounted at all. The third is the whole of #145 — `/`'s component is
// `lazyRouteComponent(() => import("../compose/authed-app.tsx"))`, ~4.9 MB of feature graph, and on a cold
// `snap --isolated` stage vite takes longer than the 3s grace to serve it. The grace fired against a router
// still in its pending component, the flag went up SETTLED with an EMPTY query cache, and every instrument
// screenshotted the boot glyph and reported a clean wait. So the no-reads-at-all arm is now gated on route
// resolution AND its grace window STARTS at resolution: "this app has no initial reads" is only claimable
// once the route that would have issued them is actually mounted.

import type { ChatId } from "@orb/kit/ids";
import type { QueryClient } from "@tanstack/react-query";
import { bootReads } from "./boot-reads.ts";
import type { BusEventRecord } from "./bus-devlog.ts";
import { busEventRing, busLiveCount } from "./bus-devlog.ts";
import { IS_DEV } from "./dev-flag.ts";
import { __resetLongTaskEvidence } from "./long-task-tracer.ts";
import { setFrameDropTrackingPaused } from "./motion-animation-state.ts";
import { motionFlaggersSettled } from "./motion-dead-class-flagger.ts";
import type { MotionFlagRecord } from "./motion-flaggers.ts";
import { __resetMotionFlags, installMotionFlaggers, motionFlags } from "./motion-flaggers.ts";
import type { AnimationRecord, MotionSnapshot } from "./motion-stats.ts";
import { __resetMotionStats, activeAnimations, installMotionObservers, motionSnapshot } from "./motion-stats.ts";
import { perfMeasureFromLoad, recentMeasures } from "./perf-marks.ts";
import { __resetRenderStats, renderHeatmap } from "./render-stats.ts";

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
    // one-shot-safe: this only DELAYS the first settle and the 20s ceiling still fires `degraded` if a
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
  const unsubscribe = cache.subscribe(check);
  void ready.finally(unsubscribe);
  // A boot-critical dependent read clearing is the other event (besides a cache tick) that can unblock a
  // settle, so the signal re-checks when the gate changes — symmetric with the routeResolution subscription.
  const unsubscribeBootReads = bootReads.subscribe(check);
  void ready.finally(unsubscribeBootReads);
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
  const unsubscribeRoute = routeResolution.subscribe(() => {
    armGrace();
    check();
  });
  void ready.finally(unsubscribeRoute);
  armGrace();
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

/** Canonical targets currently accepted by `__orb.nav`. Static vocabularies come from the same tuples the
 *  actions validate against; context tabs are the ids published by the surface mounted right now. */
export interface OrbNavCapabilities {
  readonly sections: readonly string[];
  readonly modalSlots: readonly string[];
  readonly settingsCategories: readonly string[];
  readonly contextTabs: readonly string[];
  /** Stable id paired with the exact visible label accepted by `contextTab`. */
  readonly contextTabNames: ReadonlyArray<{ readonly id: string; readonly label: string }>;
  readonly contextTabsPublished: boolean;
  readonly chatPositions: readonly string[];
}

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

/** Authoritative RPG state for the active chat, read through the same tRPC procedures as the UI. */
interface OrbRpgSnapshot {
  readonly chatId: ChatId | null;
  readonly game: unknown;
  readonly tracker: unknown;
  readonly journal: readonly unknown[];
  readonly turnToolCalls: readonly unknown[];
}

export type OrbRpgReader = () => Promise<OrbRpgSnapshot>;

export interface OrbAgentHandles {
  readonly nav: OrbNavHandle;
  readonly seed: OrbSeedHandle;
  readonly rpg: OrbRpgReader;
  readonly durableLocalUserId: () => string | null;
}

/** Dev-only SPA-navigation bridge: drive the app's client-state navigation (rail section, modals,
 *  settings category, context tab, open chat) through the SAME store actions the real UI calls — the app
 *  has only `/` + `/login` as URL routes, so this is how a harness reaches every surface without a click
 *  chain. Built at the composition tier (`client/src/agent-nav/`, a door-owned dir module that may legally
 *  compose #state/#features/#data — the lib/ floor may not) and injected into `installAgentDebugHandle`. */
export interface OrbNavHandle {
  /** Discover the exact target vocabularies without reading source or provoking a failed action. */
  readonly capabilities: () => OrbNavCapabilities;
  /** Switch the active rail section (validated against SECTION_IDS). */
  readonly section: (id: string) => NavResult;
  /** Open a rail modal by slot (validated against MODAL_SLOT_IDS). */
  readonly openModal: (slot: string) => NavResult;
  /** Open the settings modal at a category (validated against SETTINGS_CATEGORY_IDS). */
  readonly openSettings: (category: string) => NavResult;
  /** Reveal the active content's context panel by stable id OR unique visible label, and RESOLVE ONLY ONCE
   *  THE PANEL HAS PUBLISHED ITS TABS (issue #656 — it used to report `ok:true` against the not-yet-mounted
   *  panel's EMPTY vocabulary and leave a different tab showing, so every one-call probe chain censused the
   *  wrong surface while claiming this one). Async because that mount signal is: it opens the panel, waits
   *  for its own publish, resolves the name against the published set, then verifies the tab the panel
   *  actually landed on. Refuses loudly — and distinguishably — on an empty name, an ambiguous label, an
   *  unknown name, a panel that never published, and a landing that disagrees with the request. */
  readonly contextTab: (name: string) => Promise<NavResult>;
  /** Switch to the Chats section + make an existing chat active by chat id OR exact display title, OR one of
   *  the sentinels reported by `capabilities().chatPositions`:
   *    · `"first"`/`"latest"` — the chat LIST's top row (`listChats` is newest-CONVERSATION-first, so both
   *      spellings name the most recent LISTED chat). Rejects on an empty list.
   *    · `"current"` — the ACTIVE room, read off the session's active-chat pointer with no list query in the
   *      path. Use this, not `latest`, right after creating a room: a fresh room is an unlisted husk until
   *      the list query refetches, so `latest` would name a different chat. Rejects on the landing surface.
   *  All three are RESERVED WORDS — a chat actually titled one of them is reachable by its id. The id/title
   *  arms resolve against the chat-list query cache (fetching it first if not loaded) and reject loudly on
   *  no match or an ambiguous title. The section switch is part of the arm: reporting `ok` for a selection
   *  nothing on screen reflects is a lie a caller cannot detect. */
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
  /** Clear checkpoint-scoped flags, motion, and render evidence without disturbing app/query state. */
  readonly resetEvidence: () => void;
  /** Wait for the one initial full dev-instrument census before opening a measured interaction window. */
  readonly motionFlaggersSettled: () => Promise<void>;
  /** Suspend only duplicate in-page [drop] tracking while motion-audit's CDP trace owns that verdict. */
  readonly setMotionAuditDropTrackingPaused: (paused: boolean) => void;
  /** One-call overview for a quick `preview_eval("__orb.snap()")`. */
  readonly snap: () => Record<string, unknown>;
  /** Dev-only SPA-navigation actions (see OrbNavHandle) — reach any surface without a click chain. */
  readonly nav: OrbNavHandle;
  /** Dev-only rpg game seeder (see OrbSeedHandle) — spin up a fully-populated game in one call. */
  readonly seed: OrbSeedHandle;
  /** Active-game state, journal, and recorded folded calls through the production read APIs. */
  readonly rpg: OrbRpgReader;
  /** The durable-local namespace's bound identity (`state/durable-local.ts`) — `null` before the viewer
   *  read binds it (the pre-adoption legacy world). The lens a test or this bridge asserts the
   *  per-user localStorage scoping through, without reaching into `localStorage` by hand. */
  readonly durableLocalUserId: () => string | null;
}

declare global {
  // `var` is required: ambient global augmentation must use var to attach to globalThis.
  var __orb: OrbDebugHandle | undefined;
}

/** The compact motion line for snap(): ring depth + the headline jank numbers + the checkpoint's dirty
 *  animation flag count. The explicit `.animations()` deep scan remains available, but running
 *  `document.getAnimations()` inside every cheap snapshot forces a style walk and made the auditor create
 *  layout frames on large surfaces. `observedCls` rides beside `cls` because the CWV metric
 *  excludes input-adjacent shifts and therefore reads ~0 through the exact interaction-driven relayout
 *  storms this line exists to surface (motion-stats.ts header) — a summary carrying only `cls` says
 *  "clean" about a shell that is thrashing. `nonVirtualizedCls` rides here for the mirror reason (issue
 *  #109): it is the total the motion budget actually gates on, and a summary carrying only `cls` says
 *  "over budget" about a long thread whose whole score is the virtualizer settling. */
function motionSummary(): {
  loafs: number;
  worstBlocking: number;
  cls: number;
  observedCls: number;
  nonVirtualizedCls: number;
  dirtyAnimationFlags: number;
} {
  const m = motionSnapshot();
  return {
    loafs: m.loafs.length,
    worstBlocking: m.worstBlocking,
    cls: m.cls,
    observedCls: m.observedCls,
    nonVirtualizedCls: m.nonVirtualizedCls,
    dirtyAnimationFlags: motionFlags().filter((flag) => flag.tag === "anim").length,
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

export function installAgentDebugHandle(queryClient: QueryClient, handles: OrbAgentHandles): void {
  if (!IS_DEV) {
    return;
  }
  installMotionObservers();
  installMotionFlaggers();
  const { nav, seed, rpg, durableLocalUserId } = handles;
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
  const resetEvidence = (): void => {
    __resetLongTaskEvidence();
    __resetMotionFlags();
    __resetMotionStats();
    __resetRenderStats();
  };
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
    resetEvidence,
    motionFlaggersSettled,
    setMotionAuditDropTrackingPaused: setFrameDropTrackingPaused,
    snap,
    nav,
    seed,
    rpg,
    durableLocalUserId,
  };
  console.info(
    "%c[orb]%c dev introspection ready → %cwindow.__orb%c.snap() · .rpg() · .queries() · .bus() · .perf() · .renders() · .motion() · .animations() · .flags()/.resetEvidence()/.motionFlaggersSettled()/.setMotionAuditDropTrackingPaused() · .shell() · .durableLocalUserId() · .nav.capabilities/section/openModal/openSettings/contextTab/openChat/openCharacter/closeModal · .seed.game({profile:'d20'|'freeform'})/richGame;  wait on %chtml[data-app-ready]%c.  Docs: packages/client/src/lib/agent-tools.README.md",
    "color:#e0a; font-weight:bold",
    "color:#888",
    "color:#0a7; font-weight:bold",
    "color:#888",
    "color:#06c",
    "color:#888",
  );
}
