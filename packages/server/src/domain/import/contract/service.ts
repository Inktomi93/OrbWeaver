// domain/import/contract/service — typed API surface: ImportContext (DI bundle) + ImportService
// (verb interface) + the injected cross-feature op types the composition root wires at the root.

import type { AttachedBookRef, CreateCharacterInput } from "@orb/contracts/character";
import type { BulkImportChatInput, BulkImportChatsResult } from "@orb/contracts/chat";
import type { BulkImportPersonaInput, BulkImportPersonasResult } from "@orb/contracts/persona";
import type { BulkImportLorebookInput, BulkImportLorebookResult } from "@orb/contracts/world-info";
import type { AssetId, CharacterHandle, CharacterId, ChatId, PersonaId, UserId } from "@orb/kit/ids";
import type { ImportPreset } from "#domain/preset";
import type { ImportCardScripts, ImportPresetScripts } from "#domain/regex";
import type { ImportRpgGame } from "#domain/rpg";
import type { SettingsImportOutcome } from "#domain/settings";
import type { ImportCharacterInput, ImportOrphanCharacterInput, RestoreCharacterBookInput } from "./params.ts";
import type {
  ImportCharacterResult,
  ImportChatFileOutcome,
  ImportChatsResult,
  ImportedCharacterRef,
  ImportGroupsResult,
  ImportOrphanCharacterResult,
  ImportPersonasResult,
  ImportPresetsResult,
  ImportThemesResult,
  RestoreCharacterBookResult,
} from "./results.ts";
import type { CollectedPreset, CollectedTheme, ImportChatFileInput, ImportChatsInput, ImportGroupsInput, ImportPersonaInput } from "./views.ts";

export type CreateImportedCharacter = (args: {
  readonly ownerId: UserId;
  readonly input: CreateCharacterInput;
  readonly importedFrom: string | null;
  readonly importHash: string;
}) => Promise<ImportedCharacterRef>;

/** Re-import dedup oracle: id of the caller's existing character carrying `importHash`, or null. */
export type FindCharacterByImportHash = (args: { readonly ownerId: UserId; readonly importHash: string }) => Promise<CharacterId | null>;

/** Per-owner handle EXISTENCE oracle for `freeHandle`'s collision-suffix loop (#1470 replaced the PD-108
 *  handle-MATCH re-import this op originally backed — "never dedupe by name": a byte-new card whose
 *  name-slug collides gets a numeric-suffixed handle, a NEW character, never an edit of the existing one).
 *  Fires only after `FindCharacterByImportHash` misses (a byte-identical re-import is the cheaper path). */
type FindCharacterByHandle = (args: { readonly ownerId: UserId; readonly handle: CharacterHandle }) => Promise<CharacterId | null>;

/** CAS-stores the card/avatar PNG bytes and returns the asset id (one blob serves both roles). */
export type StoreImportAsset = (args: { readonly ownerId: UserId; readonly bytes: Uint8Array; readonly mime: string }) => Promise<AssetId>;

/** Attaches one author-shipped card tag by name as a card/pending suggestion; idempotent, race-safe. */
type AttachImportedCardTag = (args: { readonly ownerId: UserId; readonly characterId: CharacterId; readonly tagName: string }) => Promise<boolean>;

/** World-info-owned lorebook bulk-import write op; optional (card-only upload path skips embedded books).
 *  DESTRUCTIVE on a character that already holds a primary book — it REPLACES that book's entries (#1598),
 *  which is why the card-import verb gates it behind {@link HasPrimaryBookOp} and only the explicit restore
 *  verb calls it into an occupied seat. */
type BulkImportLorebookOp = (args: {
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly book: BulkImportLorebookInput;
}) => Promise<BulkImportLorebookResult>;

/** World-info-owned READ: does this character already hold a PRIMARY book? The non-destructiveness oracle
 *  for a card RE-UPLOAD (#1598, owner ruling 2026-09-05 — "re-uploading a card must not revert my edits").
 *  Wired from the SAME `ImportWorldInfoPort` as {@link BulkImportLorebookOp}, so a composition that can write
 *  the embedded book can always ask first; optional here on that op's own precedent, and an absent oracle
 *  keeps the pre-#1598 behavior of whatever `importLorebook` that same composition supplied. */
