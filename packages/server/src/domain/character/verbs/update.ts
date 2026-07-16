// verb: update — edit the live card IN PLACE (always safe; no CAS, no COW). Flattens the merged card to a
// fresh contentHash, writes the flat row, emits character.updated so the embeddings indexer re-embeds.
// handle is an identity column, not card content — a rename refuses the reserved __group__* namespace.
// The audit lists only fields that actually changed. An empty edit re-reads without writing.

import type { CharacterId, UserId } from "@orb/kit/ids";
import { cardContentHash } from "#kit/serde/card";
import type { CharacterContext } from "../context";
import { CHARACTER_HANDLE_RESERVED, CharacterNotFoundError, CharacterOperationError } from "../contract/errors";
import type { UpdateCharacterParams } from "../contract/params";
import type { CharacterService } from "../contract/service";
import { writeCardInPlace } from "../persistence/card";
import { canonicalTagsOf, cardOf, detailOf, ensureAssetOwned, loadOwnedCharacterRow, loadOwnedCharacterWithAvatar } from "../persistence/queries";
import { changedCardFields, flagEdits, mergeCard } from "../substrate/card-merge";
import { cardTokenSize } from "../substrate/card-tokens";
import { isReservedGroupHandle } from "../substrate/group-character";

function changedIdentityFields(input: UpdateCharacterParams["input"], current: Record<string, unknown>, handleChanged: boolean): string[] {
  const flags = Object.entries(flagEdits(input))
    .filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(current[key]))
    .map(([key]) => key);
  return handleChanged ? [...flags, "handle"] : flags;
}

function guardHandle(input: UpdateCharacterParams["input"]): void {
  if (input.handle !== undefined && isReservedGroupHandle(input.handle)) {
    throw new CharacterOperationError(CHARACTER_HANDLE_RESERVED, `handle "${input.handle}" is reserved for synthetic group characters`);
  }
}

/** Throws CharacterNotFoundError if the row vanished mid-edit. */
async function applyEdit(
  ctx: CharacterContext,
  args: {
    readonly ownerId: UserId;
    readonly characterId: CharacterId;
    readonly current: Awaited<ReturnType<typeof loadOwnedCharacterRow>> & object;
    readonly input: UpdateCharacterParams["input"];
  },
): Promise<void> {
  const { ownerId, characterId, current, input } = args;
  const next = mergeCard(cardOf(current), input);
  const nextHash = cardContentHash(next);
  const handleChanged = input.handle !== undefined && input.handle !== current.handle;
  // A flag-only/handle-only edit leaves card fields untouched, so the hash is unchanged; the embeddings
  // indexer reads this to skip re-embedding a mere star toggle or rename.
  const contentChanged = nextHash !== current.contentHash;
  const at = ctx.now();
  const written = await writeCardInPlace(ctx.db, characterId, ownerId, {
    ...next,
    contentHash: nextHash,
    tokenSize: cardTokenSize(next),
    ...flagEdits(input),
    // Inline narrow: exactOptionalPropertyTypes rejects `handle: string | undefined` against the required column.
    ...(input.handle !== undefined && input.handle !== current.handle ? { handle: input.handle } : {}),
  });
  if (!written) {
    throw new CharacterNotFoundError(characterId);
  }

  ctx.emit({ type: "character.updated", characterId, contentChanged });
  await ctx.audit(
    {
      actorUserId: ownerId,
      action: "character.update",
      entityType: "character",
      entityId: characterId,
      metadata: {
        fields: [...changedCardFields(cardOf(current), next), ...changedIdentityFields(input, current, handleChanged)],
      },
    },
    at,
  );
  ctx.emitUserEvent(ownerId, { type: "charactersChanged", characterId });
}

export function createUpdate(ctx: CharacterContext): CharacterService["update"] {
  return async ({ principal, characterId, input }: UpdateCharacterParams) => {
    const ownerId = principal.userId;
    guardHandle(input);
    const current = await loadOwnedCharacterRow(ctx.db, ownerId, characterId);
    if (current === undefined) {
      throw new CharacterNotFoundError(characterId);
    }
    if (input.avatarAssetId !== null && input.avatarAssetId !== undefined) {
      await ensureAssetOwned(ctx.db, ownerId, input.avatarAssetId);
    }

    if (Object.keys(input).length > 0) {
      await applyEdit(ctx, { ownerId, characterId, current, input });
    }

    const updated = await loadOwnedCharacterWithAvatar(ctx.db, ownerId, characterId);
    if (updated === undefined) {
      throw new CharacterNotFoundError(characterId);
    }
    return detailOf(updated, await canonicalTagsOf(ctx.db, characterId));
  };
}
