// domain/chat/engine/budget — the per-member turn-COUNT budget debit (chat.md Part III §5/§9/§12 inv 4).
// Debited IN-LOCK, attributed to `triggeredBy`, metering ALL backends (hosted $ AND the owner's shared local
// compute — local has no dollar cost but finite hardware). This file is the chat-surface WRAPPER: it calls
// the injected debit op and translates the transport limiter's `DomainRateLimitError` into the chat
// `budget_exceeded` code so the verb surface stays consistent.
//
// FLAG[budget-op-not-on-ctx]: `ChatContext` carries NO budget-debit op. The DB-backed `MemberBudget`
// primitive lives in `transport/rate-limit.ts` (`createMemberBudget`), which is ABOVE the cake — the chat
// DOMAIN cannot import it (imports flow DOWN). So the engine takes the debit as an injected ENGINE dep wired
// at the entry composition root (the bus-emit precedent — `bus.ts` FLAG[bus-not-on-ctx]). The owner-consent
// flag + the resolved budget CAP likewise need host settings under the frozen `runAsUserId`, for which there
// is ALSO no `ChatContext` op (no `loadUserSettings`) — the engine takes a `resolveTurnPolicy` dep. Both are
// FLAGGED for the entry chunk: the honest "no ctx op exists yet → flag, don't invent a sideways write".

import { DomainRateLimitError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import { CHAT_OP_CODES, ChatOperationError } from "../contract/errors";

/** The injected per-member COUNT budget debit (the transport `MemberBudget.debit` shape). `budget === null`
 *  ⇒ unbounded (a no-op debit — the supervisor-limited domain floor). File-local (the `types-in-contract`
 *  gate); the engine declares its dep with the same inline signature. */
type DebitBudgetOp = (triggeredBy: UserId, budget: number | null) => Promise<void>;

/**
 * Debit ONE turn against `triggeredBy`'s per-member budget (IN-LOCK — the engine calls this inside the
 * per-chat lock so the count can't be raced). Translates the limiter's `DomainRateLimitError` into
 * `ChatOperationError('budget_exceeded')`; any other error propagates unchanged.
 */
export async function debitTurnBudget(
  op: DebitBudgetOp,
  triggeredBy: UserId,
  budget: number | null,
): Promise<void> {
  try {
    await op(triggeredBy, budget);
  } catch (err) {
    if (err instanceof DomainRateLimitError) {
      // biome-ignore lint/style/useErrorCause: ChatOperationError(code,message) has no `cause` slot by design — the `budget_exceeded` code is the signal; the limiter's window detail isn't surfaced to the chat caller.
      throw new ChatOperationError(
        CHAT_OP_CODES.budgetExceeded,
        "per-member turn budget exhausted",
      );
    }
    throw err;
  }
}
