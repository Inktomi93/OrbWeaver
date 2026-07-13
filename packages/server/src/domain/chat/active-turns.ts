// domain/chat/active-turns — the in-memory per-chat turn controller registry. A Set of in-flight
// AbortControllers per chat (not a single slot) so a lock-free `generate` can run concurrent with a locked
// `send`, and an `abort` can signal them all. In-memory ⇒ assumes single-replica.
//
// ABORT IS OWNER-ONLY (the rollback-theft defense): each registration records the owner; `abort(chatId,
// caller)` signals only the caller's own in-flight turns. A caller who owns none while another user's turn
// is in flight gets `foreignInFlight: true` — a host cannot abort a member's turn.

import type { ChatId, UserId } from "@orb/kit/ids";
import type { AbortResult, ActiveTurnHandle, ActiveTurns } from "./contract/active-turns";

interface Entry {
  readonly controller: AbortController;
  readonly ownerUserId: UserId;
}

/** Build the in-memory active-turns registry. Pure process state — no clock, no db, no I/O. */
export function createActiveTurns(): ActiveTurns {
  const byChat = new Map<ChatId, Set<Entry>>();

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
    const entry: Entry = { controller: new AbortController(), ownerUserId };
    const set = entriesFor(chatId);
    set.add(entry);
    return {
      signal: entry.controller.signal,
      release: (): void => {
        set.delete(entry);
        if (set.size === 0) {
          byChat.delete(chatId);
        }
      },
    };
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

  const countActive = (chatId: ChatId): number => byChat.get(chatId)?.size ?? 0;

  return { register, abort, countActive };
}
