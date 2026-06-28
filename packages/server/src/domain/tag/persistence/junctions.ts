// domain/tag/persistence/junctions — the polymorphic junction REGISTRY: the ONE insertion / deletion path for
// the five per-type FK junctions (tag.md invariant #3) + the per-target ownership / membership gate. Each
// dispatch is a mapped-type Record keyed by `TagTargetType` (a `: Record<TagTargetType, …>` ANNOTATION —
// §7.5 / exhaustive-dispatch: a 6th target member is a `tsc` error until the Record gains its key). A Record,
// not a `switch`, because the canonical `TagTargetType` is a `z.infer` union (the biome lint type-checker
// cannot prove a `switch` over it exhaustive); the Record's type annotation is the proof tsc enforces (it
// also contextually types each arrow, so the handlers need no explicit return type).
//
// TWO scoping flavors (D30):
//   • target-derived (character / worldBook / persona / preset) — owner reached via the target's KEPT
//     `ownerId` using `fetchOwned`. The `OwnedTable` constraint on `fetchOwned` is the COMPILE-TIME upgrade of
//     neo's module-load ownerId assertion (tag.md §Esoteric): a target table without `ownerId` would not
//     typecheck as `fetchOwned`'s argument — a misconfigured target-derived entry can't compile, so no runtime
//     assertion is needed (and no `users` table is read — the `no-direct-users-read` chokepoint holds).
//   • membership (chat) — `chats` has no owner (D18); access is the INJECTED `requireParticipant` gate, and the
//     junction carries its own `ownerId` (the tagger) so two members tag a shared chat independently.
//
// No `as never` polymorphic cast (tag.md offers this typed alternative to neo's cast): each Record arm brands
// `targetId` with the typed `castId` helper for its own junction (type-safe + the `no-loose-id-cast` gate).

import type { Principal } from "@orb/contracts/identity";
import type { TagStatus, TagTargetType } from "@orb/contracts/tag";
import type { Db, OwnedTable } from "@orb/db";
import {
  characters,
  characterTags,
  chatTags,
  fetchOwned,
  personas,
  personaTags,
  presets,
  presetTags,
  worldBooks,
  worldBookTags,
} from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import type {
  CharacterId,
  ChatId,
  PersonaId,
  PresetId,
  TagId,
  UserId,
  WorldBookId,
} from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";
import type { RequireParticipant } from "../contract/service";

// ── target-access guard (ownership for the four target-derived types; injected membership for chat) ───────

interface TargetGuardArgs {
  readonly db: Db;
  readonly principal: Principal;
  readonly requireParticipant: RequireParticipant;
  readonly targetId: string;
}
type TargetGuard = (args: TargetGuardArgs) => Promise<void>;

/** Throw `DomainNotFoundError(label)` unless `targetId` names a row owned by `ownerId` (a foreign-owned
 *  target reads as not-found — owner reached via the target's `ownerId`). */
async function ensureOwnedTarget(args: {
  readonly db: Db;
  readonly table: OwnedTable;
  readonly targetId: string;
  readonly ownerId: UserId;
  readonly label: TagTargetType;
}): Promise<void> {
  const row = await fetchOwned(args.db, args.table, args.targetId, args.ownerId);
  if (row === undefined) {
    throw new DomainNotFoundError(args.label, args.targetId);
  }
}

// A `: Record<TagTargetType, …>` ANNOTATION (not `satisfies`) is the exhaustiveness proof (a missing key is
// a tsc error) AND gives each arrow a contextual type (so the inline handlers need no explicit return type);
// indexing a mapped type over the finite union returns the value type, never `| undefined`.
const TARGET_GUARDS: Record<TagTargetType, TargetGuard> = {
  // D30: membership IS the scope (chats have no owner, D18). The injected gate rejects a non-member.
  chat: ({ principal, requireParticipant, targetId }) =>
    requireParticipant(principal, castId<ChatId>(targetId)),
  character: ({ db, principal, targetId }) =>
    ensureOwnedTarget({
      db,
      table: characters,
      targetId,
      ownerId: principal.userId,
      label: "character",
    }),
  worldBook: ({ db, principal, targetId }) =>
    ensureOwnedTarget({
      db,
      table: worldBooks,
      targetId,
      ownerId: principal.userId,
      label: "worldBook",
    }),
  persona: ({ db, principal, targetId }) =>
    ensureOwnedTarget({
      db,
      table: personas,
      targetId,
      ownerId: principal.userId,
      label: "persona",
    }),
  preset: ({ db, principal, targetId }) =>
    ensureOwnedTarget({ db, table: presets, targetId, ownerId: principal.userId, label: "preset" }),
};

