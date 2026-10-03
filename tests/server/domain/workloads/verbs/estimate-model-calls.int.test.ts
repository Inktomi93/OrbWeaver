// Verb test: estimateModelCalls — the size of a run before a person confirms it. It must count over the SAME
// scope `start` would enqueue under (singular = the caller's library, bulk = every owner, owner-only), ask the
// owning domain, and answer `null` for a kind that calls no generative model.

import { DomainForbiddenError, DomainOperationError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { WorkloadContributions } from "@orb/server/domain/workloads";
import { describe, vi } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { fakeContributions, makeService, principal, seedUser } from "../_support.ts";

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
