// CtDataProviders — the CLIENT data-layer provider stack (Query + tRPC) for client `.ct.tsx`
// lanes; composed by `_ct-stories.tsx` modules around their story root. Deliberately NOT stacked
// in ct-providers.tsx / beforeMount: packages/ui/tsconfig.json owns ct-providers.tsx + playwright/**
// in its DOM-only program, and ANY import path from there to @orb/client drags @orb/server types
// upward through the cake (typecheck explosion). Story modules belong to the CLIENT program, so
// the seam lives here — one home, client-side (UI-Primitives §13.7 provider doctrine, client half).
//
// Fresh QueryClient PER MOUNT (this component re-runs per `mount()`) → an isolated cache per test.
// `retry: false` so a scripted failure surfaces immediately (the production retry:2 would triple
// every fail-then-succeed script). The tRPC client is the REAL production wiring (createTrpcClient:
// splitLink → httpBatchLink + CSRF header) — routeTrpc stubs the NETWORK under it, so CT exercises
// the real links / query keys / serialization.
//
// NO store-reset / localStorage.clear here: Playwright CT gives every test a FRESH browser context,
// so module state, zustand stores, and localStorage all start clean. If a future lane ever reuses a
// page across tests, the per-mount reset belongs HERE.

import { createTrpcClient, TRPCProvider } from "@orb/client/data";
import { youModal } from "@orb/client/features/app-shell";
import { accountModal } from "@orb/client/features/auth";
import { charactersSection } from "@orb/client/features/character";
import { commandModal, makeChatsSection, newChatModal } from "@orb/client/features/chat";
import { corpusSection } from "@orb/client/features/discovery";
import { presetsSection } from "@orb/client/features/preset";
import { refinerySection } from "@orb/client/features/refinery";
import { settingsModal, themeModal } from "@orb/client/features/settings";
import { analyticsSection } from "@orb/client/features/stats";
import { worldInfoSection } from "@orb/client/features/world-info";
import type { ChatContextState, ContextTabDef } from "@orb/client/lib";
import { createContributorRegistry, createRegistry } from "@orb/client/lib";
import type {
  ModalDefinition,
  ModalRegistry,
  ModalSlotId,
  SectionDefinition,
  SectionId,
  SectionRegistry,
} from "@orb/client/state";
import {
  MODAL_SLOT_IDS,
  ModalRegistryProvider,
  SECTION_IDS,
  SectionRegistryProvider,
} from "@orb/client/state";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";

export function CtDataProviders({ children }: { readonly children: ReactNode }): ReactElement {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      mutations: { retry: false },
    },
  });
  const trpcClient = createTrpcClient();
  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}

// ── Section-registry CT providers ─────────────────────────────────────────────────────────────────
// The shell (AppShell / Rail / YouSheet / useShellLayout / AppRoot) reads the section registry as a
// runtime context, so a CT mounting any of them must provide one (mirrors main.tsx's door). Homed HERE
// (the one client-owned CT support file — selection.ts CT_CLIENT_OWNED) so importing the client feature
// front doors stays in the client program.

const chatContextContributors = createContributorRegistry<ContextTabDef<ChatContextState>>(
  "chat-context",
  [],
);

const REAL: Record<SectionId, SectionDefinition> = {
  chats: makeChatsSection(chatContextContributors),
  characters: charactersSection,
  corpus: corpusSection,
  worldInfo: worldInfoSection,
  presets: presetsSection,
  refinery: refinerySection,
  analytics: analyticsSection,
};

const realRegistry: SectionRegistry = createRegistry<SectionId, SectionDefinition>(
  "sections",
  SECTION_IDS,
  REAL,
);

// ── Modal-registry CT provider ────────────────────────────────────────────────────────────────────
// AppShell / Rail / YouSheet / ModalHost read the modal registry as a runtime context (mirrors main.tsx).
// The section-registry providers below nest it, so every shell CT gets both registries transparently.

const REAL_MODALS: Record<ModalSlotId, ModalDefinition> = {
  theme: themeModal,
  settings: settingsModal,
  account: accountModal,
  command: commandModal,
  newChat: newChatModal,
  you: youModal,
};

const realModalRegistry: ModalRegistry = createRegistry<ModalSlotId, ModalDefinition>(
  "modals",
  MODAL_SLOT_IDS,
  REAL_MODALS,
);

/** The real 7-section + 6-modal registries — for CTs that drive real section content (the route CT). */
export function CtRealSectionRegistry({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return (
    <SectionRegistryProvider value={realRegistry}>
      <ModalRegistryProvider value={realModalRegistry}>{children}</ModalRegistryProvider>
    </SectionRegistryProvider>
  );
}

/** A modal registry with a story-injected body per id (real trigger/title/presentation preserved) — the
 *  test-seam analog of CtFakeSectionRegistry, for CTs isolating ModalHost behavior (the scroll invariant). */
export function CtFakeModalRegistry({
  body,
  children,
}: {
  readonly body: (id: ModalSlotId) => ReactElement;
  readonly children: ReactNode;
}): ReactElement {
  const registry = createRegistry<ModalSlotId, ModalDefinition>(
    "modals",
    MODAL_SLOT_IDS,
    Object.fromEntries(
      MODAL_SLOT_IDS.map((id) => [id, { ...REAL_MODALS[id], body: (): ReactElement => body(id) }]),
    ) as Record<ModalSlotId, ModalDefinition>,
  );
  return <ModalRegistryProvider value={registry}>{children}</ModalRegistryProvider>;
}

/** Per-section fake injection: `list`/`content`/`context` slots the story wants to render. A `context`
 *  slot is delivered through the real `single` ContextDefinition arm so `SectionContextHost` renders it
 *  live (the shell's real consumer path); a non-injected section's context is `{ kind: "none" }`. */
export interface CtFakeSection {
  readonly list?: ReactNode;
  readonly content?: ReactNode;
  readonly context?: ReactNode;
}

function fakeSection(id: SectionId, slot: CtFakeSection | undefined): SectionDefinition {
  const real = REAL[id];
  return {
    id,
    rail: real.rail,
    panelDefaults: real.panelDefaults,
    placeholder: real.placeholder,
    ...(slot?.list !== undefined ? { list: (): ReactNode => slot.list } : {}),
    // A non-injected section renders its real placeholder (the planned arm) — the old "unwired ⇒ fallback".
    content: slot?.content !== undefined ? (): ReactNode => slot.content : { planned: "ct" },
    context:
      slot?.context !== undefined
        ? { kind: "single", body: (): ReactNode => slot.context }
        : { kind: "none" },
  };
}

/** The shell-isolation registry — real rail/placeholder, story-injected list/content per section. */
export function CtFakeSectionRegistry({
  sections,
  children,
}: {
  readonly sections?: Partial<Record<SectionId, CtFakeSection>>;
  readonly children: ReactNode;
}): ReactElement {
  const registry = createRegistry<SectionId, SectionDefinition>(
    "sections",
    SECTION_IDS,
    Object.fromEntries(SECTION_IDS.map((id) => [id, fakeSection(id, sections?.[id])])) as Record<
      SectionId,
      SectionDefinition
    >,
  );
  return (
    <SectionRegistryProvider value={registry}>
      <ModalRegistryProvider value={realModalRegistry}>{children}</ModalRegistryProvider>
    </SectionRegistryProvider>
  );
}
