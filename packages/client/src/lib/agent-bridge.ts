// Agent/automation bridge — the dev-only browser introspection seam so Playwright/snap/agent
// browser-driving reads app state directly instead of scraping the DOM. Installed through the one literal
// `import.meta.env.DEV` dynamic door in main.tsx; production readiness lives in app-ready-signal.ts (#995).

import type { QueryClient } from "@tanstack/react-query";
import type { AppearanceMatrixBridgeContract } from "./agent-bridge-appearance.ts";
import { readAppearanceMatrixBridgeContract } from "./agent-bridge-appearance.ts";
import type { OrbAgentHandles, OrbCssHandle, OrbNavHandle, OrbRpgReader, OrbSeedHandle, QuerySummary, ShellSnapshot } from "./agent-bridge-handles.ts";
import { flagCounts, motionSummary } from "./agent-bridge-summary.ts";
import type { OrbAutomationFiresFilter, OrbPluginLogReader } from "./agent-plugin-bridge.ts";
import { readAutomationFires } from "./agent-plugin-bridge.ts";
import { appReady, isAppReady } from "./app-ready-signal.ts";
import { enableAppearanceMessageRegistry } from "./appearance-message-registry.ts";
import type { BusEventRecord } from "./bus-devlog.ts";
import { __resetBusDupBursts, __resetBusEventRing, busEventRing, busLiveCount } from "./bus-devlog.ts";
import { __resetConsoleErrors, consoleErrorRing, installConsoleErrorRing } from "./console-error-ring.ts";
import { __resetLongTaskEvidence } from "./long-task-tracer.ts";
import type { AnimationRecord } from "./motion-animation-record.ts";
import { activeAnimations, installAnimationLifecycleRecorder } from "./motion-animation-record.ts";
import { setFrameDropTrackingPaused } from "./motion-animation-state.ts";
import { motionFlaggersDrain, motionFlaggersSettled } from "./motion-dead-class-flagger.ts";
import type { MotionFlagRecord } from "./motion-flaggers.ts";
import { __resetMotionFlags, installMotionFlaggers, motionFlags } from "./motion-flaggers.ts";
import type { MotionSnapshot } from "./motion-stats.ts";
import { __resetMotionStats, installMotionObservers, motionSnapshot } from "./motion-stats.ts";
import { recentMeasures } from "./perf-marks.ts";
import { __resetRenderStats, renderHeatmap } from "./render-stats.ts";

export type { NavResult, OrbAgentHandles, OrbNavCapabilities, OrbNavHandle, OrbRpgReader, OrbSeedHandle, SeedProfile } from "./agent-bridge-handles.ts";

