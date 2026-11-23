// Agent/automation bridge — the dev-only browser introspection seam so Playwright/snap/agent
// browser-driving reads app state directly instead of scraping the DOM. Installed through the one literal
// `import.meta.env.DEV` dynamic door in main.tsx; production readiness lives in app-ready-signal.ts (#995).

import type { QueryClient } from "@tanstack/react-query";
import { readAppearanceMatrixBridgeContract } from "./agent-bridge-appearance.ts";
import type { OrbDebugHandle, OrbRingMetadata, OrbRingName, OrbRingResetResult } from "./agent-bridge-contract.ts";
import { ORB_RING_NAMES } from "./agent-bridge-contract.ts";
import type { OrbAgentHandles, QuerySummary, ShellSnapshot } from "./agent-bridge-handles.ts";
import { flagCounts, motionSummary } from "./agent-bridge-summary.ts";
import { appReady, isAppReady } from "./app-ready-signal.ts";
import { enableAppearanceMessageRegistry } from "./appearance-message-registry.ts";
import type { BusEventRecord } from "./bus-devlog.ts";
import { busEventRing, busLiveCount, resetBusDupBursts, resetBusEventRing } from "./bus-devlog.ts";
import { consoleErrorRing, installConsoleErrorRing, resetConsoleErrors } from "./console-error-ring.ts";
import { resetLongTaskEvidence } from "./long-task-tracer.ts";
import { activeAnimations, installAnimationLifecycleRecorder } from "./motion-animation-record.ts";
import { setFrameDropTrackingPaused } from "./motion-animation-state.ts";
import { motionFlaggersDrain, motionFlaggersSettled } from "./motion-dead-class-flagger.ts";
import { installMotionFlaggers, motionFlags, resetMotionFlags } from "./motion-flaggers.ts";
import { installMotionObservers, motionSnapshot, resetMotionStats } from "./motion-stats.ts";
import { recentMeasures } from "./perf-marks.ts";
import { renderHeatmap, resetRenderStats } from "./render-stats.ts";
import { themeFallbackRing } from "./theme-fallback-ring.ts";

export type { NavResult, OrbAgentHandles, OrbNavCapabilities, OrbNavHandle, OrbRpgReader, OrbSeedHandle, SeedProfile } from "./agent-bridge-handles.ts";

const ORB_DEBUG_CAPABILITIES = {
  ready: "promise that settles when initial app reads finish",
  isReady: "read whether the app-ready marker is present",
  queries: "read the TanStack Query cache census",
  bus: "read live chat-bus subscriptions and recent canon events",
  shell: "read the mounted shell section, panels and chat state",
  perf: "read session User Timing measures",
  renders: "read checkpoint render-profiler evidence",
  motion: "read checkpoint LoAF and layout-shift evidence",
  animations: "read currently active animations and compositor classification",
  flags: "read checkpoint motion defect flags",
  consoleErrors: "read the session console-error, uncaught-error and unhandled-rejection ring",
  themeFallbacks: "read the session ThemeScope form-control edge fallbacks",
  resetFlags: "clear the legacy motion-flag checkpoint",
  resetEvidence: "clear every checkpoint-safe client evidence store",
  motionFlaggersSettled: "wait for the initial motion-flagger census",
  motionFlaggersDrain: "drain late dead-class mutation work with a monotonic generation receipt",
  appearanceMatrixContract: "read the live Appearance carrier matrix contract and reached subject counts",
  setMotionAuditDropTrackingPaused: "coordinate in-page drop tracking with motion-audit",
  snap: "read a cheap combined bridge overview",
  nav: "call __orb.nav.capabilities() for exact vocabularies; section(id), corpusMode(mode), openModal(slot), openConfig(group,sub?,setting?), closeModal() and awaited contextTab(id), openChat(id|title|first|latest|current), openCharacter(id|name), panel(name,mode) return {ok:true}|{ok:false,reason}",
  seed: "call await __orb.seed.game({profile:'d20'|'freeform',title?}) -> {chatId}; creates a fresh complete development game through production APIs",
  rpg: "call await __orb.rpg() -> {chatId,game,tracker,journal,turnToolCalls}; reads the active game through production APIs",
  pluginLog: "read installed plugins or one server-runtime host log",
  pluginUi: "read owner-scoped runtime UI registrations and current cache/DOM observations; unobserved is not ineligible",
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
  "plugin-ui": {
    read: "await pluginUi()",
    lifetime: "session",
    resettable: false,
    description: "live runtime registrations and current cache/DOM facts, not an eligibility verdict",
  },
  "automation-fires": { read: "automationFires(filter)", lifetime: "durable", resettable: false, description: "durable automation dispatch audit" },
  "console-errors": {
    read: "consoleErrors()",
    lifetime: "checkpoint",
    resettable: true,
    description: "console errors, uncaught errors and unhandled rejections",
  },
  "theme-fallbacks": {
    read: "themeFallbacks()",
    lifetime: "session",
    resettable: false,
    description: "ThemeScope tone and form-control edge fallbacks reported by the app shell",
  },
} as const satisfies Record<OrbRingName, Omit<OrbRingMetadata, "name">>;

