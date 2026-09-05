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

import { createAppQueryClient, createTrpcClient, TRPCProvider, useSettingsViewerView } from "@orb/client/data";
import {
  appearanceBackgroundSection,
  appearanceEffectsSection,
  appearanceReadingSection,
  appearanceSizingSection,
  contextToggleChrome,
  fullscreenChrome,
  youModal,
} from "@orb/client/features/app-shell";
import { reauthModal } from "@orb/client/features/auth";
import { automationBudgetSection, automationLibraryRulesSection } from "@orb/client/features/automation";
import { characterCreateChrome, librarySettingsSection, makeCharactersSection } from "@orb/client/features/character";
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
import { connectionsHostClaudeSection, connectionsKeysSection, connectionsRolesSection } from "@orb/client/features/credentials";
import { addDocumentModal, databankDocumentsTile, databankSection } from "@orb/client/features/databank";
import { corpusSection } from "@orb/client/features/discovery";
import { buddyDormantTile, makeHomeSection, makeSectionJumpTile } from "@orb/client/features/home";
import { imageDetailModal, imageEditModal, imagineModal } from "@orb/client/features/imagery";
import { notificationsChrome } from "@orb/client/features/notifications";
import { personaChrome, personaListSection, personaNotificationsSection, personaThisChatSection } from "@orb/client/features/persona";
import {
  extensionsSection,
  pluginCommandArgsModal,
  pluginDialogModal,
  pluginDistributeSection,
  pluginsInstalledSection,
  pluginsInstallSection,
  pluginToolRenderer,
} from "@orb/client/features/plugin";
import { presetsSection } from "@orb/client/features/preset";
import { refinerySection } from "@orb/client/features/refinery";
import { savedRostersModal } from "@orb/client/features/roster-preset";
import { appearanceLooksSection } from "@orb/client/features/settings";
import { analyticsSection } from "@orb/client/features/stats";
import {
  adminCatalogSection,
  adminEmbeddingsSection,
  adminEnginesSection,
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
import {
  backupExportSection,
  backupImportSection,
  workloadsJobsSection,
  workloadsSchedulesSection,
  workloadsTuningSection,
} from "@orb/client/features/workloads";
import { worldInfoSettingsSection } from "@orb/client/features/world-info";
import type {
  CharacterDetailContribution,
  ChatContextState,
  ChatSettingsSectionContribution,
  ChatSurfaceContribution,
  ContextRegionDef,
  ContextTabDef,
  ContributorRegistry,
  ToolRenderer,
} from "@orb/client/lib";
import { createContributorRegistry, createRegistry } from "@orb/client/lib";
import type {
  ChromeEntry,
  ChromeRegistry,
  ConfigGroupId,
  ConfigSectionContribution,
  HomeTileContribution,
  ModalDefinition,
  ModalRegistry,
  ModalSlotId,
  SectionDefinition,
  SectionId,
  SectionRegistry,
  SectionSelection,
} from "@orb/client/state";
import {
  assembleChrome,
  ChromeRegistryProvider,
  ConfigSectionRegistryProvider,
  MODAL_SLOT_IDS,
  ModalRegistryProvider,
  resolveConfigSections,
  SECTION_IDS,
  SectionRegistryProvider,
} from "@orb/client/state";
import { Container, Stack } from "@orb/ui/layout";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { Fragment } from "react";
import { placeholderConfigGroups, realConfigGroups } from "./ct-config-groups.ts";

export function CtDataProviders({
  children,
  refetchOnWindowFocus = true,
}: {
  readonly children: ReactNode;
  /** Opt OUT of react-query's `refetchOnWindowFocus` (v5 default: `true`).
   *
   *  Needed by any story whose pin is "THIS interaction issued the re-read": an errored query is stale, so a
   *  focus event landing between the failure barrier and the assertion re-reads on its own and HEALS the
   *  panel — a false pass that never touches the affordance under test (graduation verifier, 2026-08-08).
   *  Defaulted to today's behaviour so this is purely additive: no existing story changes, and a story that
   *  wants determinism asks for it. */
  readonly refetchOnWindowFocus?: boolean;
}): ReactElement {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY, refetchOnWindowFocus },
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
// The per-tool renderer seam, MIRRORING the real door (#679 U3): its one member claims the `plugin_` tool
// namespace and fans per-plugin inside its body. Every non-`plugin_` tool record still falls back to
// `ToolCallBlock`, and so does a `plugin_*` one whose owner registered no card — so a CT that stubs no plugin
// routes sees exactly the generic block it always did.
const chatToolRenderers = createContributorRegistry<ToolRenderer>("tool-renderers", [pluginToolRenderer]);
// The "This chat" SECTION seam (#616), empty here: a shell CT proves the tab's OWN sections, and the
// automation graft is proved by its own CT, which wires this registry itself.
const chatSettingsSections = createContributorRegistry<ChatSettingsSectionContribution>("chat-settings-sections", []);

// The home-tile seam, assembled as at the real door (home's own jump grid + whatever features raise) —
// so a shell CT that lands on `home` renders the REAL tile grid, not a stand-in.
const HOME_TILE_CONTRIBUTIONS: readonly HomeTileContribution[] = [
  chatRecentsTile,
  chatQuickPicksTile,
  chatTempChatTile,
  databankDocumentsTile,
  buddyDormantTile,
];

const homeTiles = createContributorRegistry<HomeTileContribution>("home-tiles", [
  ...HOME_TILE_CONTRIBUTIONS,
  // LAST, and built FROM the list above: its rows are the section registry minus home minus every section
  // a tile beside it already subsumes (`sectionId`).
  makeSectionJumpTile(HOME_TILE_CONTRIBUTIONS),
]);

/** The REAL config-section registry alone — for a story that mounts the config host's LIST/CONTENT panes
 *  directly (they read the section registry from context; the group registry rides in by prop). */
export function CtRealConfigSectionRegistry({ children }: { readonly children: ReactNode }): ReactElement {
  return <ConfigSectionRegistryProvider value={realSettingsSections}>{children}</ConfigSectionRegistryProvider>;
}

const REAL: Record<SectionId, SectionDefinition> = {
  home: makeHomeSection(homeTiles),
  chats: makeChatsSection({
    contextTabs: chatContextContributors,
    contextRegions: chatContextRegions,
    surfaces: chatSurfaceContributors,
    toolRenderers: chatToolRenderers,
    settingsSections: chatSettingsSections,
  }),
  characters: makeCharactersSection(characterDetailContributors, (view) => <ChatsWithCharacterPane {...view} />),
  corpus: corpusSection,
  config: makeConfigSection(realConfigGroups),
  // U5 (#679): the REAL Extensions section, so a shell CT landing anywhere sees the true rail roster and a CT
  // ON this section exercises the production switcher/page panes rather than a stand-in.
  extensions: extensionsSection,
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
  command: commandModal,
  newChat: newChatModal,
  addDocument: addDocumentModal,
  you: youModal,
  reauth: reauthModal,
  imagine: imagineModal,
  imageDetail: imageDetailModal,
  imageEdit: imageEditModal,
  pluginDialog: pluginDialogModal,
  pluginCommandArgs: pluginCommandArgsModal,
  savedRosters: savedRostersModal,
};

const realModalRegistry: ModalRegistry = createRegistry<ModalSlotId, ModalDefinition>("modals", MODAL_SLOT_IDS, REAL_MODALS);

// ── Config-section-registry CT provider ───────────────────────────────────────────────────────────
// Mirror the door (`compose/config-sections.ts`): ONE config-section registry for every anchor (SET-SEAMS
// §5.2), read by the config host's LIST (rows + search) and CONTENT (render), so a shell CT renders the
// contributed sections exactly as production does — every non-collection group is a skimmer over these
// (config-revamp-design.md §6.8), so an omission here renders an incomplete group in every CT.
const realSettingsSections: ContributorRegistry<ConfigSectionContribution> = createContributorRegistry<ConfigSectionContribution>("config-sections", [
  // personas · backup · connections · automation ← the §6.8 conversions, in the door's order.
  personaNotificationsSection,
  personaListSection,
  personaThisChatSection,
  backupExportSection,
  backupImportSection,
  connectionsRolesSection,
  connectionsHostClaudeSection,
  connectionsKeysSection,
  automationLibraryRulesSection,
  automationBudgetSection,
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
  // LOOKS leads (#866 S4 — the theme fold into Appearance).
  appearanceLooksSection,
  appearanceMessageStyleSection,
  appearanceAvatarsSection,
  appearanceSizingSection,
  appearanceMessageDetailsSection,
  appearanceBackgroundSection,
  appearanceReadingSection,
  appearanceEffectsSection,
  librarySettingsSection,
  // plugins ← Installed · Add-a-plugin (ungated, D147), then the admin-gated "Distribute to everyone"
  // section (D147 clause (d)), last in the door's order. The distribute section's own `when` is what the
  // shell CT's admin/plain-user pair exercises, so it MUST be here: an omission would make the gate
  // untestable and read as "the section never renders" in every CT.
  pluginsInstalledSection,
  pluginsInstallSection,
  pluginDistributeSection,
]);

/** A group's body EXACTLY as the config host renders it (config-content-surface.tsx `GroupBody`): the
 *  contributions at `anchor`, `when`-filtered by the ONE viewer projection, in registry order, in the host's
 *  Stack. For a CT that mounts ONE group's sections outside the shell — the production render path for a
 *  skimmer, not a hand-mounted surface (config-revamp-design.md §6.8.4). Must sit under `CtDataProviders`
 *  (the viewer projection reads `sessions.me`). */
export function CtConfigGroupBody({
  anchor,
  sections,
}: {
  readonly anchor: ConfigGroupId;
  readonly sections: ContributorRegistry<ConfigSectionContribution>;
}): ReactElement {
  const viewer = useSettingsViewerView();
  // The canonical CONTENT sequence (`ConfigSectionPartition`): plain sections, then the advanced-fold
  // cohort. The story has no fold chrome of its own, so it renders the flattened order — which is exactly
  // what a foldless host group paints.
  const { primary, advanced } = resolveConfigSections(sections, anchor, viewer);
  const resolved = [...primary, ...advanced];
  return (
    <ConfigSectionRegistryProvider value={sections}>
      {/* The host's CONTENT root is a `Container` (a `@container` root, config-content-surface.tsx), so every
          section's container queries (a plugin row's `@max-md` stacking, a role row's clusters) resolve
          against the pane — the same root here, or a narrow story measures a layout that does not exist. */}
      <Container className="h-full min-h-0">
        <Stack gap="section">
          {resolved.map((section) => (
            <Fragment key={section.id}>{section.node}</Fragment>
          ))}
        </Stack>
      </Container>
    </ConfigSectionRegistryProvider>
  );
}

// ── Chrome-registry CT provider ───────────────────────────────────────────────────────────────────
// AppShell reads the chrome registry (its topbar.trail render) as a runtime context (mirrors main.tsx's
// door). The section-registry providers below nest it, so every shell CT gets all four registries.

const realChromeRegistry: ChromeRegistry = createContributorRegistry(
  "chrome",
  assembleChrome({
    sections: realRegistry.list(),
    modals: realModalRegistry.list(),
    // `characterCreateChrome` (#1669) is the door's SECTION-scoped trail entry — the Characters pane's
    // primary, on a phone, where the LIST band that used to carry it is shed. It has to be here or the
    // real-registry shell CTs measure a phone topbar the product does not ship.
    widgets: [notificationsChrome, characterCreateChrome, fullscreenChrome, contextToggleChrome, personaChrome],
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
// …and the same stand-in philosophy now reaches the NOTIFICATIONS widget. The rail used to render only
// `rail.nav`/`rail.end`, so a `topbar.trail` entry's hooks were never called in this mount; the mobile You
// tab badges the sheet-hosted widgets' `useBadge` counts (#214 residue), so the rail evaluates
// `useVisible`/`useBadge` for them too — and `notificationsChrome`'s gate reads `useAuthConfig()`, which
// mount-throws the whole rail in a dataless story. The stand-in keeps the SEAM (a curated `topbar.trail`
// widget the You tab can badge) with none of the data layer; `RailSheetBadgeStory` owns the badge itself.
const railStandInNotifications: ChromeEntry = {
  id: "notifications-bell",
  label: "Notifications",
  zone: "topbar.trail",
  mobile: "sheet",
  useBadge: (): number => 0,
  behavior: { kind: "widget", body: (): ReactElement => <button type="button">Notifications</button> },
};
const standInChromeRegistry: ChromeRegistry = createContributorRegistry(
  "chrome",
  assembleChrome({
    sections: realRegistry.list(),
    modals: realModalRegistry.list(),
    widgets: [railStandInNotifications, fullscreenChrome, contextToggleChrome, railStandInPersona],
  }),
);

/** Overrides the chrome registry with the stand-in (a bare "Account" rail.end widget) — for the bare
 *  RailStory, which mounts the rail without a data layer. */
export function CtStandInChromeRegistry({ children }: { readonly children: ReactNode }): ReactElement {
  return <ChromeRegistryProvider value={standInChromeRegistry}>{children}</ChromeRegistryProvider>;
}

/** The real 10-section + 13-modal + 13-config-group + chrome registries — for CTs that drive real
 *  content (the route CT). */
export function CtRealSectionRegistry({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <SectionRegistryProvider value={realRegistry}>
      <ModalRegistryProvider value={realModalRegistry}>
        <ChromeRegistryProvider value={realChromeRegistry}>
          <ConfigSectionRegistryProvider value={realSettingsSections}>{children}</ConfigSectionRegistryProvider>
        </ChromeRegistryProvider>
      </ModalRegistryProvider>
    </SectionRegistryProvider>
  );
}

/** The real registries but with the `config` section built over {@link placeholderConfigGroups}
 *  (connections → a `{ placeholder: true }` body) — the #696 live subject for the host's placeholder branch.
 *  Everything else is the production wiring, so the LIST, the search and the CONTENT behave exactly as they
 *  do for a real deferred group. The group registry rides the SECTION (by factory, as at the door), so the
 *  swap is a second section registry, not a second provider. */
const placeholderSectionRegistry: SectionRegistry = createRegistry<SectionId, SectionDefinition>("sections", SECTION_IDS, {
  ...REAL,
  config: makeConfigSection(placeholderConfigGroups),
});
export function CtPlaceholderGroupRegistry({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <SectionRegistryProvider value={placeholderSectionRegistry}>
      <ModalRegistryProvider value={realModalRegistry}>
        <ChromeRegistryProvider value={realChromeRegistry}>
          <ConfigSectionRegistryProvider value={realSettingsSections}>{children}</ConfigSectionRegistryProvider>
        </ChromeRegistryProvider>
      </ModalRegistryProvider>
    </SectionRegistryProvider>
  );
}

/** The config-SECTION registry alone, for a CT that mounts a section body outside the shell and needs the
 *  registry in context (a body that reads sibling contributions). */
export function CtConfigSectionRegistry({
  sections,
  children,
}: {
  readonly sections: ContributorRegistry<ConfigSectionContribution>;
  readonly children: ReactNode;
}): ReactElement {
  return <ConfigSectionRegistryProvider value={sections}>{children}</ConfigSectionRegistryProvider>;
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
      settingsSections: chatSettingsSections,
    }),
  });
  return (
    <SectionRegistryProvider value={registry}>
      <ModalRegistryProvider value={realModalRegistry}>
        <ChromeRegistryProvider value={realChromeRegistry}>
          <ConfigSectionRegistryProvider value={realSettingsSections}>{children}</ConfigSectionRegistryProvider>
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
          <ConfigSectionRegistryProvider value={realSettingsSections}>{children}</ConfigSectionRegistryProvider>
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
  /** The section-owned TOPBAR header cluster (`SectionDefinition.header`) — production's chats section
   *  supplies avatars + name + a member chip here, and it is what fills the topbar's LEAD. A story that
   *  measures the row needs it, or the lead is one control wide and the defect cannot appear. */
  readonly header?: ReactNode;
  /** The section-owned LIST chrome band (`SectionDefinition.listHeader`). A story needs it whenever the
   *  assertion is about the band itself — since #493 the LIST landmark is NAMED BY the band's heading
   *  (`LIST_PANE_TITLE_ID`), so a story with no band exercises only the `aria-label` fallback. */
  readonly listHeader?: ReactNode;
  /** The section's `useSelectionTitle` for the story — absent ⇒ the REAL one when the section has it, else
   *  a `null` stand-in (the shell falls back to the section label). */
  readonly selectionTitle?: () => string | null;
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
    useSelectionTitle: slot?.selectionTitle ?? real.useSelectionTitle,
    ...(slot?.header === undefined ? {} : { header: (): ReactNode => slot.header }),
  };
  if (slot?.list === undefined) {
    return base;
  }
  // `list` and `selection` are ONE arm of the definition union (section-registry.ts) — the fake honours that
  // instead of casting around it, so a story exercises the same shell rule production does.
  // `list` + `selection` + `useSelectionTitle` are ONE arm of the definition union (section-registry.ts) —
  // the fake honours all three instead of casting around them, so a story exercises the same shell rule
  // production does. A story-injected list over a section with no real seam gets the never-selected
  // stand-in, whose title is `null` (the shell then prints the section label).
  return {
    ...base,
    list: (): ReactNode => slot.list,
    selection: slot.selection ?? real.selection ?? CT_NEVER_SELECTED,
    ...(slot.listHeader === undefined ? {} : { listHeader: (): ReactNode => slot.listHeader }),
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
    Object.fromEntries(SECTION_IDS.map((id) => [id, fakeSection(id, sections?.[id])])) as Record<SectionId, SectionDefinition>,
  );
  return (
    <SectionRegistryProvider value={registry}>
      <ModalRegistryProvider value={realModalRegistry}>
        <ChromeRegistryProvider value={realChromeRegistry}>
          <ConfigSectionRegistryProvider value={realSettingsSections}>{children}</ConfigSectionRegistryProvider>
        </ChromeRegistryProvider>
      </ModalRegistryProvider>
    </SectionRegistryProvider>
  );
}