type HasPrimaryBookOp = (args: { readonly ownerId: UserId; readonly characterId: CharacterId }) => Promise<boolean>;

/** World-info-owned re-link op for a portable card's carried attached-book references (PD-144); optional —
 *  the card-only upload path omits it. Links only ids the importer OWNS, returns linked/skipped counts. */
type LinkCarriedBooksOp = (args: {
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly refs: readonly AttachedBookRef[];
}) => Promise<{ readonly linked: number; readonly skipped: number }>;

/** Enqueues one memory-backfill workload for the owner, once per import run when a chat was written. Returns
 *  whether a row actually entered the queue: the workloads door can REFUSE the enqueue (#156 — memory is off
 *  for this owner, so the sweep could only land a vacuous 0/0), and an already-active run is the benign
 *  conflict the op swallows. Either way the import succeeds; the caller reports the truth. */
type EnqueueImportBackfill = (args: { readonly ownerId: UserId }) => Promise<boolean>;

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
  /** The IANA zone SillyTavern's zone-less wall-clock timestamps (`send_date`'s human forms, the filename /
   *  header `create_date`) were written against — ST builds them off the local `Date` of the box it ran on.
   *  INJECTED, never read ambiently down in the parser: the composition root resolves it (`hostTimeZone()`,
   *  correct whenever a corpus is imported on the box that produced it) and a test pins it. Absent ⇒ the
   *  serde's `"UTC"` default. */
  readonly stWallClockZone?: string;
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
  /** Preset-owned import write op — the ST preset wave hands it orb-native `orb.preset` BYTES, so the preset
   *  domain keeps its one serde AND its one (ownerId, name) collision rule and import owns neither. OPTIONAL on
   *  the `importLorebook` precedent: absent ⇒ the preset plane simply does not restore (the profile-import
   *  composition always wires it; a card-only wiring has no use for it). */
  readonly importPreset?: ImportPreset;
  /** Settings-owned theme import op — the ST theme wave hands it orb-native `orb.theme` BYTES, so the
   *  settings domain keeps its one serde AND its one (ownerId, name) collision rule and import owns neither.
   *  OPTIONAL on the `importPreset` precedent: absent ⇒ the theme plane simply does not restore. */
  readonly importTheme?: ImportTheme;
  /** Regex-owned PRESET lift — a collected preset's own `extensions.regex_scripts` become library rows +
   *  a `preset_regex_scripts` attachment, AFTER `importPreset` returns the row id. OPTIONAL on the
   *  `importCardScripts` precedent: absent ⇒ the scripts are reported skipped-with-reason, never silent. */
  readonly importPresetScripts?: ImportPresetScripts;
}

/** Settings-owned theme-backup import write op (`domain/settings` `createImportTheme`). Spelled here as an
 *  injected-op TYPE rather than imported, exactly like every other cross-domain op on this bundle. */
type ImportTheme = (ownerId: UserId, bytes: Uint8Array) => Promise<SettingsImportOutcome>;

/** DI bundle every import verb closes over. `profile` is absent for the card-only slice. */
export interface ImportContext {
  readonly ownerId: UserId;
  readonly createCharacter: CreateImportedCharacter;
  readonly findByImportHash: FindCharacterByImportHash;
  readonly findByHandle: FindCharacterByHandle;
  readonly storeAsset: StoreImportAsset;
  readonly attachCardTag: AttachImportedCardTag;
  readonly importLorebook?: BulkImportLorebookOp;
  /** The #1598 skip oracle — see {@link HasPrimaryBookOp}. Travels with `importLorebook`. */
  readonly hasPrimaryBook?: HasPrimaryBookOp;
  readonly linkCarriedBooks?: LinkCarriedBooksOp;
  /** D121-E: the card LIFT — a card's by-value ST scripts become library rows + a `character_regex_scripts`
   *  attachment, with carried references re-linked instead of cloned. Optional/absent ⇒ a card's scripts are
   *  simply not imported (the `importLorebook` optionality shape); the real composition root always wires it. */
  readonly importCardScripts?: ImportCardScripts;
  readonly profile?: ImportProfileDeps;
}

