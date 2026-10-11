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
// Adding a section / modal / config group / contributor is the same one-line edit it always was — it just
// lands here instead of in `main.tsx`.

import type { ReactElement } from "react";
import { youModal } from "#features/app-shell";
import { reauthModal } from "#features/auth";
import { automationActivityTab, automationGroup } from "#features/automation";
import { makeCharactersSection } from "#features/character";
import { ChatsWithCharacterPane, commandModal, makeChatsSection, newChatModal } from "#features/chat";
import { appearanceGroup, bindConfigPaletteGroups, chatBehaviorGroup, makeConfigSection } from "#features/config";
import { connectionsGroup } from "#features/credentials";
import { addDocumentModal, databankSection } from "#features/databank";
import { makeCorpusSection } from "#features/discovery";
import { makeHomeSection } from "#features/home";
import { imageDetailModal, imageEditModal, imagineModal } from "#features/imagery";
import { personasGroup } from "#features/persona";
import { extensionsSection, pluginCommandArgsModal, pluginDialogModal, pluginsGroup } from "#features/plugin";
import { presetsSection } from "#features/preset";
import { refinerySection } from "#features/refinery";
import { regexGroup } from "#features/regex";
import { rosterGroup, savedRostersModal } from "#features/roster-preset";
import { makeRpgContextTabs, makeRpgHudRegion } from "#features/rpg";
import { insightsCorpusMode } from "#features/stats";
import { labelsCorpusMode } from "#features/tag";
import { aboutGroup, adminGroup } from "#features/user-admin";
import { backupGroup, workloadsGroup } from "#features/workloads";
import { worldInfoGroup } from "#features/world-info";
import type { CharacterDetailContribution, ChatContextState, ContextRegionDef, ContextTabDef, MessageToolsRenderer } from "#lib";
import { createContributorRegistry, createRegistry } from "#lib";
import {
  assembleChrome,
  ChromeRegistryProvider,
  CONFIG_GROUP_IDS,
  CommandPaletteSourceRegistryProvider,
  ConfigSectionRegistryProvider,
  MessageToolsRendererRegistryProvider,
  MODAL_SLOT_IDS,
  ModalRegistryProvider,
  SECTION_IDS,
  SectionRegistryProvider,
  SlashCommandRegistryProvider,
} from "#state";
import { AppRoot } from "../routes/app-root.tsx";
import { queryClient, trpcProxy } from "./app-singletons.ts";
// The config-SECTION assembly, in its own `compose/` sibling (§7 + `client-compose-door-only`): still ONE
// assembly, still door-owned — it moved for `component-size`, like `home-tiles.ts`. See that file's header.
import { configSections } from "./config-sections.ts";
import {
  chatSettingsSections,
  chatSurfaceContributors,
  chromeWidgets,
  commandPaletteSources,
  corpusContextTabs,
  slashCommands,
  toolRenderers,
} from "./contributors.ts";
// The home-tile registry, assembled in its own `compose/` sibling (§7 + `client-compose-door-only`): still ONE
// assembly, still door-owned — it moved for `component-size`, not for architecture. See that file's header.
import { homeTiles } from "./home-tiles.ts";

// The chat-context contributor seam (§6c): the rpg takeover's four LITE game tabs — the
// FIRST real consumer of this seam. rpg exports the SELF-CONTAINED factory `makeRpgContextTabs`
// ({trpc, queryClient}) — the door injects the cross-domain read channel (§12) and assembles the result into
// the registry, which chat merges at `defineContextTabs`'s `contributors` arm. rpg never imports chat; the
// `when`/`strip:"game"` gating (a cache-first getChat.rpg read) drives the §4.2 bracket.
// (B2's host-only "Rules" TAB used to ride here too. It was RETIRED at #616 — the owner ruled the surface
// belongs as a SECTION inside "This chat", and it now grafts through `chatSettingsSections` in `contributors.ts`.)
const chatContextContributors = createContributorRegistry<ContextTabDef<ChatContextState>>("chat-context", [
  ...makeRpgContextTabs({ trpc: trpcProxy, queryClient }),
  // B11 — the room ACTIVITY tab (host-only), automation's second CONTEXT-strip graft: a ready def (no injected
  // read channel — its body reads through `useTRPC`), sibling of Members/"This chat"/Preview. automation owns
  // it because `client-features-no-cross` forbids chat from importing the fire-outcome copy it renders.
  automationActivityTab,
]);

