import type { UserMacroSpec } from "@orb/contracts/preset";
import type { ChatId, PresetId } from "@orb/kit/ids";

/** IMGMAC — the chat's authored USER-MACRO defs from BOTH homes (the owner ruling's two authoring homes): the
 *  active preset's `promptConfig.userMacros` and the game's `rpg_games.config.userMacros`. Handed to
 *  `extractQuiet` UNMERGED because the merge policy (the game shadows the preset by name) is chat's law, not
 *  the wirer's — `shadowPresetUserMacros` inside `buildTurnUserMacros` is its ONE home. A chat with no host /
 *  no game yields two empty arrays (the byte-identical no-plane path). */
export interface ChatUserMacroDefs {
  readonly preset: readonly UserMacroSpec[];
  /** The id of the preset those defs came from; null when the room runs the built-in default. */
  readonly presetId: PresetId | null;
  readonly game: readonly UserMacroSpec[];
}

export type ResolveChatUserMacroDefs = (chatId: ChatId) => Promise<ChatUserMacroDefs>;
