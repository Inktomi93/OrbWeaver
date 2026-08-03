// The client composition root: constructs the singletons once (QueryClient → tRPC client → the toast
// manager) and provides them to the tree. Nothing imports this file; everything consumes via
// providers/hooks.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
// biome's resolver stops at the lucide-react re-export chain behind the @orb/ui/icons subpath; tsc +
// vite resolve AlertTriangle/Icon fine (the same gap `#primitives/icons` hits inside packages/ui itself
// — see status-chip.tsx).
import { AlertTriangle, Icon } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { createToastManager, Toaster, ToastProvider } from "@orb/ui/toast";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import type { ReactElement } from "react";
// biome mis-enumerates react's conditional-CJS export map and misses StrictMode/lazy/Suspense
// specifically (useState/Component/etc. resolve fine); tsc resolves them and the client
// typechecks clean.
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { createAppQueryClient, createTrpcClient, createTrpcProxy, TRPCProvider } from "#data";
import {
  appearanceBackgroundSection,
  appearanceEffectsSection,
  appearanceReadingSection,
  appearanceSizingSection,
  contextToggleChrome,
  fullscreenChrome,
  youModal,
} from "#features/app-shell";
import { accountModal } from "#features/auth";
import { characterSlashCommands, librarySettingsSection, makeCharactersSection } from "#features/character";
import {
  appearanceAvatarsSection,
  appearanceMessageDetailsSection,
  appearanceMessageStyleSection,
  ChatsWithCharacterPane,
  chatMessageHandlingSection,
  chatOptionsChrome,
  chatQuickPicksTile,
  chatRecentsTile,
  chatSlashCommands,
  chatStreamingSection,
  chatTempChatTile,
  commandModal,
  databankSettingsSection,
  imageryTemplatesSection,
  makeChatsSection,
  memorySettingsSection,
  newChatModal,
  proseSettingsSection,
} from "#features/chat";
import { makeConfigSection } from "#features/config";
import { connectionsPane } from "#features/credentials";
import { databankSection } from "#features/databank";
import { corpusSection } from "#features/discovery";
import { automationDormantTile, buddyDormantTile, makeHomeSection, sectionJumpTile } from "#features/home";
import { notificationsChrome } from "#features/notifications";
import { personaChrome, personasPane } from "#features/persona";
import { presetsSection } from "#features/preset";
import { refinerySection } from "#features/refinery";
import { regexCollection } from "#features/regex";
import { makeRpgContextTabs, makeRpgHudRegion } from "#features/rpg";
import { appearancePane, automationPane, chatBehaviorPane, settingsModal, themeModal } from "#features/settings";
import { analyticsSection } from "#features/stats";
import { tagCollection } from "#features/tag";
import {
  adminCatalogSection,
  adminEmbeddingsSection,
  adminEnginesSection,
  adminPane,
  adminUsersSection,
  computeSection,
  mediaTrustSection,
  memoryTuningSection,
  multiUserSection,
  operationsSection,
  rateLimitsSection,
  sharedAccessSection,
  structuredOutputSection,
  systemTuningSection,
} from "#features/user-admin";
import { backupPane, workloadsJobsSection, workloadsPane, workloadsSchedulesSection, workloadsTuningSection } from "#features/workloads";
import { worldInfoCollection, worldInfoSettingsSection } from "#features/world-info";
import type {
  CharacterDetailContribution,
  ChatContextState,
  ChatSurfaceContribution,
  CollectionContribution,
  ContextRegionDef,
  ContextTabDef,
  HomeTileContribution,
  MessageToolsRenderer,
  SlashCommandContribution,
  ToolRenderer,
} from "#lib";
import { AppErrorBoundary, bindNotify, buildClientErrorPayload, createContributorRegistry, createRegistry } from "#lib";
import type { SettingsSectionContribution } from "#state";
import {
  assembleChrome,
  assertSettingsKeyPartition,
  ChromeRegistryProvider,
  MessageToolsRendererRegistryProvider,
  MODAL_SLOT_IDS,
  ModalRegistryProvider,
  SECTION_IDS,
  SETTINGS_CATEGORY_IDS,
  SectionRegistryProvider,
  SettingsPaneRegistryProvider,
  SettingsSectionRegistryProvider,
  SlashCommandRegistryProvider,
} from "#state";
import { buildAgentNav } from "./agent-nav/index.ts";
import { buildAgentSeed } from "./agent-seed/index.ts";
import { installAgentDebugHandle, installAppReadySignal } from "./lib/agent-bridge.ts";
import { isProbeMode } from "./lib/probe-mode.ts";
import { router } from "./routes/router.tsx";
import "./styles/globals.css";

