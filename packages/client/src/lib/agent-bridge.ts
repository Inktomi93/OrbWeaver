// Agent/automation bridge — the browser-side introspection seam so Playwright/snap/agent
// browser-driving read app state directly instead of scraping the DOM. Two installs, wired once from
// main.tsx: installAppReadySignal sets `data-app-ready` on <html> once the query cache goes idle after
// initial reads (a stable wait target that never hangs on the never-idle SSE bus); installAgentDebugHandle
// installs dev-only `globalThis.__orb`.
//
// `data-app-ready` is PRESENCE + VALUE: presence stops waiting; `""` means settled and `"degraded"`
// means the ceiling fired with reads still in flight. Readiness is judged after route resolution because
// an idle query cache can also mean the lazy route that owns the reads has not mounted yet (#145).

import type { QueryClient } from "@tanstack/react-query";
import type { OrbAgentHandles, OrbCssHandle, OrbNavHandle, OrbRpgReader, OrbSeedHandle, QuerySummary, ShellSnapshot } from "./agent-bridge-handles.ts";
import { flagCounts, motionSummary } from "./agent-bridge-summary.ts";
import type { OrbAutomationFiresFilter, OrbPluginLogReader } from "./agent-plugin-bridge.ts";
import { readAutomationFires } from "./agent-plugin-bridge.ts";
import type { AppearanceMatrixContract, AppearanceMatrixContractRow } from "./appearance-carrier-manifest.ts";
import { appearanceMatrixContract } from "./appearance-carrier-manifest.ts";
import { bootReads } from "./boot-reads.ts";
import type { BusEventRecord } from "./bus-devlog.ts";
import { __resetBusEventRing, busEventRing, busLiveCount } from "./bus-devlog.ts";
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

export type { NavResult, OrbAgentHandles, OrbNavCapabilities, OrbNavHandle, OrbRpgReader, OrbSeedHandle, SeedProfile } from "./agent-bridge-handles.ts";

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
  // @orb-gate-ignore caught-failure-ownership(promise:ready): both arms only unsubscribe this listener; `ready`'s own settlement is owned by whichever caller awaits it elsewhere. Ends if this becomes the sole reader of `ready`.
  ready.then(unsubscribe, unsubscribe);
  // A boot-critical dependent read clearing is the other event (besides a cache tick) that can unblock a
  // settle, so the signal re-checks when the gate changes — symmetric with the routeResolution subscription.
  const unsubscribeBootReads = bootReads.subscribe(check);
  // @orb-gate-ignore caught-failure-ownership(promise:ready): both arms only unsubscribe this listener; `ready`'s own settlement is owned by whichever caller awaits it elsewhere. Ends if this becomes the sole reader of `ready`.
  ready.then(unsubscribeBootReads, unsubscribeBootReads);
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
  // @orb-gate-ignore caught-failure-ownership(promise:ready): both arms only unsubscribe this listener; `ready`'s own settlement is owned by whichever caller awaits it elsewhere. Ends if this becomes the sole reader of `ready`.
  ready.then(unsubscribeRoute, unsubscribeRoute);
  armGrace();
  // The ceiling still guarantees "never hang a waiter", but it tells the truth about what it is handing over:
  // reads are STILL in flight, so the flag goes up as `degraded` and anything reading the value knows the
  // capture is mid-flight rather than settled.
  setTimeout(() => {
    finish(READY_DEGRADED);
  }, READY_CEILING_MS);
}

const ORB_RING_LIFETIMES = ["checkpoint", "durable", "server-runtime", "session"] as const;
type OrbRingLifetime = (typeof ORB_RING_LIFETIMES)[number];

interface OrbRingMetadata {
  readonly name: OrbRingName;
  readonly read: string;
  readonly lifetime: OrbRingLifetime;
  readonly resettable: boolean;
  readonly description: string;
}