const ORB_RING_LIFETIMES = ["checkpoint", "durable", "server-runtime", "session"] as const;
type OrbRingLifetime = (typeof ORB_RING_LIFETIMES)[number];
const ORB_RING_NAMES = [
  "bus-events",
  "flags",
  "motion",
  "renders",
  "css-merges",
  "animations",
  "perf",
  "plugin-log",
  "automation-fires",
  "console-errors",
] as const;
type OrbRingName = (typeof ORB_RING_NAMES)[number];

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
  /** Every browser-side FAILURE this session: `console.error` calls, uncaught errors, unhandled rejections —
   *  wall-clock stamped, capped, and counting its own evictions (`dropped`). The one signal this client held
   *  nowhere before #1095: a caught RENDER error reaches the server's log ring, a bare console.error did not. */
  readonly consoleErrors: () => ReturnType<typeof consoleErrorRing>;
  /** Clear the flag ring + its per-offender dedupe. Call between the STEPS of a driven flow: without
   *  it, step 1's offenders suppress the identical ones in step 2 and the later steps read clean. */
  readonly resetFlags: () => void;
  /** Clear checkpoint-scoped flags, motion, and render evidence without disturbing app/query state. */
  readonly resetEvidence: () => void;
  /** Wait for the one initial full dev-instrument census before opening a measured interaction window. */
  readonly motionFlaggersSettled: () => Promise<void>;
  /** Wait for late class/style mutations and return the caller's monotonic drain generation. */
  readonly motionFlaggersDrain: typeof motionFlaggersDrain;
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
  consoleErrors: "read the session console-error, uncaught-error and unhandled-rejection ring",
  resetFlags: "clear the legacy motion-flag checkpoint",
  resetEvidence: "clear every checkpoint-safe client evidence store",
  motionFlaggersSettled: "wait for the initial motion-flagger census",
  motionFlaggersDrain: "drain late dead-class mutation work with a monotonic generation receipt",
  appearanceMatrixContract: "read the live Appearance carrier matrix contract and reached subject counts",
  setMotionAuditDropTrackingPaused: "coordinate in-page drop tracking with motion-audit",
  snap: "read a cheap combined bridge overview",
  nav: "call __orb.nav.capabilities() for exact vocabularies; section(id), openModal(slot), openConfig(group,sub?,setting?), closeModal(), focus(on) and awaited contextTab(id), openChat(id|title|first|latest|current), openCharacter(id|name), panel(name,mode) return {ok:true}|{ok:false,reason}",
  seed: "call await __orb.seed.game({profile:'d20'|'freeform',title?}) -> {chatId}; creates a fresh complete development game through production APIs",
  rpg: "call await __orb.rpg() -> {chatId,game,tracker,journal,turnToolCalls}; reads the active game through production APIs",
  pluginLog: "read installed plugins or one server-runtime host log",
  css: "read or reset checkpoint CSS merge receipts",
  automationFires: "read durable automation fire audit rows",
  durableLocalUserId: "read the bound durable-local user namespace",
  capabilities: "describe every top-level bridge member",
  rings: "describe every indexed evidence source and its lifetime",
  resetRing: "reset one checkpoint-safe client evidence source",
} as const satisfies Record<keyof OrbDebugHandle, string>;

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
  "console-errors": {
    read: "consoleErrors()",
    lifetime: "checkpoint",
    resettable: true,
    description: "console errors, uncaught errors and unhandled rejections",
  },
} as const satisfies Record<OrbRingName, Omit<OrbRingMetadata, "name">>;

const ORB_RINGS: readonly OrbRingMetadata[] = ORB_RING_NAMES.map((name) => ({ name, ...ORB_RING_REGISTRY[name] }));

declare global {
  // `var` is required: ambient global augmentation must use var to attach to globalThis.
  var __orb: OrbDebugHandle | undefined;
}

/** `data-panel-available` → the tri-state a reader needs: the declaration, or `null` for "the shell did
 *  not publish one". Never defaults to `true`: a missing declare that read as "available" would be the
 *  exact silent-guess this attribute exists to end.
 *
 *  EXPORTED because `shell()` is not the only reader (#1149): `agent-nav/panel-request.ts` names the same
 *  tri-state in its refusal for a `"docked"` request that never landed. One parser for one attribute — a
 *  second `getAttribute("data-panel-available") === "true"` elsewhere is the drift where the `null` arm
 *  quietly becomes `false` and a shell that published nothing gets accused of declaring nothing. */
/** The ONE read seam for the installed handle. Readers depend on THIS module rather than on the bare
 *  `globalThis.__orb`: the global's type is an augmentation declared here, so a reader compiled in a program
 *  that never pulls this file (the tests-dom closure reaches it through app-shell's bug-report capture)
 *  sees an untyped index and REDs — a value import makes the augmentation part of every closure that reads. */
export function readAgentDebugHandle(): OrbDebugHandle | undefined {
  return globalThis.__orb;
}

export function panelAvailability(panel: Element): boolean | null {
  const declared = panel.getAttribute("data-panel-available");
  return declared === null ? null : declared === "true";
}

function isRenderedElement(element: Element): boolean {
  const targetStyle = getComputedStyle(element);
  if (targetStyle.visibility === "hidden" || targetStyle.visibility === "collapse") {
    return false;
  }
  for (let current: Element | null = element; current !== null; current = current.parentElement) {
    const style = getComputedStyle(current);
    if ((current as HTMLElement).hidden === true || style.display === "none" || Number(style.opacity) === 0) {
      return false;
    }
  }
  return element.getClientRects().length > 0;
}

