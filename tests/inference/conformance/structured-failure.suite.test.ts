// CONFORMANCE — STRUCTURED-OUTPUT FAILURE. A malformed structured payload must be a typed `ProviderError` on
// every wire that serves `structured` — NEVER a resolved result carrying an empty or blank item. That second
// arm is #1400's shape in the non-streaming task: a collapse-to-null that hands a caller a "successful"
// structured answer with nothing in it, which then gets written as if the model had said it.
//
// WHAT "MALFORMED" IS PER WIRE, and why it is not one fixture. The hosted wires take `structured` over a
// non-streaming `doGenerate`, so the malformed input is a truncated HTTP body (`{"choices": `) — the literal
// shape a socket cut mid-response produces. The agent-sdk wire has no HTTP body at all; its analogue is a
// `result` frame with NO `structured_output`, which is what the bundled runtime produces when its schema pass
// yields nothing. Same law, two renderings — the harness owns both.
//
// WHAT THESE PINS WOULD CATCH
//  · Remove `serializeStructured`'s `structuredOutput === undefined` throw in
//    `backends/agent-sdk/summarize.ts` and that wire resolves an item whose `text` is the string
//    `"undefined"` — a blank answer laundered into a record. Only this arm reds.
//  · Turn `backends/v4/batch.ts::runItem`'s catch into a swallow-and-return-empty and both hosted wires
//    resolve with zero items while every shape check in the tree still passes.
//  · Change the classification so a malformed body reports `retryable: true` and the ERROR-KIND table below
//    reds — a deterministic shape disagreement that is retried just re-buys the same refusal.
//
// THE KIND TABLE IS AN OBSERVATION, NOT AN APPLICABILITY ROSTER. Applicability is derived (`cellTest` +
// `WIRE_DEFS[wire].serves`); the table records WHICH typed kind each wire reaches, because the wires
// legitimately classify a malformed payload differently — the hosted pair sees a transport/parse failure, the
// agent-sdk wire sees a structurally-invalid RESPONSE it can name. Both are inside `PROVIDER_ERROR_KINDS` and
// both are non-retryable, which is the part that is actually a law.

import type { Wire } from "@orb/contracts/inference";
import { PROVIDER_ERROR_KINDS } from "../../../packages/inference/src/contract/errors.ts";
import { expect, test } from "../../support/fixtures.ts";
import { CONFORMANCE_WIRES, cellTest, driveStructuredMalformed, settledProviderError } from "./_harness.ts";

for (const wire of CONFORMANCE_WIRES) {
  cellTest(wire, "structured", "a malformed structured payload is a typed ProviderError, never an empty success (#1400)", async () => {
    const { error, value } = await settledProviderError(() => driveStructuredMalformed(wire));

    // The RESOLUTION assertion is the load-bearing one. A `.rejects.toThrow()` would accept any rejection and
    // say nothing about the arm that actually ships a blank answer as canon.
    expect(value, "resolved a malformed structured payload instead of failing closed").toBeUndefined();
    expect(error, "a malformed structured payload must reach the caller as ProviderError").not.toBeNull();
    expect(PROVIDER_ERROR_KINDS, "the failure kind is inside the closed vocabulary").toContain(error?.kind);
    // A shape disagreement is deterministic: a retry re-buys the identical refusal, so it is never retryable.
    expect(error?.retryable, "a malformed structured payload is not retryable").toBe(false);
    expect(error?.message.length, "the failure names itself for an operator").toBeGreaterThan(0);
  });
}

cellTest("agent-sdk", "structured", "the missing structured_output frame is named, not collapsed to a blank item", async () => {
  const { error } = await settledProviderError(() => driveStructuredMalformed("agent-sdk"));
  // The agent-sdk wire is the one that can tell "the turn succeeded but produced no structured frame" apart
  // from "the transport broke", and it must say so rather than serialise `undefined` into the item's text.
  expect(error?.kind, "a turn with no structured_output frame is a structurally-invalid RESPONSE").toBe("invalid");
  expect(error?.message, "the operator-facing message names the missing frame").toContain("structured_output");
});

test("the structured-failure kinds each wire reaches — a drifting classification reds here", async () => {
  const observed: Partial<Record<Wire, string>> = {};
  for (const wire of CONFORMANCE_WIRES) {
    const { error } = await settledProviderError(() => driveStructuredMalformed(wire));
    observed[wire] = error?.kind ?? "RESOLVED";
  }
  expect(observed).toEqual({
    // The hosted pair: the SDK's own parse of a truncated body fails before any content exists, and that
    // surfaces through `providerErrorFromHttp`'s transport-name fallback.
    "openai-compat": "unknown",
    "anthropic-messages": "unknown",
    // The subscription wire reduced a complete, successful turn that simply carried no schema frame.
    "agent-sdk": "invalid",
    // `WIRE_DEFS["local-light"].serves` has no `structured`; the dispatcher's typed refusal is the answer.
    "local-light": "invalid",
  });
});
