// domain/import/verbs/backfill-token-usage — the auditable import-owned catch-up loop. Source semantics
// live here; message_variants access stays behind chat-owned injected operations. Every skip is counted,
// writes are CAS-protected, and a second pass is a read-only census.

import type { ImportedTokenUsageCandidate } from "@orb/contracts/chat";
import type { ImportTokenUsageBackfillResult } from "@orb/contracts/workloads";
import type { UserId } from "@orb/kit/ids";
import type { BackfillTokenUsage, ImportTokenUsageBackfillDeps } from "../contract/workloads.ts";
import { recordedTokenCountFromMetadata, resolveImportedTokenUsage } from "../substrate/token-usage.ts";

const PAGE_SIZE = 500;
const PLANNED_CHANGES = ["exactRecovered", "estimated", "legacyPromoted"] as const;
type PlannedChange = (typeof PLANNED_CHANGES)[number];

interface BackfillCounts {
  scanned: number;
  exactRecovered: number;
  legacyPromoted: number;
  estimated: number;
  alreadyMeasured: number;
  alreadyEstimated: number;
  compareAndSetSkipped: number;
}

function plan(candidate: ImportedTokenUsageCandidate): {
  readonly category: PlannedChange;
  readonly resolution: ReturnType<typeof resolveImportedTokenUsage>;
} {
  const legacyCount = candidate.tokensOut ?? candidate.tokensIn;
  if (legacyCount !== null) {
    return {
      category: "legacyPromoted",
      resolution: resolveImportedTokenUsage({ role: candidate.role, content: candidate.content, recordedTokenCount: legacyCount }),
    };
  }
  const recordedTokenCount = recordedTokenCountFromMetadata(candidate.metadata);
  return {
    category: recordedTokenCount === null ? "estimated" : "exactRecovered",
    resolution: resolveImportedTokenUsage({ role: candidate.role, content: candidate.content, recordedTokenCount }),
  };
}

async function settleCandidate(args: {
  readonly deps: ImportTokenUsageBackfillDeps;
  readonly candidate: ImportedTokenUsageCandidate;
  readonly dryRun: boolean;
  readonly counts: BackfillCounts;
  readonly ownersScanned: Set<UserId>;
  readonly changedOwners: Set<UserId>;
  readonly signal: AbortSignal;
}): Promise<void> {
  const { deps, candidate, dryRun, counts, ownersScanned, changedOwners, signal } = args;
  signal.throwIfAborted();
  counts.scanned++;
  ownersScanned.add(candidate.ownerId);
  if (candidate.tokenProvenance === "measured") {
    counts.alreadyMeasured++;
    return;
  }
  if (candidate.tokenProvenance === "estimated") {
    counts.alreadyEstimated++;
    return;
  }
  const change = plan(candidate);
  if (dryRun) {
    counts[change.category]++;
    return;
  }
  const changed = await deps.compareAndSetTokenUsage({ candidate, resolution: change.resolution });
  if (changed) {
    counts[change.category]++;
    changedOwners.add(candidate.ownerId);
  } else {
    counts.compareAndSetSkipped++;
  }
}

/** Keep one-row CAS writes sequential so each result remains attributable without flooding SQLite. */
function settlePageSequentially(args: {
  readonly deps: ImportTokenUsageBackfillDeps;
  readonly page: readonly ImportedTokenUsageCandidate[];
  readonly dryRun: boolean;
  readonly counts: BackfillCounts;
  readonly ownersScanned: Set<UserId>;
  readonly changedOwners: Set<UserId>;
  readonly signal: AbortSignal;
}): Promise<void> {
  return args.page.reduce<Promise<void>>((previous, candidate) => previous.then(() => settleCandidate({ ...args, candidate })), Promise.resolve());
}

/**
 * Rebuild distinct owners serially; the DB writer owns one atomic owner rebuild at a time.
 *
 * DELIBERATELY UNCANCELLABLE (it takes no `AbortSignal`): this is the SETTLEMENT of writes that already
 * landed, not more work. A cancel that skipped it left every CAS-promoted row counted under the old
 * provenance in the rollups FOREVER — a re-run cannot heal it, because a settled row returns at
 * `alreadyMeasured`/`alreadyEstimated` before it can re-enter `changedOwners`, and the loop's contract
 * (this file's header) is that a second pass is a read-only census. The set is bounded by the owners this
 * run actually WROTE, so the uninterruptible tail is proportional to work done, never to corpus size.
 */
function reconcileChangedOwners(args: { readonly deps: ImportTokenUsageBackfillDeps; readonly changedOwners: ReadonlySet<UserId> }): Promise<void> {
  return [...args.changedOwners].reduce<Promise<void>>(
    (previous, ownerId) => previous.then(() => args.deps.reconcileImportStats({ ownerId })),
    Promise.resolve(),
  );
}

/** Compose the singular-owner or all-owner catch-up verb over chat-owned persistence rails. */
export function createBackfillTokenUsage(deps: ImportTokenUsageBackfillDeps): BackfillTokenUsage {
  return async ({ ownerId, dryRun, report, signal }): Promise<ImportTokenUsageBackfillResult> => {
    const counts: BackfillCounts = {
      scanned: 0,
      exactRecovered: 0,
      legacyPromoted: 0,
      estimated: 0,
      alreadyMeasured: 0,
      alreadyEstimated: 0,
      compareAndSetSkipped: 0,
    };
    const ownersScanned = new Set<UserId>();
    const changedOwners = new Set<UserId>();

    const sweepPage = async (afterVariantId: ImportedTokenUsageCandidate["variantId"] | null): Promise<void> => {
      signal.throwIfAborted();
      const page = await deps.listTokenUsageCandidates({ hostUserId: ownerId, afterVariantId, limit: PAGE_SIZE });
      if (page.length === 0) {
        return;
      }
      await settlePageSequentially({ deps, page, dryRun, counts, ownersScanned, changedOwners, signal });
      report({ current: counts.scanned, message: `token usage: scanned ${counts.scanned}` });
      const lastVariantId = page.at(-1)?.variantId;
      if (page.length === PAGE_SIZE && lastVariantId !== undefined) {
        await sweepPage(lastVariantId);
      }
    };

    // The reconcile rides a `finally` so an ABORT (or any sweep failure) still settles what was written —
    // see {@link reconcileChangedOwners}. Order matters: cancel stops scanning, it never strands rollups.
    try {
      await sweepPage(null);
    } finally {
      await reconcileChangedOwners({ deps, changedOwners });
    }
    return {
      ...counts,
      ownersScanned: ownersScanned.size,
      ownersReconciled: changedOwners.size,
      dryRun,
    };
  };
}
