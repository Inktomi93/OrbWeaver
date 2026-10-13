import type { UserMacroSpec } from "@orb/contracts/preset";
import type { ChatId } from "@orb/kit/ids";
import type { ChatUserMacroDefs } from "./context.ts";

export type ReadChatUserMacros = (chatId: ChatId) => Promise<readonly UserMacroSpec[]>;
export type ResolveChatUserMacroDefs = (chatId: ChatId) => Promise<ChatUserMacroDefs>;
