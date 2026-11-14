// Missing or foreign rows are skipped. Audit and notification follow deletion; owned avatars reap once.
// The deletes run one after another: each one retires its canon from the owner's stats behind a guard on the owner's
// canon, and a sibling committing in between would refuse it. Each delete catches its own failure, so every card that
// was deleted is still audited, announced and reaped, and the result names each card that failed.
import type { CharacterBulkResult } from "@orb/contracts/character";
import type { AssetId, CharacterId, UserId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import type { BulkRemoveParams } from "../contract/params.ts";
import type { BulkTagOutcome } from "../contract/results.ts";
import type { CharacterContext, CharacterService } from "../contract/service.ts";
import { deleteOwnedCharacter } from "../persistence/card.ts";
import { loadOwnedCharacterRow } from "../persistence/queries.ts";
import { buildBulkTagResult } from "../substrate/bulk-tag-result.ts";

type CharacterRow = NonNullable<Awaited<ReturnType<typeof loadOwnedCharacterRow>>>;

async function deleteInTurn(
  ctx: CharacterContext,
  ownerId: UserId,
  characterIds: readonly CharacterId[],
): Promise<{ readonly outcomes: BulkTagOutcome[]; readonly deleted: CharacterRow[] }> {
  const outcomes: BulkTagOutcome[] = [];
  const deleted: CharacterRow[] = [];
  for (const characterId of characterIds) {
    try {
      const row = await loadOwnedCharacterRow(ctx.db, ownerId, characterId);
      const removed = row !== undefined && (await deleteOwnedCharacter(ctx.db, characterId, ownerId, ctx.prepareCanonRetirement));
      if (removed) {
        deleted.push(row);
      }
      outcomes.push({ characterId, applied: removed });
    } catch (failed) {
      outcomes.push({ characterId, failed });
    }
  }
  return { outcomes, deleted };
}

async function announce(ctx: CharacterContext, ownerId: UserId, deleted: readonly CharacterRow[], at: number): Promise<void> {
  await Promise.all(
    deleted.map((row) =>
      ctx.audit(
        {
          actorUserId: ownerId,
          action: "character.remove",
          entityType: "character",
          entityId: row.id,
          metadata: { handle: row.handle, bulk: true },
        },
        at,
      ),
    ),
  );
  ctx.emitUserEvent(ownerId, { type: "charactersChanged" });

  const reap = deleted.map((row) => row.avatarAssetId).filter((id): id is AssetId => id !== null);
  if (reap.length > 0) {
    try {
      await ctx.reapAssets(reap);
    } catch (err) {
      getLog(ctx.logger).warn({ err, count: reap.length }, "character: bulk avatar reap failed");
    }
  }
}

export function createBulkRemove(ctx: CharacterContext): CharacterService["bulkRemove"] {
  return async ({ principal, characterIds }: BulkRemoveParams): Promise<CharacterBulkResult> => {
    const ownerId = principal.userId;
    const at = ctx.now();
    const { outcomes, deleted } = await deleteInTurn(ctx, ownerId, characterIds);
    if (deleted.length > 0) {
      await announce(ctx, ownerId, deleted, at);
    }
    return buildBulkTagResult(outcomes);
  };
}
