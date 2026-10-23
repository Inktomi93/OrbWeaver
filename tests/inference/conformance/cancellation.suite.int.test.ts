// @subject packages/inference/src/registry/dispatch.ts
// @subject packages/inference/src/backends/http/abort-flatten.ts
import { expect, test } from "@orb/testkit/node";

import { CONFORMANCE_WIRES, cancellationTaskFor, driveCancellable, settledProviderError } from "./runtime.fixtures.ts";

const POISONED_REASON = new DOMException("connection timeout: the network overload handler cancelled", "TimeoutError");

const POISON_WORDS = ["connection", "timeout", "overload", "network"] as const;

for (const wire of CONFORMANCE_WIRES) {
  const task = cancellationTaskFor(wire);
  // Not a `cellTest`: cancellation binds every wire, and `cancellationTaskFor` throws rather than skips if a
  // wire has no drivable task at all — an unprobeable wire must be a failure, never an absent row.
  test(`${wire} — an abort is the flattened abort outcome on its ${task} task, and the caller's reason never leaks`, async () => {
    const controller = new AbortController();
    controller.abort(POISONED_REASON);
    const { error, value } = await settledProviderError(() => driveCancellable(wire, controller.signal));

    expect(value, "a cancelled call resolved instead of aborting").toBeUndefined();
    expect(error?.kind, "cancellation kind").toBe("aborted");
    expect(error?.retryable, "an abort is never retryable — a retry re-buys the cancelled work").toBe(false);
    const message = error?.message ?? "";
    for (const word of POISON_WORDS) {
      expect(message.toLowerCase(), `the caller's abort reason leaked "${word}" into the provider error`).not.toContain(word);
    }
  });
}

test("the cancellation matrix covers every wire — no wire is excused from the one law that binds all of them", () => {
  // The positive control on the matrix itself: a silent shortfall here would make every arm above pass while
  // covering less than it claims, which is the vacuity this suite exists to make impossible.
  expect(CONFORMANCE_WIRES.map((wire) => `${wire}:${cancellationTaskFor(wire)}`)).toEqual([
    "openai-compat:chat",
    "anthropic-messages:chat",
    "google-generative-ai:chat",
    "agent-sdk:chat",
    "local-light:embed",
  ]);
});
