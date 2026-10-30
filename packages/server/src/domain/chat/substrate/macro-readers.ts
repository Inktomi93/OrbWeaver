// Keep both authoring planes separate; the turn assembler alone owns their shadow policy.
import type { ReadChatUserMacrosOp } from "@orb/contracts/chat";
import type { ResolveChatUserMacroDefs } from "../contract/macro-readers.ts";

export function createResolveChatUserMacroDefs(preset: ReadChatUserMacrosOp, game: ReadChatUserMacrosOp): ResolveChatUserMacroDefs {
  return async (chatId): ReturnType<ResolveChatUserMacroDefs> => {
    const [presetDefs, gameDefs] = await Promise.all([preset(chatId), game(chatId)]);
    return { preset: presetDefs, game: gameDefs };
  };
}
