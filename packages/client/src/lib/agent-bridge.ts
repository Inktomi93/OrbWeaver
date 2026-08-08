// Agent/automation bridge — the browser-side introspection seam so Playwright/snap/agent
// browser-driving read app state directly instead of scraping the DOM. Two installs, wired once from
// main.tsx: installAppReadySignal sets `data-app-ready` on <html> once the query cache goes idle after
// initial reads (a stable wait target that never hangs on the never-idle SSE bus); installAgentDebugHandle
// installs dev-only `globalThis.__orb`.

import type { ChatId } from "@orb/kit/ids";
import type { QueryClient } from "@tanstack/react-query";
import type { BusEventRecord } from "./bus-devlog.ts";
import { busEventRing, busLiveCount } from "./bus-devlog.ts";
import { IS_DEV } from "./dev-flag.ts";
import type { AnimationRecord, MotionSnapshot } from "./motion-stats.ts";
import { activeAnimations, installMotionObservers, motionSnapshot } from "./motion-stats.ts";
import { perfMeasureFromLoad, recentMeasures } from "./perf-marks.ts";
import { renderHeatmap } from "./render-stats.ts";

const READY_ATTR = "data-app-ready";
const READY_FALLBACK_MS = 3000;

/** `ready` resolves once the app has hydrated and its initial reads have settled (see installAppReadySignal);
 *  `markReady` is its resolver, called from the settle check. */
const { promise: ready, resolve: markReady } = Promise.withResolvers<void>();

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

export function installAgentDebugHandle(queryClient: QueryClient, nav: OrbNavHandle, seed: OrbSeedHandle): void {
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
    nav,
    seed,
  };
  console.info(
    "%c[orb]%c dev introspection ready → %cwindow.__orb%c.snap() · .queries() · .bus() · .perf() · .renders() · .motion() · .animations() · .shell() · .nav.section/openModal/openSettings/contextTab/openChat/openCharacter/closeModal · .seed.game({profile:'d20'|'freeform'})/richGame;  wait on %chtml[data-app-ready]%c.  Docs: packages/client/src/lib/agent-tools.README.md",
    "color:#e0a; font-weight:bold",
    "color:#888",
    "color:#0a7; font-weight:bold",
    "color:#888",
    "color:#06c",
    "color:#888",
  );
}