type OrbRingResetResult = { readonly ok: true; readonly name: OrbRingName } | { readonly ok: false; readonly name: string; readonly reason: string };

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
  /** The live Appearance carrier roster, its two-arm values, and reached DOM populations. */
  readonly appearanceMatrixContract: () => AppearanceMatrixBridgeContract;
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
  /** The installed-plugin roster (no ref) or one plugin's RUNTIME host.log ring (ref = slug or id) through
   *  the production `plugin.list` / `plugin.getLog` reads — the lines a floated hub-search continuation
   *  logs included (#806). Loud refusal on no match / ambiguity. */
  readonly pluginLog: OrbPluginLogReader;
  /** Ordered configured-merge conflicts since the last checkpoint (#949). */
  readonly css: OrbCssHandle;
  /** The durable AUTOMATION FIRE LOG (`automation_fires`: every dispatch terminal with its per-arm `detail`),
   *  newest-first across the deployment, via a same-origin read of `/api/_debug/automation/fires` —
   *  `{chatId?, ruleId?, limit?}` narrow. The debug gate admits the dev admin session (or `x-debug-token`);
   *  a refused read answers `{ok:false, reason}` with the HTTP status, never a throw. */
  readonly automationFires: (filter?: OrbAutomationFiresFilter) => Promise<unknown>;
  /** The durable-local namespace's bound identity (`state/durable-local.ts`) — `null` before the viewer
   *  read binds it (the pre-adoption legacy world). The lens a test or this bridge asserts the
   *  per-user localStorage scoping through, without reaching into `localStorage` by hand. */
  readonly durableLocalUserId: () => string | null;
  /** Exhaustive, typed inventory of this top-level handle. */
  readonly capabilities: () => Readonly<Record<keyof OrbDebugHandle, string>>;
  /** Evidence-source index: read surface, lifetime, and whether this client owns a safe reset. */
  readonly rings: () => readonly OrbRingMetadata[];
  /** Reset one checkpoint-safe client ring; unsafe or unknown names refuse loudly. */
  readonly resetRing: (name: string) => OrbRingResetResult;
}

interface AppearanceMatrixBridgeContract extends Omit<AppearanceMatrixContract, "rows"> {
  readonly rows: readonly (AppearanceMatrixContractRow & { readonly reached: number })[];
}

const ORB_DEBUG_CAPABILITIES = {
  ready: "promise that settles when initial app reads finish",
  isReady: "read whether the app-ready marker is present",
  queries: "read the TanStack Query cache census",
  bus: "read live chat-bus subscriptions and recent canon events",
  shell: "read the mounted shell section, panels, chat, and focus state",
  perf: "read session User Timing measures",
  renders: "read checkpoint render-profiler evidence",
  motion: "read checkpoint LoAF and layout-shift evidence",
  animations: "read currently active animations and compositor classification",
  flags: "read checkpoint motion defect flags",
  resetFlags: "clear the legacy motion-flag checkpoint",
  resetEvidence: "clear every checkpoint-safe client evidence store",
  motionFlaggersSettled: "wait for the initial motion-flagger census",
  appearanceMatrixContract: "read the live Appearance carrier matrix contract and reached subject counts",
  setMotionAuditDropTrackingPaused: "coordinate in-page drop tracking with motion-audit",
  snap: "read a cheap combined bridge overview",
  nav: "drive SPA navigation through production state actions",
  seed: "seed a complete development game through production APIs",
  rpg: "read active-game state through production APIs",
  pluginLog: "read installed plugins or one server-runtime host log",
  css: "read or reset checkpoint CSS merge receipts",
  automationFires: "read durable automation fire audit rows",
  durableLocalUserId: "read the bound durable-local user namespace",
  capabilities: "describe every top-level bridge member",
  rings: "describe every indexed evidence source and its lifetime",
  resetRing: "reset one checkpoint-safe client evidence source",
} as const satisfies Record<keyof OrbDebugHandle, string>;

const ORB_RING_NAMES = ["bus-events", "flags", "motion", "renders", "css-merges", "animations", "perf", "plugin-log", "automation-fires"] as const;
type OrbRingName = (typeof ORB_RING_NAMES)[number];

const ORB_RING_REGISTRY = {
  "bus-events": { read: "bus().events", lifetime: "checkpoint", resettable: true, description: "recent canon bus events" },
  flags: { read: "flags()", lifetime: "checkpoint", resettable: true, description: "deduplicated motion defect flags" },
  motion: { read: "motion()", lifetime: "checkpoint", resettable: true, description: "LoAF and layout-shift evidence" },
  renders: { read: "renders()", lifetime: "checkpoint", resettable: true, description: "render-profiler heatmap" },
  "css-merges": { read: "css.read()", lifetime: "checkpoint", resettable: true, description: "configured class-merge receipts" },
  animations: { read: "animations()", lifetime: "session", resettable: false, description: "currently active animations" },
  perf: { read: "perf()", lifetime: "session", resettable: false, description: "load and session User Timing measures" },
  "plugin-log": { read: "pluginLog(ref)", lifetime: "server-runtime", resettable: false, description: "plugin-host runtime log" },
  "automation-fires": { read: "automationFires(filter)", lifetime: "durable", resettable: false, description: "durable automation dispatch audit" },
} as const satisfies Record<OrbRingName, Omit<OrbRingMetadata, "name">>;

