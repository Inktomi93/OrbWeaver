// verb: get — one owned character by id (owner-scoped). Throws `CharacterNotFoundError` when it doesn't
// exist OR isn't the caller's — the two collapse into one answer (no foreign-existence leak). A read: no
// audit, no emit. Owner-only (viewing ≠ owning — a member reads a roster card through chat's D22 clamp,
// `domain/chat/substrate/auth/clamp.ts` `clampMemberCard`, the ONE level-clamp surface — PD-111).

import type { CharacterContext } from "../context.ts";
import { CharacterNotFoundError } from "../contract/errors.ts";
import type { GetCharacterParams } from "../contract/params.ts";
import type { CharacterService } from "../contract/service.ts";
import { canonicalTagsOf, detailOf, loadOwnedCharacterWithAvatar } from "../persistence/queries.ts";

export function createGet(ctx: CharacterContext): CharacterService["get"] {
  return async ({ principal, characterId }: GetCharacterParams) => {
    const row = await loadOwnedCharacterWithAvatar(ctx.db, principal.userId, characterId);
    if (row === undefined) {
      throw new CharacterNotFoundError(characterId);
    }
    return detailOf(row, await canonicalTagsOf(ctx.db, characterId));
  };
}