export interface ImportService {
  /** Imports one ST character card; idempotent by importHash (a byte-identical re-import RECONCILES its
   *  overlay planes, #1470). A byte-new card that collides on handle disambiguates via `freeHandle`
   *  (`emily` → `emily-2`) instead of matching by name — #1470 replaced the earlier PD-108 handle-match
   *  edit-in-place with this "never dedupe by name" rule, so a re-import never routes to an update. */
  readonly importCharacter: (input: ImportCharacterInput) => Promise<ImportCharacterResult>;
  /** THE RESTORE DOOR (#1598, owner ruling 2026-09-05). Re-asserts a card file's EMBEDDED lorebook over the
   *  character that card imported as — the explicit, opt-in half of the non-destructive re-upload: an ordinary
   *  re-upload now KEEPS the owner's edited primary book, and this is how they ask for the card's own version
   *  back. Owner-gated twice over: the card resolves to a character through the caller's own
   *  `(ownerId, importHash)` dedup oracle, and the world-info write re-asserts ownership before it touches a
   *  row. Refuses (never throws a bare Error) when the bytes are not a card, when the card carries no
   *  embedded book, or when no character of THIS owner was imported from those bytes. */
  readonly restoreCharacterBook: (input: RestoreCharacterBookInput) => Promise<RestoreCharacterBookResult>;
  /** Mints a MINIMAL placeholder character for an ORPHAN chats/ directory (card PNG absent) from the dir's
   *  own evidence — name at most, never invented prose — so its transcripts can import instead of being
   *  skipped. Idempotent via a synthetic dir-keyed importHash. The driver then runs the ordinary
   *  {@link ImportService.importChats} against the mint and tags it `orphan import` for discoverability. */
  readonly importOrphanCharacter: (input: ImportOrphanCharacterInput) => Promise<ImportOrphanCharacterResult>;
  /** Imports loose ST chat .jsonl files into an existing owned character. Requires ctx.profile. */
  readonly importChats: (input: ImportChatsInput) => Promise<ImportChatsResult>;
  /** Imports ONE bundle-shaped chat file — the single-chat door AND the bundle descriptor's one path.
   *  Routes an ST `<handle>/<leaf>.jsonl` to the interchange arm and anything else to
   *  {@link ImportService.importChatBundle}. Requires ctx.profile. Never throws for a malformed file. */
  readonly importChatFile: (input: ImportChatFileInput) => Promise<ImportChatFileOutcome>;
  /** R6 — imports ONE orb-native `<handle>/<id>.orb.json`: the room WHOLE (canon + injections + the tag
   *  overlay + the room blob + the variable/macro picks + the rpg campaign). REFUSES when the file names no
   *  character this account holds (owner ruling — a transcript may not be imported without a
   *  character). Requires ctx.profile. Never throws for a malformed file. */
  readonly importChatBundle: (input: ImportChatFileInput) => Promise<ImportChatFileOutcome>;
  /** Imports a profile's personas; must run before the chat importers (populates personaByUserName). */
  readonly importPersonas: (input: { readonly personas: readonly ImportPersonaInput[] }) => Promise<ImportPersonasResult>;
  /** Imports a profile's ST presets (already mapped to the orb-native file by the collector) through the
   *  preset domain's own idempotent import op. Per-preset isolation. Requires ctx.profile. */
  readonly importPresets: (input: { readonly presets: readonly CollectedPreset[] }) => Promise<ImportPresetsResult>;
  /** Imports a profile's ST UI themes (already mapped to an orb `ThemeOverride` by the collector) through the
   *  settings domain's own idempotent theme-import op. Per-theme isolation. Requires ctx.profile. */
  readonly importThemes: (input: { readonly themes: readonly CollectedTheme[] }) => Promise<ImportThemesResult>;
  /** Imports a profile's ST GROUPS as multi-character rooms — one room per group transcript, seated from the
   *  group's member cards resolved BY CARD FILENAME. Per-group and per-member isolation. Requires ctx.profile.
   *  Runs AFTER the character wave (the filename → characterId map is its input). */
  readonly importGroupChats: (input: ImportGroupsInput) => Promise<ImportGroupsResult>;
}
