// @subject packages/inference/src/roles/side-gen.ts
// @subject packages/inference/src/backends/agent-sdk/runner.ts
import type { Wire } from "@orb/contracts/inference";
import { PROVIDER_ERROR_KINDS } from "@orb/inference";
import { expect, test } from "@orb/testkit/node";

import { CONFORMANCE_WIRES, cellTest, driveStructuredMalformed, settledProviderError } from "./runtime.fixtures.ts";

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
    // The hosted wires: the SDK's own parse of a truncated event fails before any content exists, and that
    // surfaces through `providerErrorFromHttp`'s transport-name fallback.
    "openai-compat": "unknown",
    "anthropic-messages": "unknown",
    "google-generative-ai": "unknown",
    // The subscription wire reduced a complete, successful turn that simply carried no schema frame.
    "agent-sdk": "invalid",
    // The production resolver refuses the unserved task before any executable request exists.
    "local-light": "forbidden",
  });
});
