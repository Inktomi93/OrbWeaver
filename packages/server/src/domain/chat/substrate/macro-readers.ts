// Keep both authoring planes separate; the turn assembler alone owns their shadow policy.
import type { ReadChatUserMacrosOp } from "@orb/contracts/chat";
import type { ChatId, PresetId } from "@orb/kit/ids";
import type { ResolveChatUserMacroDefs } from "../contract/macro-readers.ts";

export function createResolveChatUserMacroDefs(
  preset: ReadChatUserMacrosOp,
  game: ReadChatUserMacrosOp,
  presetId: (chatId: ChatId) => Promise<PresetId | null>,
): ResolveChatUserMacroDefs {
  return async (chatId): ReturnType<ResolveChatUserMacroDefs> => {
    const [presetDefs, gameDefs, id] = await Promise.all([preset(chatId), game(chatId), presetId(chatId)]);
    return { preset: presetDefs, presetId: id, game: gameDefs };
  };
}
