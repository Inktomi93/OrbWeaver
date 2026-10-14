// domain/chat/active-turns — the in-memory per-chat turn controller registry. A Set of in-flight
// AbortControllers per chat (not a single slot) so a lock-free `generate` can run concurrent with a locked
// `send`, and an `abort` can signal them all. In-memory ⇒ assumes single-replica.
//
// ABORT IS OWNER-ONLY (the rollback-theft defense): each registration records the owner; `abort(chatId,
// caller)` signals only the caller's own in-flight turns. A caller who owns none while another user's turn
// is in flight gets `foreignInFlight: true` — a host cannot abort a member's turn. The ONE owner-blind sweep
// is `abortAll`, reserved for the room-gone case (the host deleted the chat) — see its contract note.

import type { ChatId, UserId } from "@orb/kit/ids";
import type { AbortResult, ActiveTurnHandle, OwnedActiveTurns } from "./contract/active-turns.ts";

interface Entry {
  readonly controller: AbortController;
  readonly ownerUserId: UserId;
  readonly released: PromiseWithResolvers<void>;
}

/** Build the in-memory active-turns registry. Pure process state — no clock, no db, no I/O. */
export function createActiveTurns(): OwnedActiveTurns {
  const byChat = new Map<ChatId, Set<Entry>>();
  const unsettled = new Set<Entry>();
  let closed = false;

  const entriesFor = (chatId: ChatId): Set<Entry> => {
    const existing = byChat.get(chatId);
    if (existing !== undefined) {
      return existing;
    }
    const fresh = new Set<Entry>();
    byChat.set(chatId, fresh);
    return fresh;
  };

  const register = (chatId: ChatId, ownerUserId: UserId): ActiveTurnHandle => {
    if (closed) {
      throw new Error("cannot register a turn on a closed active-turn registry");
    }
    const entry: Entry = { controller: new AbortController(), ownerUserId, released: Promise.withResolvers<void>() };
    const set = entriesFor(chatId);
    set.add(entry);
    unsettled.add(entry);
    // `release` is idempotent (a second call deletes an already-absent entry — a no-op), which is what lets
    // `[Symbol.dispose]` ALIAS it rather than fork a second implementation: a `using` scope exit and a stray
    // hand `release()` cannot disagree.
    const release = (): void => {
      unsettled.delete(entry);
      entry.released.resolve();
      set.delete(entry);
      if (set.size === 0 && byChat.get(chatId) === set) {
        byChat.delete(chatId);
      }
    };
    return { signal: entry.controller.signal, release, [Symbol.dispose]: release };
  };

  const abort = (chatId: ChatId, principalUserId: UserId): AbortResult => {
    const set = byChat.get(chatId);
    if (set === undefined) {
      return { aborted: 0, foreignInFlight: false };
    }
    let aborted = 0;
    let foreignInFlight = false;
    for (const entry of [...set]) {
      if (entry.ownerUserId === principalUserId) {
        entry.controller.abort();
        set.delete(entry);
        aborted += 1;
      } else {
        foreignInFlight = true;
      }
    }
    if (set.size === 0) {
      byChat.delete(chatId);
    }
    return { aborted, foreignInFlight };
  };

  const abortAll = (chatId: ChatId): number => {
    const set = byChat.get(chatId);
    if (set === undefined) {
      return 0;
    }
    const signalled = set.size;
    for (const entry of set) {
      entry.controller.abort();
    }
    byChat.delete(chatId);
    return signalled;
  };

  const countActive = (chatId: ChatId): number => byChat.get(chatId)?.size ?? 0;

  return {
    register,
    abort,
    abortAll,
    countActive,
    async [Symbol.asyncDispose](): Promise<void> {
      closed = true;
      const turns = [...unsettled];
      for (const turn of turns) {
        turn.controller.abort();
      }
      await Promise.all(turns.map((turn) => turn.released.promise));
    },
  };
}