// The chat-context REGION-CLAIM seam (§6c / HUD-1 §3.2): the rpg HUD claims the WHOLE CONTEXT pane on an
// engaged game chat — same door, same injected read channel, same one-directional flow as the tabs above.
// Every other chat (and every other section) has no claimant and renders the generic panel.
const chatContextRegions = createContributorRegistry<ContextRegionDef<ChatContextState>>("chat-context-regions", [
  makeRpgHudRegion({ trpc: trpcProxy, queryClient }),
]);

// The WHOLE-MESSAGE tool-renderer seam (§6c): the per-message override that renders ALL of a message's tool
// records together so a contributor can AGGREGATE across them (the per-tool registry above cannot see across
// records). Delivered via a context provider; the FIRST renderer to claim a message owns its whole tool block,
// else chat falls back to the per-record path. Empty ⇒ byte-identical.
const messageToolsRenderers = createContributorRegistry<MessageToolsRenderer>("message-tools-renderer", []);

// The character-detail contributor seam (§6c): EMPTY but typed — the door → factory → editor-body anchor
// path is compiled and exercised with zero contributions; the agents feature appends its card-evolution
// review section later (crew 07-client-ui §4.2), grafting into the editor WITHOUT importing character.
const characterDetailContributors = createContributorRegistry<CharacterDetailContribution>("character-detail", []);

// The ONE config-group assembly: total over CONFIG_GROUP_IDS by
// tsc — a missing group is a compile error, and `config-group-completeness` carries the walls tsc cannot
// (co-location, duplicate ids, placeholder honesty, skimmer purity, the collection body's data verbs). The
// settings categories, the member collections (owner fork F-1 closed the old `config-collections`
// contributor set into this tuple) and the persona surface register the SAME shape; a plugin never registers
// a group — its settings ride the Extensions group's rows. Placement is the def's `(shelf, order)`; membership
// is the tuple. Handed to `makeConfigSection` by factory: the host is the registry's only reader.
const configGroups = createRegistry("config-groups", CONFIG_GROUP_IDS, {
  personas: personasGroup,
  appearance: appearanceGroup,
  "chat-behavior": chatBehaviorGroup,
  workloads: workloadsGroup,
  backup: backupGroup,
  connections: connectionsGroup,
  automation: automationGroup,
  admin: adminGroup,
  about: aboutGroup,
  regex: regexGroup,
  worldInfo: worldInfoGroup,
  // #26/B10 — the saved-roster library's management surface (order 40, after world-info's 30).
  rosterPreset: rosterGroup,
  plugins: pluginsGroup,
});
// The ⌘K Settings source reads the door-held group registry through its bound module slot (§3.3 — the same
// `makeConfigSection` delivery, spelled for a module-level hook; written exactly once, here).
bindConfigPaletteGroups(configGroups);

// The ONE section assembly (G1/G8): total over SECTION_IDS by tsc; delivered as a context value so
// app-shell reads it (incl. the use-shell-layout hook) without a #features import.
const sections = createRegistry("sections", SECTION_IDS, {
  home: makeHomeSection(homeTiles),
  chats: makeChatsSection({
    contextTabs: chatContextContributors,
    contextRegions: chatContextRegions,
    surfaces: chatSurfaceContributors,
    toolRenderers,
    settingsSections: chatSettingsSections,
  }),
  // The characters LIST pane is MODAL (Arm A): its projection half is chat-owned row
  // anatomy over the `chat.listChats` cache, threaded in HERE — the one legal channel for chat UI inside
  // the characters section (the `makeChatsSection` contributor precedent; a direct import is dep-cruiser RED).
  characters: makeCharactersSection(characterDetailContributors, (view) => <ChatsWithCharacterPane {...view} />),
  corpus: makeCorpusSection({ insights: insightsCorpusMode, labels: labelsCorpusMode, contextTabs: corpusContextTabs }),
  config: makeConfigSection(configGroups),
  // U5 (#679, seam 16): ONE rail entry for every plugin's `ui.page` surfaces; its switcher does the fan.
  extensions: extensionsSection,
  databank: databankSection,
  presets: presetsSection,
  refinery: refinerySection,
});