// Both arms behind the literal import.meta.env.DEV, which the bundler constant-folds so neither
// module lands in the prod output. Dynamic import keeps the tracer out of the entry chunk in dev too.
if (import.meta.env.DEV) {
  void import("./lib/long-task-tracer.ts").then(({ installLongTaskTracer }) => {
    installLongTaskTracer();
  });
}
// Deep import on purpose — dev-tools must never ride a barrel that also exports prod code.
const DevTools = import.meta.env.DEV
  ? lazy(async () => {
      const mod = await import("./lib/dev-tools.tsx");
      return { default: mod.DevTools };
    })
  : null;

// A redeploy rotates hashed chunk names; an old tab that lazy-imports a chunk with a stale hash
// white-screens. Soft-reload once — the sessionStorage guard stops a reload loop.
const PRELOAD_RELOAD_FLAG = "orb:preload-reloaded";
globalThis.addEventListener("vite:preloadError", () => {
  if (globalThis.sessionStorage.getItem(PRELOAD_RELOAD_FLAG) !== null) {
    return;
  }
  globalThis.sessionStorage.setItem(PRELOAD_RELOAD_FLAG, "1");
  globalThis.location.reload();
});

const queryClient = createAppQueryClient();
const trpcClient = createTrpcClient();
// The door's `trpc` OPTIONS proxy — the cross-domain read channel a contributor is injected (§12): it lets
// rpg read `chat.getChat` CACHE-FIRST (game-ness) without importing chat's client (used by the agent bridge
// below too).
const trpcProxy = createTrpcProxy(trpcClient, queryClient);

// The chat-context contributor seam (§6c): the rpg takeover's four LITE game tabs (Context-Panel-Program
// §4.4) — the FIRST real consumer of this seam. rpg exports the SELF-CONTAINED factory `makeRpgContextTabs`
// ({trpc, queryClient}) — the door injects the cross-domain read channel (§12) and assembles the result into
// the registry, which chat merges at `defineContextTabs`'s `contributors` arm. rpg never imports chat; the
// `when`/`strip:"game"` gating (a cache-first getChat.rpg read) drives the §4.2 bracket.
const chatContextContributors = createContributorRegistry<ContextTabDef<ChatContextState>>(
  "chat-context",
  makeRpgContextTabs({ trpc: trpcProxy, queryClient }),
);

// The chat-context REGION-CLAIM seam (§6c / HUD-1 §3.2): the rpg HUD claims the WHOLE CONTEXT pane on an
// engaged game chat — same door, same injected read channel, same one-directional flow as the tabs above.
// Every other chat (and every other section) has no claimant and renders the generic panel.
const chatContextRegions = createContributorRegistry<ContextRegionDef<ChatContextState>>("chat-context-regions", [
  makeRpgHudRegion({ trpc: trpcProxy, queryClient }),
]);

// The chat-surface contributor seam (§6c/M8): EMPTY but typed — the door → factory → 3 anchors path is
// compiled and exercised with zero contributions; rpg/crew append array members later.
const chatSurfaceContributors = createContributorRegistry<ChatSurfaceContribution>("chat-surface", []);

// The per-tool-name renderer seam (§6c): EMPTY but typed — zero contributions ⇒ every persisted tool record
// renders through the generic @orb/ui `ToolCallBlock` fallback, so today's transcript is byte-identical to a
// build with no renderers; an automation/plugin feature appends array members later without importing chat.
const toolRenderers = createContributorRegistry<ToolRenderer>("tool-renderers", []);

