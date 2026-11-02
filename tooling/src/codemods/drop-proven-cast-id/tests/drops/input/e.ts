import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";

// Not listed: the transform has no type information, so an unlisted call stays.
export const kept = castId<ChatId>(chat.id);
