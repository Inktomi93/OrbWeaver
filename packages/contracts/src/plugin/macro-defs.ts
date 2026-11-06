import type { PluginId } from "@orb/kit/ids";
import type { UserMacroDef } from "@orb/kit/macro";

/** One plugin's resolved macros for a turn: the plugin that registered them and their kit defs. The plugin domain
 *  produces it and the chat domain consumes it through an injected op, so neither imports the other. */
export interface PluginMacroDefs {
  readonly pluginId: PluginId;
  readonly defs: readonly UserMacroDef[];
}

/** One plugin's registered macro names, with no guest run: what a preview lists while the turn alone resolves the
 *  values. Includes the legacy hyphen spellings the turn resolves as aliases. */
export interface PluginMacroNames {
  readonly pluginId: PluginId;
  readonly names: readonly string[];
}
