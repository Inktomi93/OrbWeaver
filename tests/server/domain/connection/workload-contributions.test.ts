// Contribution test: `refresh-model-catalog`. Pins the best-effort FAN-OUT the ownership move brought into
// the domain (it used to live at the entry tier, in compose/runner-env.ts): both catalog lanes run under
// allSettled, a failed lane reports `null` (≠ 0, a real empty catalog), and the run only throws when BOTH fail.

import type { WorkloadRunContext } from "@orb/contracts/workloads";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, vi } from "vitest";
import type { ConnectionWorkloadDeps } from "../../../../packages/server/src/domain/connection/contract/service.ts";
import { createConnectionWorkloadContributions } from "../../../../packages/server/src/domain/connection/workload-contributions.ts";
import { expect, test } from "../../../support/fixtures.ts";

const T0 = 1_700_000_000_000;
// A catalog refresh is deployment-wide (bulk-only): the row carries no owner.
const ctx: WorkloadRunContext = { userId: castId<UserId>("system"), ownerId: null, now: () => T0 };
const sig = (): AbortSignal => new AbortController().signal;

function build(connection: Partial<ConnectionWorkloadDeps["connection"]> = {}): ReturnType<typeof createConnectionWorkloadContributions>[0] {
  const [contribution] = createConnectionWorkloadContributions({
    // The fan-out reads ONLY `.models.length` off each catalog snapshot — the per-model entry shape never
    // @orb-waive no-test-fabrication(unknown): enters the contribution, so a full snapshot factory would state more than is tested. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    connection: {
      refreshCatalog: vi.fn(async () => ({ models: Array.from({ length: 99 }, () => ({})) })),
      refreshAgentSdkCatalog: vi.fn(async () => ({ models: [{}, {}, {}] })),
      ...connection,
    } as unknown as ConnectionWorkloadDeps["connection"],
  });
  return contribution;
}

describe("refresh-model-catalog contribution", () => {
  test("refreshes both catalogs and projects the two counts", async () => {
    const result = await build().run(ctx, {}, vi.fn(), sig());
    expect(result).toEqual({ models: 99, agentSdkModels: 3 });
  });

  test("a failed lane reports null and does NOT discard the other lane's refresh (null ≠ 0)", async () => {
    // A deliberately REJECTING lane: the failure path is exactly what is under test.
    const contribution = build({
      // @orb-waive no-test-fabrication(unknown): a deliberately REJECTING lane — the failure path is exactly what is under test. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
      refreshAgentSdkCatalog: vi.fn(() =>
        Promise.reject(new Error("daemon down")),
      ) as unknown as ConnectionWorkloadDeps["connection"]["refreshAgentSdkCatalog"],
    });
    const result = await contribution.run(ctx, {}, vi.fn(), sig());
    expect(result).toEqual({ models: 99, agentSdkModels: null });
  });

  test("BOTH lanes failing fails the run (the row is a real failure, not a silent empty refresh)", async () => {
    const reject = (): Promise<never> => Promise.reject(new Error("offline"));
    // Two deliberately REJECTING lanes: the both-failed path is exactly what is under test.
    const contribution = build({
      // @orb-waive no-test-fabrication(unknown): two deliberately REJECTING lanes — the both-failed path is exactly under test. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
      refreshCatalog: reject as unknown as ConnectionWorkloadDeps["connection"]["refreshCatalog"],
      // @orb-waive no-test-fabrication(unknown): see above. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
      refreshAgentSdkCatalog: reject as unknown as ConnectionWorkloadDeps["connection"]["refreshAgentSdkCatalog"],
    });
    await expect(contribution.run(ctx, {}, vi.fn(), sig())).rejects.toThrow("offline");
  });

  test("declares the sweep lane + idempotent-restart resume policy", () => {
    const contribution = build();
    expect(contribution.kind).toBe("refresh-model-catalog");
    expect(contribution.lane).toBe("sweep");
    expect(contribution.resume).toBe("idempotent-restart");
  });
});
