// domain/chat/substrate/backfill-estimate — how many Utility-model calls a memory backfill over a scope would make,
// counted from canon and the stored digests WITHOUT the planner (it mints group characters and prunes, so it
// cannot double as a read). It walks the planner's own block grid, witness narrowing and content hashes, so an
// edited block counts and a block the character never witnessed does not.

import type { ImportWindow } from "@orb/contracts/chat";
import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import type { ChatContext } from "../context.ts";
import type { BlockSpan, ResolveBackfillMemoryConfig } from "../contract/memory.ts";
import { resolveCfg } from "../memory/constants.ts";
import { blockHash, consolidationHash, sliceBlocks } from "../memory/generate/substrate/transcript.ts";
import { spanWitnessed } from "../memory/generate/substrate/witnessing.ts";
import { loadCanonThroughSeq, loadChatMeta, loadDigestHashes, loadWitnessHorizons } from "../memory/persistence/queries.ts";
import { classifyParticipant } from "../persistence/participant.ts";
import { loadParticipants } from "../persistence/participants-read.ts";
import { loadAllChatIds } from "./backfill.ts";
import { digestsDerivable } from "./digests-derivable.ts";
import { hostUserIdOf } from "./participants-host.ts";

type MemoryCfg = ReturnType<typeof resolveCfg>;

/** One child the next tier folds: its block index and the hash it will carry, `null` when it is rebuilt this pass. */
interface TierChild {
  readonly blockIdx: number;
  readonly hash: string | null;
}

/** A bucket's hash prefix (its scoped character id) and its stored `${tier}:${blockIdx}` hashes. */
interface BucketScope {
  readonly key: string;
  readonly existing: ReadonlyMap<string, string>;
}

/** One consolidation tier over `children`: a parent per full group of `fanOut`, current only when every child is
 *  current and the stored parent hash matches the one the build would compute (a rebuilt child always changes it). */
function consolidationTier(children: readonly TierChild[], tier: number, fanOut: number, scope: BucketScope): TierChild[] {
  const groups = new Map<number, TierChild[]>();
  for (const child of children) {
    const parent = Math.floor(child.blockIdx / fanOut);
    groups.set(parent, [...(groups.get(parent) ?? []), child]);
  }
  return [...groups]
    .filter(([, group]) => group.length >= fanOut)
    .sort((a, b) => a[0] - b[0])
    .map(([blockIdx, group]) => {
      const childHashes = group.toSorted((a, b) => a.blockIdx - b.blockIdx).map((child) => child.hash);
      const hash = childHashes.every((h) => h !== null) ? consolidationHash(`${scope.key}:${tier}:${blockIdx}`, childHashes) : null;
      return { blockIdx, hash: hash !== null && scope.existing.get(`${tier}:${blockIdx}`) === hash ? hash : null };
    });
}

/** One bucket's calls, as the build makes them: a tier-0 summary per block whose stored hash is missing or stale, then
 *  each consolidation tier's parents that are not current. */
function bucketCalls(blocks: readonly BlockSpan[], cfg: MemoryCfg, scope: BucketScope): number {
  let children: TierChild[] = blocks.map((block) => {
    const hash = blockHash(`${scope.key}:0:${block.blockIdx}`, block.rows);
    return { blockIdx: block.blockIdx, hash: scope.existing.get(`0:${block.blockIdx}`) === hash ? hash : null };
  });
  let calls = children.filter((child) => child.hash === null).length;
  for (let tier = 1; tier <= cfg.maxTier && children.length >= cfg.fanOut; tier += 1) {
    children = consolidationTier(children, tier, cfg.fanOut, scope);
    calls += children.filter((child) => child.hash === null).length;
  }
  return calls;
}

/** The scope buckets a chat digests into, mirroring the sweep: every seated character, plus the shared group
 *  bucket in a multi-character room. A group bucket whose synthetic character is not minted yet has nothing stored. */
async function bucketKeys(ctx: ChatContext, chatId: ChatId, characterIds: readonly CharacterId[], hostUserId: UserId): Promise<(CharacterId | null)[]> {
  if (characterIds.length <= 1) {
    return [...characterIds];
  }
  const group = await ctx.findSyntheticGroupCharacter({ ownerId: hostUserId, chatId });
  return [group?.characterId ?? null, ...characterIds];
}

async function chatCalls(ctx: ChatContext, chatId: ChatId, resolveMemoryConfig: ResolveBackfillMemoryConfig): Promise<number> {
  const participants = await loadParticipants(ctx.db, chatId);
  const hostUserId = hostUserIdOf(participants);
  if (hostUserId === null) {
    return 0;
  }
  const cfg = resolveCfg(await resolveMemoryConfig(hostUserId));
  const cutoff = (await loadChatMeta(ctx.db, chatId)).maxSeq - cfg.verbatimWindow;
  if (cfg.mode === "off" || cutoff < cfg.blockSize) {
    return 0;
  }
  const allBlocks = sliceBlocks(await loadCanonThroughSeq(ctx.db, chatId, cutoff), cfg.blockSize);
  const characterIds = participants.flatMap((row) => {
    const actor = classifyParticipant(row);
    return actor?.kind === "character" ? [actor.characterId] : [];
  });
  const { generationId } = await ctx.resolveMemoryEmbedSpace(hostUserId);
  let calls = 0;
  for (const scopedCharacterId of await bucketKeys(ctx, chatId, characterIds, hostUserId)) {
    if (scopedCharacterId === null) {
      // The unminted shared bucket has no stored digest and no hash prefix yet: every block and parent is built.
      calls += bucketCalls(allBlocks, cfg, { key: "", existing: new Map() });
      continue;
    }
    // A seated character's bucket holds only the blocks it witnessed, as the planner narrows it; the shared bucket holds all.
    const witnessing = characterIds.includes(scopedCharacterId) ? await loadWitnessHorizons(ctx.db, chatId, scopedCharacterId) : null;
    const blocks = witnessing === null ? allBlocks : allBlocks.filter((block) => spanWitnessed(block.seqStart, block.seqEnd, witnessing));
    calls += bucketCalls(blocks, cfg, { key: scopedCharacterId, existing: await loadDigestHashes(ctx.db, chatId, scopedCharacterId, generationId) });
  }
  return calls;
}

/** The Utility-model calls a memory backfill over `ownerId`'s hosted chats (`null` = every chat), narrowed to
 *  the chats an import wrote when `importWindow` is set, would make for `funderUserId`. Zero when the funder has no Utility model: the sweep then
 *  builds no digests at all. */
export async function estimateMemoryBackfillCalls(
  ctx: ChatContext,
  args: { readonly ownerId: UserId | null; readonly funderUserId: UserId; readonly importWindow: ImportWindow | null },
  resolveMemoryConfig: ResolveBackfillMemoryConfig,
): Promise<number> {
  if (!(await digestsDerivable(ctx, args.funderUserId))) {
    return 0;
  }
  let calls = 0;
  for (const chatId of await loadAllChatIds(ctx, args.ownerId, args.importWindow)) {
    calls += await chatCalls(ctx, chatId, resolveMemoryConfig);
  }
  return calls;
}
