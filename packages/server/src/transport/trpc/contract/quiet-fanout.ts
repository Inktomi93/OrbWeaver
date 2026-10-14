import type { RoomEntityKind } from "@orb/contracts/chat";
import type { UserBusEvent } from "@orb/contracts/user-bus";
import type { ChatId, UserId } from "@orb/kit/ids";

/** One application's request-scoped bulk coalescer; nested scopes within that application join their gesture. */
export interface QuietFanout extends Disposable {
  readonly silenceUserEvent: (userId: UserId, type: UserBusEvent["type"], terminal: () => void) => boolean;
  readonly silenceRoomEntityFan: (chatId: ChatId, entity: RoomEntityKind, terminal: () => void) => boolean;
  readonly withQuietBulkFanout: <T>(run: () => Promise<T>) => Promise<T>;
}
