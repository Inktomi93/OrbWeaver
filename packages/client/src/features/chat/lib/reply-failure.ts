// The failed turn this client still owes an answer for, per room: set when this client's own send landed its message
// and the reply then failed, or when a turn action the room offers (a reply, swipe, continue, rewrite, summon) failed;
// held while its retry runs, replaced by a failed retry, and cleared by the next send, a retry that settles, or
// another turn in the room. It lives in memory, for this tab: another member's failure is
// theirs to see, and a reload starts without it.

import type { ChatId } from "@orb/kit/ids";
import { useSyncExternalStore } from "react";
import { isSilencedTurnAbort, trpcErrorDetailString, trpcErrorMessage, trpcErrorReason, turnRoomStateCopy } from "#lib";
import { REPLY_FAILED_LEAD } from "./send-failure-copy.ts";

/** The surface that states a failed turn, which every turn action names so its toast stands down for it. */
export const REPLY_FAILURE_LINE = "the composer's reply-failure line";

export interface ReplyFailure {
  /** The server's sentence for the failure, or `null` when it sent none. */
  readonly message: string | null;
  /** The failure's `data.reason`, the structured key every decision reads; `""` when the error carried none. */
  readonly reason: string;
  /** The cause a coded refusal states on `data.detail.cause`; `""` when it states none. */
  readonly cause: string;
  /** What failed, said first on the line. */
  readonly lead: string;
  /** The copy for a turn refused for the room's state, which states itself in place of the server's sentence. */
  readonly roomState: string | null;
  /** The line's Retry asks for the reply again on the saved message. It is the right retry only for a reply. */
  readonly retryable: boolean;
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

interface RecordOptions {
  /** What failed; a failed reply by default. */
  readonly lead?: string;
  /** Offer Retry; true by default, as every reply is retried by the same call. */
  readonly retryable?: boolean;
}

/** Record `error` as the room's failed turn. */
export function recordReplyFailure(chatId: ChatId, error: unknown, options: RecordOptions = {}): void {
  failures.set(chatId, {
    message: trpcErrorMessage(error),
    reason: trpcErrorReason(error),
    cause: trpcErrorDetailString(error, "cause") ?? "",
    lead: options.lead ?? REPLY_FAILED_LEAD,
    roomState: turnRoomStateCopy(error),
    retryable: options.retryable ?? true,
    retrying: false,
  });
  announce();
}

/** Record a failed turn action named `lead`. A stale abort stays silent: the bus states it. The action's own control
 *  starts it again, so the line offers no Retry. */
export function recordTurnFailure(chatId: ChatId, error: unknown, lead: string): void {
  if (!isSilencedTurnAbort(error)) {
    recordReplyFailure(chatId, error, { lead, retryable: false });
  }
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
