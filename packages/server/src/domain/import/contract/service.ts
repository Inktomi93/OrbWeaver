// domain/import/contract/service — the typed API surface (read THIS to know everything the slice does).
// Holds:
//   • ImportContext   the explicit DI bundle the verbs close over (NOT `ReturnType<>` — §7.4 /
//                     no-context-returntype; the conventional re-export home is context.ts)
//   • ImportService   the verb interface (the front door re-exports the type)
//   • the FOUR injected cross-feature op TYPES (boundaries-are-physics: the runtime is wired at the
//     composition root; import sideways-imports neither character, assets, nor tag — domain-no-cross-feature):
//       - CreateImportedCharacter   character.create + the import-provenance stamp
//       - FindCharacterByImportHash  the re-import dedup oracle (a character read, owner-scoped)
//       - StoreImportAsset           assets.store for the card/avatar PNG (one blob, both roles)
//       - AttachImportedCardTag      tag.attachCardTagByName (source:'card', status:'pending') for card.tags
//
// SCOPE (4c W3 — the SillyTavern character-card path): `importCharacter` (parse → validate/flatten →
// dedup → store avatar → create with provenance). `importChats` / `importPersonas` (import.md §Verbs) are
// the chats/personas waves — they need the chat-writer + persona normalizer + the `emit`/`enqueueBackfill`
// ops, which are not part of this card slice.
//
// FLAG[PD-43]: `CreateImportedCharacter` carries `importedFrom` + `importHash` — but `character.create`
// (CreateCharacterInput) has NO provenance fields and its verb hard-codes them null ("app-authored"). The
// `characters` row HAS `imported_from`/`import_hash` columns, so the gap is real: character must expose a
// provenance-accepting create (a `provenance?` arg on `create`, or an import-create variant) for the
// composition root to wire this op. Until then the root can fulfil only the id (provenance dropped).
// FLAG[PD-43]: `FindCharacterByImportHash` likewise needs a character-provided lookup by
// `(ownerId, importHash)` — character has no such read today. Both are character follow-ups; import
// declares the TYPES it needs and the root binds the runtime (it never reads the `characters` table — §7.1).

import type { CreateCharacterInput } from "@orb/contracts/character";
import type { AssetId, CharacterId, UserId } from "@orb/kit/ids";
import type { ImportCharacterInput } from "./params";
import type { ImportCharacterResult, ImportedCharacterRef } from "./results";

/**
 * Create a character from a flattened+validated import, stamping the import provenance. Injected type-only;
 * the composition root binds it to `character.create` (+ the `imported_from`/`import_hash` columns).
 * `input` is the canonical `CreateCharacterInput` the tolerant serde produced; `importedFrom` is the source
 * label (filename) or null; `importHash` is the whole-file sha-256.
 */
export type CreateImportedCharacter = (args: {
  readonly ownerId: UserId;
  readonly input: CreateCharacterInput;
  readonly importedFrom: string | null;
  readonly importHash: string;
}) => Promise<ImportedCharacterRef>;

/**
 * The re-import dedup oracle: the id of the caller's existing character that already carries `importHash`,
 * or null. Injected type-only (a character-provided owner-scoped read, wired at the root); import never
 * reads the `characters` table itself.
 */
export type FindCharacterByImportHash = (args: {
  readonly ownerId: UserId;
  readonly importHash: string;
}) => Promise<CharacterId | null>;

/**
 * CAS-store the card/avatar PNG bytes and return the asset id (one blob serves both the card + the avatar
 * role). Injected type-only; the root binds it to `assets.store` (kind `avatar`, trusted import → no magic
 * enforcement). Import never imports the assets package.
 */
export type StoreImportAsset = (args: {
  readonly ownerId: UserId;
  readonly bytes: Uint8Array;
  readonly mime: string;
}) => Promise<AssetId>;

/**
 * Attach one author-shipped card tag (BY NAME) to the just-created character as a card/pending suggestion
 * (the `proposedTags` → `character_tags.status` redesign). Injected type-only;
 * the composition root (the import driver) binds it to `tag.attachCardTagByName` with `source:'card'`,
 * `status:'pending'` (import never sideways-imports `domain/tag` — domain-no-cross-feature). Resolve-or-create
 * + idempotent + race-safe; a re-attach never downgrades an `accepted` row. Returns whether NEWLY attached.
 */
export type AttachImportedCardTag = (args: {
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly tagName: string;
}) => Promise<boolean>;

/**
 * The DI bundle every import verb closes over (wired at `service.ts` / the composition root). Explicit
 * interface (not `ReturnType<typeof …>`) per §7.4 + the `no-context-returntype` gate.
 *   - `ownerId` — the resolved principal id (ImportServiceDeps, collapsed; import.md §Verbs — identity is
 *     resolved ONCE at the edge, never re-resolved inside the domain). Import reads no `users` row.
 *   - `createCharacter` / `findByImportHash` / `storeAsset` / `attachCardTag` — the injected cross-feature
 *     ops (type-only; the root binds the character / assets / tag runtimes).
 */
export interface ImportContext {
  readonly ownerId: UserId;
  readonly createCharacter: CreateImportedCharacter;
  readonly findByImportHash: FindCharacterByImportHash;
  readonly storeAsset: StoreImportAsset;
  readonly attachCardTag: AttachImportedCardTag;
}

export interface ImportService {
  /** Import one ST character card (PNG-embedded ccv3/chara JSON, or a bare V2/V3 JSON card): parse →
   *  flatten to the canonical card → validate against `createCharacterSchema` → dedup by the whole-file
   *  `importHash` → store the PNG as the avatar (PNG cards only) → create with import provenance. Idempotent
   *  by `importHash` (a byte-identical re-import returns the existing character, `created:false`). Throws
   *  `ImportCardError` when the bytes carry no readable/valid card. */
  readonly importCharacter: (input: ImportCharacterInput) => Promise<ImportCharacterResult>;
}
