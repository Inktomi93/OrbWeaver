// Contribution test: chat's two corpus sweeps. `memory-backfill` (PD-41) folds the segment/digest counts
// and, PD-139(b), reclaims the OLD chat-memory embed space via the INJECTED purge op after a BULK
// (ownerId===null) sweep — but never on a singular pass and never on an aborted run (the space must stay a
// strict superset, never a gap). `group-character-backfill` (PD-41/D38) projects its mint counts.

import type { WorkloadRunContext } from "@orb/contracts/workloads";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, vi } from "vitest";
import type { ChatWorkloadDeps } from "../../../../packages/server/src/domain/chat/contract/workloads.ts";
import { createChatWorkloadContributions } from "../../../../packages/server/src/domain/chat/workload-contributions.ts";
import { expect, test } from "../../../support/fixtures";

const OWNER_ID = castId<UserId>("user_owner");
const T0 = 1_700_000_000_000;
const ctx: WorkloadRunContext = { userId: OWNER_ID, ownerId: OWNER_ID, now: () => T0 };
const bulkCtx: WorkloadRunContext = { ...ctx, ownerId: null };
const sig = (): AbortSignal => new AbortController().signal;

function build(): { readonly deps: ChatWorkloadDeps; readonly contributions: ReturnType<typeof createChatWorkloadContributions> } {
  const deps: ChatWorkloadDeps = {
    backfillMemory: vi.fn(async () => ({ segments: { scanned: 4, changed: 2 }, digests: { scanned: 6, changed: 3 }, failed: 0 })),
    backfillGroupCharacters: vi.fn(async () => ({ scanned: 5, changed: 1 })),
    purgeMemoryVectors: vi.fn(async () => undefined),
  };
  return { deps, contributions: createChatWorkloadContributions(deps) };
}

describe("memory-backfill", () => {
  test("runs the corpus sweep with the enumeration scope and returns its folded counts", async () => {
    const { deps, contributions } = build();
    const result = await contributions[0].run(ctx, {}, vi.fn(), sig());
    expect(deps.backfillMemory).toHaveBeenCalledWith({ ownerId: OWNER_ID, signal: expect.any(AbortSignal) });
    expect(result).toEqual({ segments: { scanned: 4, changed: 2 }, digests: { scanned: 6, changed: 3 }, failed: 0 });
  });

  test("a BULK run (ownerId===null) reclaims the old chat-memory space after the sweep", async () => {
    const { deps, contributions } = build();
    await contributions[0].run(bulkCtx, {}, vi.fn(), sig());
    expect(deps.backfillMemory).toHaveBeenCalledWith({ ownerId: null, signal: expect.any(AbortSignal) });
    expect(deps.purgeMemoryVectors).toHaveBeenCalledTimes(1);
  });

  test("a SINGULAR per-owner run does NOT purge (a model change is box-level)", async () => {
    const { deps, contributions } = build();
    await contributions[0].run(ctx, {}, vi.fn(), sig());
    expect(deps.purgeMemoryVectors).not.toHaveBeenCalled();
  });

  test("an aborted BULK run does NOT purge (the space stays a strict superset)", async () => {
    const { deps, contributions } = build();
    const controller = new AbortController();
    controller.abort();
    await contributions[0].run(bulkCtx, {}, vi.fn(), controller.signal);
    expect(deps.purgeMemoryVectors).not.toHaveBeenCalled();
  });
});

describe("group-character-backfill", () => {
  test("sweeps group rooms with the enumeration scope and projects the mint counts", async () => {
    const { deps, contributions } = build();
    const result = await contributions[1].run(ctx, {}, vi.fn(), sig());
    expect(deps.backfillGroupCharacters).toHaveBeenCalledWith({ ownerId: OWNER_ID, signal: expect.any(AbortSignal) });
    expect(result).toEqual({ scanned: 5, changed: 1 });
  });
});

describe("the contribution set", () => {
  test("contributes exactly chat's two sweep kinds, both sweep-lane + idempotent-restart", () => {
    const { contributions } = build();
    expect(contributions.map((contribution) => contribution.kind)).toEqual(["memory-backfill", "group-character-backfill"]);
    for (const contribution of contributions) {
      expect(contribution.lane).toBe("sweep");
      expect(contribution.resume).toBe("idempotent-restart");
    }
  });
});
