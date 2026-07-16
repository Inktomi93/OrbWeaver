// engine/budget — the in-lock per-member budget debit wrapper (attribution + error translation).

import { DomainRateLimitError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, vi } from "vitest";
import { ChatOperationError } from "../../../../../packages/server/src/domain/chat/contract/errors";
import { debitTurnBudget } from "../../../../../packages/server/src/domain/chat/engine/budget";
import { expect, test } from "../../../../support/fixtures";

const TRIGGERED_BY = castId<UserId>("user_trig");

describe("debitTurnBudget", () => {
  test("debits ONE turn attributed to triggeredBy with the resolved cap", async () => {
    const op = vi.fn(() => Promise.resolve());
    await debitTurnBudget(op, TRIGGERED_BY, 50);
    expect(op).toHaveBeenCalledWith(TRIGGERED_BY, 50);
  });

  test("an unbounded budget (null) is passed through (the op no-ops)", async () => {
    const op = vi.fn(() => Promise.resolve());
    await debitTurnBudget(op, TRIGGERED_BY, null);
    expect(op).toHaveBeenCalledWith(TRIGGERED_BY, null);
  });

  test("a limiter DomainRateLimitError becomes ChatOperationError('budget_exceeded')", async () => {
    const op = (): Promise<void> => Promise.reject(new DomainRateLimitError("over", { msBeforeNext: 1000, remainingPoints: 0 }));
    let caught: unknown;
    try {
      await debitTurnBudget(op, TRIGGERED_BY, 1);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ChatOperationError);
    expect((caught as ChatOperationError).code).toBe("budget_exceeded");
  });

  test("any OTHER error propagates unchanged (not swallowed / not re-coded)", async () => {
    const boom = new Error("db down");
    const op = (): Promise<void> => Promise.reject(boom);
    await expect(debitTurnBudget(op, TRIGGERED_BY, 1)).rejects.toBe(boom);
  });
});
