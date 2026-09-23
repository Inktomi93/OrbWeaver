// domain/chat/substrate/group-bucket — the ONE home for the SHARED memory bucket key. A group room's shared
// digest bucket is keyed by the MINTED synthetic group-as-character's REAL `characters.id` (inv 8 / D55(4) /
// D38), NEVER the `__group__${chatId}` HANDLE string: `chat_digests.scopedCharacterId` FK-references
// `characters.id` (enforced — `db/client` refuses to boot without `PRAGMA foreign_keys=ON`), so a fabricated
// handle throws on EVERY group write (the bug this file exists to make impossible — two build sites had each
// hand-rolled `castId<CharacterId>(\`__group__${chatId}\`)`, killing group memory silently).
//
// Both digest-BUILD sites resolve the key HERE — the engine's post-turn trigger (`engine.ts §3a`) and the
// corpus backfill (`backfill.ts`). The resolve is find-or-mint (idempotent via
// `ctx.mintSyntheticGroupCharacter`), so a merged-mode group that never minted a narrator author still gets a
// stable, distinct shared bucket. RECALL keys the same bucket via `ctx.findSyntheticGroupCharacter`
// (assemble-gather) — a READ must never mint; by the time recall surfaces anything a build has already minted
// the row (recall's `?? characterIds[0]` fallback only covers the pre-first-build empty pool).

import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import type { ChatContext } from "../context.ts";

/** The shared group bucket's scope key: the synthetic group-as-character's REAL row id (find-or-mint,
 *  idempotent — race-safe on the `(ownerId, handle)` unique). Callers gate on seated-character count (`>1`); a solo room keys
 *  its memory on its lone seated character, never through here. `ownerId` is the room HOST (D18/D19 — the funding
 *  owner the synthetic identity belongs to). */
export async function resolveGroupBucketCharacterId(ctx: ChatContext, args: { readonly ownerId: UserId; readonly chatId: ChatId }): Promise<CharacterId> {
  const group = await ctx.mintSyntheticGroupCharacter({
    ownerId: args.ownerId,
    chatId: args.chatId,
  });
  return group.characterId;
}
