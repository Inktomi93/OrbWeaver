// The failed reply this client still owes an answer for, per room: set when this client's own send landed its message
// and the reply then failed, held while its retry runs, replaced by a failed retry, and cleared by the next send, a
// retry that settles, or another turn in the room. It lives in memory, for this tab: another member's failure is
// theirs to see, and a reload starts without it.

import type { ChatId } from "@orb/kit/ids";
import { useSyncExternalStore } from "react";
import { trpcErrorMessage, trpcErrorReason } from "#lib";

export interface ReplyFailure {
  /** The server's sentence for the failure, or `null` when it sent none. */
  readonly message: string | null;
  /** The failure's `data.reason`, the structured key every decision reads; `""` when the error carried none. */
  readonly reason: string;
  /** Its retry is running: the line stands down, and the retry's own outcome settles it. */
  readonly retrying: boolean;
}

const failures = new Map<ChatId, ReplyFailure>();
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return (): void => {
    listeners.delete(onChange);
  };
}

function announce(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** Record `error` as the room's failed reply. */
export function recordReplyFailure(chatId: ChatId, error: unknown): void {
  failures.set(chatId, { message: trpcErrorMessage(error), reason: trpcErrorReason(error), retrying: false });
  announce();
}

export function markReplyRetrying(chatId: ChatId): void {
  const failure = failures.get(chatId);
  if (failure !== undefined) {
    failures.set(chatId, { ...failure, retrying: true });
    announce();
  }
}

export function clearReplyFailure(chatId: ChatId): void {
  if (failures.delete(chatId)) {
    announce();
  }
}

/** The held failure, read outside render. */
export function peekReplyFailure(chatId: ChatId): ReplyFailure | undefined {
  return failures.get(chatId);
}

export function useReplyFailure(chatId: ChatId): ReplyFailure | undefined {
  return useSyncExternalStore(subscribe, () => failures.get(chatId));
}