// The ONE modal assembly (§6d/G8): total over MODAL_SLOT_IDS by tsc; delivered as a context value so
// ModalHost reads it without a #features import.
const modals = createRegistry("modals", MODAL_SLOT_IDS, {
  command: commandModal,
  newChat: newChatModal,
  addDocument: addDocumentModal,
  you: youModal,
  // Opened by the session-recovery ladder, never by a human affordance (staleness §4.4 rung 1).
  reauth: reauthModal,
  // The imagery flow's three content-triggered modals — opened from
  // chat content (the /imagine command, a message image click, the detail Edit action) via the imagery-store
  // #state actions, never a chrome affordance (all `placement:"surface"`).
  imagine: imagineModal,
  imageDetail: imageDetailModal,
  imageEdit: imageEditModal,
  // U5 (#679, §4.5a): the ONE house modal a plugin `dialog` surface renders inside — opened ONLY by a round-trip
  // outcome, never an affordance, so a spontaneous plugin modal is unspellable.
  pluginDialog: pluginDialogModal,
  // #791: the ONE house modal that collects a plugin command's DECLARED typed args when it is picked from the
  // command palette — opened by `openPluginCommandArgs` (the palette source's row `run`), never an affordance.
  pluginCommandArgs: pluginCommandArgsModal,
  // #26 (D61 B6): the saved-roster picker — opened from the new-chat picker's "Start from a saved roster" and
  // the members panel's host action via `openModal("savedRosters")` (all `placement:"surface"`).
  savedRosters: savedRostersModal,
});

// The ONE chrome assembly: `assembleChrome` DERIVES the rail
// section + mapped modal-trigger entries and combines them with the feature-owned WIDGET entries into one
// dupe-checked, zone-validated, canonically-ordered list; `createContributorRegistry` (the door mint, G8)
// wraps it. An OPEN registry (CHROME_ZONES is the closed axis, entries are growth) delivered as a context
// value so app-shell renders the topbar.trail zone blind (no #features import).
const chrome = createContributorRegistry(
  "chrome",
  assembleChrome({
    sections: sections.list(),
    modals: modals.list(),
    // U5 (#679, §4.5): the "Plugins" wand — SILENT when a person's plugins register no commands.
    // `bugReportChrome` is visible in every build ("Report a bug"); only its developer capture is dev-gated,
    // inside the form.
    // `characterCreateChrome` (#1669) is the first SECTION-scoped trail entry: the Characters pane's primary,
    // on a phone only, where the LIST band that used to carry it is shed. Its `useVisible` states the three
    // conditions; the zone is shell-global, the affordance is not.
    widgets: chromeWidgets,
  }),
);

/** The `/` route's component: the door's assembled registries delivered to the authed tree, then the thin
 *  `AppRoot` mount. Reached ONLY through `routes/router.tsx`'s lazy boundary — this module (and the whole
 *  feature graph it imports) is a separate chunk that an unauthenticated client never fetches. */
export function AuthedApp(): ReactElement {
  return (
    <SectionRegistryProvider value={sections}>
      <ModalRegistryProvider value={modals}>
        <ChromeRegistryProvider value={chrome}>
          <ConfigSectionRegistryProvider value={configSections}>
            <MessageToolsRendererRegistryProvider value={messageToolsRenderers}>
              <SlashCommandRegistryProvider value={slashCommands}>
                <CommandPaletteSourceRegistryProvider value={commandPaletteSources}>
                  <AppRoot />
                </CommandPaletteSourceRegistryProvider>
              </SlashCommandRegistryProvider>
            </MessageToolsRendererRegistryProvider>
          </ConfigSectionRegistryProvider>
        </ChromeRegistryProvider>
      </ModalRegistryProvider>
    </SectionRegistryProvider>
  );
}
