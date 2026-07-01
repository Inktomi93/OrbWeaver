// Runner test: reconcile-world-state — the v2 reserved-kind no-op stub. Returns a DeferredResult so the
// reserved kind keeps RUNNERS / exhaustive-dispatch green without shipping a half-built feature.

import { describe, vi } from "vitest";
import { reconcileWorldStateRunner } from "../../../../../packages/server/src/domain/workloads/runners/reconcile-world-state.ts";
import { expect, test } from "../../../../support/fixtures";
import { fakeEnv, makeRunnerContext } from "../_support.ts";

describe("reconcile-world-state runner (v2 stub)", () => {
  test("is a no-op returning deferred", async () => {
    const result = await reconcileWorldStateRunner(
      makeRunnerContext(fakeEnv()),
      {},
      vi.fn(),
      new AbortController().signal,
    );
    expect(result).toEqual({ deferred: true });
  });
});
