// D332 joins actual room work before authority moves; normal admissions remain concurrent.
// A husk reap closes only an idle room, never waits, and holds it closed just for its delete (D166), so it
// cannot delete a room under admitted work such as a first send that has not claimed yet.
// The room records why it is closed, so a refused admission says the room is going away only for a removal.
import type { ChatId } from "@orb/kit/ids";
import { CHAT_OP_CODES, ChatOperationError } from "../contract/errors.ts";
import type { HandoffBarrier, HandoffReservation } from "../contract/handoff-barrier.ts";

type RoomClosure = "handoff" | "removal";

interface RoomWork {
  count: number;
  closure: RoomClosure | null;
  readonly idle: Set<() => void>;
}

/** Refuse an admission the barrier turned away, after the caller's own gate: a stranger reads the not found, never
 *  the closure. The refusal is read first, so a closure that lifts during the gate still names its own cause. */
export async function refuseClosedAdmission(barrier: HandoffBarrier, chatId: ChatId, authorize: () => Promise<unknown>): Promise<never> {
  const refusal = barrier.refusal(chatId);
  await authorize();
  throw refusal;
}

/** Construct the chat graph's transition barrier, not a database or cross-replica lock. */
export function createHandoffBarrier(): HandoffBarrier {
  const rooms = new Map<ChatId, RoomWork>();
  const roomFor = (chatId: ChatId): RoomWork => {
    const existing = rooms.get(chatId);
    if (existing !== undefined) {
      return existing;
    }
    const room: RoomWork = { count: 0, closure: null, idle: new Set() };
    rooms.set(chatId, room);
    return room;
  };
  const retire = (chatId: ChatId, room: RoomWork): void => {
    if (room.count !== 0) {
      return;
    }
    for (const resolve of room.idle) {
      resolve();
    }
    room.idle.clear();
    if (room.closure === null) {
      rooms.delete(chatId);
    }
  };
  const retain = (chatId: ChatId, room: RoomWork): (() => void) => {
    room.count += 1;
    let released = false;
    return (): void => {
      if (!released) {
        released = true;
        room.count -= 1;
        retire(chatId, room);
      }
    };
  };
  const tryEnter: HandoffBarrier["tryEnter"] = (chatId) => {
    const room = roomFor(chatId);
    return room.closure !== null ? null : { [Symbol.dispose]: retain(chatId, room) };
  };
  const closeRoom = (chatId: ChatId, room: RoomWork, closure: RoomClosure): (() => void) => {
    room.closure = closure;
    let released = false;
    return (): void => {
      if (!released) {
        released = true;
        room.closure = null;
        retire(chatId, room);
      }
    };
  };
  return {
    tryEnter,
    close: (chatId): HandoffReservation => {
      const room = roomFor(chatId);
      if (room.closure !== null) {
        throw new ChatOperationError(CHAT_OP_CODES.locked, "host handoff is already settling this room; accept it again");
      }
      return {
        settle: async (): Promise<void> => {
          while (room.count > 0) {
            await new Promise<void>((resolve) => room.idle.add(resolve));
          }
        },
        [Symbol.dispose]: closeRoom(chatId, room, "handoff"),
      };
    },
    tryCloseIdle: (chatId): Disposable | null => {
      const room = roomFor(chatId);
      if (room.closure !== null || room.count > 0) {
        return null;
      }
      return { [Symbol.dispose]: closeRoom(chatId, room, "removal") };
    },
    refusal: (chatId): ChatOperationError =>
      rooms.get(chatId)?.closure === "removal"
        ? new ChatOperationError(CHAT_OP_CODES.roomClosing, "this chat is being removed")
        : new ChatOperationError(CHAT_OP_CODES.locked, "this room is settling a host handoff; try the request again"),
    track: (chatId, work): void => {
      const release = retain(chatId, roomFor(chatId));
      // The existing terminal boundary still owns failure; this derivative only releases custody.
      void work.then(release, release);
    },
  };
}