/** `data-panel-available` → the tri-state a reader needs: the declaration, or `null` for "the shell did
 *  not publish one". Never defaults to `true`: a missing declare that read as "available" would be the
 *  exact silent-guess this attribute exists to end.
 *
 *  EXPORTED because `shell()` is not the only reader (#1149): `dev/agent-nav/panel-request.ts` names the same
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

/** Read current host paint without treating a mounted Activity subtree as visible. */
export function isRenderedElement(element: Element): boolean {
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
 * NO ENVIRONMENT GATE HERE: the only production caller is `dev/agent-handles/index.ts`, which `main.tsx`
 * reaches by DYNAMIC import inside its literal `if (import.meta.env.DEV)` block — the one the bundler
 * constant-folds, so nothing on this graph exists in a shipped build at all. A second `IS_DEV` check behind
 * that could only ever be true, and it would shut out the component-test bundle, which Vite builds in
 * PRODUCTION mode. One door, entered by the composition root and by the CT host alike.
 */
export function installAgentDebugHandle(queryClient: QueryClient, handles: OrbAgentHandles): void {
  const rings: readonly OrbRingMetadata[] = ORB_RING_NAMES.map((name) => ({ name, ...ORB_RING_REGISTRY[name] }));
  enableAppearanceMessageRegistry();
  installAnimationLifecycleRecorder();
  installMotionObservers();
  installMotionFlaggers();
  installConsoleErrorRing();
  const { nav, seed, rpg, pluginLog, pluginUi, automationFires, css, durableLocalUserId } = handles;
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
    themeFallbacks: themeFallbackRing().inputBorder.length,
  });
  const resetters = {
    // The ring AND the duplicate-invalidate burst windows: a window left half-counted across a checkpoint
    // would charge pre-reset waves to the measurement taken after it.
    "bus-events": (): void => {
      resetBusEventRing();
      resetBusDupBursts();
    },
    flags: resetMotionFlags,
    motion: (): void => {
      resetLongTaskEvidence();
      resetMotionStats();
    },
    renders: resetRenderStats,
    "console-errors": resetConsoleErrors,
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
    themeFallbacks: themeFallbackRing,
    resetFlags: resetMotionFlags,
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
    pluginUi,
    css,
    automationFires,
    durableLocalUserId,
    capabilities: (): Readonly<Record<keyof OrbDebugHandle, string>> => ORB_DEBUG_CAPABILITIES,
    rings: (): readonly OrbRingMetadata[] => rings,
    resetRing,
  };
  console.info(
    "%c[orb]%c dev introspection ready → %cwindow.__orb%c.capabilities() · .rings()/.resetRing(name) · .snap() · .css.read() · .rpg() · .pluginLog(slug?) · .pluginUi() · .automationFires({chatId?}) · .queries() · .bus() · .perf() · .renders() · .motion() · .animations() · .flags()/.consoleErrors()/.themeFallbacks()/.resetEvidence()/.motionFlaggersSettled()/.motionFlaggersDrain()/.setMotionAuditDropTrackingPaused() · .shell() · .durableLocalUserId() · .nav.capabilities/section/corpusMode/openModal/openConfig/contextTab/openChat/openCharacter/closeModal/panel(name,mode)/focus(on) · .seed.game({profile:'d20'|'freeform'})/richGame;  wait on %chtml[data-app-ready]%c.  Docs: packages/client/src/lib/agent-tools.README.md",
    "color:#e0a; font-weight:bold",
    "color:#888",
    "color:#0a7; font-weight:bold",
    "color:#888",
    "color:#06c",
    "color:#888",
  );
}
