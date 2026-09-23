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
import { bugReportChrome, contextToggleChrome, fullscreenChrome, youModal } from "#features/app-shell";
import { reauthModal } from "#features/auth";
import {
  automationActivityTab,
  automationClockMeterSurface,
  automationGroup,
  automationNeedleMeterSurface,
  automationQuickReplySource,
  automationRulesSection,
  automationSuggestionSource,
} from "#features/automation";
import { characterCreateChrome, characterSlashCommands, makeCharactersSection } from "#features/character";
import {
  ChatsWithCharacterPane,
  chatMessageReactionsSurface,
  chatSlashCommands,
  commandModal,
  makeChatControlsContribution,
  makeChatsSection,
  newChatModal,
} from "#features/chat";
import { appearanceGroup, bindConfigPaletteGroups, chatBehaviorGroup, configPaletteSource, makeConfigSection } from "#features/config";
import { connectionsGroup } from "#features/credentials";
import { addDocumentModal, databankSection } from "#features/databank";
import { corpusSection } from "#features/discovery";
import { makeHomeSection } from "#features/home";
import { imageDetailModal, imageEditModal, imagerySlashCommands, imagineModal } from "#features/imagery";
import { notificationsChrome } from "#features/notifications";
import { personaChrome, personasGroup } from "#features/persona";
import {
  extensionsSection,
  pluginChatFlankSurface,
  pluginChatSettingsSection,
  pluginCommandArgsModal,
  pluginCommandPaletteSource,
  pluginCommandsChrome,
  pluginDialogModal,
  pluginMessageFooterSurface,
  pluginSlashCommands,
  pluginSnippetConsoleSection,
  pluginsGroup,
  pluginToolRenderer,
} from "#features/plugin";
import { presetsSection } from "#features/preset";
import { refinerySection } from "#features/refinery";
import { regexGroup } from "#features/regex";
import { rosterGroup, savedRostersModal } from "#features/roster-preset";
import { makeRpgContextTabs, makeRpgHudRegion, rpgDiceAskSource, rpgDiceToolRenderer, rpgTurnToolCallsSurface } from "#features/rpg";
import { analyticsSection } from "#features/stats";
import { tagsGroup } from "#features/tag";
import { adminGroup } from "#features/user-admin";
import { backupGroup, workloadsGroup } from "#features/workloads";
import { worldInfoGroup } from "#features/world-info";
import type {
  CharacterDetailContribution,
  ChatContextState,
  ChatControlSource,
  ChatSettingsSectionContribution,
  ChatSurfaceContribution,
  CommandPaletteSource,
  ContextRegionDef,
  ContextTabDef,
  MessageToolsRenderer,
  SlashCommandContribution,
  ToolRenderer,
} from "#lib";
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
// The home-tile registry, assembled in its own `compose/` sibling (§7 + `client-compose-door-only`): still ONE
// assembly, still door-owned — it moved for `component-size`, not for architecture. See that file's header.
import { homeTiles } from "./home-tiles.ts";

// The chat-context contributor seam (§6c): the rpg takeover's four LITE game tabs (Context-Panel-Program
// §4.4) — the FIRST real consumer of this seam. rpg exports the SELF-CONTAINED factory `makeRpgContextTabs`
// ({trpc, queryClient}) — the door injects the cross-domain read channel (§12) and assembles the result into
// the registry, which chat merges at `defineContextTabs`'s `contributors` arm. rpg never imports chat; the
// `when`/`strip:"game"` gating (a cache-first getChat.rpg read) drives the §4.2 bracket.
// (B2's host-only "Rules" TAB used to ride here too. It was RETIRED at #616 — the owner ruled the surface
// belongs as a SECTION inside "This chat", and it now grafts through `chatSettingsSections` below.)
const chatContextContributors = createContributorRegistry<ContextTabDef<ChatContextState>>("chat-context", [
  ...makeRpgContextTabs({ trpc: trpcProxy, queryClient }),
  // B11 — the room ACTIVITY tab (host-only), automation's second CONTEXT-strip graft: a ready def (no injected
  // read channel — its body reads through `useTRPC`), sibling of Members/"This chat"/Preview. automation owns
  // it because `client-features-no-cross` forbids chat from importing the fire-outcome copy it renders.
  automationActivityTab,
]);