/**
 * Install `globalThis.__orb`.
 *
 * NO ENVIRONMENT GATE HERE, and the gate this used to carry was redundant, not load-bearing (#1847): the
 * only production caller is `agent-handles/index.ts`, which `main.tsx` reaches by DYNAMIC import inside its
 * literal `if (import.meta.env.DEV)` block — the one the bundler constant-folds, so nothing on this graph
 * exists in a shipped build at all (#433). A second `IS_DEV` check behind that could only ever be true, while
 * costing the component-test bundle (built in Vite PRODUCTION mode) its way in — which is why a
 * `__installAgentDebugHandleForTest` alias had grown beside it. One door, entered by the composition root
 * and by the CT host alike.
 */
export function installAgentDebugHandle(queryClient: QueryClient, handles: OrbAgentHandles): void {
  enableAppearanceMessageRegistry();
  installAnimationLifecycleRecorder();
  installMotionObservers();
  installMotionFlaggers();
  installConsoleErrorRing();
  const { nav, seed, rpg, pluginLog, css, durableLocalUserId } = handles;
  const shell = (): ShellSnapshot => ({
    section: document.querySelector('[aria-current="page"]')?.getAttribute("aria-label") ?? null,
    panels: [...document.querySelectorAll(".shell-panel")].map((p) => ({
      side: p.getAttribute("data-panel-side"),
      mode: p.getAttribute("data-panel-mode"),
      // The section's PANE DECLARATION, not a resolved mode: an unavailable pane and a merely-collapsed
      // one both render `data-panel-mode="collapsed"`, and every probe outside React could only guess
      // between them (#1122). `null` = the attribute was absent, which readers must treat as a broken
      // publish rather than as "unavailable".
      available: panelAvailability(p),
    })),
    chatOpen: [...document.querySelectorAll('article,[role="article"]')].some(isRenderedElement),
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
    ready: isAppReady(),
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
    // Browser-side failures since load — a non-zero here is the first thing to read.
    consoleErrors: consoleErrorRing().records.length,
  });
  const resetters = {
    // The ring AND the duplicate-invalidate burst windows: a window left half-counted across a checkpoint
    // would charge pre-reset waves to the measurement taken after it.
    "bus-events": (): void => {
      __resetBusEventRing();
      __resetBusDupBursts();
    },
    flags: __resetMotionFlags,
    motion: (): void => {
      __resetLongTaskEvidence();
      __resetMotionStats();
    },
    renders: __resetRenderStats,
    "console-errors": __resetConsoleErrors,
    "css-merges": css.reset,
  } as const satisfies Record<Extract<OrbRingName, "bus-events" | "console-errors" | "css-merges" | "flags" | "motion" | "renders">, () => void>;
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
  globalThis.__orb = {
    ready: appReady,
    isReady: isAppReady,
    queries,
    bus,
    shell,
    perf: recentMeasures,
    renders: renderHeatmap,
    motion: motionSnapshot,
    animations: activeAnimations,
    flags: motionFlags,
    consoleErrors: consoleErrorRing,
    resetFlags: __resetMotionFlags,
    resetEvidence,
    motionFlaggersSettled,
    motionFlaggersDrain,
    appearanceMatrixContract: readAppearanceMatrixBridgeContract,
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
    "%c[orb]%c dev introspection ready → %cwindow.__orb%c.capabilities() · .rings()/.resetRing(name) · .snap() · .css.read() · .rpg() · .pluginLog(slug?) · .automationFires({chatId?}) · .queries() · .bus() · .perf() · .renders() · .motion() · .animations() · .flags()/.consoleErrors()/.resetEvidence()/.motionFlaggersSettled()/.motionFlaggersDrain()/.setMotionAuditDropTrackingPaused() · .shell() · .durableLocalUserId() · .nav.capabilities/section/openModal/openConfig/contextTab/openChat/openCharacter/closeModal/panel(name,mode)/focus(on) · .seed.game({profile:'d20'|'freeform'})/richGame;  wait on %chtml[data-app-ready]%c.  Docs: packages/client/src/lib/agent-tools.README.md",
    "color:#e0a; font-weight:bold",
    "color:#888",
    "color:#0a7; font-weight:bold",
    "color:#888",
    "color:#06c",
    "color:#888",
  );
}
