// @subject packages/inference/src/backends/v4/result.ts
// @subject packages/inference/src/backends/agent-sdk/runner.ts
import type { TokenProvenance } from "@orb/contracts/chat";
import { TOKEN_PROVENANCES } from "@orb/contracts/chat";

import type { Wire } from "@orb/contracts/inference";

import { expect, test } from "@orb/testkit/node";

import type { ChatScript } from "./runtime.fixtures.ts";

import { CONFORMANCE_WIRES, cellTest, driveChat, meteredForWire } from "./runtime.fixtures.ts";

const COST_BEARING: ChatScript = { deltas: ["ok"], stop: "stop", tokensIn: 1000, tokensOut: 500, costUsd: 0.0042 };

function scriptFor(wire: Wire): ChatScript {
  return wire === "anthropic-messages" ? { ...COST_BEARING, stop: "end_turn" } : COST_BEARING;
}

for (const wire of CONFORMANCE_WIRES) {
  cellTest(wire, "chat", "the normalized ChatUsage core is complete and its provenance is honest", async () => {
    const { turn } = await driveChat(wire, { script: scriptFor(wire), pricing: true });
    const usage = turn.usage;

    // U3 — the core.
    expect(usage.tokensIn, "tokensIn off the terminal frame").toBe(COST_BEARING.tokensIn);
    expect(usage.tokensOut, "tokensOut off the terminal frame").toBe(COST_BEARING.tokensOut);
    expect(typeof usage.cacheReadTokens, "a wire reporting no cache has 0, never unknown").toBe("number");
    expect(typeof usage.cacheWriteTokens, "a wire reporting no cache has 0, never unknown").toBe("number");
    expect(usage.contextWindow, "the caller-filled context window").not.toBeNull();
    expect(usage.maxOutputTokens, "the caller-filled output cap").not.toBeNull();
    expect(TOKEN_PROVENANCES, "provenance is inside the closed vocabulary").toContain(usage.costProvenance);

    // U1 — spelled as the forbidden pair so it asserts on every wire rather than only on the ones that
    // happen to reach `measured`.
    expect(
      usage.costProvenance === "measured" && !meteredForWire(wire),
      "a NON-metered wire reported its cost as `measured` — a notional price can never be an invoice",
    ).toBe(false);

    // U2 — the number and its provenance agree in both directions.
    expect(usage.costUsd === null, "costUsd === null must mean `unrecorded`, and `unrecorded` must mean costUsd === null").toBe(
      usage.costProvenance === "unrecorded",
    );
    expect(usage.costProvenance === "unrecorded" && usage.costDetails !== null, "an unrecorded cost carries no breakdown").toBe(false);
  });
}

const CACHED = { deltas: ["ok"], stop: "stop", tokensIn: 18_580, tokensOut: 20, cacheRead: 18_568 } satisfies ChatScript;

for (const wire of CONFORMANCE_WIRES) {
  cellTest(wire, "chat", "tokensIn is the whole prompt, so the cache read is a part of it", async () => {
    const script = wire === "anthropic-messages" ? { ...CACHED, stop: "end_turn" } : CACHED;
    const { turn } = await driveChat(wire, { script });
    expect(turn.usage.tokensIn).toBe(CACHED.tokensIn);
    expect(turn.usage.cacheReadTokens).toBe(CACHED.cacheRead);
    expect(CACHED.cacheRead / (turn.usage.tokensIn ?? 0)).toBeLessThanOrEqual(1);
  });
}

// The wires DIFFER here for individually correct reasons, and recording that is the point: a suite that only
// proved "they all agree" would have nothing to say about the one axis where agreeing would itself be the defect.
// One case per wire, so each composed root and drive is billed to its own case.
const COST_PROVENANCE_ARMS = {
  // OpenRouter reports a real charge on its own accounting channel — a metered figure, so `measured` wins
  // over the row's pricing.
  "openai-compat": "measured",
  // The direct Anthropic wire has NO cost channel; the row's shipped pricing × tokens is the honest arm.
  "anthropic-messages": "estimated",
  "google-generative-ai": "estimated",
  // The subscription: the SDK computes what the turn WOULD have billed at API prices. No invoice exists,
  // so it is `estimated` BY RULING even though a number is present (`contracts/inference/usage.ts`).
  "agent-sdk": "estimated",
} as const satisfies Record<Exclude<Wire, "local-light">, TokenProvenance>;

for (const wire of CONFORMANCE_WIRES) {
  if (wire === "local-light") {
    continue;
  }
  const arm: TokenProvenance = COST_PROVENANCE_ARMS[wire];
  test(`${wire} reaches the ${arm} cost-provenance arm on a cost-bearing turn — an observation, not a roster`, async () => {
    const { turn } = await driveChat(wire, { script: scriptFor(wire), pricing: true });
    expect(turn.usage.costProvenance).toBe(arm);
  });
}

test("the observed cost-provenance arms distinguish wires", () => {
  expect(new Set(Object.values(COST_PROVENANCE_ARMS)).size, "a table where every wire reported the same arm would prove nothing").toBeGreaterThan(1);
});
