// domain/import/contract/service — the typed API surface (read THIS to know everything the slice does).
// Holds:
//   • ImportContext   the explicit DI bundle the verbs close over (NOT `ReturnType<>` — §7.4 /
//                     no-context-returntype; the conventional re-export home is context.ts)
//   • ImportService   the verb interface (the front door re-exports the type)
//   • the SIX injected cross-feature op TYPES (boundaries-are-physics: the runtime is wired at the
//     composition root; import sideways-imports neither character, assets, nor tag — domain-no-cross-feature):
//       - CreateImportedCharacter   character.create + the import-provenance stamp
//       - FindCharacterByImportHash  the byte-identical re-import dedup oracle (a character read, owner-scoped)
//       - FindCharacterByHandle      the (ownerId, handle) re-import match oracle (PD-108 — completes the
//                                    dedup: an edited/second same-name card resolves here instead of
//                                    dead-ending on the unique constraint)
//       - UpdateImportedCharacter    character.update, edit-in-place (D28) for the handle-match re-import
//       - StoreImportAsset           assets.store for the card/avatar PNG (one blob, both roles)
//       - AttachImportedCardTag      tag.attachCardTagByName (source:'card', status:'pending') for card.tags
//
// SCOPE (4c W3 — the SillyTavern character-card path): `importCharacter` (parse → validate/flatten →
// dedup → store avatar → create with provenance). `importChats` / `importPersonas`
// (`proposed/import-st-profile-waves.md`, PD-77) are
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
//
// PD-108: `FindCharacterByHandle` + `UpdateImportedCharacter` close the re-import dead-end. Both are
// type-only here too — the root binds them to the ALREADY-BUILT `character.findByHandle` (the seeder's
// partial-rerun precedent, owner-scoped) and `character.update` (D28 edit-in-place); no character-domain
// change was needed for either.

import type { CreateCharacterInput, UpdateCharacterInput } from "@orb/contracts/character";
import type { Db } from "@orb/db";
import type {
  AssetId,
  CharacterId,
  ChatId,
  ChatParticipantId,
  MessageId,
  MessageVariantId,
  PersonaId,
  UserId,
  WorldBookId,
  WorldEntryId,
} from "@orb/kit/ids";
import type { ImportCharacterInput } from "./params";
import type {
  ImportCharacterResult,
  ImportChatsResult,
  ImportedCharacterRef,
  ImportPersonasResult,
} from "./results";
import type { ImportChatsInput, ImportPersonaInput } from "./views";

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
 * The (ownerId, handle) re-import match oracle (PD-108): the id of the caller's existing character that
 * already carries `handle`, or null. Injected type-only (the root binds `character.findByHandle` — the
 * same owner-scoped read the default-card seeder already injects); import never reads the `characters`
 * table itself. Fires only after `FindCharacterByImportHash` misses (a byte-identical re-import is handled
 * by that faster, cheaper path first).
 */
export type FindCharacterByHandle = (args: {
  readonly ownerId: UserId;
  readonly handle: string;
}) => Promise<CharacterId | null>;

/**
 * Edit an existing character's card IN PLACE (D28 — always safe; no CAS/COW) for the handle-match re-import
 * path (PD-108): an edited card, or a second card sharing a handle, updates the existing row instead of
 * dead-ending on `characters_owner_handle_unique`. Injected type-only; the root binds it to
 * `character.update` (which recomputes `contentHash` and emits `character.updated` itself — import stamps
 * no provenance columns on an update, matching `character.update`'s existing contract). `input` is the
 * SAME flattened `CreateCharacterInput` the create path validates (a structural subset of
 * `UpdateCharacterInput` — every field explicit, so the update is a full content replace, not a partial
 * merge of stale fields).
 */
