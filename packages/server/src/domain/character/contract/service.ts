// domain/character/contract/service — the typed API surface (read THIS to know everything the domain does).
// Holds:
//   • CharacterContext   the explicit DI bundle the verbs close over (NOT `ReturnType<>` — §7.4 /
//                        no-context-returntype; the conventional `context.ts` slot re-exports this type)
//   • CharacterService   the verb interface (the front door re-exports the type)
//   • ReapAssetsOp / AttachCardTagOp   the two cross-feature injected-op TYPES (boundaries-are-physics:
//     the runtime is wired at the composition root; character never sideways-imports assets or tag)
//
// The flat live card (D28): owner-scoped CRUD + the git-style snapshot/restore history + the card read
// (`getCard`, the card IS the row) + the synthetic group-identity mint/find. Every USER-facing verb gates
// on `principal.userId` (ownership IS the gate — NO admin/owner guard is injected; there is no privileged
// character surface in this slice, same as persona). The synthetic mint/find are internal chat-injected
// ops on a resolved `ownerId`. Cross-feature deps (the avatar-reap, the tag attach, the domain-event emit)
// arrive type-only on the bundle; character sideways-imports nothing (domain-no-cross-feature).
// The default-card `seeder/` subsystem (PD-32, character.md §8-slot) lives in `seeder/` + `contract/seeder.ts`
//   — it's reached by ENTRY over this service's `create`/`findByHandle` verbs (the injected settings latch
//   ops are wired at the composition root), NOT a character verb, so no tier collapse here.

import type { CharacterCard } from "@orb/contracts/character";
import type { MemberCardVisibility } from "@orb/contracts/chat";
import type { DomainEvent } from "@orb/contracts/events";
import type { Principal } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import type { AssetId, CharacterId, CharacterSnapshotId, ChatId, UserId } from "@orb/kit/ids";
import type { AuditEntry } from "#foundation/observability";
import type {
  BulkAddCardTagParams,
  BulkArchiveParams,
  BulkRemoveParams,
  CreateCharacterParams,
  DuplicateCharacterParams,
  FindByHandleParams,
  FindByImportHashParams,
  FindGroupCharParams,
  GetCardParams,
  GetCharacterParams,
  GetRosterCardViewParams,
  ListCharactersParams,
  ListSnapshotsParams,
  MintGroupCharParams,
  RemoveCharacterParams,
  RestoreParams,
  SnapshotParams,
  UpdateCharacterParams,
} from "./params";
import type { CharacterRef, SnapshotRef, SnapshotSummary } from "./results";
import type { CharacterDetail, CharacterSummary, MemberCardView } from "./views";

/**
 * Best-effort reap of avatar assets that a deleted character may have orphaned. The avatar FK is
 * `onDelete: set null`, so deleting a character does NOT delete the asset — the assets domain decides
 * whether a now-unreferenced blob is reaped (CAS sharing). Injected type-only (the runtime is the assets
 * front door, wired at the composition root); character never imports the assets package.
 */
export type ReapAssetsOp = (assetIds: readonly AssetId[]) => Promise<void>;

/**
 * Attach a tag (by NAME) to one owned character. Returns `true` if it was newly attached, `false` if the
 * carrier already had it (idempotent no-op) — so `bulkAddCardTag` can report updated-vs-skipped without
 * reading the tag-owned junction. Injected type-only (the runtime is the tag front door's resolve-or-create
 * + attach, wired at the composition root); character never imports the tag package.
 */
export type AttachCardTagOp = (args: {
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly tagName: string;
}) => Promise<boolean>;

/**
 * The DI bundle every character verb closes over (wired at the composition root). Explicit interface (not
 * `ReturnType<typeof create…>`) per §7.4 + the `no-context-returntype` gate.
 *   - `db` — the libSQL handle (all queries route through `persistence/`).
 *   - `now` — the INJECTED clock (epoch-ms). No ambient `Date.now()` in a verb (determinism).
 *   - `newCharacterId` / `newSnapshotId` — the INJECTED id minters (production `mintTypeId(...)`; tests the
 *     seeded generator). No ambient `mintTypeId()` in a verb (the same determinism seam).
 *   - `audit` — `foundation/observability`'s `logAudit`, pre-bound to `db` at the root (best-effort).
 *   - `emit` — the injected domain-event op (`@orb/contracts/events`): character emits `character.updated`
 *     on every content write (create/update/duplicate/restore); the embeddings indexer re-embeds. Character
 *     NEVER reaches the bus directly (domain-no-cross-feature) — the root binds it.
 *   - `reapAssets` — the avatar-orphan reap port (assets domain, injected type-only).
 *   - `attachCardTag` — the by-name tag attach port (tag domain, injected type-only) — `bulkAddCardTag` only.
 */
export interface CharacterContext {
  readonly db: Db;
  readonly now: () => number;
  readonly newCharacterId: () => CharacterId;
  readonly newSnapshotId: () => CharacterSnapshotId;
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  readonly emit: (event: DomainEvent) => void;
  readonly reapAssets: ReapAssetsOp;
  readonly attachCardTag: AttachCardTagOp;
  readonly requireParticipant: (principal: Principal, chatId: ChatId) => Promise<void>;
  readonly getChatMemberCardVisibility: (chatId: ChatId) => Promise<MemberCardVisibility>;
}

