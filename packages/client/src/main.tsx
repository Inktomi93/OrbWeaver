// The client composition root: constructs the singletons once (QueryClient → tRPC client → the toast
// manager) and provides them to the tree. Nothing imports this file; everything consumes via
// providers/hooks.

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
import { contextToggleChrome, fullscreenChrome, youModal } from "#features/app-shell";
import { accountModal } from "#features/auth";
import { characterSlashCommands, makeCharactersSection } from "#features/character";
import {
  chatOptionsChrome,
  chatSlashCommands,
  commandModal,
  databankSettingsSection,
  makeChatsSection,
  memorySettingsSection,
  newChatModal,
} from "#features/chat";
import { connectionsPane } from "#features/credentials";
import { corpusSection } from "#features/discovery";
import { notificationsChrome } from "#features/notifications";
import { personaChrome, personasPane } from "#features/persona";
import { presetsSection } from "#features/preset";
import { refinerySection } from "#features/refinery";
import { appearancePane, automationPane, makeChatBehaviorPane, regexPane, settingsModal, systemPane, tagsPane, themeModal } from "#features/settings";
import { analyticsSection } from "#features/stats";
import { makeAdminPane, memoryTuningSection, rateLimitsSection } from "#features/user-admin";
import { backupPane, workloadsPane } from "#features/workloads";
import { worldInfoSection, worldInfoSettingsSection } from "#features/world-info";
import type {
  CharacterDetailContribution,
  ChatContextState,
  ChatSurfaceContribution,
  ContextTabDef,
  MessageToolsRenderer,
  SlashCommandContribution,
  ToolRenderer,
} from "#lib";
import { AppErrorBoundary, bindNotify, buildClientErrorPayload, createContributorRegistry, createRegistry } from "#lib";
import type { SettingsSectionContribution } from "#state";
import {
  assembleChrome,
  ChromeRegistryProvider,
  MessageToolsRendererRegistryProvider,
  MODAL_SLOT_IDS,
  ModalRegistryProvider,
  SECTION_IDS,
  SETTINGS_CATEGORY_IDS,
  SectionRegistryProvider,
  SettingsPaneRegistryProvider,
  SlashCommandRegistryProvider,
} from "#state";
import { buildAgentNav } from "./agent-nav";
import { installAgentDebugHandle, installAppReadySignal } from "./lib/agent-bridge";
import { isProbeMode } from "./lib/probe-mode";
import { router } from "./routes/router";
import "./styles/globals.css";

// Both arms behind the literal import.meta.env.DEV, which the bundler constant-folds so neither
// module lands in the prod output. Dynamic import keeps the tracer out of the entry chunk in dev too.
if (import.meta.env.DEV) {
  void import("./lib/long-task-tracer").then(({ installLongTaskTracer }) => {
    installLongTaskTracer();
  });
}
// Deep import on purpose — dev-tools must never ride a barrel that also exports prod code.
const DevTools = import.meta.env.DEV
  ? lazy(async () => {
      const mod = await import("./lib/dev-tools");
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

// The chat-context contributor seam (§6c): EMPTY but typed at M3 — the door → factory → mint → resolve
// → render path is compiled and exercised with zero contributions; M8 only appends array members.
const chatContextContributors = createContributorRegistry<ContextTabDef<ChatContextState>>("chat-context", []);

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

// The ONE section assembly (G1/G8): total over SECTION_IDS by tsc; delivered as a context value so
// app-shell reads it (incl. the use-shell-layout hook) without a #features import.
const sections = createRegistry("sections", SECTION_IDS, {
  chats: makeChatsSection(chatContextContributors, chatSurfaceContributors, toolRenderers),
  characters: makeCharactersSection(characterDetailContributors),
  corpus: corpusSection,
  worldInfo: worldInfoSection,
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

// The settings-SECTION contributor seam (§6c / pain-point §7): domains graft ONE anchored section into a
// host pane WITHOUT growing features/settings. Assembled at the door (G8), threaded into the chat-behavior
// pane factory. Phase B: memory ① (the master switch) + world-info ② (scanDepth/tokenBudget) — both owned
// by their features, both landing here as contributions. An empty list ⇒ the pane is byte-identical.
const chatBehaviorSettingsSections = createContributorRegistry<SettingsSectionContribution>("chat-behavior-settings-sections", [
  memorySettingsSection,
  worldInfoSettingsSection,
  databankSettingsSection,
]);

// The admin-anchored sections (Phase B ③): the AppSettings admin-tier surfaces (memory tuning +
// summarizer, rate limits) — owned by user-admin (admin-tier config), grafted into the admin pane via the
// same seam. An empty list ⇒ the admin pane is byte-identical.
const adminSettingsSections = createContributorRegistry<SettingsSectionContribution>("admin-settings-sections", [memoryTuningSection, rateLimitsSection]);

// The ONE settings-pane assembly (§8/G8): total over SETTINGS_CATEGORY_IDS by tsc; delivered as a
// context value so the settings host reads it without importing any pane body directly.
const settingsPanes = createRegistry("settings-panes", SETTINGS_CATEGORY_IDS, {
  personas: personasPane,
  appearance: appearancePane,
  tags: tagsPane,
  workloads: workloadsPane,
  backup: backupPane,
  "chat-behavior": makeChatBehaviorPane(chatBehaviorSettingsSections),
  regex: regexPane,
  connections: connectionsPane,
  automation: automationPane,
  system: systemPane,
  admin: makeAdminPane(adminSettingsSections),
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
                    <MessageToolsRendererRegistryProvider value={messageToolsRenderers}>
                      <SlashCommandRegistryProvider value={slashCommands}>
                        <RouterProvider router={router} />
                      </SlashCommandRegistryProvider>
                    </MessageToolsRendererRegistryProvider>
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
installAgentDebugHandle(queryClient, buildAgentNav(createTrpcProxy(trpcClient, queryClient), queryClient));
