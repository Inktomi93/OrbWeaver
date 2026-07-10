// verb: update — edit the live card IN PLACE (D28 — always safe; no CAS, no COW). The merge (clear-vs-keep
// semantics) + the identity-flag extraction live in `substrate/card-merge`; here we flatten the merged card
// to a fresh `contentHash`, write the flat row, and emit `character.updated` so the embeddings indexer
// re-embeds. `handle` is an IDENTITY column (FINAL-Character §2 — `update({handle})`), NOT card content: it
// is applied here too (a rename), refusing the reserved `__group__*` namespace (mirror of `__agent__`) and
// surfacing a per-owner `(ownerId, handle)` collision as the typed `handle_conflict` (persistence classifies
// it). The audit lists only the fields that ACTUALLY changed (a provided-but-identical value is not "edited").
// An empty edit re-reads without writing. Throws `CharacterNotFoundError` when not owned/found.

import type { CharacterId, UserId } from "@orb/kit/ids";
import { cardContentHash } from "#kit/serde/card";
import {
  CHARACTER_HANDLE_RESERVED,
  CharacterNotFoundError,
  CharacterOperationError,
} from "../contract/errors";
import type { UpdateCharacterParams } from "../contract/params";
import type { CharacterContext, CharacterService } from "../contract/service";
import { writeCardInPlace } from "../persistence/card";
import {
  canonicalTagsOf,
  cardOf,
  detailOf,
  ensureAssetOwned,
  loadOwnedCharacterRow,
  loadOwnedCharacterWithAvatar,
} from "../persistence/queries";
import { changedCardFields, flagEdits, mergeCard } from "../substrate/card-merge";
import { cardTokenSize } from "../substrate/card-tokens";
import { isReservedGroupHandle } from "../substrate/group-character";

/** The flag/handle field names whose provided value differs from the stored row — the identity half of the
 *  audit's changed-fields list (the card half is `changedCardFields`). `undefined` never appears in
 *  `flagEdits`, so an omitted flag is absent; a provided-but-identical flag is filtered out here. */
function changedIdentityFields(
  input: UpdateCharacterParams["input"],
  current: Record<string, unknown>,
  handleChanged: boolean,
): string[] {
  const flags = Object.entries(flagEdits(input))
    .filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(current[key]))
    .map(([key]) => key);
  return handleChanged ? [...flags, "handle"] : flags;
}

/** Reject a non-empty edit whose supplied `handle` lands in the reserved `__group__*` namespace (create
 *  refuses it too — the mirror of the `__agent__` identity refusal). Extracted to keep the verb under the gate. */
function guardHandle(input: UpdateCharacterParams["input"]): void {
  if (input.handle !== undefined && isReservedGroupHandle(input.handle)) {
    throw new CharacterOperationError(
      CHARACTER_HANDLE_RESERVED,
      `handle "${input.handle}" is reserved for synthetic group characters`,
    );
  }
}

/** Apply a non-empty edit: merge → flat write (card fields + flags + an optional handle rename) → emit +
 *  audit-the-changed-fields + user-bus. Extracted from the verb closure to keep it under the cognitive-
 *  complexity gate (the create-verb precedent). Throws `CharacterNotFoundError` if the row vanished mid-edit. */
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
  // A flag-only / handle-only edit leaves the card fields untouched, so the re-flattened hash is identical
  // to the stored one; a real card-field write changes it. This is the discriminator the embeddings indexer
  // reads to skip re-embedding a mere star toggle or rename (owner ruling — handle is not embedded).
  const contentChanged = nextHash !== current.contentHash;
  const at = ctx.now();
  const written = await writeCardInPlace(ctx.db, characterId, ownerId, {
    ...next,
    contentHash: nextHash,
    tokenSize: cardTokenSize(next),
    ...flagEdits(input),
    // Inline narrow (not `handleChanged`): TS can't carry the earlier const's narrowing into the spread,
    // and exactOptionalPropertyTypes rejects `handle: string | undefined` against the row's required column.
    ...(input.handle !== undefined && input.handle !== current.handle
      ? { handle: input.handle }
      : {}),
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
        fields: [
          ...changedCardFields(cardOf(current), next),
          ...changedIdentityFields(input, current, handleChanged),
        ],
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
      // D21 cross-root belt: the FK proves the asset exists, never that it's the caller's.
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
