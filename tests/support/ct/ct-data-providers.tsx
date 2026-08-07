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

import { createAppQueryClient, createTrpcClient, TRPCProvider } from "@orb/client/data";
import {
  appearanceBackgroundSection,
  appearanceEffectsSection,
  appearanceReadingSection,
  appearanceSizingSection,
  contextToggleChrome,
  fullscreenChrome,
  youModal,
} from "@orb/client/features/app-shell";
import { accountModal } from "@orb/client/features/auth";
import { librarySettingsSection, makeCharactersSection } from "@orb/client/features/character";
import {
  appearanceAvatarsSection,
  appearanceMessageDetailsSection,
  appearanceMessageStyleSection,
  ChatsWithCharacterPane,
  chatMessageHandlingSection,
  chatQuickPicksTile,
  chatRecentsTile,
  chatStreamingSection,
  chatTempChatTile,
  commandModal,
  databankSettingsSection,
  imageryTemplatesSection,
  makeChatsSection,
  memorySettingsSection,
  newChatModal,
  proseSettingsSection,
} from "@orb/client/features/chat";
import { makeConfigSection } from "@orb/client/features/config";
import { connectionsPane } from "@orb/client/features/credentials";
import { databankSection } from "@orb/client/features/databank";
import { corpusSection } from "@orb/client/features/discovery";
import { automationDormantTile, buddyDormantTile, makeHomeSection, sectionJumpTile } from "@orb/client/features/home";
import { notificationsChrome } from "@orb/client/features/notifications";
import { personaChrome, personasPane } from "@orb/client/features/persona";
import { presetsSection } from "@orb/client/features/preset";
import { refinerySection } from "@orb/client/features/refinery";
import { regexCollection } from "@orb/client/features/regex";
import { appearancePane, automationPane, chatBehaviorPane, settingsModal, themeModal } from "@orb/client/features/settings";
import { analyticsSection } from "@orb/client/features/stats";
import { tagCollection } from "@orb/client/features/tag";
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
} from "@orb/client/features/user-admin";
import { backupPane, workloadsJobsSection, workloadsPane, workloadsSchedulesSection, workloadsTuningSection } from "@orb/client/features/workloads";
import { worldInfoCollection, worldInfoSettingsSection } from "@orb/client/features/world-info";
import type {
  CharacterDetailContribution,
  ChatContextState,
  ChatSurfaceContribution,
  CollectionContribution,
  ContextRegionDef,
  ContextTabDef,
  ContributorRegistry,
  HomeTileContribution,
  ToolRenderer,
} from "@orb/client/lib";
import { createContributorRegistry, createRegistry } from "@orb/client/lib";
import type {
  ChromeEntry,
  ChromeRegistry,
  ModalDefinition,
  ModalRegistry,
  ModalSlotId,
  SectionDefinition,
  SectionId,
  SectionRegistry,
  SectionSelection,
  SettingsCategoryId,
  SettingsPaneDefinition,
  SettingsPaneRegistry,
  SettingsSectionContribution,
} from "@orb/client/state";
import {
  assembleChrome,
  ChromeRegistryProvider,
  MODAL_SLOT_IDS,
  ModalRegistryProvider,
  SECTION_IDS,
  SETTINGS_CATEGORY_IDS,
  SectionRegistryProvider,
  SettingsPaneRegistryProvider,
  SettingsSectionRegistryProvider,
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

/** {@link CtDataProviders}, but on the REAL app QueryClient (`createAppQueryClient`) — the one whose
 *  MutationCache/QueryCache `onError` IS the `meta.errorToast` → `notify` channel. The plain client above
 *  has no such channel, so a CT whose observable is a mutation's ERROR TOAST must mount this one and pair it
 *  with `CtToastSurface` (which owns the single `bindNotify`). Everything else — the real tRPC client over
 *  the routeTrpc-stubbed network, one client per mount — is identical. */
export function CtAppDataProviders({ children }: { readonly children: ReactNode }): ReactElement {
  const queryClient = createAppQueryClient();
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

const chatContextContributors = createContributorRegistry<ContextTabDef<ChatContextState>>("chat-context", []);
const chatContextRegions = createContributorRegistry<ContextRegionDef<ChatContextState>>("chat-context-regions", []);
const chatSurfaceContributors = createContributorRegistry<ChatSurfaceContribution>("chat-surface", []);
const characterDetailContributors = createContributorRegistry<CharacterDetailContribution>("character-detail", []);
// The per-tool-name renderer seam, empty as at the real door — every tool record falls back to `ToolCallBlock`.
const chatToolRenderers = createContributorRegistry<ToolRenderer>("tool-renderers", []);

// The home-tile seam, assembled as at the real door (home's own jump grid + whatever features raise) —
// so a shell CT that lands on `home` renders the REAL tile grid, not a stand-in.
const homeTiles = createContributorRegistry<HomeTileContribution>("home-tiles", [
  chatRecentsTile,
  chatQuickPicksTile,
  chatTempChatTile,
  sectionJumpTile,
  buddyDormantTile,
  automationDormantTile,
]);

// The COLLECTION seam, assembled as at the real door — so a shell CT landing on `config` renders the REAL
// roster (tags + regex scripts + world books), not a stand-in.
const configCollections = createContributorRegistry<CollectionContribution>("config-collections", [tagCollection, regexCollection, worldInfoCollection]);

const REAL: Record<SectionId, SectionDefinition> = {
  home: makeHomeSection(homeTiles),
  chats: makeChatsSection({
    contextTabs: chatContextContributors,
    contextRegions: chatContextRegions,
    surfaces: chatSurfaceContributors,
    toolRenderers: chatToolRenderers,
  }),
  characters: makeCharactersSection(characterDetailContributors, (view) => <ChatsWithCharacterPane {...view} />),
  corpus: corpusSection,
  config: makeConfigSection(configCollections),
  databank: databankSection,
  presets: presetsSection,
  refinery: refinerySection,
  analytics: analyticsSection,
};

const realRegistry: SectionRegistry = createRegistry<SectionId, SectionDefinition>("sections", SECTION_IDS, REAL);

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

const realModalRegistry: ModalRegistry = createRegistry<ModalSlotId, ModalDefinition>("modals", MODAL_SLOT_IDS, REAL_MODALS);

// ── Settings-pane-registry CT provider ────────────────────────────────────────────────────────────
// The settings host reads the settings-pane registry as a runtime context (mirrors main.tsx's door).

// Mirror main.tsx's door: ONE settings-section registry for every anchor (SET-SEAMS §5.2), read by the
// shell (nav + search) and by each host pane's surface (render), so the shell CT renders the contributed
// sections exactly as production does.
const realSettingsSections: ContributorRegistry<SettingsSectionContribution> = createContributorRegistry<SettingsSectionContribution>("settings-sections", [
  // chat-behavior ← the DECOMPOSED pane (SET-SEAMS stage 2) leading, then the already-contributed sections.
  chatMessageHandlingSection,
  chatStreamingSection,
  memorySettingsSection,
  worldInfoSettingsSection,
  databankSettingsSection,
  imageryTemplatesSection,
  proseSettingsSection,
  // admin ← the former SYSTEM pane's five sections lead (SET-SEAMS stage 4 / §10 Q2), then the DECOMPOSED
  // admin pane (stage 3) in the door's render order, then the AppSettings admin-tier sections.
  // `systemTuningSection` used to be omitted here; with the pane a pure skimmer the registry IS the pane, so
  // an omission would render an incomplete admin pane in every CT.
  mediaTrustSection,
  computeSection,
  sharedAccessSection,
  multiUserSection,
  operationsSection,
  adminUsersSection,
  adminEnginesSection,
  adminCatalogSection,
  adminEmbeddingsSection,
  memoryTuningSection,
  rateLimitsSection,
  systemTuningSection,
  structuredOutputSection,
  // workloads ← the DECOMPOSED pane (SET-SEAMS stage 3), in the door's render order.
  workloadsJobsSection,
  workloadsSchedulesSection,
  workloadsTuningSection,
  // appearance ← the DECOMPOSED pane (SET-SEAMS stage 1), in the door's render order.
  appearanceMessageStyleSection,
  appearanceAvatarsSection,
  appearanceSizingSection,
  appearanceMessageDetailsSection,
  appearanceBackgroundSection,
  appearanceReadingSection,
  appearanceEffectsSection,
  librarySettingsSection,
]);

const REAL_SETTINGS_PANES: Record<SettingsCategoryId, SettingsPaneDefinition> = {
  personas: personasPane,
  appearance: appearancePane,
  automation: automationPane,
  workloads: workloadsPane,
  backup: backupPane,
  "chat-behavior": chatBehaviorPane,
  connections: connectionsPane,
  admin: adminPane,
};

const realSettingsPaneRegistry: SettingsPaneRegistry = createRegistry<SettingsCategoryId, SettingsPaneDefinition>(
  "settings-panes",
  SETTINGS_CATEGORY_IDS,
  REAL_SETTINGS_PANES,
);

// ── Chrome-registry CT provider ───────────────────────────────────────────────────────────────────
// AppShell reads the chrome registry (its topbar.trail render) as a runtime context (mirrors main.tsx's
// door). The section-registry providers below nest it, so every shell CT gets all four registries.

const realChromeRegistry: ChromeRegistry = createContributorRegistry(
  "chrome",
  assembleChrome({
    sections: realRegistry.list(),
    modals: realModalRegistry.list(),
    widgets: [notificationsChrome, fullscreenChrome, contextToggleChrome, personaChrome],
  }),
);

// The rail's `rail.end` persona identity widget (`personaChrome.body("bar")`) is a data-backed suspense
// surface; the BARE RailStory (a11y/keyboard, no data layer) stands a named button in its place — the
// old `railFoot` stand-in philosophy, now expressed as a chrome widget — so the footer-slot a11y baseline
// stays covered without pulling the persona feature (and its queries) into a dataless mount.
const railStandInPersona: ChromeEntry = {
  id: "persona-identity",
  label: "Account",
  zone: "rail.end",
  order: 50,
  mobile: "sheet",
  behavior: { kind: "widget", body: (): ReactElement => <button type="button">Account</button> },
};
const standInChromeRegistry: ChromeRegistry = createContributorRegistry(
  "chrome",
  assembleChrome({
    sections: realRegistry.list(),
    modals: realModalRegistry.list(),
    widgets: [notificationsChrome, fullscreenChrome, contextToggleChrome, railStandInPersona],
  }),
);

/** Overrides the chrome registry with the stand-in (a bare "Account" rail.end widget) — for the bare
 *  RailStory, which mounts the rail without a data layer. */
export function CtStandInChromeRegistry({ children }: { readonly children: ReactNode }): ReactElement {
  return <ChromeRegistryProvider value={standInChromeRegistry}>{children}</ChromeRegistryProvider>;
}

/** The real 10-section + 7-modal + 10-settings-pane + 3-chrome registries — for CTs that drive real
 *  content (the route CT). */
export function CtRealSectionRegistry({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <SectionRegistryProvider value={realRegistry}>
      <ModalRegistryProvider value={realModalRegistry}>
        <ChromeRegistryProvider value={realChromeRegistry}>
          <SettingsPaneRegistryProvider value={realSettingsPaneRegistry}>
            <SettingsSectionRegistryProvider value={realSettingsSections}>{children}</SettingsSectionRegistryProvider>
          </SettingsPaneRegistryProvider>
        </ChromeRegistryProvider>
      </ModalRegistryProvider>
    </SectionRegistryProvider>
  );
}

/** The settings-SECTION registry alone, for a CT that mounts ONE host pane's surface outside the shell —
 *  the surface reads the registry from context now that the pane factories' prop threading is gone. */
export function CtSettingsSectionRegistry({
  sections,
  children,
}: {
  readonly sections: ContributorRegistry<SettingsSectionContribution>;
  readonly children: ReactNode;
}): ReactElement {
  return <SettingsSectionRegistryProvider value={sections}>{children}</SettingsSectionRegistryProvider>;
}

/** The REAL `chats` section, rebuilt with a CALLER-supplied `chat-context`/`chat-surface` contributor
 *  registry in place of main.tsx's empty ones (the M8 deliverable — proves a fake contributor renders +
 *  `when`-gates through the REAL section/factory/mint path, not a bespoke test double). Every other
 *  section stays the real registry (`REAL`), so a chat CT mounting the shell still sees real siblings. */
export function CtChatContributorSectionRegistry({
  contextContributors,
  contextRegions,
  surfaceContributors,
  children,
}: {
  readonly contextContributors?: ContributorRegistry<ContextTabDef<ChatContextState>>;
  /** The whole-pane REGION-CLAIM arm (HUD-1 §3.2) — a fake claimant proves the seam without rpg. */
  readonly contextRegions?: ContributorRegistry<ContextRegionDef<ChatContextState>>;
  readonly surfaceContributors?: ContributorRegistry<ChatSurfaceContribution>;
  readonly children: ReactNode;
}): ReactElement {
  const registry = createRegistry<SectionId, SectionDefinition>("sections", SECTION_IDS, {
    ...REAL,
    chats: makeChatsSection({
      contextTabs: contextContributors ?? chatContextContributors,
      contextRegions: contextRegions ?? chatContextRegions,
      surfaces: surfaceContributors ?? chatSurfaceContributors,
      toolRenderers: chatToolRenderers,
    }),
  });
  return (
    <SectionRegistryProvider value={registry}>
      <ModalRegistryProvider value={realModalRegistry}>
        <ChromeRegistryProvider value={realChromeRegistry}>
          <SettingsPaneRegistryProvider value={realSettingsPaneRegistry}>
            <SettingsSectionRegistryProvider value={realSettingsSections}>{children}</SettingsSectionRegistryProvider>
          </SettingsPaneRegistryProvider>
        </ChromeRegistryProvider>
      </ModalRegistryProvider>
    </SectionRegistryProvider>
  );
}

/** The REAL `characters` section, rebuilt with a CALLER-supplied `character-detail` contributor registry
 *  in place of main.tsx's empty one (the seam deliverable — proves a fake detail contribution renders +
 *  `when`-gates through the REAL section/factory/content path, not a bespoke test double). Every other
 *  section stays the real registry (`REAL`), so a character CT mounting the shell still sees real siblings. */
export function CtCharacterContributorSectionRegistry({
  detailContributors,
  children,
}: {
  readonly detailContributors: ContributorRegistry<CharacterDetailContribution>;
  readonly children: ReactNode;
}): ReactElement {
  const registry = createRegistry<SectionId, SectionDefinition>("sections", SECTION_IDS, {
    ...REAL,
    characters: makeCharactersSection(detailContributors, (view) => <ChatsWithCharacterPane {...view} />),
  });
  return (
    <SectionRegistryProvider value={registry}>
      <ModalRegistryProvider value={realModalRegistry}>
        <ChromeRegistryProvider value={realChromeRegistry}>
          <SettingsPaneRegistryProvider value={realSettingsPaneRegistry}>
            <SettingsSectionRegistryProvider value={realSettingsSections}>{children}</SettingsSectionRegistryProvider>
          </SettingsPaneRegistryProvider>
        </ChromeRegistryProvider>
      </ModalRegistryProvider>
    </SectionRegistryProvider>
  );
}

/** A modal registry with a story-injected body per id (real trigger/title/presentation preserved) — the
 *  test-seam analog of CtFakeSectionRegistry, for CTs isolating ModalHost behavior (the scroll invariant). */
export function CtFakeModalRegistry({ body, children }: { readonly body: (id: ModalSlotId) => ReactElement; readonly children: ReactNode }): ReactElement {
  const registry = createRegistry<ModalSlotId, ModalDefinition>(
    "modals",
    MODAL_SLOT_IDS,
    Object.fromEntries(MODAL_SLOT_IDS.map((id) => [id, { ...REAL_MODALS[id], body: (): ReactElement => body(id) }])) as Record<ModalSlotId, ModalDefinition>,
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
  /** The section's SELECTION seam for the story (`SectionSelection` — the mobile ONE-SHELL rule's input).
   *  Absent ⇒ the section's REAL seam when it has one, else a never-selected stand-in: a story that injects
   *  a `list` still has to answer "is anything open?", because the shell's rule is not optional. */
  readonly selection?: SectionSelection;
}

/** The stand-in seam for a story-injected list over a section that owns no real selection store: nothing is
 *  ever selected, so the LIST is the mobile screen and there is no back affordance. Module-scope (a fresh
 *  object per render would re-subscribe every commit). */
const CT_NEVER_SELECTED: SectionSelection = {
  subscribe: () => (): void => undefined,
  hasSelection: () => false,
  clear: (): void => undefined,
};

function fakeSection(id: SectionId, slot: CtFakeSection | undefined): SectionDefinition {
  const real = REAL[id];
  const base = {
    id,
    rail: real.rail,
    // The section's declared PANEL CAPABILITY is shell anatomy, not story content — carry it through so a
    // shell CT sees the real "this section has no LIST pane" arm (home).
    ...(real.panels === undefined ? {} : { panels: real.panels }),
    panelDefaults: real.panelDefaults,
    placeholder: real.placeholder,
    // A non-injected section renders its real placeholder (the planned arm) — the old "unwired ⇒ fallback".
    content: slot?.content !== undefined ? (): ReactNode => slot.content : { planned: "ct" },
    context: slot?.context !== undefined ? { kind: "single" as const, body: (): ReactNode => slot.context } : { kind: "none" as const },
  };
  if (slot?.list === undefined) {
    return base;
  }
  // `list` and `selection` are ONE arm of the definition union (section-registry.ts) — the fake honours that
  // instead of casting around it, so a story exercises the same shell rule production does.
  return { ...base, list: (): ReactNode => slot.list, selection: slot.selection ?? real.selection ?? CT_NEVER_SELECTED };
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
    Object.fromEntries(SECTION_IDS.map((id) => [id, fakeSection(id, sections?.[id])])) as Record<SectionId, SectionDefinition>,
  );
  return (
    <SectionRegistryProvider value={registry}>
      <ModalRegistryProvider value={realModalRegistry}>
        <ChromeRegistryProvider value={realChromeRegistry}>
          <SettingsPaneRegistryProvider value={realSettingsPaneRegistry}>
            <SettingsSectionRegistryProvider value={realSettingsSections}>{children}</SettingsSectionRegistryProvider>
          </SettingsPaneRegistryProvider>
        </ChromeRegistryProvider>
      </ModalRegistryProvider>
    </SectionRegistryProvider>
  );
}
