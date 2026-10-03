// domain/chat/substrate/backfill-estimate — how many Utility-model calls a memory backfill over a scope would make,
// counted from canon and the stored digests WITHOUT the planner (it mints group characters and prunes, so it
// cannot double as a read). It errs high: witness narrowing and an edited block's hash drift are not modelled.

import type { ImportWindow } from "@orb/contracts/chat";
import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import type { ChatContext } from "../context.ts";
import type { ResolveBackfillMemoryConfig } from "../contract/memory.ts";
import { resolveCfg } from "../memory/constants.ts";
import { countCanonThroughSeq, countDigestsByTier, loadChatMeta } from "../memory/persistence/queries.ts";
import { classifyParticipant } from "../persistence/participant.ts";
import { loadParticipants } from "../persistence/participants-read.ts";
import { loadAllChatIds } from "./backfill.ts";
import { digestsDerivable } from "./digests-derivable.ts";
import { hostUserIdOf } from "./participants-host.ts";

type MemoryCfg = ReturnType<typeof resolveCfg>;

/** One bucket's calls: a tier-0 summary per aged-out block with none stored, then each consolidation tier's
 *  parents (`fanOut` children each, up to `maxTier`) that are not stored yet. */
function bucketCalls(blocks: number, cfg: MemoryCfg, stored: readonly { readonly tier: number; readonly rows: number }[]): number {
  const storedAt = (tier: number): number => stored.find((row) => row.tier === tier)?.rows ?? 0;
  let calls = Math.max(0, blocks - storedAt(0));
  let parents = blocks;
  for (let tier = 1; tier <= cfg.maxTier; tier += 1) {
    parents = Math.floor(parents / cfg.fanOut);
    calls += Math.max(0, parents - storedAt(tier));
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
  const blocks = Math.floor((await countCanonThroughSeq(ctx.db, chatId, cutoff)) / cfg.blockSize);
  const characterIds = participants.flatMap((row) => {
    const actor = classifyParticipant(row);
    return actor?.kind === "character" ? [actor.characterId] : [];
  });
  const { generationId } = await ctx.resolveMemoryEmbedSpace(hostUserId);
  let calls = 0;
  for (const scopedCharacterId of await bucketKeys(ctx, chatId, characterIds, hostUserId)) {
    calls += bucketCalls(blocks, cfg, scopedCharacterId === null ? [] : await countDigestsByTier(ctx.db, chatId, scopedCharacterId, generationId));
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
