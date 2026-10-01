import type { CorpusDigestSource } from "@orb/contracts/search";
import type { ChatDigestId, UserId } from "@orb/kit/ids";
import type { SearchContext } from "../context.ts";
import type { DigestCoverageOp, DigestSourceLocator, DigestSourceSpan } from "../contract/service.ts";
import { resolveChatDisplay } from "../persistence/display.ts";
import { readDigestSourceLineage, readOwnedDigestSourceRows, readSourceSpan } from "../persistence/source.ts";
import { SOURCE_LINEAGE_LIMIT } from "../substrate/constants.ts";

/** Theme assignments supply ids; the live host predicate authorizes every underlying digest again. */
export function createDigestSources(
  ctx: Pick<SearchContext, "db" | "tier0RangeOf" | "digestConsolidationHash">,
): (ownerId: UserId, ids: readonly ChatDigestId[]) => Promise<readonly CorpusDigestSource[]> {
  const coverage = createDigestSourceCoverage(ctx);
  return async (ownerId, ids): Promise<readonly CorpusDigestSource[]> => {
    const rows = await readOwnedDigestSourceRows(ctx.db, ownerId, ids);
    const display = new Map((await resolveChatDisplay(ctx.db, [...new Set(rows.map((row) => row.chatId))])).map((row) => [row.chatId, row.title]));
    return await Promise.all(
      rows.map(async (row) => ({
        text: row.text,
        chatTitle: display.get(row.chatId) ?? null,
        scopedCharacterName: row.scopedCharacterName,
        source: {
          kind: "digest" as const,
          rowId: row.id,
          chatId: row.chatId,
          generationId: row.generationId,
          fingerprint: row.fingerprint,
          contentHash: row.contentHash,
          blockIdx: row.blockIdx,
          tier: row.tier,
          scopedCharacterId: row.scopedCharacterId,
          ...(await coverage(row, 0)),
        },
      })),
    );
  };
}

/** Service-local source coverage uses the writer's hash chain and the caller's resolved floor. */
export function createDigestSourceCoverage(ctx: Pick<SearchContext, "db" | "tier0RangeOf" | "digestConsolidationHash">): DigestCoverageOp {
  return (source, floorSeq): Promise<DigestSourceSpan> => readDigestSourceCoverage(ctx, source, floorSeq);
}

/** A live grid cannot identify an old parent until the writer's stored child-hash chain proves that grid. */
async function readDigestSourceCoverage(
  ctx: Pick<SearchContext, "db" | "tier0RangeOf" | "digestConsolidationHash">,
  source: DigestSourceLocator,
  floorSeq: number | null,
): Promise<DigestSourceSpan> {
  if (source.tier > 0) {
    const ranges = Array.from({ length: source.tier }, (_unused, tier) => ({ tier, ...ctx.tier0RangeOf(source.tier - tier, source.blockIdx) }));
    const rows = await readDigestSourceLineage(ctx.db, source, ranges, SOURCE_LINEAGE_LIMIT + 1);
    const bySlot = new Map(rows.map((row) => [`${row.tier}:${row.blockIdx}`, row.contentHash]));
    const validates = (tier: number, blockIdx: number, contentHash: string): boolean => {
      if (tier === 0) {
        return true;
      }
      const range = ctx.tier0RangeOf(1, blockIdx);
      if (range.endIdx - range.startIdx + 1 > SOURCE_LINEAGE_LIMIT) {
        return false;
      }
      const hashes: string[] = [];
      for (let childIdx = range.startIdx; childIdx <= range.endIdx; childIdx += 1) {
        const hash = bySlot.get(`${tier - 1}:${childIdx}`);
        if (hash === undefined || !validates(tier - 1, childIdx, hash)) {
          return false;
        }
        hashes.push(hash);
      }
      return ctx.digestConsolidationHash(`${source.scopedCharacterId}:${tier}:${blockIdx}`, hashes) === contentHash;
    };
    if (rows.length > SOURCE_LINEAGE_LIMIT || !validates(source.tier, source.blockIdx, source.contentHash)) {
      return { seqStart: null, seqEnd: null, messageStartId: null, messageEndId: null };
    }
  }
  return await readSourceSpan(ctx.db, source, ctx.tier0RangeOf(source.tier, source.blockIdx), floorSeq);
}
