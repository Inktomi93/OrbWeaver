// domain/imagery/substrate/identity-hash — the deterministic reuse key. Pure:
// sha-256 hex of `${mode}:${characterId}:${contentHash}`. The reuse gate (B2) matches on it so an unchanged
// card → hit → reuse, and an edited appearance → new `contentHash` → miss → regenerate.
//
// SIGNATURE NOTE (resolves the 03 §4.3 TYPE-MISMATCH FLAG): the hash is fed the ROW-side `contentHash`
// (the character's semantic-fields hash, `characters.content_hash`), NOT a `CharacterCard` — the zod card
// carries no hash. The caller reads it from the row (imagery: `character.get` → `CharacterDetail.contentHash`).
// `characterId` is a bare string so the same primitive serves rpg's game-side portrait reuse (docs/plans/rpg/design.md
// §2 hashes its OWN identity tuple into this arg — same gate, two producers, each holding its own state).

import type { PromptTemplateMode } from "@orb/contracts/imagery";
import type { CharacterId } from "@orb/kit/ids";
import { sha256Hex } from "#kit/content-hash";

export function identityHashFor(mode: PromptTemplateMode, characterId: CharacterId, contentHash: string): string {
  return sha256Hex(`${mode}:${characterId}:${contentHash}`);
}