export type UpdateImportedCharacter = (args: {
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly input: UpdateCharacterInput;
}) => Promise<void>;

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
 * PD-78 op — enqueue ONE `memory-backfill` workload for the owner, over the freshly imported chats (the
 * backfill sweep itself scopes to the owner's `real_conversation`-bucketed chats). Injected type-only; the
 * composition root binds it to `workloads.start({ kind:"memory-backfill", ownerId })` — import never
 * sideways-imports `domain/workloads`. Called ONCE per import run (or per `importChats`), only when ≥1
 * `real_conversation` chat was written (the gate invariant: canon-write ⇒ downstream index runs).
 */
export type EnqueueImportBackfill = (args: { readonly ownerId: UserId }) => Promise<void>;

/** PD-78 op — the inline post-import stats rollup rebuild (economics is not event-driven). Injected
 *  type-only; the root binds it to the `reconcileStats` write substrate (owner-scoped). */
export type ReconcileImportStats = (args: { readonly ownerId: UserId }) => Promise<void>;

/**
 * The PROFILE-wave deps (RULING A): the chats/personas/lorebook writers write against `@orb/db` DIRECTLY
 * (the sanctioned bulk-serializer exemption export's reads use — the row shapes are chat's
 * `persistence/roster.ts` + world-info's tables), so this bundle carries the `db` handle + the injected
 * clock + the caller-minted ids (determinism — the composition root is the mint site) + the cross-verb
 * `personaByUserName` attribution state + the PD-78 ops. ABSENT for the card-only slice: the built
 * `importCharacter` verb reads NONE of it (RULING A — "zero db access" → "the card verbs use zero db"),
 * so the card-slice harness needs no change. The chats/personas verbs assert it is present.
 */
export interface ImportProfileDeps {
  readonly db: Db;
  readonly now: () => number;
  /** Cross-verb attribution: `importPersonas` populates it (lowercased display name → persona id); the
   *  chat writer reads it to attribute each imported chat's `user_name` to the persona the user RP'd as. */
  readonly personaByUserName: Map<string, PersonaId>;
  readonly newChatId: () => ChatId;
  readonly newMessageId: () => MessageId;
  readonly newVariantId: () => MessageVariantId;
  readonly newParticipantId: () => ChatParticipantId;
  readonly newPersonaId: () => PersonaId;
  readonly newWorldBookId: () => WorldBookId;
  readonly newWorldEntryId: () => WorldEntryId;
  readonly enqueueBackfill: EnqueueImportBackfill;
  readonly reconcileStats: ReconcileImportStats;
}

/**
 * The DI bundle every import verb closes over (wired at `service.ts` / the composition root). Explicit
 * interface (not `ReturnType<typeof …>`) per §7.4 + the `no-context-returntype` gate.
 *   - `ownerId` — the resolved principal id (ImportServiceDeps, collapsed — identity is
 *     resolved ONCE at the edge, never re-resolved inside the domain). Import reads no `users` row.
 *   - `createCharacter` / `findByImportHash` / `findByHandle` / `updateCharacter` / `storeAsset` /
 *     `attachCardTag` — the injected cross-feature ops (type-only; the root binds the character / assets /
 *     tag runtimes).
 *   - `profile` — the PD-77 profile-wave deps (db + clock + minters + attribution + PD-78 ops). ABSENT for
 *     the card-only slice (RULING A); the chats/personas verbs require it, the card verb ignores it.
 */
export interface ImportContext {
  readonly ownerId: UserId;
  readonly createCharacter: CreateImportedCharacter;
  readonly findByImportHash: FindCharacterByImportHash;
  readonly findByHandle: FindCharacterByHandle;
  readonly updateCharacter: UpdateImportedCharacter;
  readonly storeAsset: StoreImportAsset;
  readonly attachCardTag: AttachImportedCardTag;
  readonly profile?: ImportProfileDeps;
}

export interface ImportService {
  /**
   * Import one ST character card (PNG-embedded ccv3/chara JSON, or a bare V2/V3 JSON card): parse →
   * flatten to the canonical card → validate against `createCharacterSchema` → dedup by the whole-file
   * `importHash` → (PD-108) match `(ownerId, handle)` → store the PNG as the avatar (PNG cards only) →
   * create with import provenance, or edit-in-place (D28) when the handle already matches an owned
   * character. Idempotent by `importHash` (a byte-identical re-import returns the existing character,
   * `created:false`); an edited or second same-name card resolves via the handle match instead of dead-
   * ending on the per-owner handle unique constraint (also `created:false` — the row was updated, not
   * inserted). A genuinely new handle still inserts (`created:true`).
   * @throws {@link ImportCardError} When the bytes carry no readable/valid card.
   */
  readonly importCharacter: (input: ImportCharacterInput) => Promise<ImportCharacterResult>;
  /**
   * Import a list of loose ST chat `.jsonl` files into an EXISTING owned character (PD-77): dup-skip by
   * `chats.importHash`, write chats→messages→variants + the founding roster, resolve branch parents
   * (filename → parent chat id), then enqueue ONE `memory-backfill` when any `real_conversation` chat was
   * written. Requires `ctx.profile`.
   * @throws The shared kit `DomainNotFoundError` when the character isn't owned by the caller.
   */
  readonly importChats: (input: ImportChatsInput) => Promise<ImportChatsResult>;
  /**
   * Import a profile's settings.json personas (PD-77): dedup-by-name (a name collision reuses the existing
   * persona), write the new rows, and POPULATE `ctx.profile.personaByUserName` so the chat importers can
   * attribute their `user_name`s. MUST run BEFORE the chat importers. Requires `ctx.profile`.
   */
  readonly importPersonas: (input: {
    readonly personas: readonly ImportPersonaInput[];
  }) => Promise<ImportPersonasResult>;
}
