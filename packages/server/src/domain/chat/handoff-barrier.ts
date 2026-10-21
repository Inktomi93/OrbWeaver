// D332 joins actual room work before authority moves; normal admissions remain concurrent.
import type { ChatId } from "@orb/kit/ids";
import { CHAT_OP_CODES, ChatOperationError } from "./contract/errors.ts";
import type { HandoffBarrier, HandoffReservation } from "./contract/handoff-barrier.ts";

interface RoomWork {
  count: number;
  closed: boolean;
  readonly idle: Set<() => void>;
}

/** A request that observed closure never waits and rebinds to the recipient's authority. */
export function refuseHandoffAdmission(): never {
  throw new ChatOperationError(CHAT_OP_CODES.locked, "host handoff is settling this room; try the request again");
}

/** Construct the chat graph's transition barrier, not a database or cross-replica lock. */
export function createHandoffBarrier(): HandoffBarrier {
  const rooms = new Map<ChatId, RoomWork>();
  const roomFor = (chatId: ChatId): RoomWork => {
    const existing = rooms.get(chatId);
    if (existing !== undefined) {
      return existing;
    }
    const room: RoomWork = { count: 0, closed: false, idle: new Set() };
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
    if (!room.closed) {
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
    return room.closed ? null : { [Symbol.dispose]: retain(chatId, room) };
  };
  return {
    tryEnter,
    close: (chatId): HandoffReservation => {
      const room = roomFor(chatId);
      if (room.closed) {
        throw new ChatOperationError(CHAT_OP_CODES.locked, "host handoff is already settling this room; accept it again");
      }
      room.closed = true;
      let released = false;
      return {
        settle: async (): Promise<void> => {
          while (room.count > 0) {
            await new Promise<void>((resolve) => room.idle.add(resolve));
          }
        },
        [Symbol.dispose](): void {
          if (!released) {
            released = true;
            room.closed = false;
            retire(chatId, room);
          }
        },
      };
    },
    track: (chatId, work): void => {
      const release = retain(chatId, roomFor(chatId));
      // The existing terminal boundary still owns failure; this derivative only releases custody.
      void work.then(release, release);
    },
  };
}