// The "This chat" tab's SECTION seam (§6c — the THIRTEENTH contributor family, minted at #616 on the
// owner's ruling that the Rules surface belongs INSIDE the per-chat-configuration tab rather than beside
// it as a 5th host tab). automation's Rules is its first tenant: a ready def, not a factory (it needs no
// injected read channel — the body reads through `useTRPC` at render). `CommittedSettingsTab` renders each
// contribution in its own `<Section kicker>` at the end of the host-ops band, importing nothing from
// automation; zero contributors leaves the tab byte-identical to a build without the seam.
const chatSettingsSections = createContributorRegistry<ChatSettingsSectionContribution>("chat-settings-sections", [
  automationRulesSection,
  pluginSnippetConsoleSection,
  // U2 (#679, seam 7): the ONE plugin-panel section — it fans per-plugin INSIDE its body off `listSurfaces`,
  // so this array never grows when a person installs a plugin. Its body renders `null` for a person with no
  // `chat-settings-section` surfaces and the host's grafted `<Section>` collapses with it (no empty heading).
  pluginChatSettingsSection,
]);

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
// imports the other. Its SECOND is the S1 control mount below.
//
// The S1 CONTROL-SOURCE seam — the TWELFTH contributor family:
// transient interactive controls near the transcript (rule chips, confirm cards, a dice ask). A feature
// appends a source here without importing chat, and chat renders it blind through the one band.
//
// ITS TENANTS: automation's S4 suggest/confirm CARDS (A4) and B3's member-visible quick-reply CHIPS — two
// sources, one band, each publishing its own control KIND (card / chip) so the stacking law has one owner per
// kind. The zero-source acceptance property the seam shipped with still holds and is still what the CTs pin —
// with an empty array the mount below `when`-filters itself out and the room is byte-identical to a build with
// no control seam — but the array is no longer empty, so the honest statement of the property is now "a room
// with no live control renders no band chrome", which each source delivers by publishing nothing until its
// own bus event arrives.
// …and B8's THIRD tenant + first game arm: rpg's dice ASK. A clean tuple
// append — the chips appear only on an engaged game chat (the source's own `isRpgEngaged` gate), so a plain
// chat is byte-identical. rpg raises it; chat renders it blind; neither imports the other.
const chatControlSources = createContributorRegistry<ChatControlSource>("chat-controls", [
  automationSuggestionSource,
  automationQuickReplySource,
  rpgDiceAskSource,
]);

const chatSurfaceContributors = createContributorRegistry<ChatSurfaceContribution>("chat-surface", [
  rpgTurnToolCallsSurface,
  // B6 — the reaction pill row. Chat's own tenant on its own anchor, and deliberately so: the anchor mounts
  // once per COMMITTED row, which is what makes "reactions only exist on canon" structural rather than a
  // predicate. Silent (and layout-neutral, the footer band being `empty:hidden`) on every row nobody has
  // reacted to, which is most rows in most rooms.
  chatMessageReactionsSurface,
  // The ONE above-composer control mount, consuming the registry above.
  makeChatControlsContribution(chatControlSources),
  // …and the seam's THIRD tenant + first `thread-flank` one (#16): automation's needle meter, rendering the
  // tension score its preset publishes into the room's chat variables. Silent — and therefore invisible in
  // the layout, the flank stack being `empty:hidden` — in every room that carries no score.
  automationNeedleMeterSurface,
  // B9 (#7): the clock's fill meter, a second `thread-flank` tenant. It reads the `clockFires` preset's
  // published fill + threshold from the same member-visible vars plane and is silent (layout-neutral) in every
  // room that carries no clock.
  automationClockMeterSurface,
  // U2 (#679, seam 7): the ONE plugin `chat-flank` tenant, and LAST in the column on purpose — the house's own
  // widgets keep the top of the flank and third-party panels read below them. A fixed first-party member that
  // fans per-plugin INSIDE its body off `plugin.listSurfaces` (the one-assembly law: the door never grows per
  // plugin). It carries no `when` — "does this person have a chat-flank surface?" is DATA the seam's sync
  // predicate cannot see — so it mounts in every room and renders null where it does not apply.
  pluginChatFlankSurface,
  // U6 (#679, §5.4): the ONE plugin `message-footer` tenant — the per-ROW decoration strip, LAST so the
  pluginMessageFooterSurface, // house's own per-row disclosures read above third-party decoration.
]);

