// domain/import/contract/service — typed API surface: ImportContext (DI bundle) + ImportService
// (verb interface) + the injected cross-feature op types the composition root wires at the root.
// FLAG[PD-43]: CreateImportedCharacter/FindCharacterByImportHash need character to expose a
// provenance-accepting create + an (ownerId, importHash) lookup; neither exists yet.

import type { AttachedBookRef, CreateCharacterInput, UpdateCharacterInput } from "@orb/contracts/character";
import type { BulkImportChatInput, BulkImportChatsResult } from "@orb/contracts/chat";
import type { BulkImportPersonaInput, BulkImportPersonasResult } from "@orb/contracts/persona";
import type { BulkImportLorebookInput, BulkImportLorebookResult } from "@orb/contracts/world-info";
import type { AssetId, CharacterHandle, CharacterId, ChatId, PersonaId, UserId } from "@orb/kit/ids";
import type { ImportCardScripts } from "#domain/regex";
import type { ImportRpgGame } from "#domain/rpg";
import type { ImportCharacterInput } from "./params.ts";
import type { ImportCharacterResult, ImportChatFileOutcome, ImportChatsResult, ImportedCharacterRef, ImportPersonasResult } from "./results.ts";
import type { ImportChatFileInput, ImportChatsInput, ImportPersonaInput } from "./views.ts";

export type CreateImportedCharacter = (args: {
  readonly ownerId: UserId;
  readonly input: CreateCharacterInput;
  readonly importedFrom: string | null;
  readonly importHash: string;
}) => Promise<ImportedCharacterRef>;

/** Re-import dedup oracle: id of the caller's existing character carrying `importHash`, or null. */
export type FindCharacterByImportHash = (args: { readonly ownerId: UserId; readonly importHash: string }) => Promise<CharacterId | null>;

/** (ownerId, handle) re-import match oracle; fires only after FindCharacterByImportHash misses. */
type FindCharacterByHandle = (args: { readonly ownerId: UserId; readonly handle: CharacterHandle }) => Promise<CharacterId | null>;

/** Edits an existing character's card in place for the handle-match re-import path. */
type UpdateImportedCharacter = (args: { readonly ownerId: UserId; readonly characterId: CharacterId; readonly input: UpdateCharacterInput }) => Promise<void>;

/** CAS-stores the card/avatar PNG bytes and returns the asset id (one blob serves both roles). */
export type StoreImportAsset = (args: { readonly ownerId: UserId; readonly bytes: Uint8Array; readonly mime: string }) => Promise<AssetId>;

/** Attaches one author-shipped card tag by name as a card/pending suggestion; idempotent, race-safe. */
type AttachImportedCardTag = (args: { readonly ownerId: UserId; readonly characterId: CharacterId; readonly tagName: string }) => Promise<boolean>;

/** World-info-owned lorebook bulk-import write op; optional (card-only upload path skips embedded books). */
type BulkImportLorebookOp = (args: {
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly book: BulkImportLorebookInput;
}) => Promise<BulkImportLorebookResult>;

/** World-info-owned re-link op for a portable card's carried attached-book references (PD-144); optional —
 *  the card-only upload path omits it. Links only ids the importer OWNS, returns linked/skipped counts. */
type LinkCarriedBooksOp = (args: {
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly refs: readonly AttachedBookRef[];
}) => Promise<{ readonly linked: number; readonly skipped: number }>;

/** Enqueues one memory-backfill workload for the owner, once per import run when a chat was written. */
type EnqueueImportBackfill = (args: { readonly ownerId: UserId }) => Promise<void>;

/** Inline post-import stats rollup rebuild. */
type ReconcileImportStats = (args: { readonly ownerId: UserId }) => Promise<void>;

/** Chat-owned bulk-import write op; import maps its ST parse to the canonical input and never touches \@orb/db. */
type BulkImportChatsOp = (args: {
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly chats: readonly BulkImportChatInput[];
}) => Promise<BulkImportChatsResult>;

/** Persona-owned bulk-import write op (dedup-by-name); returned idByName feeds chat attribution. */
type BulkImportPersonasOp = (args: { readonly ownerId: UserId; readonly personas: readonly BulkImportPersonaInput[] }) => Promise<BulkImportPersonasResult>;

/** Persona-owned by-NAME lookup (R6). `personaByUserName` below is the PROFILE run's in-memory map, built by
 *  the persona wave in the same process; a BUNDLE gets one fresh `ImportContext` per file, so a chat that
 *  imports after the personas entity needs a durable read instead. `(ownerId, name)` is the persona domain's
 *  own dedup key, so this resolves exactly what its import verb would have merged onto. */
