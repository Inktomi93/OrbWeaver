// The door's contributor lists that need no injected read channel, split out of `authed-app.tsx` so the CT
// harness imports the same arrays in the same order (Spine-Testing §10). Order here is render and dispatch order.

import { bugReportChrome, contextToggleChrome } from "#features/app-shell";
import {
  automationClockMeterSurface,
  automationNeedleMeterSurface,
  automationQuickReplySource,
  automationRulesSection,
  automationSuggestionSource,
} from "#features/automation";
import { characterCreateChrome, characterSlashCommands } from "#features/character";
import { chatMessageReactionsSurface, chatSlashCommands, makeChatControlsContribution } from "#features/chat";
import { configPaletteSource } from "#features/config";
import { corpusModePaletteSource } from "#features/discovery";
import { imagerySlashCommands } from "#features/imagery";
import { notificationsChrome } from "#features/notifications";
import { personaChrome } from "#features/persona";
import {
  pluginChatFlankSurface,
  pluginChatSettingsSection,
  pluginCommandPaletteSource,
  pluginCommandsChrome,
  pluginComposerActionSurface,
  pluginComposerMediaSurface,
  pluginMessageFooterSurface,
  pluginSlashCommands,
  pluginSnippetConsoleSection,
  pluginToolRenderer,
} from "#features/plugin";
import { rpgDiceComposerMediaSurface, rpgDiceToolRenderer, rpgTurnToolCallsSurface } from "#features/rpg";
import { insightsContextTabs } from "#features/stats";
import { labelsContextTabs } from "#features/tag";
import type {
  ChatControlSource,
  ChatSettingsSectionContribution,
  ChatSurfaceContribution,
  CommandPaletteSource,
  ContextTabDef,
  CorpusContextState,
  SlashCommandContribution,
  ToolRenderer,
} from "#lib";
import { createContributorRegistry } from "#lib";
import type { ChromeEntry } from "#state";

// The "This chat" tab's SECTION seam (§6c — the THIRTEENTH contributor family, minted at #616 on the
// owner's ruling that the Rules surface belongs INSIDE the per-chat-configuration tab rather than beside
// it as a 5th host tab). automation's Rules is its first tenant: a ready def, not a factory (it needs no
// injected read channel — the body reads through `useTRPC` at render). `CommittedSettingsTab` renders each
// contribution in its own `<Section kicker>` at the end of the host-ops band, importing nothing from
// automation; zero contributors leaves the tab byte-identical to a build without the seam.
export const chatSettingsSections = createContributorRegistry<ChatSettingsSectionContribution>("chat-settings-sections", [
  automationRulesSection,
  pluginSnippetConsoleSection,
  // U2 (#679, seam 7): the ONE plugin-panel section — it fans per-plugin INSIDE its body off `listSurfaces`,
  // so this array never grows when a person installs a plugin. Its body renders `null` for a person with no
  // `chat-settings-section` surfaces and the host's grafted `<Section>` collapses with it (no empty heading).
  pluginChatSettingsSection,
]);

// The S1 CONTROL-SOURCE seam — the TWELFTH contributor family:
// transient interactive controls near the transcript (rule chips and confirm cards). A feature
// appends a source here without importing chat, and chat renders it blind through the one band.
//
// ITS TENANTS: automation's S4 suggest/confirm CARDS (A4) and B3's member-visible quick-reply CHIPS — two
// sources, one band, each publishing its own control KIND (card / chip) so the stacking law has one owner per
// kind. A room with no live control renders no band chrome, which each source delivers by publishing nothing
// until its own bus event arrives.
const chatControlSources = createContributorRegistry<ChatControlSource>("chat-controls", [automationSuggestionSource, automationQuickReplySource]);

// The chat-surface contributor seam (§6c/M8). Its FIRST tenant is rpg's per-row "what this turn did"
// disclosure (TOOLCALLS-INVISIBLE, arm A): on the `folded` path the model emits its state writes alongside
// its prose and D112 keeps that traffic server-internal, so without this the majority of what a turn DID was
// invisible to the person who played it. rpg raises it; chat mounts it blind at `message-footer`; neither
// imports the other. Its SECOND is the S1 control mount above.
export const chatSurfaceContributors = createContributorRegistry<ChatSurfaceContribution>("chat-surface", [
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
  pluginComposerActionSurface,
  // D269: RPG's ruleset-gated dice actions join the existing Message tools menu, away from the persistent band.
  rpgDiceComposerMediaSurface,
  pluginComposerMediaSurface,
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
export const toolRenderers = createContributorRegistry<ToolRenderer>("tool-renderers", [pluginToolRenderer, rpgDiceToolRenderer]);

// The ONE slash-command assembly (§6c/G8): the single source of truth BOTH command surfaces read — the chat
// composer dispatches `/<id> …` against it and the command palette lists it. A grafted feature (automation,
// a plugin surface) appends its commands the same way, without importing chat. Delivered via a context
// provider, so a build/CT with no Provider has zero commands and every send is a plain send.
export const slashCommands = createContributorRegistry<SlashCommandContribution>("slash-commands", [
  ...chatSlashCommands,
  ...characterSlashCommands,
  ...imagerySlashCommands,
  // U5 (#679, §4.5): the ONE `/plugin <slug> <cmd> …` dispatcher — it fans per-plugin INSIDE its mount, so no
  // plugin claims a top-level token and the door never grows per install.
  ...pluginSlashCommands,
]);

// U8 (#679, §4.5/§5 row 9): the DYNAMIC palette sources — first-party contributors that fan RUNTIME-derived
// rows (a plugin's registered commands, read per-caller) into first-class command-palette rows. Like every
// contributor family, the door does not grow when a person installs a plugin (the per-plugin fan lives inside
// the source's `useRows` off the caller's own `plugin.listCommands`). The Corpus modes ride here too (D271).
export const commandPaletteSources = createContributorRegistry<CommandPaletteSource>("command-palette-sources", [
  pluginCommandPaletteSource,
  configPaletteSource,
  corpusModePaletteSource,
]);

// The Corpus workbench's contributed modes (D271): stats is Insights and tag is Labels, assembled here so
// discovery imports neither. Their CONTEXT tabs join Explore's own, each gated on the active mode.
export const corpusContextTabs = createContributorRegistry<ContextTabDef<CorpusContextState>>("corpus-context", [...insightsContextTabs, ...labelsContextTabs]);

// The WIDGET entries `assembleChrome` combines with the derived rail and modal-trigger entries.
// U5 (#679, §4.5): the "Plugins" wand — SILENT when a person's plugins register no commands.
// `bugReportChrome` is visible in every build ("Report a bug"); only its developer capture is dev-gated,
// inside the form.
// `characterCreateChrome` (#1669) is the first SECTION-scoped trail entry: the Characters pane's primary,
// on a phone only, where the LIST band that used to carry it is shed. Its `useVisible` states the three
// conditions; the zone is shell-global, the affordance is not.
export const chromeWidgets: readonly ChromeEntry[] = [
  notificationsChrome,
  pluginCommandsChrome,
  characterCreateChrome,
  contextToggleChrome,
  personaChrome,
  bugReportChrome,
];