/** Gate access to an attach/detach target. Target-derived types verify ownership; chat (D30) routes through
 *  the injected membership gate. Throws (DomainNotFoundError / the participant guard's reject) on deny. */
export function ensureTargetAccessible(args: {
  readonly db: Db;
  readonly principal: Principal;
  readonly requireParticipant: RequireParticipant;
  readonly targetType: TagTargetType;
  readonly targetId: string;
}): Promise<void> {
  return TARGET_GUARDS[args.targetType](args);
}

// ── single attach (idempotent) ───────────────────────────────────────────────────────────────────────────

interface AttachArgs {
  readonly db: Db;
  readonly targetId: string;
  readonly tagId: TagId;
  /** The tagger's own owner id — used ONLY by the chat arm (the D30 per-user overlay column). */
  readonly taggerId: UserId;
  /** The proposed/accepted surface — used ONLY by the character arm. */
  readonly status: TagStatus;
}
type JunctionInserter = (args: AttachArgs) => Promise<unknown>;

const INSERTERS: Record<TagTargetType, JunctionInserter> = {
  // character carries `status` and UPSERTs it: re-attach flips a pending row → accepted (the "Accept").
  character: ({ db, targetId, tagId, status }) =>
    db
      .insert(characterTags)
      .values({ characterId: castId<CharacterId>(targetId), tagId, status })
      .onConflictDoUpdate({
        target: [characterTags.characterId, characterTags.tagId],
        set: { status },
      }),
  // chat carries the tagger's own `ownerId` (D30); a same-tagger duplicate is a no-op.
  chat: ({ db, targetId, tagId, taggerId }) =>
    db
      .insert(chatTags)
      .values({ chatId: castId<ChatId>(targetId), tagId, ownerId: taggerId })
      .onConflictDoNothing(),
  worldBook: ({ db, targetId, tagId }) =>
    db
      .insert(worldBookTags)
      .values({ worldBookId: castId<WorldBookId>(targetId), tagId })
      .onConflictDoNothing(),
  persona: ({ db, targetId, tagId }) =>
    db
      .insert(personaTags)
      .values({ personaId: castId<PersonaId>(targetId), tagId })
      .onConflictDoNothing(),
  preset: ({ db, targetId, tagId }) =>
    db
      .insert(presetTags)
      .values({ presetId: castId<PresetId>(targetId), tagId })
      .onConflictDoNothing(),
};

/** Attach ONE tag to a target (idempotent). Per-type semantics live in {@link INSERTERS}. */
export async function insertJunctionRow(args: {
  readonly db: Db;
  readonly targetType: TagTargetType;
  readonly targetId: string;
  readonly tagId: TagId;
  readonly taggerId: UserId;
  readonly status: TagStatus;
}): Promise<void> {
  await INSERTERS[args.targetType](args);
}

// ── bulk attach (many tags → one target, single multi-row insert) ────────────────────────────────────────

interface BulkAttachArgs {
  readonly db: Db;
  readonly targetId: string;
  readonly tagIds: readonly TagId[];
  readonly taggerId: UserId;
  readonly status: TagStatus;
}
type JunctionBulkInserter = (args: BulkAttachArgs) => Promise<unknown>;