export interface CharacterService {
  // ── CRUD ──────────────────────────────────────────────────────────────────
  /** Create a character owned by the caller (`contentHash` computed). Optional `provenance` stamps the
   *  `imported_from`/`import_hash` columns (the import composition-root wire — PD-43); omit it for an
   *  app-authored card (provenance stays null). Emits `character.updated`. Throws
   *  `CharacterOperationError("handle_conflict")` on a per-owner handle collision. */
  readonly create: (params: CreateCharacterParams) => Promise<CharacterDetail>;
  /** One owned character by id. Throws `CharacterNotFoundError` when missing OR not the caller's. */
  readonly get: (params: GetCharacterParams) => Promise<CharacterDetail>;
  /** The caller's NON-synthetic characters, newest first (synthetic group buckets excluded — invariant 3). */
  readonly list: (params: ListCharactersParams) => Promise<CharacterSummary[]>;
  /** Edit the live card IN PLACE (always safe — no CAS/COW; D28). Recomputes `contentHash`; emits
   *  `character.updated`. Throws `CharacterNotFoundError` when not owned/found. */
  readonly update: (params: UpdateCharacterParams) => Promise<CharacterDetail>;
  /** Delete an owned character (cascades snapshots/personas/etc.); best-effort reaps the avatar asset.
   *  Throws `CharacterNotFoundError` when not owned/found. */
  readonly remove: (params: RemoveCharacterParams) => Promise<void>;
  /** Clone an owned character into a fresh local card (`<handle>-copy[-n]`, import provenance cleared).
   *  Emits `character.updated`. */
  readonly duplicate: (params: DuplicateCharacterParams) => Promise<CharacterDetail>;
  /** Delete many owned characters (missing/foreign ids are skipped, not thrown — a bulk selection can race
   *  a concurrent delete). Best-effort avatar reap per deletion. */
  readonly bulkRemove: (params: BulkRemoveParams) => Promise<void>;
  /** Archive / un-archive many owned characters (owner-scoped flip; identity flag, not card content). */
  readonly bulkArchive: (params: BulkArchiveParams) => Promise<void>;
  /** Attach a tag by name to many owned characters (via the injected tag port). */
  readonly bulkAddCardTag: (params: BulkAddCardTagParams) => Promise<void>;

  // ── History (git working-tree + commit-log; gates nothing — D28) ────────────
  /** Append a `character_snapshots` history blob (the live card snapshotted). Owner-gated. */
  readonly snapshot: (params: SnapshotParams) => Promise<SnapshotRef>;
  /** Browse an owned character's snapshot history, newest first. */
  readonly listSnapshots: (params: ListSnapshotsParams) => Promise<SnapshotSummary[]>;
  /** Copy a snapshot blob → the live card row IN PLACE (snapshot-current-first, so it's reversible).
   *  Emits `character.updated`. Throws `CharacterNotFoundError` when the character/snapshot isn't owned. */
  readonly restore: (params: RestoreParams) => Promise<CharacterDetail>;

  // ── Card read (chat/roster/memory inject this) — the card IS the row ─────────
  /** The live card for an owned character, or `null` for not-owned / mid-delete (contract invariant —
   *  callers treat `null` as "skip, not an error"; it NEVER throws). */
  readonly getCard: (params: GetCardParams) => Promise<CharacterCard | null>;

  /** The membership-gated, level-clamped card view for a roster member (D22). */
  readonly getRosterCardView: (params: GetRosterCardViewParams) => Promise<MemberCardView>;

  // ── Card-text projection (embeddings indexer injects this — UN-PRINCIPAL, D20) ──
  /** The card-text embed PROJECTION for a character, keyed by id ALONE (NO owner scope — D20: the vector
   *  substrate carries no `ownerId`; the indexer is a trusted SYSTEM re-reader, never a user-facing surface).
   *  `null` when the card is gone or synthetic. A read — never throws. NOT routed through `can()`/owner-gating;
   *  wired only into the embeddings indexer at the composition root. */
  readonly loadCardText: (characterId: CharacterId) => Promise<string | null>;

  /** Every NON-synthetic character id, ALL owners (the embeddings BULK embed pass's enumeration — PD-53).
   *  UN-PRINCIPAL like `loadCardText` (D20): a trusted SYSTEM sweep, never a user-facing surface; wired only
   *  into the embeddings service at the composition root. A read — never throws. */
  readonly listEmbeddableCharacterIds: () => Promise<readonly CharacterId[]>;

  // ── Re-import dedup (import-injected, internal) ─────────────────────────────
  /** The owner's existing character that already carries `importHash` (the re-import dedup oracle), or
   *  `null`. Owner-scoped: a different owner's same-hash card is never returned. A read — never throws. */
  readonly findByImportHash: (params: FindByImportHashParams) => Promise<CharacterRef | null>;

  // ── By-handle resolve (seeder-injected, internal) ───────────────────────────
  /** The owner's character carrying `handle` (the default-card seeder's partial-rerun resolve path), or
   *  `null`. Owner-scoped: a different owner's same-handle card is never returned. A read — never throws. */
  readonly findByHandle: (params: FindByHandleParams) => Promise<CharacterRef | null>;

  // ── Synthetic group identity (chat-injected, internal) ──────────────────────
  /** Find-or-mint the hidden `synthetic=true` `__group__${chatId}` character (the scoped-group memory
   *  bucket). Idempotent: a second call returns the same row. Never emits (synthetic rows aren't embedded). */
  readonly mintSyntheticGroupCharacter: (params: MintGroupCharParams) => Promise<CharacterRef>;
  /** Look up the synthetic group character for a room, or `null` if not yet minted. */
  readonly findSyntheticGroupCharacter: (
    params: FindGroupCharParams,
  ) => Promise<CharacterRef | null>;
}
