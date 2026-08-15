// The AUTHED half of the registration door (client-architecture-lockdown.md §5/§7, G8): the ONE place
// feature definitions and contributors are imported and assembled, and the provider stack that delivers
// the assembled registries to the `/` route's tree.
//
// WHY IT IS NOT IN `main.tsx` ANY MORE (#43, the boot code-split). Assembling here means importing every
// feature front door, which is the ENTIRE app — 4.9 MB in one entry chunk, parsed before the login form
// could paint, and served in full to clients that had not authenticated yet. This module is reached
// through a lazy route boundary (`routes/router.tsx` → `lazyRouteComponent`), so it and the whole feature
// graph below it become a separate chunk fetched only when an authenticated session actually renders `/`.
// Nothing about the LOCKDOWN changes: the assemblies did not move into a feature or a route — they moved
// into a `compose/` module, which §7 and the `registry-assembly-at-door-only` gate name as the door's own
// helper tier, and there is still exactly ONE assembly per registry, project-wide. What DID change is that
// the door is now two modules (`main.tsx` boots, this one composes); the shared singletons live in
// `./app-singletons.ts` so neither half mints a second QueryClient or tRPC client.
//
// Adding a section / modal / pane / contributor is the same one-line edit it always was — it just lands
// here instead of in `main.tsx`.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { ReactElement } from "react";
import {
  appearanceBackgroundSection,
  appearanceEffectsSection,
  appearanceReadingSection,
  appearanceSizingSection,
  contextToggleChrome,
  fullscreenChrome,
  youModal,
} from "#features/app-shell";
import { accountModal, reauthModal } from "#features/auth";
import { characterSlashCommands, librarySettingsSection, makeCharactersSection } from "#features/character";
import {
  appearanceAvatarsSection,
  appearanceMessageDetailsSection,
  appearanceMessageStyleSection,
  ChatsWithCharacterPane,
  chatMessageHandlingSection,
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
import { addDocumentModal, databankDocumentsTile, databankSection } from "#features/databank";
import { corpusSection } from "#features/discovery";
import { automationDormantTile, buddyDormantTile, makeHomeSection, makeSectionJumpTile } from "#features/home";
import { notificationsChrome } from "#features/notifications";
import { personaChrome, personasPane } from "#features/persona";
import { presetsSection } from "#features/preset";
import { refinerySection } from "#features/refinery";
import { regexCollection } from "#features/regex";
import { makeRpgContextTabs, makeRpgHudRegion, rpgTurnToolCallsSurface } from "#features/rpg";
import { appearancePane, automationPane, chatBehaviorPane, settingsModal, themeModal } from "#features/settings";
import { analyticsSection } from "#features/stats";
import { tagCollection } from "#features/tag";
import {
  adminApprovalsSection,
  adminCatalogSection,
  adminEmbeddingsSection,
  adminEnginesSection,
  adminLinkSsoSection,
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
  MessageToolsRenderer,
  SlashCommandContribution,
  ToolRenderer,
} from "#lib";
import { createContributorRegistry, createRegistry } from "#lib";
import type { HomeTileContribution, SettingsSectionContribution } from "#state";
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
import { AppRoot } from "../routes/app-root.tsx";
import { queryClient, trpcProxy } from "./app-singletons.ts";

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

// The chat-surface contributor seam (§6c/M8). Its FIRST tenant is rpg's per-row "what this turn did"
// disclosure (TOOLCALLS-INVISIBLE, arm A): on the `folded` path the model emits its state writes alongside
// its prose and D112 keeps that traffic server-internal, so without this the majority of what a turn DID was
// invisible to the person who played it. rpg raises it; chat mounts it blind at `message-footer`; neither
// imports the other.
const chatSurfaceContributors = createContributorRegistry<ChatSurfaceContribution>("chat-surface", [rpgTurnToolCallsSurface]);

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
// path is compiled and exercised with zero contributions; the agents feature appends its card-evolution
// review section later (crew 07-client-ui §4.2), grafting into the editor WITHOUT importing character.
const characterDetailContributors = createContributorRegistry<CharacterDetailContribution>("character-detail", []);

// The HOME-TILE contributor seam (§6c / home-section-spec §3.2) — the SIXTH contributor registry, and the
// whole point of the home section: a feature raises a tile, home skims it. Adding "future stuff" to home is
// ONE co-located file in the OWNING feature plus ONE array member HERE — home is never edited. Canonical
// `(order, id)` at the door: home's own jump grid is order 40 (the chat tiles land at 10/20/30, databank's
// documents tile at 50, the dormant doorways at 80/90). Home consumes the registry BLIND through
// `makeHomeSection`.
const HOME_TILE_CONTRIBUTIONS: readonly HomeTileContribution[] = [
  chatRecentsTile,
  chatQuickPicksTile,
  chatTempChatTile,
  databankDocumentsTile,
  buddyDormantTile,
  automationDormantTile,
];

const homeTiles = createContributorRegistry<HomeTileContribution>("home-tiles", [
  ...HOME_TILE_CONTRIBUTIONS,
  // LAST, and built FROM the list above: its rows are the section registry minus home minus every section
  // a tile beside it already subsumes (`sectionId`).
  makeSectionJumpTile(HOME_TILE_CONTRIBUTIONS),
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
  // The characters LIST pane is MODAL (Arm A): its projection half is chat-owned row
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
  addDocument: addDocumentModal,
  you: youModal,
  // Opened by the session-recovery ladder, never by a human affordance (staleness §4.4 rung 1).
  reauth: reauthModal,
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
    widgets: [notificationsChrome, fullscreenChrome, contextToggleChrome, personaChrome],
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
  // A2 — the OIDC_REQUIRE_APPROVAL account-approval queue, right after Users.
  adminApprovalsSection,
  // B5 — the db-surgery-free "Link SSO identity" migration surface, right after Approvals.
  adminLinkSsoSection,
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

/** The `/` route's component: the door's assembled registries delivered to the authed tree, then the thin
 *  `AppRoot` mount. Reached ONLY through `routes/router.tsx`'s lazy boundary — this module (and the whole
 *  feature graph it imports) is a separate chunk that an unauthenticated client never fetches. */
export function AuthedApp(): ReactElement {
  return (
    <SectionRegistryProvider value={sections}>
      <ModalRegistryProvider value={modals}>
        <ChromeRegistryProvider value={chrome}>
          <SettingsPaneRegistryProvider value={settingsPanes}>
            <SettingsSectionRegistryProvider value={settingsSections}>
              <MessageToolsRendererRegistryProvider value={messageToolsRenderers}>
                <SlashCommandRegistryProvider value={slashCommands}>
                  <AppRoot />
                </SlashCommandRegistryProvider>
              </MessageToolsRendererRegistryProvider>
            </SettingsSectionRegistryProvider>
          </SettingsPaneRegistryProvider>
        </ChromeRegistryProvider>
      </ModalRegistryProvider>
    </SectionRegistryProvider>
  );
}
