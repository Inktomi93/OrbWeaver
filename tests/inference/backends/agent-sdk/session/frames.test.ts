import { NO_SAVED_TOTALS, savedSessionTotals } from "../../../../../packages/inference/src/backends/agent-sdk/session/frames.ts";
import { agentSdkSessionIdSchema } from "../../../../../packages/inference/src/contract/identity.ts";
import { expect, test } from "../../../../support/fixtures.ts";

type SessionStoreEntry = Parameters<typeof savedSessionTotals>[0][number];

const SESSION = agentSdkSessionIdSchema.parse("1d9ddf80-17e0-4aa7-84c8-44143db4d63c");
const OTHER = "80cb475f-17e0-4aa7-84c8-44143db4d63c";

// The runtime's own `cost-state` transcript entry, trimmed to the fields the reader parses.
function costState(sessionId: string, costUSD: number, webSearchRequests = 0): SessionStoreEntry {
  return { type: "cost-state", sessionId, totalCostUSD: costUSD, modelUsage: { "claude-sonnet-5": { costUSD, webSearchRequests, inputTokens: 1 } } };
}

const userTurn: SessionStoreEntry = { type: "user", message: { role: "user", content: "Hi" } };

test("a transcript with no cost-state entry saved nothing", () => {
  expect(savedSessionTotals([userTurn], SESSION)).toEqual(NO_SAVED_TOTALS);
});

test("the latest cost-state entry for the session is the saved total, summed across models", () => {
  const entries: SessionStoreEntry[] = [
    costState(SESSION, 0.0049),
    userTurn,
    {
      type: "cost-state",
      sessionId: SESSION,
      modelUsage: { "claude-sonnet-5": { costUSD: 0.011, webSearchRequests: 1 }, "claude-haiku-4-5": { costUSD: 0.001, webSearchRequests: 0 } },
    },
  ];
  const totals = savedSessionTotals(entries, SESSION);
  expect(totals?.costUsd).toBeCloseTo(0.012, 10);
  expect(totals?.webSearchRequests).toBe(1);
});

test("another session's cost-state entry is not this session's total", () => {
  expect(savedSessionTotals([costState(OTHER, 0.5)], SESSION)).toEqual(NO_SAVED_TOTALS);
});

test("an unreadable cost-state entry for the session makes the saved total unknowable", () => {
  expect(savedSessionTotals([costState(SESSION, 0.0049), { type: "cost-state", sessionId: SESSION, modelUsage: "bad" }], SESSION)).toBeNull();
});
