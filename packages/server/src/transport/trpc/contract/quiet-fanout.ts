import type { UserBusEvent } from "@orb/contracts/user-bus";
import type { UserId } from "@orb/kit/ids";
import type { ChatPublicationDeps } from "#domain/chat";
import type { ImportDriverDeps } from "#domain/import";

/** One application's request-scoped bulk coalescer; nested scopes within that application join their gesture. */
export interface QuietFanout extends Disposable {
  readonly silenceUserEvent: (userId: UserId, type: UserBusEvent["type"], terminal: () => void) => boolean;
  readonly silenceRoomEntityFan: ChatPublicationDeps["silenceRoomEntityFan"];
  readonly withQuietBulkFanout: ImportDriverDeps["quiet"];
}