// The WHOLE-MESSAGE tool-renderer seam (§6c): the per-message override that renders ALL of a message's tool
// records together so a contributor can AGGREGATE across them (the per-tool registry above cannot see across
// records). Delivered via a context provider; the FIRST renderer to claim a message owns its whole tool block,
// else chat falls back to the per-record path. Empty ⇒ byte-identical.
const messageToolsRenderers = createContributorRegistry<MessageToolsRenderer>("message-tools-renderer", []);

// The ONE slash-command assembly (§6c/G8): the single source of truth BOTH command surfaces read — the chat
// composer dispatches `/<id> …` against it and the command palette lists it. The two entries here are the
// palette's former hardcoded "Create" rows, now owned by their own features; a grafted feature (automation,
// a plugin surface) appends its commands the same way, without importing chat. Delivered via a context
// provider, so a build/CT with no Provider has zero commands and every send is a plain send.
const slashCommands = createContributorRegistry<SlashCommandContribution>("slash-commands", [...chatSlashCommands, ...characterSlashCommands]);

// The character-detail contributor seam (§6c): EMPTY but typed — the door → factory → editor-body anchor
// path is compiled and exercised with zero contributions; the crew feature appends its card-evolution
// review section later (crew 07-client-ui §4.2), grafting into the editor WITHOUT importing character.
const characterDetailContributors = createContributorRegistry<CharacterDetailContribution>("character-detail", []);

// The HOME-TILE contributor seam (§6c / home-section-spec §3.2) — the SIXTH contributor registry, and the
// whole point of the home section: a feature raises a tile, home skims it. Adding "future stuff" to home is
// ONE co-located file in the OWNING feature plus ONE array member HERE — home is never edited. Canonical
// `(order, id)` at the door: home's own jump grid is order 40 (the chat tiles land at 10/20/30, the dormant
// doorways at 80/90). Home consumes the registry BLIND through `makeHomeSection`.
const homeTiles = createContributorRegistry<HomeTileContribution>("home-tiles", [
  chatRecentsTile,
  chatQuickPicksTile,
  chatTempChatTile,
  sectionJumpTile,
  buddyDormantTile,
  automationDormantTile,
]);

// The COLLECTION contributor seam (config-rail-spec.md · review §4) — the ELEVENTH contributor family and
// the Configuration workspace's whole content: the DOOR ARRAY IS THE ROSTER, in group order. Moving a
// library between the rail and this workspace is one line HERE and zero edits to the library itself; the
// host (`features/config`) imports none of them.
const configCollections = createContributorRegistry<CollectionContribution>("config-collections", [tagCollection, regexCollection, worldInfoCollection]);

// The ONE section assembly (G1/G8): total over SECTION_IDS by tsc; delivered as a context value so
// app-shell reads it (incl. the use-shell-layout hook) without a #features import.
const sections = createRegistry("sections", SECTION_IDS, {
  home: makeHomeSection(homeTiles),
  chats: makeChatsSection({ contextTabs: chatContextContributors, contextRegions: chatContextRegions, surfaces: chatSurfaceContributors, toolRenderers }),
  // The characters LIST pane is MODAL (list-pane-projection Arm A): its projection half is chat-owned row
  // anatomy over the `chat.listChats` cache, threaded in HERE — the one legal channel for chat UI inside
  // the characters section (the `makeChatsSection` contributor precedent; a direct import is dep-cruiser RED).
  characters: makeCharactersSection(characterDetailContributors, (view) => <ChatsWithCharacterPane {...view} />),
  corpus: corpusSection,
  config: makeConfigSection(configCollections),
  databank: databankSection,
  presets: presetsSection,
  refinery: refinerySection,
  analytics: analyticsSection,
});

// The ONE modal assembly (§6d/G8): total over MODAL_SLOT_IDS by tsc; delivered as a context value so
// ModalHost reads it without a #features import.
const modals = createRegistry("modals", MODAL_SLOT_IDS, {
  theme: themeModal,
  settings: settingsModal,
  account: accountModal,
  command: commandModal,
  newChat: newChatModal,
  you: youModal,
});

