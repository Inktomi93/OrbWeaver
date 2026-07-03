// domain/import/contract/results — the verb result shapes (§7.4 / types-in-contract — one home).
//
// `ImportedCharacterRef` is the return of the injected create op (the composition root binds it to
// `character.create` + the provenance stamp); import knows only the resulting id. `ImportCharacterResult`
// is the card-import verb's answer: which character the card became, whether it was newly created vs
// deduped (re-import safety), and the whole-file `importHash` provenance.

import type { CharacterId } from "@orb/kit/ids";

export interface ImportedCharacterRef {
  readonly characterId: CharacterId;
}

/** `importCharacter` — the imported (or matched) character + whether this run created it. `created:false`
 *  means an existing character already carried this `importHash` (the re-import dedup oracle fired; nothing
 *  was written). */
export interface ImportCharacterResult {
  readonly characterId: CharacterId;
  readonly created: boolean;
  /** sha-256 of the whole imported file bytes (the per-card dedup oracle + `characters.import_hash`). */
  readonly importHash: string;
}
