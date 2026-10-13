import type { ChatContextState, ContextRegionDef, ContextTabDef, ContributorRegistry } from "#lib";
import type { ChromeRegistry } from "./chrome-registry-context.ts";
import type { CommandPaletteSourceRegistry } from "./command-palette-source-registry-context.ts";
import type { ConfigGroupRegistry } from "./config-group-registry.ts";
import type { ConfigSectionRegistry } from "./config-section-registry-context.ts";
import type { MessageToolsRendererRegistry } from "./message-tools-renderer-registry-context.ts";
import type { ModalRegistry } from "./modal-registry-context.ts";
import type { SectionRegistry } from "./section-registry-context.ts";
import type { SlashCommandRegistry } from "./slash-command-registry-context.ts";

/** The authenticated graph delivered by the production registry provider door. */
export interface AuthedComposition {
  readonly sections: SectionRegistry;
  readonly modals: ModalRegistry;
  readonly chrome: ChromeRegistry;
  readonly configGroups: ConfigGroupRegistry;
  readonly configSections: ConfigSectionRegistry;
  readonly messageToolsRenderers: MessageToolsRendererRegistry;
  readonly slashCommands: SlashCommandRegistry;
  readonly commandPaletteSources: CommandPaletteSourceRegistry;
  readonly chatContextContributors: ContributorRegistry<ContextTabDef<ChatContextState>>;
  readonly chatContextRegions: ContributorRegistry<ContextRegionDef<ChatContextState>>;
}