// The ONE chrome assembly (shell-chrome-unification.md §A/§D/§E-2, G8): `assembleChrome` DERIVES the rail
// section + mapped modal-trigger entries and combines them with the feature-owned WIDGET entries into one
// dupe-checked, zone-validated, canonically-ordered list; `createContributorRegistry` (the door mint, G8)
// wraps it. An OPEN registry (CHROME_ZONES is the closed axis, entries are growth) delivered as a context
// value so app-shell renders the topbar.trail zone blind (no #features import).
const chrome = createContributorRegistry(
  "chrome",
  assembleChrome({
    sections: sections.list(),
    modals: modals.list(),
    widgets: [notificationsChrome, fullscreenChrome, contextToggleChrome, chatOptionsChrome, personaChrome],
  }),
);

// The settings-SECTION contributor seam (§6c / pain-point §7 / SET-SEAMS §5.2): a feature raises ONE
// anchored section, the settings shell skims it — no growth of features/settings. ONE registry for EVERY
// anchor (the four per-anchor registries + their `make*Pane(…)` factories retired with SET-SEAMS stage 0),
// delivered by a context mint: the shell reads it for nav + search, each host pane's surface reads it for
// render. Adding a section is ONE line here.
//
// DOOR ORDER IS RENDER ORDER: within a pane, sections render in the order they appear below.
const settingsSections = createContributorRegistry<SettingsSectionContribution>("settings-sections", [
  // chat-behavior ← the DECOMPOSED chat-behavior pane (SET-SEAMS stage 2) leading, then the sections that
  // were already contributions: chat/memory ① (the master switch), world-info ② (scanDepth/tokenBudget),
  // databank ④ (retrieval), imagery (prompt templates). The two chat-owned knob groups come FIRST, which
  // reproduces the pre-split pane exactly (its own sections rendered above the contributed ones).
  chatMessageHandlingSection,
  chatStreamingSection,
  memorySettingsSection,
  worldInfoSettingsSection,
  databankSettingsSection,
  imageryTemplatesSection,
  proseSettingsSection,
  // admin ← the former SYSTEM pane's five sections lead (SET-SEAMS stage 4 / §10 Q2 merged `system` INTO
  // `admin`, "system's sections becoming the first group"), in their pre-merge pane order …
  mediaTrustSection,
  computeSection,
  sharedAccessSection,
  multiUserSection,
  operationsSection,
  // … then the DECOMPOSED admin pane (SET-SEAMS stage 3) in its pre-split order (users · engines · model
  // catalog · card embeddings), then the AppSettings admin-tier sections that were already contributions.
  // All twelve are owned by user-admin (it owns the admin verbs + the admin-tier config).
  adminUsersSection,
  adminEnginesSection,
  adminCatalogSection,
  adminEmbeddingsSection,
  memoryTuningSection,
  rateLimitsSection,
  systemTuningSection,
  structuredOutputSection,
  // workloads ← the DECOMPOSED workloads pane (SET-SEAMS stage 3): the jobs list and the schedules, ahead of
  // the analysis-tuning knobs (dupThreshold/computeThemesK/maxPairs/hubFraction) that were already a
  // contribution — reproducing the pre-split pane exactly.
  workloadsJobsSection,
  workloadsSchedulesSection,
  workloadsTuningSection,
  // appearance ← the DECOMPOSED appearance pane (SET-SEAMS stage 1). Order here IS render order down the
  // pane, and it reproduces the pre-split pane exactly. Each section is owned by the feature that READS its
  // knobs (§6): chat renders the message chrome, app-shell paints sizing/reading/effects/background, and
  // character reads the library page size.
  appearanceMessageStyleSection,
  appearanceAvatarsSection,
  appearanceSizingSection,
  appearanceMessageDetailsSection,
  appearanceBackgroundSection,
  appearanceReadingSection,
  appearanceEffectsSection,
  librarySettingsSection,
]);

