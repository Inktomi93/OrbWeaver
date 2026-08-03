// verb: update — edit the live card IN PLACE (always safe; no CAS, no COW). Flattens the merged card to a
// fresh contentHash, writes the flat row, emits character.updated so the embeddings indexer re-embeds.
// handle is an identity column, not card content — a rename refuses the reserved __group__* namespace.
// The audit lists only fields that actually changed. An empty edit re-reads without writing.

import type { Principal } from "@orb/contracts/identity";
import { backgroundMaterializeMessage } from "@orb/contracts/theme";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { cardContentHash } from "#kit/serde/card";
import type { CharacterContext } from "../context.ts";
import { CHARACTER_BACKGROUND_UNAVAILABLE, CHARACTER_HANDLE_RESERVED, CharacterNotFoundError, CharacterOperationError } from "../contract/errors.ts";
import type { UpdateCharacterParams } from "../contract/params.ts";
import type { CharacterService } from "../contract/service.ts";
import { writeCardInPlace } from "../persistence/card.ts";
import {
  canonicalTagsOf,
  cardOf,
  detailOf,
  ensureAssetOwned,
  ensureBackgroundOverrideOwned,
  loadOwnedCharacterRow,
  loadOwnedCharacterWithAvatar,
} from "../persistence/queries.ts";
import { changedCardFields, flagEdits, mergeCard } from "../substrate/card-merge.ts";
import { cardTokenSize } from "../substrate/card-tokens.ts";
import { isReservedGroupHandle } from "../substrate/group-character.ts";

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

/** Resolve a `kind:"external"` carried background on the incoming edit into an owned `kind:"asset"` source
 *  (BG-C invariant, F-P0-2): fetch → magic-belt → CAS-store, keeping the URL as `provenanceUrl`. A blank URL
 *  clears to `kind:"none"`; any non-external (or absent) override passes through untouched. A refusal throws a
 *  leak-free coded error. Returns the (possibly rewritten) input the rest of the verb persists. */
async function resolveBackgroundOverride(
  ctx: CharacterContext,
  principal: Principal,
  input: UpdateCharacterParams["input"],
): Promise<UpdateCharacterParams["input"]> {
  const bg = input.backgroundOverride;
  if (bg === null || bg === undefined || bg.kind !== "external") {
    return input;
  }
  const url = bg.externalUrl.trim();
  if (url.length === 0) {
    return { ...input, backgroundOverride: { ...bg, kind: "none" } };
  }
  const result = await ctx.materializeBackground(principal, url);
  if (!result.ok) {
    throw new CharacterOperationError(CHARACTER_BACKGROUND_UNAVAILABLE, backgroundMaterializeMessage(result.reason));
  }
  return {
    ...input,
    backgroundOverride: {
      kind: "asset",
      seededId: "",
      externalUrl: "",
      provenanceUrl: url,
      assetId: result.asset.assetId,
      assetHash: result.asset.assetHash,
      mime: result.asset.mime,
    },
  };
}

export function createUpdate(ctx: CharacterContext): CharacterService["update"] {
  return async ({ principal, characterId, input: rawInput }: UpdateCharacterParams) => {
    const ownerId = principal.userId;
    // Materialize an external carried-background BEFORE ownership checks / persist (the resolved source is
    // `kind:"asset"` referencing a freshly-stored OWN asset, so `ensureBackgroundOverrideOwned` passes).
    const input = await resolveBackgroundOverride(ctx, principal, rawInput);
    guardHandle(input);
    const current = await loadOwnedCharacterRow(ctx.db, ownerId, characterId);
    if (current === undefined) {
      throw new CharacterNotFoundError(characterId);
    }
    if (input.avatarAssetId !== null && input.avatarAssetId !== undefined) {
      await ensureAssetOwned(ctx.db, ownerId, input.avatarAssetId);
    }
    // BG-C: a `kind:"asset"` carried background must reference the caller's OWN asset (the avatar-FK belt's
    // twin for the JSON `background_override` column); the persisted value is canonicalized in `flagEdits`.
    await ensureBackgroundOverrideOwned(ctx.db, ownerId, input.backgroundOverride);

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
