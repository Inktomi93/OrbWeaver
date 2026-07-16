// The polymorphic junction registry: the one insertion/deletion path for the five per-type FK junctions +
// the per-target ownership/membership gate. Each dispatch is a `Record<TagTargetType, …>` (a type
// annotation, not `satisfies`, so a 6th target member is a tsc error until the Record gains its key).
//
// Two scoping flavors: target-derived (character/worldBook/persona/preset) — owner reached via the target's
// `ownerId` using `fetchOwned`; membership (chat) — chats have no owner, access is the injected
// `requireParticipant` gate, and the junction carries its own `ownerId` (the tagger).

import type { Principal } from "@orb/contracts/identity";
import type { TagStatus, TagTargetType } from "@orb/contracts/tag";
import type { Db, OwnedTable } from "@orb/db";
import { characters, characterTags, chatTags, fetchOwned, personas, personaTags, presets, presetTags, worldBooks, worldBookTags } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { CharacterId, ChatId, PersonaId, PresetId, TagId, UserId, WorldBookId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";
import type { RequireParticipant } from "../contract/service";

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

const TARGET_GUARDS: Record<TagTargetType, TargetGuard> = {
  // membership IS the scope (chats have no owner). The injected gate rejects a non-member.
  chat: ({ principal, requireParticipant, targetId }) => requireParticipant(principal, castId<ChatId>(targetId)),
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
  preset: ({ db, principal, targetId }) => ensureOwnedTarget({ db, table: presets, targetId, ownerId: principal.userId, label: "preset" }),
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

/** Attach one tag to a character at the given `status`, idempotently, reporting whether it was newly
 *  attached. A returned row ⇒ new junction row (true); empty result ⇒ already existed (false, status
 *  untouched — never downgrades an already-`accepted` row to `pending`). This is the by-name attach path;
 *  the status-flipping {@link INSERTERS} path is the principal-gated `attachTag` "Accept". */
export async function attachCharacterTag(args: {
  readonly db: Db;
  readonly characterId: CharacterId;
  readonly tagId: TagId;
  readonly status: TagStatus;
}): Promise<boolean> {
  const inserted = await args.db
    .insert(characterTags)
    .values({ characterId: args.characterId, tagId: args.tagId, status: args.status })
    .onConflictDoNothing({ target: [characterTags.characterId, characterTags.tagId] })
    .returning({ tagId: characterTags.tagId });
  return inserted.length > 0;
}

/** Detach one tag from a character, idempotently, reporting whether a row was removed. The mirror of
 *  {@link attachCharacterTag}. The tag row itself is left intact. */
export async function detachCharacterTag(args: { readonly db: Db; readonly characterId: CharacterId; readonly tagId: TagId }): Promise<boolean> {
  const deleted = await args.db
    .delete(characterTags)
    .where(and(eq(characterTags.characterId, args.characterId), eq(characterTags.tagId, args.tagId)))
    .returning({ tagId: characterTags.tagId });
  return deleted.length > 0;
}

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
      .values(tagIds.map((tagId) => ({ characterId: castId<CharacterId>(targetId), tagId, status })))
      .onConflictDoUpdate({
        target: [characterTags.characterId, characterTags.tagId],
        set: { status },
      }),
  chat: ({ db, targetId, tagIds, taggerId }) =>
    db
      .insert(chatTags)
      .values(tagIds.map((tagId) => ({ chatId: castId<ChatId>(targetId), tagId, ownerId: taggerId })))
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
    db.delete(characterTags).where(and(eq(characterTags.characterId, castId<CharacterId>(targetId)), eq(characterTags.tagId, tagId))),
  // D30 per-user overlay: the tagger removes ONLY their own row (ownerId in the predicate).
  chat: ({ db, targetId, tagId, taggerId }) =>
    db.delete(chatTags).where(and(eq(chatTags.chatId, castId<ChatId>(targetId)), eq(chatTags.tagId, tagId), eq(chatTags.ownerId, taggerId))),
  worldBook: ({ db, targetId, tagId }) =>
    db.delete(worldBookTags).where(and(eq(worldBookTags.worldBookId, castId<WorldBookId>(targetId)), eq(worldBookTags.tagId, tagId))),
  persona: ({ db, targetId, tagId }) => db.delete(personaTags).where(and(eq(personaTags.personaId, castId<PersonaId>(targetId)), eq(personaTags.tagId, tagId))),
  preset: ({ db, targetId, tagId }) => db.delete(presetTags).where(and(eq(presetTags.presetId, castId<PresetId>(targetId)), eq(presetTags.tagId, tagId))),
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