const BULK_INSERTERS: Record<TagTargetType, JunctionBulkInserter> = {
  character: ({ db, targetId, tagIds, status }) =>
    db
      .insert(characterTags)
      .values(
        tagIds.map((tagId) => ({ characterId: castId<CharacterId>(targetId), tagId, status })),
      )
      .onConflictDoUpdate({
        target: [characterTags.characterId, characterTags.tagId],
        set: { status },
      }),
  chat: ({ db, targetId, tagIds, taggerId }) =>
    db
      .insert(chatTags)
      .values(
        tagIds.map((tagId) => ({ chatId: castId<ChatId>(targetId), tagId, ownerId: taggerId })),
      )
      .onConflictDoNothing(),
  worldBook: ({ db, targetId, tagIds }) =>
    db
      .insert(worldBookTags)
      .values(tagIds.map((tagId) => ({ worldBookId: castId<WorldBookId>(targetId), tagId })))
      .onConflictDoNothing(),
  persona: ({ db, targetId, tagIds }) =>
    db
      .insert(personaTags)
      .values(tagIds.map((tagId) => ({ personaId: castId<PersonaId>(targetId), tagId })))
      .onConflictDoNothing(),
  preset: ({ db, targetId, tagIds }) =>
    db
      .insert(presetTags)
      .values(tagIds.map((tagId) => ({ presetId: castId<PresetId>(targetId), tagId })))
      .onConflictDoNothing(),
};

/** Attach MANY tags to ONE target in a single multi-row insert (the bulk/promote path). The caller
 *  guarantees `tagIds` is non-empty + owner-verified. */
export async function bulkInsertJunctionRows(args: {
  readonly db: Db;
  readonly targetType: TagTargetType;
  readonly targetId: string;
  readonly tagIds: readonly TagId[];
  readonly taggerId: UserId;
  readonly status: TagStatus;
}): Promise<void> {
  await BULK_INSERTERS[args.targetType](args);
}

// ── detach ───────────────────────────────────────────────────────────────────────────────────────────────

interface DetachArgs {
  readonly db: Db;
  readonly targetId: string;
  readonly tagId: TagId;
  /** The tagger — used ONLY by the chat arm, so a member removes only their OWN overlay row (D30). */
  readonly taggerId: UserId;
}
type JunctionDeleter = (args: DetachArgs) => Promise<unknown>;

const DELETERS: Record<TagTargetType, JunctionDeleter> = {
  character: ({ db, targetId, tagId }) =>
    db
      .delete(characterTags)
      .where(
        and(
          eq(characterTags.characterId, castId<CharacterId>(targetId)),
          eq(characterTags.tagId, tagId),
        ),
      ),
  // D30 per-user overlay: the tagger removes ONLY their own row (ownerId in the predicate).
  chat: ({ db, targetId, tagId, taggerId }) =>
    db
      .delete(chatTags)
      .where(
        and(
          eq(chatTags.chatId, castId<ChatId>(targetId)),
          eq(chatTags.tagId, tagId),
          eq(chatTags.ownerId, taggerId),
        ),
      ),
  worldBook: ({ db, targetId, tagId }) =>
    db
      .delete(worldBookTags)
      .where(
        and(
          eq(worldBookTags.worldBookId, castId<WorldBookId>(targetId)),
          eq(worldBookTags.tagId, tagId),
        ),
      ),
  persona: ({ db, targetId, tagId }) =>
    db
      .delete(personaTags)
      .where(
        and(eq(personaTags.personaId, castId<PersonaId>(targetId)), eq(personaTags.tagId, tagId)),
      ),
  preset: ({ db, targetId, tagId }) =>
    db
      .delete(presetTags)
      .where(and(eq(presetTags.presetId, castId<PresetId>(targetId)), eq(presetTags.tagId, tagId))),
};

/** Detach a tag from a target. Per-type semantics live in {@link DELETERS} (chat removes only the tagger's
 *  own overlay row — D30). */
export async function deleteJunctionRow(args: {
  readonly db: Db;
  readonly targetType: TagTargetType;
  readonly targetId: string;
  readonly tagId: TagId;
  readonly taggerId: UserId;
}): Promise<void> {
  await DELETERS[args.targetType](args);
}
