import type { ChatId } from "@orb/kit/ids";
import { castId, ID_PREFIX } from "@orb/kit/ids";

export const view = <Row id={castId<ChatId>(chat.id)} prefix={ID_PREFIX.chat} />;
