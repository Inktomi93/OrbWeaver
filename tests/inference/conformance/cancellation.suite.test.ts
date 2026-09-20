// CONFORMANCE — CANCELLATION. An abort must reach EVERY wire as the flattened abort outcome: a typed
// `ProviderError{kind:"aborted", retryable:false}` whose message carries none of the caller's abort reason.
// This is the one law that binds all four wires, so it is probed on whichever task each wire actually
// serves (`cancellationTaskFor` derives it — chat on the three generation wires, `embed` on local-light),
// never skipped for the wire that happens not to serve chat.
//
// THE REASON IS THE POINT, not merely the kind. `backends/kit/abort-flatten.ts` exists because
// `AbortSignal.any([caller, ours])` PROPAGATES the caller's `reason`, a signal handed to `fetch` makes that
// reason the fetch rejection, and `classifyTransportName` decides `aborted` vs retryable-`server` by
// matching /timeout|connection|network|overload/ over an error's name+message. So a cancellation whose reason
// merely CONTAINS one of those words classifies as a transient fault and gets RE-RUN — the exact opposite of
// cancelling, and it bills. The fold happens once, at `registry/dispatch.ts`'s `runTask`, which is why every
// arm here dispatches through the real executor rather than calling a backend method directly.
//
// WHAT THESE PINS WOULD CATCH
//  · Swap `flattenAbortSignal` for `AbortSignal.any` in `registry/dispatch.ts` and the two hosted wires red
//    on BOTH the kind (`server`, retryable) and the leak assertion — the poisoned words reach the message.
//  · Drop the `ABORT_NAME_RE` precedence in `backends/kit/error-classify.ts` (so the transient regex reads
//    the message first) and the same two red. Nothing else in the tree distinguishes those two orderings.
//  · Delete `throwIfAborted` from a `local-light` task and that wire reds while the others stay green —
//    which is the whole reason cancellation is probed per-wire instead of once.
//
// THE FAKE TRANSPORT HONOURS THE SIGNAL (`abortAware`). A fake `fetch` that ignores `init.signal` answers
// happily and the arm passes vacuously; `abortAware` rejects with `signal.reason` the way undici does, which
// is also what makes the leak observable at all.

import { expect, test } from "../../support/fixtures.ts";
import { CONFORMANCE_WIRES, cancellationTaskFor, driveCancellable, settledProviderError } from "./_harness.ts";

/** A caller abort reason built from the EXACT vocabulary the transport classifier treats as transient. If a
 *  wire lets this through, a deliberate cancellation is re-run as a retryable server fault. */
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
    "agent-sdk:chat",
    "local-light:embed",
  ]);
});
