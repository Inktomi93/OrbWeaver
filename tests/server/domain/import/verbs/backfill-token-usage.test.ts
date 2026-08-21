// Unit: the catch-up loop's CONTROL FLOW over injected rails (the `.int` sibling covers the real SQL).
// Two arms no db-backed test reaches cheaply: the PAGE_SIZE keyset recursion (it needs >500 candidates),
// and CANCELLATION — an abort mid-sweep must still settle the rollups for every owner already written,
// because a re-run is a read-only census and can never heal them.

import type { ImportedTokenUsageCandidate } from "@orb/contracts/chat";
import type { MessageVariantId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, vi } from "vitest";
import type { ImportTokenUsageBackfillDeps } from "../../../../../packages/server/src/domain/import/contract/workloads.ts";
import { createBackfillTokenUsage } from "../../../../../packages/server/src/domain/import/verbs/backfill-token-usage.ts";
import { expect, test } from "../../../../support/fixtures.ts";

/** The verb's own page size — mirrored here so the recursion arm is driven at its real boundary. */
const PAGE_SIZE = 500;
const OWNERS = [castId<UserId>("user_a"), castId<UserId>("user_b")] as const;

/** One unrecorded, estimate-bound candidate. Ids are zero-padded so lexical order IS keyset order. */
function candidate(n: number): ImportedTokenUsageCandidate {
  return {
    variantId: castId<MessageVariantId>(`variant_${String(n).padStart(5, "0")}`),
    ownerId: OWNERS[n % OWNERS.length] ?? OWNERS[0],
    role: "user",
    content: `row ${n}`,
    metadata: null,
    tokensIn: null,
    tokensOut: null,
    tokenProvenance: "unrecorded",
  };
}

/** An INPUT-AWARE reader stub: it honours `afterVariantId` + `limit` against a fixed corpus exactly as the
 *  real keyset query does, so a verb that ignored either would loop forever or drop rows instead of passing. */
function readerOver(corpus: readonly ImportedTokenUsageCandidate[]): ImportTokenUsageBackfillDeps["listTokenUsageCandidates"] {
  return ({ afterVariantId, limit }) => {
    const start = afterVariantId === null ? 0 : corpus.findIndex((c) => c.variantId === afterVariantId) + 1;
    return Promise.resolve(corpus.slice(start, start + limit));
  };
}

describe("createBackfillTokenUsage — paging", () => {
  test("a corpus larger than one page keyset-recurses until a short page ends the sweep", async () => {
    const corpus = Array.from({ length: PAGE_SIZE * 2 + 1 }, (_, i) => candidate(i));
    const listTokenUsageCandidates = vi.fn(readerOver(corpus));
    const reconcileImportStats = vi.fn(async () => undefined);
    const backfill = createBackfillTokenUsage({
      listTokenUsageCandidates,
      compareAndSetTokenUsage: () => Promise.resolve(true),
      reconcileImportStats,
    });

    const result = await backfill({ ownerId: null, dryRun: false, report: vi.fn(), signal: new AbortController().signal });

    expect(result).toMatchObject({ scanned: corpus.length, estimated: corpus.length, ownersScanned: OWNERS.length, ownersReconciled: OWNERS.length });
    // THE RECURSION: three reads — two full pages that each re-enter, then the short page that stops it.
    expect(listTokenUsageCandidates.mock.calls.map((c) => c[0]?.afterVariantId)).toEqual([
      null,
      corpus[PAGE_SIZE - 1]?.variantId,
      corpus[PAGE_SIZE * 2 - 1]?.variantId,
    ]);
    expect(reconcileImportStats).toHaveBeenCalledTimes(OWNERS.length);
  });

  test("a corpus that ends EXACTLY on a page boundary still stops (the empty follow-up page)", async () => {
    const corpus = Array.from({ length: PAGE_SIZE }, (_, i) => candidate(i));
    const listTokenUsageCandidates = vi.fn(readerOver(corpus));
    const backfill = createBackfillTokenUsage({
      listTokenUsageCandidates,
      compareAndSetTokenUsage: () => Promise.resolve(true),
      reconcileImportStats: async () => undefined,
    });

    const result = await backfill({ ownerId: null, dryRun: false, report: vi.fn(), signal: new AbortController().signal });

    expect(result).toMatchObject({ scanned: PAGE_SIZE });
    expect(listTokenUsageCandidates).toHaveBeenCalledTimes(2);
  });
});

describe("createBackfillTokenUsage — cancellation", () => {
  test("an abort mid-sweep still reconciles every owner already WRITTEN (a re-run cannot heal them)", async () => {
    const corpus = Array.from({ length: 50 }, (_, i) => candidate(i));
    const controller = new AbortController();
    const written: MessageVariantId[] = [];
    const compareAndSetTokenUsage: ImportTokenUsageBackfillDeps["compareAndSetTokenUsage"] = ({ candidate: c }) => {
      written.push(c.variantId);
      if (written.length === 3) {
        controller.abort();
      }
      return Promise.resolve(true);
    };
    const reconcileImportStats = vi.fn(({ ownerId }: { readonly ownerId: UserId }): Promise<void> => {
      void ownerId;
      return Promise.resolve();
    });
    const backfill = createBackfillTokenUsage({
      listTokenUsageCandidates: readerOver(corpus),
      compareAndSetTokenUsage,
      reconcileImportStats,
    });

    await expect(backfill({ ownerId: null, dryRun: false, report: vi.fn(), signal: controller.signal })).rejects.toThrow();

    // The sweep stopped at the abort…
    expect(written).toHaveLength(3);
    // …and the three promoted rows' owners were settled anyway — the rollups are not left describing the
    // pre-promotion provenance forever.
    expect(reconcileImportStats.mock.calls.map((c) => c[0].ownerId).sort()).toEqual([...OWNERS].sort());
  });

  test("an abort BEFORE any write reconciles nothing (the settlement is scoped to what actually changed)", async () => {
    const controller = new AbortController();
    controller.abort();
    const reconcileImportStats = vi.fn(async () => undefined);
    const backfill = createBackfillTokenUsage({
      listTokenUsageCandidates: readerOver([candidate(0)]),
      compareAndSetTokenUsage: () => Promise.resolve(true),
      reconcileImportStats,
    });

    await expect(backfill({ ownerId: null, dryRun: false, report: vi.fn(), signal: controller.signal })).rejects.toThrow();

    expect(reconcileImportStats).not.toHaveBeenCalled();
  });
});