// The per-tool renderer seam (§6c). Its FIRST tenant is the plugin plane's card
// renderer, and it claims a NAMESPACE rather than a name: a plugin tool's wire name is `plugin_<slug'>_<name>`,
// so which names exist depends on who installed what and could never be listed here. ONE member claims
// `plugin_*` and fans per-plugin inside its own body off `plugin.listSurfaces` — the door does not grow per
// plugin (G8). A tool with no claiming renderer still renders the generic @orb/ui `ToolCallBlock`, and so does
// a `plugin_*` tool whose owner registered no card: the fallback is the null state for a tool call, because a
// call is canon and the transcript owes the reader a record of it.
// B8's SECOND tenant: rpg's in-thread dice renderer, an EXACT `roll_dice`
// claim (`match: "name"`, which wins over the plugin plane's `plugin_*` prefix claim above). A `roll_dice`
// call with no well-formed roll — and any tool with no claiming renderer — still renders the generic
// `ToolCallBlock`, so the seam's zero-registrant fallback is untouched.
const toolRenderers = createContributorRegistry<ToolRenderer>("tool-renderers", [pluginToolRenderer, rpgDiceToolRenderer]);

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
const slashCommands = createContributorRegistry<SlashCommandContribution>("slash-commands", [
  ...chatSlashCommands,
  ...characterSlashCommands,
  ...imagerySlashCommands,
  // U5 (#679, §4.5): the ONE `/plugin <slug> <cmd> …` dispatcher — it fans per-plugin INSIDE its mount, so no
  // plugin claims a top-level token and the door never grows per install.
  ...pluginSlashCommands,
]);

// U8 (#679, §4.5/§5 row 9): the DYNAMIC palette sources — first-party contributors that fan RUNTIME-derived
// rows (a plugin's registered commands, read per-caller) into first-class command-palette rows. One member
// today; like every contributor family, the door does not grow when a person installs a plugin (the per-plugin
// fan lives inside the source's `useRows` off the caller's own `plugin.listCommands`).
const commandPaletteSources = createContributorRegistry<CommandPaletteSource>("command-palette-sources", [pluginCommandPaletteSource, configPaletteSource]);

// The character-detail contributor seam (§6c): EMPTY but typed — the door → factory → editor-body anchor
// path is compiled and exercised with zero contributions; the agents feature appends its card-evolution
// review section later (crew 07-client-ui §4.2), grafting into the editor WITHOUT importing character.
const characterDetailContributors = createContributorRegistry<CharacterDetailContribution>("character-detail", []);

// The ONE config-group assembly: total over CONFIG_GROUP_IDS by
// tsc — a missing group is a compile error, and `config-group-completeness` carries the walls tsc cannot
// (co-location, duplicate ids, placeholder honesty, skimmer purity, the collection body's data verbs). The
// nine settings categories, the FOUR member collections (owner fork F-1 closed the old `config-collections`
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
  tags: tagsGroup,
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
  corpus: corpusSection,
  config: makeConfigSection(configGroups),
  // U5 (#679, seam 16): ONE rail entry for every plugin's `ui.page` surfaces; its switcher does the fan.
  extensions: extensionsSection,
  databank: databankSection,
  presets: presetsSection,
  refinery: refinerySection,
  analytics: analyticsSection,
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
    // `bugReportChrome` (#1095) is registered unconditionally and gates itself on IS_DEV in `useVisible` — the
    // registry's own no-gap contract, and the same shape every other capability-gated widget here uses. It
    // renders nothing in a production build.
    // `characterCreateChrome` (#1669) is the first SECTION-scoped trail entry: the Characters pane's primary,
    // on a phone only, where the LIST band that used to carry it is shed. Its `useVisible` states the three
    // conditions; the zone is shell-global, the affordance is not.
    widgets: [notificationsChrome, pluginCommandsChrome, characterCreateChrome, fullscreenChrome, contextToggleChrome, personaChrome, bugReportChrome],
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
