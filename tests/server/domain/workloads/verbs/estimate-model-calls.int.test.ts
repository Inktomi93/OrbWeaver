// Verb test: estimateModelCalls — the size of a run before a person confirms it. It must count over the SAME
// scope `start` would enqueue under (singular = the caller's library, bulk = every owner, owner-only), ask the
// owning domain, and answer `null` for a kind that calls no generative model.

import { DomainForbiddenError, DomainNotFoundError, DomainOperationError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { WorkloadContributions } from "@orb/server/domain/workloads";
import { describe, vi } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { fakeContributions, makeService, principal, seedUser, seedWorkloadRow } from "../_support.ts";

const SINGULAR_CALLS = 4;
const BULK_CALLS = 9;

/** The registry with a distill estimator that answers by scope, so a test can read which scope it was asked. */
function withDistillEstimate(): { readonly contributions: WorkloadContributions; readonly modelCalls: ReturnType<typeof vi.fn> } {
  const base = fakeContributions();
  const modelCalls = vi.fn(async ({ ownerId }: { readonly ownerId: UserId | null }) => (ownerId === null ? BULK_CALLS : SINGULAR_CALLS));
  return { contributions: { ...base, "distill-characters": { ...base["distill-characters"], modelCalls } }, modelCalls };
}

describe("workloads.estimateModelCalls", () => {
  test("a singular estimate counts the caller's own library, funded by the caller", async () => {
    const db = await freshDb();
    await seedUser(db, "user_alice");
    const { contributions, modelCalls } = withDistillEstimate();
    const s = makeService(db, contributions);

    const estimate = await s.estimateModelCalls({ input: { kind: "distill-characters", params: {} }, caller: principal("user_alice"), mode: "singular" });

    expect(estimate).toEqual({ calls: SINGULAR_CALLS });
    expect(modelCalls).toHaveBeenCalledWith({ ownerId: castId<UserId>("user_alice"), funderUserId: castId<UserId>("user_alice"), params: {} });
  });

  test("a kind that calls no generative model answers null, never zero", async () => {
    const db = await freshDb();
    await seedUser(db, "user_alice");
    const s = makeService(db, withDistillEstimate().contributions);

    await expect(s.estimateModelCalls({ input: { kind: "reconcile-stats", params: {} }, caller: principal("user_alice"), mode: "singular" })).resolves.toEqual({
      calls: null,
    });
  });

  test("a bulk estimate is the box owner's alone and counts every owner", async () => {
    const db = await freshDb();
    await seedUser(db, "user_alice");
    await seedUser(db, "user_box", "owner");
    const { contributions, modelCalls } = withDistillEstimate();
    const s = makeService(db, contributions);
    const input = { kind: "distill-characters", params: {} } as const;

    await expect(s.estimateModelCalls({ input, caller: principal("user_alice"), mode: "bulk" })).rejects.toBeInstanceOf(DomainForbiddenError);
    expect(modelCalls).not.toHaveBeenCalled();
    await expect(s.estimateModelCalls({ input, caller: principal("user_box", "owner"), mode: "bulk" })).resolves.toEqual({ calls: BULK_CALLS });
  });

  test("a retry estimate counts the ROW's owner and params, not the caller's scope", async () => {
    const db = await freshDb();
    await seedUser(db, "user_alice");
    await seedUser(db, "user_box", "owner");
    const { contributions, modelCalls } = withDistillEstimate();
    const s = makeService(db, contributions);
    const alice = castId<UserId>("user_alice");
    const id = await seedWorkloadRow(db, { id: "workload_alice", kind: "distill-characters", status: "failed", ownerId: alice });

    // The box owner retries Alice's run: the clone re-runs Alice's library on Alice's model.
    await expect(s.estimateRetryModelCalls({ id, caller: principal("user_box", "owner") })).resolves.toEqual({ calls: SINGULAR_CALLS });
    expect(modelCalls).toHaveBeenCalledWith({ ownerId: alice, funderUserId: alice, params: {} });
  });

  test("a retry estimate keeps retry's gates: a stranger's id is leak-free NOT_FOUND, a bulk row is the box owner's", async () => {
    const db = await freshDb();
    await seedUser(db, "user_alice");
    await seedUser(db, "user_bob");
    await seedUser(db, "user_box", "owner");
    const { contributions, modelCalls } = withDistillEstimate();
    const s = makeService(db, contributions);
    const mine = await seedWorkloadRow(db, { id: "workload_alice", kind: "distill-characters", status: "failed", ownerId: castId<UserId>("user_alice") });
    const bulk = await seedWorkloadRow(db, { id: "workload_bulk", kind: "distill-characters", status: "failed", mode: "bulk" });

    await expect(s.estimateRetryModelCalls({ id: mine, caller: principal("user_bob") })).rejects.toBeInstanceOf(DomainNotFoundError);
    await expect(s.estimateRetryModelCalls({ id: bulk, caller: principal("user_alice") })).rejects.toBeInstanceOf(DomainNotFoundError);
    expect(modelCalls).not.toHaveBeenCalled();
    // The bulk sweep has no owner, so the box owner retrying it is the funder, as `start` counts a bulk run.
    await expect(s.estimateRetryModelCalls({ id: bulk, caller: principal("user_box", "owner") })).resolves.toEqual({ calls: BULK_CALLS });
    expect(modelCalls).toHaveBeenCalledWith({ ownerId: null, funderUserId: castId<UserId>("user_box"), params: {} });
  });

  test("a retry estimate of a POISON row answers null: there are no params to count", async () => {
    const db = await freshDb();
    await seedUser(db, "user_alice");
    // The poisoned kind has an estimator, so only the poison branch keeps it from being asked.
    const base = fakeContributions();
    const modelCalls = vi.fn(async () => SINGULAR_CALLS);
    const s = makeService(db, { ...base, "compute-themes": { ...base["compute-themes"], modelCalls } });
    const id = await seedWorkloadRow(db, {
      id: "workload_poison",
      kind: "compute-themes",
      status: "failed",
      ownerId: castId<UserId>("user_alice"),
      params: { k: -5 },
    });

    await expect(s.estimateRetryModelCalls({ id, caller: principal("user_alice") })).resolves.toEqual({ calls: null });
    expect(modelCalls).not.toHaveBeenCalled();
  });

  test("a mode the kind does not support is refused before any count", async () => {
    const db = await freshDb();
    await seedUser(db, "user_alice");
    const { contributions, modelCalls } = withDistillEstimate();
    const s = makeService(db, contributions);

    await expect(
      s.estimateModelCalls({ input: { kind: "refresh-model-catalog", params: {} }, caller: principal("user_alice"), mode: "singular" }),
    ).rejects.toBeInstanceOf(DomainOperationError);
    expect(modelCalls).not.toHaveBeenCalled();
  });
});
