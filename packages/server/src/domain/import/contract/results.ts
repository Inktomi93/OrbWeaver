// domain/import/contract/results — the verb result shapes (§7.4 / types-in-contract — one home).
//
// `ImportedCharacterRef` is the return of the injected create op (the composition root binds it to
// `character.create` + the provenance stamp); import knows only the resulting id. `ImportCharacterResult`
// is the card-import verb's answer: which character the card became, whether it was newly created vs
// deduped (re-import safety), and the whole-file `importHash` provenance.

import type { CharacterId, PersonaId } from "@orb/kit/ids";

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

/** `importChats` (PD-77) — the counts from writing a chat list into an existing character (chats→messages→
 *  variants + branch links), with the idempotent dup-skip (`chats.importHash`) surfaced. `backfillEnqueued`
 *  records whether the run enqueued a `memory-backfill` (only when ≥1 `real_conversation` chat was written —
 *  the PD-78 gate). */
export interface ImportChatsResult {
  readonly characterId: CharacterId;
  readonly chatsImported: number;
  readonly chatsSkipped: number;
  readonly messagesImported: number;
  readonly variantsImported: number;
  readonly branchesLinked: number;
  readonly backfillEnqueued: boolean;
}

/** `importPersonas` (PD-77) — the counts from writing settings.json personas (dedup-by-name), plus the
 *  resolved `defaultPersonaId` (the `power_user.default_persona`, or null). The cross-verb attribution map
 *  it populates lives on `ImportProfileDeps.personaByUserName` (read by the chat writer). */
export interface ImportPersonasResult {
  readonly personasCreated: number;
  readonly personasSkipped: number;
  readonly defaultPersonaId: PersonaId | null;
}
