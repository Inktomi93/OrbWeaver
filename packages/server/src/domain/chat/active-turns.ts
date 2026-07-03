// domain/chat/active-turns — the in-memory per-chat turn CONTROLLER registry. A `Set` of in-flight
// `AbortController`s PER chat (not a single slot) so a lock-free `generate` can run CONCURRENT with a locked
// `send`, and an `abort` can signal them all. In-memory ⇒ ASSUMES single-replica (the same assumption auto-
// mode's round state makes — Part III §6).
//
// HOMED at the feature root (not under `verbs/`): it is a shared, stateful, cross-verb collaborator (every turn
// verb registers; `abort` signals) — the 8-slot puts it at the chat root, alongside `bus.ts`. The REGISTRY
// INSTANCE is built ONCE at the composition root (`createActiveTurns()`) and injected into the turn verbs as a
// dep (like the `TurnEngine`); the verbs import only the TYPE (`contract/active-turns.ts`, the `types-in-
// contract` home).
//
// ABORT IS OWNER-ONLY (the rollback-theft defense): each registration records
// the `triggeredBy` owner; `abort(chatId, caller)` signals ONLY the caller's own in-flight turns. A caller who
// owns NONE while another user's turn is in flight gets `foreignInFlight: true` (the verb maps that to
// `not_turn_owner`) — a host cannot abort a member's turn.
//
// `TurnPrep` now carries an optional `signal` (`contract/results.ts`); the
// turn verbs thread `handle.signal` into `engine.runTurn`, which forwards it through the pipeline to the
// `runChatTurn` role — so a single in-flight ENGINE turn IS interruptible mid-generation (the runner aborts its
// request; the engine maps the `AbortError` to `turnAborted(reason:"user")`). The registered signal still also
// reaches the auto-mode chain (`runAutoMode` checks it between turns) + the lock-free `generate`.

import type { ChatId, UserId } from "@orb/kit/ids";
import type { AbortResult, ActiveTurnHandle, ActiveTurns } from "./contract/active-turns";

interface Entry {
  readonly controller: AbortController;
  readonly ownerUserId: UserId;
}

/**
 * Build the in-memory active-turns registry. PURE process state — no clock, no db, no I/O. One instance per
 * replica, created at the composition root and injected into the turn verbs.
 */
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
