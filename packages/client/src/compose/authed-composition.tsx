// The authenticated registry assembly stays behind the lazy route and accepts its data runtime explicitly.

import type { ClientRuntime } from "#data";
import { youModal } from "#features/app-shell";
import { reauthModal } from "#features/auth";
import { automationGroup } from "#features/automation";
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
import { insightsCorpusMode } from "#features/stats";
import { labelsCorpusMode } from "#features/tag";
import { aboutGroup, adminGroup } from "#features/user-admin";
import { backupGroup, workloadsGroup } from "#features/workloads";
import { worldInfoGroup } from "#features/world-info";
import { createContributorRegistry, createRegistry } from "#lib";
import type { AuthedComposition } from "#state";
import { assembleChrome, CONFIG_GROUP_IDS, MODAL_SLOT_IDS, SECTION_IDS } from "#state";
import { characterDetailContributors, makeChatContextContributors, makeChatContextRegions, messageToolsRenderers } from "./chat-context.ts";
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
import { homeTiles } from "./home-tiles.ts";

// The canonical settings vocabulary shared by every authenticated mount.
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
  rosterPreset: rosterGroup,
  plugins: pluginsGroup,
});
// The palette hook retains module identity while reading the immutable canonical registry.
bindConfigPaletteGroups(configGroups);

// Modal identity and triggers belong to the production door, not individual mounted stories.
const modals = createRegistry("modals", MODAL_SLOT_IDS, {
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
});

/** Assemble the authenticated graph over the same data runtime its providers deliver. */
export function createAuthedComposition({ queryClient, trpcProxy }: Pick<ClientRuntime, "queryClient" | "trpcProxy">): AuthedComposition {
  const chatContextContributors = makeChatContextContributors({ trpc: trpcProxy, queryClient });
  const chatContextRegions = makeChatContextRegions({ trpc: trpcProxy, queryClient });
  const sections = createRegistry("sections", SECTION_IDS, {
    home: makeHomeSection(homeTiles),
    chats: makeChatsSection({
      contextTabs: chatContextContributors,
      contextRegions: chatContextRegions,
      surfaces: chatSurfaceContributors,
      toolRenderers,
      settingsSections: chatSettingsSections,
    }),
    characters: makeCharactersSection(characterDetailContributors, (view) => <ChatsWithCharacterPane {...view} />),
    corpus: makeCorpusSection({ insights: insightsCorpusMode, labels: labelsCorpusMode, contextTabs: corpusContextTabs }),
    config: makeConfigSection(configGroups),
    extensions: extensionsSection,
    databank: databankSection,
    presets: presetsSection,
    refinery: refinerySection,
  });

  const chrome = createContributorRegistry("chrome", assembleChrome({ sections: sections.list(), modals: modals.list(), widgets: chromeWidgets }));
  return {
    sections,
    modals,
    chrome,
    chatContextContributors,
    chatContextRegions,
    configGroups,
    configSections,
    messageToolsRenderers,
    slashCommands,
    commandPaletteSources,
  };
}
