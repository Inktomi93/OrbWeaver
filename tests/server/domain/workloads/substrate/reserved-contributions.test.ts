// The RESERVED kinds — registered in the tuple with no owning domain yet, so workloads carries them (they
// carry zero domain knowledge, which is what makes that legal). `reconcile-world-state` is v2 (FLAG[PD-18],
// Knowledge-Cluster.md §9): an inert no-op whose `{ deferred: true }` result is how a caller tells
// "reserved, not built" apart from "ran, changed nothing".

import type { WorkloadRunContext } from "@orb/contracts/workloads";
import { WORKLOAD_KIND_MODES } from "@orb/contracts/workloads";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, vi } from "vitest";
import { createReservedWorkloadContributions } from "../../../../../packages/server/src/domain/workloads/substrate/reserved-contributions.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const T0 = 1_700_000_000_000;
const ctx: WorkloadRunContext = { userId: castId<UserId>("system"), ownerId: null, now: () => T0 };

describe("reconcile-world-state (reserved)", () => {
  test("is inert: it reports, mutates nothing, and returns the deferred sentinel", async () => {
    const [contribution] = createReservedWorkloadContributions();
    const report = vi.fn();
    const result = await contribution.run(ctx, {}, report, new AbortController().signal);
    expect(result).toEqual({ deferred: true });
    expect(report).toHaveBeenCalledTimes(1);
  });

  test("stays hidden from the run UI via its stub mode policy (the flip rides the real body's change)", () => {
    expect(WORKLOAD_KIND_MODES["reconcile-world-state"].stub).toBe(true);
  });

  test("every reserved kind is a real registered kind with a sweep lane", () => {
    for (const contribution of createReservedWorkloadContributions()) {
      expect(WORKLOAD_KIND_MODES[contribution.kind]).toBeDefined();
      expect(contribution.lane).toBe("sweep");
    }
  });
});
