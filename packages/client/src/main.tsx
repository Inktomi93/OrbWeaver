// The client composition root: constructs the singletons once (QueryClient → tRPC client → the toast
// manager) and provides them to the tree. Nothing imports this file; everything consumes via
// providers/hooks.

import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
// biome's resolver stops at the lucide-react re-export chain behind the @orb/ui/icons subpath; tsc +
// vite resolve AlertTriangle/Icon fine (the same gap `#primitives/icons` hits inside packages/ui itself
// — see status-chip.tsx).
// biome-ignore lint/correctness/noUnresolvedImports: tsc-verified false positive (see above).
import { AlertTriangle, Icon } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { createToastManager, Toaster, ToastProvider } from "@orb/ui/toast";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import type { ReactElement } from "react";
// biome mis-enumerates react's conditional-CJS export map and misses StrictMode/lazy/Suspense
// specifically (useState/Component/etc. resolve fine); tsc resolves them and the client
// typechecks clean.
// biome-ignore lint/correctness/noUnresolvedImports: tsc-verified false positive (see above).
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { createAppQueryClient, createTrpcClient, TRPCProvider } from "#data";
import { youModal } from "#features/app-shell";
import { accountModal } from "#features/auth";
import { charactersSection } from "#features/character";
import { commandModal, makeChatsSection, newChatModal } from "#features/chat";
import { connectionsPane } from "#features/credentials";
import { corpusSection } from "#features/discovery";
import { personasPane } from "#features/persona";
import { presetsSection } from "#features/preset";
import { refinerySection } from "#features/refinery";
import {
  accountPane,
  appearancePane,
  automationPane,
  chatBehaviorPane,
  regexPane,
  settingsModal,
  systemPane,
  tagsPane,
  themeModal,
} from "#features/settings";
import { analyticsSection } from "#features/stats";
import { adminPane } from "#features/user-admin";
import { backupPane, workloadsPane } from "#features/workloads";
import { worldInfoSection } from "#features/world-info";
import type { ChatContextState, ChatSurfaceContribution, ContextTabDef } from "#lib";
import {
  AppErrorBoundary,
  bindNotify,
  buildClientErrorPayload,
  createContributorRegistry,
  createRegistry,
} from "#lib";
import {
  MODAL_SLOT_IDS,
  ModalRegistryProvider,
  SECTION_IDS,
  SETTINGS_CATEGORY_IDS,
  SectionRegistryProvider,
  SettingsPaneRegistryProvider,
} from "#state";
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
const chatContextContributors = createContributorRegistry<ContextTabDef<ChatContextState>>(
  "chat-context",
  [],
);

// The chat-surface contributor seam (§6c/M8): EMPTY but typed — the door → factory → 3 anchors path is
// compiled and exercised with zero contributions; rpg/crew append array members later.
const chatSurfaceContributors = createContributorRegistry<ChatSurfaceContribution>(
  "chat-surface",
  [],
);

// The ONE section assembly (G1/G8): total over SECTION_IDS by tsc; delivered as a context value so
// app-shell reads it (incl. the use-shell-layout hook) without a #features import.
const sections = createRegistry("sections", SECTION_IDS, {
  chats: makeChatsSection(chatContextContributors, chatSurfaceContributors),
  characters: charactersSection,
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

// The ONE settings-pane assembly (§8/G8): total over SETTINGS_CATEGORY_IDS by tsc; delivered as a
// context value so the settings host reads it without importing any pane body directly.
const settingsPanes = createRegistry("settings-panes", SETTINGS_CATEGORY_IDS, {
  account: accountPane,
  personas: personasPane,
  appearance: appearancePane,
  tags: tagsPane,
  workloads: workloadsPane,
  backup: backupPane,
  "chat-behavior": chatBehaviorPane,
  regex: regexPane,
  connections: connectionsPane,
  automation: automationPane,
  system: systemPane,
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
              <Stack
                align="center"
                justify="center"
                className="min-h-dvh bg-background text-foreground"
              >
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
                <SettingsPaneRegistryProvider value={settingsPanes}>
                  <RouterProvider router={router} />
                </SettingsPaneRegistryProvider>
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
installAgentDebugHandle(queryClient);
