import type { UserMacroSpec } from "@orb/contracts/preset";
import type { ChatId } from "@orb/kit/ids";

/** IMGMAC — the chat's authored USER-MACRO defs from BOTH homes (owner ruling #20's two authoring homes): the
 *  active preset's `promptConfig.userMacros` and the game's `rpg_games.config.userMacros`. Handed to
 *  `extractQuiet` UNMERGED because the merge policy (the game shadows the preset by name) is chat's law, not
 *  the wirer's — `shadowPresetUserMacros` inside `buildTurnUserMacros` is its ONE home. A chat with no host /
 *  no game yields two empty arrays (the byte-identical no-plane path). */
export interface ChatUserMacroDefs {
  readonly preset: readonly UserMacroSpec[];
  readonly game: readonly UserMacroSpec[];
}

export type ResolveChatUserMacroDefs = (chatId: ChatId) => Promise<ChatUserMacroDefs>;