// S2 — the key partition (SET-SEAMS §2.3). N sections patching ONE UserSettings namespace (or the ONE
// AppSettings blob) is safe only while their claims are DISJOINT — the server merges per key and serializes
// the write, so disjoint patches commute. THROWS here, at the door, on an overlap (including a claim NESTED
// inside another section's, e.g. two owners of one `engineLaunch`) or on an uneditable knob inside a claimed
// user namespace.
assertSettingsKeyPartition(settingsSections, DEFAULT_USER_SETTINGS);

// The ONE settings-pane assembly (§8/G8): total over SETTINGS_CATEGORY_IDS by tsc; delivered as a
// context value so the settings host reads it without importing any pane body directly.
const settingsPanes = createRegistry("settings-panes", SETTINGS_CATEGORY_IDS, {
  personas: personasPane,
  appearance: appearancePane,
  workloads: workloadsPane,
  backup: backupPane,
  "chat-behavior": chatBehaviorPane,
  connections: connectionsPane,
  automation: automationPane,
  admin: adminPane,
});

// The app-wide toast manager, minted outside React so it binds once here and <ToastProvider> renders
// whatever notify.* enqueues. Without this bind, user-facing errors were console-only.
const toastManager = createToastManager();
bindNotify({
  info: (message): void => {
    toastManager.add({ title: message });
  },
  success: (message): void => {
    toastManager.add({ title: message, type: "success" });
  },
  error: (message): void => {
    toastManager.add({ title: message, type: "error", priority: "high" });
  },
});

function reportClientError(error: Error, ownerStack: string | null): void {
  const url = `${globalThis.location.pathname}${globalThis.location.search}`;
  trpcClient.clientError.mutate(buildClientErrorPayload(error, ownerStack, url)).catch(() => {
    // A failed error report must never itself throw — there is nowhere left to report that to.
  });
}

const rootEl = document.getElementById("root");
if (rootEl === null) {
  throw new Error("orbweaver: #root mount node missing from index.html");
}

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {/* Mounted outside AppErrorBoundary so a notification survives an app-level crash boundary swap. */}
        <ToastProvider toastManager={toastManager}>
          <AppErrorBoundary
            onError={reportClientError}
            renderFallback={(): ReactElement => (
              <Stack align="center" justify="center" className="min-h-dvh bg-background text-foreground">
                <EmptyState
                  icon={<Icon icon={AlertTriangle} size="lg" />}
                  title="Something went wrong"
                  description="The app hit an unexpected error. Reloading usually fixes it."
                  action={
                    <Button intent="primary" onClick={(): void => globalThis.location.reload()}>
                      Reload
                    </Button>
                  }
                />
              </Stack>
            )}
          >
            <SectionRegistryProvider value={sections}>
              <ModalRegistryProvider value={modals}>
                <ChromeRegistryProvider value={chrome}>
                  <SettingsPaneRegistryProvider value={settingsPanes}>
                    <SettingsSectionRegistryProvider value={settingsSections}>
                      <MessageToolsRendererRegistryProvider value={messageToolsRenderers}>
                        <SlashCommandRegistryProvider value={slashCommands}>
                          <RouterProvider router={router} />
                        </SlashCommandRegistryProvider>
                      </MessageToolsRendererRegistryProvider>
                    </SettingsSectionRegistryProvider>
                  </SettingsPaneRegistryProvider>
                </ChromeRegistryProvider>
              </ModalRegistryProvider>
            </SectionRegistryProvider>
          </AppErrorBoundary>
          <Toaster />
        </ToastProvider>
        {DevTools === null || isProbeMode() ? null : (
          <Suspense fallback={null}>
            <DevTools queryClient={queryClient} router={router} />
          </Suspense>
        )}
      </TRPCProvider>
    </QueryClientProvider>
  </StrictMode>,
);

// Installed after render so the query cache exists and the readiness check observes the initial reads.
installAppReadySignal(queryClient);
installAgentDebugHandle(queryClient, buildAgentNav(trpcProxy, queryClient), buildAgentSeed(trpcClient));
