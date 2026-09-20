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
import { expect, test } from "../../../support/fixtures.ts";

const OWNER_ID = castId<UserId>("user_owner");
const T0 = 1_700_000_000_000;
const ctx: WorkloadRunContext = { userId: OWNER_ID, ownerId: OWNER_ID, now: () => T0 };
const bulkCtx: WorkloadRunContext = { ...ctx, ownerId: null };
const sig = (): AbortSignal => new AbortController().signal;
const FAILED_CHATS_RE = /7 chat/;

function build(
  failed = 0,
  segmentsSkippedOverWindow = 0,
  memoryEnabled = true,
): { readonly deps: ChatWorkloadDeps; readonly contributions: ReturnType<typeof createChatWorkloadContributions> } {
  const deps: ChatWorkloadDeps = {
    backfillMemory: vi.fn(async () => ({ segments: { scanned: 4, changed: 2 }, digests: { scanned: 6, changed: 3 }, segmentsSkippedOverWindow, failed })),
    backfillGroupCharacters: vi.fn(async () => ({ scanned: 5, changed: 1 })),
    purgeMemoryVectors: vi.fn(async () => undefined),
    isMemoryEnabled: vi.fn(async () => memoryEnabled),
  };
  return { deps, contributions: createChatWorkloadContributions(deps) };
}

describe("memory-backfill", () => {
  test("runs the corpus sweep with the enumeration scope and returns its folded counts", async () => {
    const { deps, contributions } = build();
    const result = await contributions[0].run(ctx, {}, vi.fn(), sig());
    expect(deps.backfillMemory).toHaveBeenCalledWith({ funderUserId: OWNER_ID, ownerId: OWNER_ID, signal: expect.any(AbortSignal) });
    expect(result).toEqual({ segments: { scanned: 4, changed: 2 }, digests: { scanned: 6, changed: 3 }, segmentsSkippedOverWindow: 0, failed: 0 });
  });

  test("a BULK run (ownerId===null) reclaims the old chat-memory space after the sweep", async () => {
    const { deps, contributions } = build();
    await contributions[0].run(bulkCtx, {}, vi.fn(), sig());
    expect(deps.backfillMemory).toHaveBeenCalledWith({ funderUserId: OWNER_ID, ownerId: null, signal: expect.any(AbortSignal) });
    expect(deps.purgeMemoryVectors).toHaveBeenCalledTimes(1);
  });

  test("a SINGULAR per-owner run does NOT purge (a model change is box-level)", async () => {
    const { deps, contributions } = build();
    await contributions[0].run(ctx, {}, vi.fn(), sig());
    expect(deps.purgeMemoryVectors).not.toHaveBeenCalled();
  });

  // #165/#156 (the vacuous-success family): the 895-chat run that skipped every chat on an embed timeout
  // still landed `succeeded` because the sweep RETURNS its failure tally instead of failing on it. A skip is
  // a chat whose memory silently did not build — the row must read FAILED, and the progress copy already
  // names the count, so the throw carries it too.
  test("a sweep with per-chat failures FAILS the workload (a skipped-with-error run must never read as success)", async () => {
    const { contributions } = build(7);
    const report = vi.fn();
    await expect(contributions[0].run(ctx, {}, report, sig())).rejects.toThrow(FAILED_CHATS_RE);
    // The progress line still landed first, so the Jobs row keeps the full counts next to the failure.
    expect(report).toHaveBeenCalledWith({ message: expect.stringContaining("7 chats FAILED") });
  });

  // C4 (side-eye corpus re-pass): this sentence is read by a person — in the Jobs row and on the corpus
  // readiness rail, which quotes `pass.failure` verbatim. It shipped as "1 chat FAILED during the sweep and
  // were skipped": a plural verb on a singular count, in a shout the surrounding copy never uses.
  test("the failure sentence AGREES WITH ITS OWN COUNT on the singular arm, and does not shout", async () => {
    const { contributions } = build(1);
    const error = await contributions[0].run(ctx, {}, vi.fn(), sig()).catch((e: unknown) => e);
    const message = error instanceof Error ? error.message : String(error);
    expect(message).toContain("1 chat failed and was skipped");
    expect(message, "no plural verb on a count of one").not.toContain("were skipped");
    expect(message, "FAILED in caps is a shout this copy does not otherwise use").not.toContain("FAILED");
  });

  test("…and the plural arm agrees too", async () => {
    const { contributions } = build(3);
    const error = await contributions[0].run(ctx, {}, vi.fn(), sig()).catch((e: unknown) => e);
    expect(error instanceof Error ? error.message : String(error)).toContain("3 chats failed and were skipped");
  });

  // The owner ruling's visibility half (#165): blocks skipped for being too big are a RECORDED gap, so the
  // Jobs row copy has to say so — and say it did NOT truncate them.
  test("the progress copy NAMES blocks skipped for exceeding the embed window (recorded, not truncated)", async () => {
    const { contributions } = build(0, 3);
    const report = vi.fn();
    await contributions[0].run(ctx, {}, report, sig());
    expect(report).toHaveBeenLastCalledWith({
      message: expect.stringContaining("3 blocks TOO LARGE EVEN TO CHUNK for the embed model (skipped whole, NOT truncated"),
    });
  });

  test("a BULK sweep with failures does NOT purge the old embed space (the corpus was not fully re-derived)", async () => {
    const { deps, contributions } = build(7);
    await expect(contributions[0].run(bulkCtx, {}, vi.fn(), sig())).rejects.toThrow();
    expect(deps.purgeMemoryVectors).not.toHaveBeenCalled();
  });

  // #156 (the vacuous-run family's ADMISSION half, owner-observed): an ST import auto-enqueued this sweep
  // while memory was DISABLED, the sweep skipped every one of that host's chats (the D36 opt-out, honored on
  // the corpus sweep since #54), and the Jobs row read "0 segments · 0 digests" as a SUCCESS. The refusal is
  // at ADMISSION, so no row exists to read.
  test("REFUSES admission for a singular run whose owner has memory off, naming the reason and the remedy", async () => {
    const { deps, contributions } = build(0, 0, false);
    const refusal = await contributions[0].admit?.({ ownerId: OWNER_ID, params: {} });
    expect(deps.isMemoryEnabled).toHaveBeenCalledWith(OWNER_ID);
    expect(refusal, "a refusal must be a sentence the person who hit it can act on").toContain("Memory is turned off");
    expect(refusal).toContain("enable Memory in Settings");
  });

  test("ADMITS a singular run whose owner has memory on", async () => {
    const { contributions } = build();
    expect(await contributions[0].admit?.({ ownerId: OWNER_ID, params: {} })).toBeNull();
  });

  // A bulk pass sweeps EVERY host, so one host's opt-out says nothing about the box — the per-host skip is
  // the right instrument there, and refusing the whole pass would strand every enabled host.
  test("ADMITS the BULK all-owners pass even with memory off, without asking about any single host", async () => {
    const { deps, contributions } = build(0, 0, false);
    expect(await contributions[0].admit?.({ ownerId: null, params: {} })).toBeNull();
    expect(deps.isMemoryEnabled).not.toHaveBeenCalled();
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
    expect(deps.backfillGroupCharacters).toHaveBeenCalledWith({ funderUserId: OWNER_ID, ownerId: OWNER_ID, signal: expect.any(AbortSignal) });
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
