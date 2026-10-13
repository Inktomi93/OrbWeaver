// Keep both authoring planes separate; the turn assembler alone owns their shadow policy.
import type { ReadChatUserMacros, ResolveChatUserMacroDefs } from "../contract/macro-readers.ts";

export function createResolveChatUserMacroDefs(preset: ReadChatUserMacros, game: ReadChatUserMacros): ResolveChatUserMacroDefs {
  return async (chatId): ReturnType<ResolveChatUserMacroDefs> => {
    const [presetDefs, gameDefs] = await Promise.all([preset(chatId), game(chatId)]);
    return { preset: presetDefs, game: gameDefs };
  };
}