const ORB_RINGS: readonly OrbRingMetadata[] = ORB_RING_NAMES.map((name) => ({ name, ...ORB_RING_REGISTRY[name] }));

declare global {
  // `var` is required: ambient global augmentation must use var to attach to globalThis.
  var __orb: OrbDebugHandle | undefined;
}

export function installAgentDebugHandle(queryClient: QueryClient, handles: OrbAgentHandles): void {
  if (!IS_DEV) {
    return;
  }
  installAgentDebugHandleImpl(queryClient, handles);
}

/** CT-only entry to exercise the real bridge implementation through Vite's production-mode CT build. */
export function __installAgentDebugHandleForTest(queryClient: QueryClient, handles: OrbAgentHandles): void {
  installAgentDebugHandleImpl(queryClient, handles);
}

function installAgentDebugHandleImpl(queryClient: QueryClient, handles: OrbAgentHandles): void {
  installMotionObservers();
  installMotionFlaggers();
  const { nav, seed, rpg, pluginLog, css, durableLocalUserId } = handles;
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
  const resetters = {
    "bus-events": __resetBusEventRing,
    flags: __resetMotionFlags,
    motion: (): void => {
      __resetLongTaskEvidence();
      __resetMotionStats();
    },
    renders: __resetRenderStats,
    "css-merges": css.reset,
  } as const satisfies Record<Extract<OrbRingName, "bus-events" | "css-merges" | "flags" | "motion" | "renders">, () => void>;
  const resetRing = (name: string): OrbRingResetResult => {
    if (!Object.hasOwn(ORB_RING_REGISTRY, name)) {
      return { ok: false, name, reason: `unknown ring "${name}"; call __orb.rings() for the indexed names` };
    }
    if (!Object.hasOwn(resetters, name)) {
      const ring = ORB_RING_REGISTRY[name as OrbRingName];
      return { ok: false, name, reason: `${name} is ${ring.lifetime} evidence and is not safely resettable by the client bridge` };
    }
    resetters[name as keyof typeof resetters]();
    return { ok: true, name: name as keyof typeof resetters };
  };
  const resetEvidence = (): void => {
    for (const name of ORB_RING_NAMES) {
      if (name in resetters) {
        resetters[name as keyof typeof resetters]();
      }
    }
  };
  const readAppearanceMatrixContract = (): AppearanceMatrixBridgeContract => {
    const contract = appearanceMatrixContract();
    return {
      ...contract,
      rows: contract.rows.map((row) => ({
        ...row,
        reached: row.observable === null ? 0 : document.querySelectorAll(row.observable.selector).length,
      })),
    };
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
    appearanceMatrixContract: readAppearanceMatrixContract,
    setMotionAuditDropTrackingPaused: setFrameDropTrackingPaused,
    snap,
    nav,
    seed,
    rpg,
    pluginLog,
    css,
    automationFires: readAutomationFires,
    durableLocalUserId,
    capabilities: (): Readonly<Record<keyof OrbDebugHandle, string>> => ORB_DEBUG_CAPABILITIES,
    rings: (): readonly OrbRingMetadata[] => ORB_RINGS,
    resetRing,
  };
  console.info(
    "%c[orb]%c dev introspection ready → %cwindow.__orb%c.capabilities() · .rings()/.resetRing(name) · .snap() · .css.read() · .rpg() · .pluginLog(slug?) · .automationFires({chatId?}) · .queries() · .bus() · .perf() · .renders() · .motion() · .animations() · .flags()/.resetEvidence()/.motionFlaggersSettled()/.setMotionAuditDropTrackingPaused() · .shell() · .durableLocalUserId() · .nav.capabilities/section/openModal/openConfig/contextTab/openChat/openCharacter/closeModal · .seed.game({profile:'d20'|'freeform'})/richGame;  wait on %chtml[data-app-ready]%c.  Docs: packages/client/src/lib/agent-tools.README.md",
    "color:#e0a; font-weight:bold",
    "color:#888",
    "color:#0a7; font-weight:bold",
    "color:#888",
    "color:#06c",
    "color:#888",
  );
}
