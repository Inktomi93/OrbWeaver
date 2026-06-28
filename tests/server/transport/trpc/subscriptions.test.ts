// The SSE subscription typed-error wrapper, end-to-end through `workloads.subscribe` (tiers/transport.md
// §D2 / Esoteric #5). A subscription generator bypasses the domain-error middleware, so a thrown
// DomainError (here, the `workloads.get` existence check) must surface as a typed terminal frame — never a
// raw 500. Driven through the real ladder via `createCaller` (admin-gated; no @trpc import needed).

import { DomainNotFoundError } from "@orb/kit/errors";
import type { WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { WorkloadService } from "@orb/server/domain/workloads";
import { describe, expect, test, vi } from "vitest";
import { caller, makeContext, principal } from "./_support.ts";

/** Unwrap a yielded subscription value — `tracked()` yields `[id, data, symbol]`; data is at index 1. */
function dataOf(yielded: unknown): Record<string, unknown> {
  const value = Array.isArray(yielded) ? yielded[1] : yielded;
  return value as Record<string, unknown>;
}

describe("workloads.subscribe — the SSE typed-error wrapper", () => {
  test("a thrown DomainError surfaces as a typed terminal frame, not a 500", async () => {
    const get = vi.fn<WorkloadService["get"]>(() => {
      throw new DomainNotFoundError("Workload", "workload_missing");
    });
    const ctx = makeContext({ auth: principal("admin"), services: { workloads: { get } } });

    const sub = await caller(ctx).workloads.subscribe({
      workloadId: castId<WorkloadId>("workload_missing"),
    });
    const iterator = sub[Symbol.asyncIterator]();
    const first = await iterator.next();
    await iterator.return?.(undefined);

    expect(first.done).toBe(false);
    const frame = dataOf(first.value);
    expect(frame["__subscriptionError"]).toBe(true);
    expect(frame["code"]).toBe("NOT_FOUND");
  });
});
