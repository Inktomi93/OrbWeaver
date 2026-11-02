import { ID_PREFIX, castId } from "@orb/kit/ids";

export const proven = castId<ChatId>(chat.id);
export const unlisted = ID_PREFIX.chat;
