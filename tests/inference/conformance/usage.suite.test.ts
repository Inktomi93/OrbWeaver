// CONFORMANCE — USAGE REPORTING. Every wire that serves `chat` lands the SAME normalized `ChatUsage` core,
// and `costProvenance` is `measured | estimated | unrecorded` with the arm the wire's own nature justifies.
//
// THE PROVENANCE LAWS ARE IMPLICATIONS, not a per-wire expectation, because the wires legitimately reach
// different arms with the same fixture and a hand-written "this wire says X" table would be an applicability
// roster in disguise. Each is spelled as a forbidden COMBINATION so it asserts unconditionally:
//   U1  `measured` ⟹ the provider row is METERED. A subscription's SDK-computed price is notional — no
//       invoice exists — so it is `estimated` by ruling (`contracts/inference/usage.ts`), and a rollup that
//       summed it with a metered figure would be inventing spend. `metered` is read off `BUILTIN_PROVIDERS`,
//       so this law re-derives if a row's billing nature ever changes.
//   U2  `costUsd === null` ⟺ `costProvenance === "unrecorded"`, and `unrecorded` ⟹ `costDetails === null`.
//       A recorded number with no provenance, or a provenance with no number, is a row that lies about where
//       its figure came from.
//   U3  the normalized core is COMPLETE on every wire: the token counts come from the terminal frame, and
//       the two cache counters are numbers — never null, because a wire that reports no cache HAS none, and
//       that is 0, not unknown.
//
// WHAT THESE PINS WOULD CATCH
//  · Change `backends/agent-sdk/runner.ts`'s `costProvenance: … "estimated"` to `"measured"` and U1 reds on
//    exactly one wire — the subscription — while every shape and token assertion stays green. That single
//    word is the difference between a real invoice line and a notional one in every downstream rollup.
//  · Drop the `pricing` arm in `backends/v4/result.ts::costOf` and the ARM TABLE below reds: the two hosted
//    wires fall to `unrecorded` and stop reporting a cost they can legitimately derive.
//  · Default a missing `cacheRead` to `null` instead of `0` in `foldNestedUsage` and U3 reds on every wire.

import { TOKEN_PROVENANCES } from "@orb/contracts/chat";
import type { Wire } from "@orb/contracts/inference";
import { expect, test } from "../../support/fixtures.ts";
import type { ChatScript } from "./_harness.ts";
import { CONFORMANCE_WIRES, cellTest, driveChat, meteredForWire } from "./_harness.ts";

/** A turn whose wire reports a cost figure WHERE THE WIRE HAS A CHANNEL FOR ONE — OpenRouter's `usage.cost`,
 *  the agent-sdk's `modelUsage[].costUSD`. The anthropic-messages wire has no such channel at all, which is
 *  exactly why the laws above are implications: that wire must reach its arm from the row's pricing. */
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

test("the cost-provenance ARM each wire reaches on a cost-bearing turn — an observation, not a roster", async () => {
  const observed: Partial<Record<Wire, unknown>> = {};
  for (const wire of CONFORMANCE_WIRES.filter((candidate) => candidate !== "local-light")) {
    const { turn } = await driveChat(wire, { script: scriptFor(wire), pricing: true });
    observed[wire] = turn.usage.costProvenance;
  }
  // The three wires DIFFER here for three individually correct reasons, and recording that is the point: a
  // suite that only proved "they all agree" would have nothing to say about the one axis where agreeing
  // would itself be the defect.
  expect(observed).toEqual({
    // OpenRouter reports a real charge on its own accounting channel — a metered figure, so `measured` wins
    // over the row's pricing.
    "openai-compat": "measured",
    // The direct Anthropic wire has NO cost channel; the row's shipped pricing × tokens is the honest arm.
    "anthropic-messages": "estimated",
    // The subscription: the SDK computes what the turn WOULD have billed at API prices. No invoice exists,
    // so it is `estimated` BY RULING even though a number is present (`contracts/inference/usage.ts`).
    "agent-sdk": "estimated",
  });
  // The distinguishing control: the table above is only meaningful because the suite CAN observe both arms.
  expect(new Set(Object.values(observed)).size, "a table where every wire reported the same arm would prove nothing").toBeGreaterThan(1);
});
