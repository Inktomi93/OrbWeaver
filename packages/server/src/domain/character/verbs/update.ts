// verb: update — edit the live card IN PLACE (no COW). Flattens the merged card to a fresh contentHash,
// writes the flat row, emits character.updated so the embeddings indexer re-embeds.
// handle is an identity column, not card content — a rename refuses the reserved __group__* namespace.
// The audit lists only fields that actually changed. An empty edit re-reads without writing.
//
// "ALWAYS SAFE; NO CAS" SURVIVES — ITS INPUT CHANGED (#1446). In-place is still unconditional for every
// caller that reads the card and writes it back in one breath (the editor, the importer, the seeder): there
// is no window for them to lose, and a version column on `characters` would tax every such write to protect
// nobody. What the ruling never covered is a caller whose BASIS is old — the refinery's apply builds its
// patch from a card read before two model calls and a snapshot write. Such a caller passes
// `expectedBasis`, and only then does the write carry the basis predicates (`persistence/card.ts`) and
// refuse TOTALLY with `CHARACTER_STALE_BASIS` rather than overwrite the edit that landed in between.

import type { Principal } from "@orb/contracts/identity";
import { backgroundMaterializeMessage } from "@orb/contracts/theme";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { cardContentHash } from "#kit/serde/card";
import type { CharacterContext } from "../context.ts";
import {
  CHARACTER_BACKGROUND_UNAVAILABLE,
  CHARACTER_HANDLE_RESERVED,
  CHARACTER_STALE_BASIS,
  CharacterNotFoundError,
  CharacterOperationError,
} from "../contract/errors.ts";
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
    readonly expectedBasis: UpdateCharacterParams["expectedBasis"];
  },
): Promise<void> {
  const { ownerId, characterId, current, input, expectedBasis } = args;
  const next = mergeCard(cardOf(current), input);
  const nextHash = cardContentHash(next);
  const handleChanged = input.handle !== undefined && input.handle !== current.handle;
  // A flag-only/handle-only edit leaves card fields untouched, so the hash is unchanged; the embeddings
  // indexer reads this to skip re-embedding a mere star toggle or rename.
  const contentChanged = nextHash !== current.contentHash;
  const at = ctx.now();
  const written = await writeCardInPlace(
    ctx.db,
    { characterId, ownerId, ...(expectedBasis === undefined ? {} : { expectedBasis }) },
    {
      ...next,
      contentHash: nextHash,
      tokenSize: cardTokenSize(next),
      updatedAt: at,
      ...flagEdits(input),
      // Inline narrow: exactOptionalPropertyTypes rejects `handle: string | undefined` against the required column.
      ...(input.handle !== undefined && input.handle !== current.handle ? { handle: input.handle } : {}),
    },
  );
  if (written === "stale") {
    // #1446 — the caller declared the content it merged against and the card has moved since. TOTAL refusal:
    // nothing was written, so the other writer's edit stands and this caller re-reads and re-applies.
    throw new CharacterOperationError(
      CHARACTER_STALE_BASIS,
      "This character changed while the edit was being prepared — reload it and apply the change again.",
    );
  }
  if (written === "background-unavailable") {
    throw new CharacterOperationError(CHARACTER_BACKGROUND_UNAVAILABLE, "The background asset is no longer available.");
  }
  if (written === "missing") {
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
      externalUrl: "",
      provenanceUrl: url,
      assetId: result.asset.assetId,
      assetHash: result.asset.assetHash,
      mime: result.asset.mime,
    },
  };
}

export function createUpdate(ctx: CharacterContext): CharacterService["update"] {
  return async ({ principal, characterId, input: rawInput, expectedBasis }: UpdateCharacterParams) => {
    const ownerId = principal.userId;
    // ORDER IS SECURITY-LOAD-BEARING (#1455): AUTHORIZE THE TARGET, THEN FETCH. `resolveBackgroundOverride`
    // drives an outbound fetch + image processing + a CAS/db write for any `kind:"external"` override, all
    // from caller-supplied values. Running it first meant a characterId the caller does not own (or one that
    // does not exist) still bought them that SSRF-sensitive boundary work, its cost, and a durable asset — on
    // the way to a `CharacterNotFoundError`. The handle guard moves up with it: it reads only `input.handle`,
    // which the background resolve never rewrites.
    guardHandle(rawInput);
    const current = await loadOwnedCharacterRow(ctx.db, ownerId, characterId);
    if (current === undefined) {
      throw new CharacterNotFoundError(characterId);
    }
    // Materialize AFTER the ownership load but still BEFORE `ensureBackgroundOverrideOwned` — the resolved
    // source is `kind:"asset"` referencing a freshly-stored OWN asset, so that belt passes on it unchanged.
    const input = await resolveBackgroundOverride(ctx, principal, rawInput);
    if (input.avatarAssetId !== null && input.avatarAssetId !== undefined) {
      await ensureAssetOwned(ctx.db, ownerId, input.avatarAssetId);
    }
    // BG-C: a `kind:"asset"` carried background must reference the caller's OWN asset (the avatar-FK belt's
    // twin for the JSON `background_override` column); the persisted value is canonicalized in `flagEdits`.
    await ensureBackgroundOverrideOwned(ctx.db, ownerId, input.backgroundOverride);

    if (Object.keys(input).length > 0) {
      await applyEdit(ctx, { ownerId, characterId, current, input, expectedBasis });
    }

    const updated = await loadOwnedCharacterWithAvatar(ctx.db, ownerId, characterId);
    if (updated === undefined) {
      throw new CharacterNotFoundError(characterId);
    }
    return detailOf(updated, await canonicalTagsOf(ctx.db, characterId));
  };
}