type FindPersonaByNameOp = (args: { readonly ownerId: UserId; readonly name: string }) => Promise<PersonaId | null>;

/** Tag-owned resolve-or-create + D30 per-tagger chat-overlay attach (R6 — the `chat_tags` re-link that ended
 *  the ACCEPTED-LOSSY row). By NAME, because tag ids no more survive a cross-box move than chat ids do. */
type AttachChatTagByNameOp = (args: { readonly ownerId: UserId; readonly chatId: ChatId; readonly tagName: string }) => Promise<boolean>;

/** Profile-wave deps: no db handle or id minters here — each entity write is an injected owning-domain op. */
export interface ImportProfileDeps {
  readonly now: () => number;
  readonly personaByUserName: Map<string, PersonaId>;
  readonly bulkImportChats: BulkImportChatsOp;
  readonly bulkImportPersonas: BulkImportPersonasOp;
  readonly enqueueBackfill: EnqueueImportBackfill;
  readonly reconcileStats: ReconcileImportStats;
  // ── R6: the orb-native chat bundle's three cross-domain re-links. All OPTIONAL, on the
  // `importLorebook`/`importCardScripts` precedent: absent ⇒ that plane simply does not restore, which keeps
  // the ST-only profile-import wiring (which has no use for any of them) honest instead of forcing it to
  // fabricate stubs. The real bundle composition always wires all three.
  readonly findPersonaByName?: FindPersonaByNameOp;
  readonly attachChatTagByName?: AttachChatTagByNameOp;
  /** The chat-anchored rpg campaign's write half. Every message/variant ref is remapped by the bundle verb
   *  through the `ImportedChatIdentity` the chat write op returns, before this ever sees it. */
  readonly importRpgGame?: ImportRpgGame;
}

/** DI bundle every import verb closes over. `profile` is absent for the card-only slice. */
export interface ImportContext {
  readonly ownerId: UserId;
  readonly createCharacter: CreateImportedCharacter;
  readonly findByImportHash: FindCharacterByImportHash;
  readonly findByHandle: FindCharacterByHandle;
  readonly updateCharacter: UpdateImportedCharacter;
  readonly storeAsset: StoreImportAsset;
  readonly attachCardTag: AttachImportedCardTag;
  readonly importLorebook?: BulkImportLorebookOp;
  readonly linkCarriedBooks?: LinkCarriedBooksOp;
  /** D121-E: the card LIFT — a card's by-value ST scripts become library rows + a `character_regex_scripts`
   *  attachment, with carried references re-linked instead of cloned. Optional/absent ⇒ a card's scripts are
   *  simply not imported (the `importLorebook` optionality shape); the real composition root always wires it. */
  readonly importCardScripts?: ImportCardScripts;
  readonly profile?: ImportProfileDeps;
}

export interface ImportService {
  /** Imports one ST character card; idempotent by importHash, falls back to a handle match re-import. */
  readonly importCharacter: (input: ImportCharacterInput) => Promise<ImportCharacterResult>;
  /** Imports loose ST chat .jsonl files into an existing owned character. Requires ctx.profile. */
  readonly importChats: (input: ImportChatsInput) => Promise<ImportChatsResult>;
  /** Imports ONE bundle-shaped chat file — the single-chat door AND the bundle descriptor's one path.
   *  Routes an ST `<handle>/<leaf>.jsonl` to the interchange arm and anything else to
   *  {@link ImportService.importChatBundle}. Requires ctx.profile. Never throws for a malformed file. */
  readonly importChatFile: (input: ImportChatFileInput) => Promise<ImportChatFileOutcome>;
  /** R6 — imports ONE orb-native `<handle>/<id>.orb.json`: the room WHOLE (canon + injections + the tag
   *  overlay + the room blob + the variable/macro picks + the rpg campaign). REFUSES when the file names no
   *  character this account holds (owner ruling 2026-08-07 — a transcript may not be imported without a
   *  character). Requires ctx.profile. Never throws for a malformed file. */
  readonly importChatBundle: (input: ImportChatFileInput) => Promise<ImportChatFileOutcome>;
  /** Imports a profile's personas; must run before the chat importers (populates personaByUserName). */
  readonly importPersonas: (input: { readonly personas: readonly ImportPersonaInput[] }) => Promise<ImportPersonasResult>;
}
