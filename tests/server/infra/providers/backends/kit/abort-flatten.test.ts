// backends/kit/abort-flatten — the reason-flattening primitive: a caller's cancellation propagates, its
// REASON does not. The defect this exists against (STRUCTURED-ABORT-REASON-LEAK) is proved end-to-end at the
// dispatch seam (`tests/server/infra/providers/roles/dispatch.test.ts`); this is the unit surface —
// propagation, already-aborted, the reason drop, and the detach that keeps a long-lived caller signal from
// accumulating a listener per provider call.

import { flattenAbortSignal, foldAbortInto } from "@orb/server/infra/providers/backends/kit";
import { describe } from "vitest";
import { expect, test } from "../../../../../support/fixtures.ts";

const HOSTILE_REASON = new Error("connection timeout waiting for the user");

describe("flattenAbortSignal", () => {
  test("propagates the cancellation but NOT the reason (the whole point)", () => {
    const caller = new AbortController();
    const { signal } = flattenAbortSignal(caller.signal);

    expect(signal).not.toBe(caller.signal);
    expect(signal.aborted).toBe(false);
    caller.abort(HOSTILE_REASON);

    expect(signal.aborted).toBe(true);
    expect(signal.reason).not.toBe(HOSTILE_REASON);
    // A plain AbortError — what `classifyTransportName` must see for a cancellation to stay non-retryable.
    expect(Error.isError(signal.reason) ? signal.reason.name : "").toBe("AbortError");
  });

  test("an already-aborted caller flattens synchronously (the call never reaches the wire)", () => {
    const caller = new AbortController();
    caller.abort(HOSTILE_REASON);
    const { signal } = flattenAbortSignal(caller.signal);

    expect(signal.aborted).toBe(true);
    expect(signal.reason).not.toBe(HOSTILE_REASON);
  });

  test("dispose() detaches, so a caller signal that outlives the call stops driving it", () => {
    const caller = new AbortController();
    const { signal, dispose } = flattenAbortSignal(caller.signal);

    dispose();
    caller.abort(HOSTILE_REASON);

    // The call had already settled — a later cancel of the caller's own (turn-scoped) signal is not ours.
    expect(signal.aborted).toBe(false);
  });
});

describe("foldAbortInto", () => {
  test("folds into a caller-owned controller, and an undefined external is a no-op", () => {
    const controller = new AbortController();
    const detach = foldAbortInto(controller, undefined);
    detach();
    expect(controller.signal.aborted).toBe(false);

    const external = new AbortController();
    const folded = new AbortController();
    foldAbortInto(folded, external.signal);
    external.abort(HOSTILE_REASON);
    expect(folded.signal.aborted).toBe(true);
    expect(folded.signal.reason).not.toBe(HOSTILE_REASON);
  });

  test("the controller keeps its OWN abort authority (the idle-timer arm)", () => {
    const external = new AbortController();
    const controller = new AbortController();
    foldAbortInto(controller, external.signal);

    controller.abort();
    expect(controller.signal.aborted).toBe(true);
    // Folding is one-directional: our abort never cancels the caller's turn.
    expect(external.signal.aborted).toBe(false);
  });
});
