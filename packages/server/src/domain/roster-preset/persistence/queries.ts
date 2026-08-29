// All db access for the feature (queries only). Every preset read is OWNERSHIP-scoped in the WHERE
// (`ownerId = ?`), never a post-filter; member reads derive through the preset row (D23 — the junction
// stamps no owner). Member views join the LIVE card (name + avatar hash, the ParticipantView resolution
// posture — joined server-side, the client has no id→hash resolver): an INNER join, because a deleted
// character CASCADEs its seat row out, so an unresolvable member is unrepresentable, not a degrade arm.
//
// NO `chat_participants` access anywhere in this directory — `applyToChat` drives chat's own verbs via
// injected ops (the no-second-add-path law, D61 B6; grep-provable, dep-cruiser-backstopped).

import type { RosterPresetMemberView, RosterPresetSummary, RosterPresetView } from "@orb/contracts/roster-preset";
import type { Db } from "@orb/db";
import { assets, characters, rosterPresetMembers, rosterPresets } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany } from "@orb/db/kit";
import type { RosterPresetId, UserId } from "@orb/kit/ids";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import type { MemberCardRow, MemberWrite } from "../contract/service.ts";

const LIMIT_ONE = 1;

type PresetRow = typeof rosterPresets.$inferSelect;
type MemberRow = typeof rosterPresetMembers.$inferSelect;

/** One owned preset row, or undefined when not found / not the caller's (one answer — leak-free). */
export async function loadOwnedPresetRow(db: Db, ownerId: UserId, presetId: RosterPresetId): Promise<PresetRow | undefined> {
  const rows = await db
    .select()
    .from(rosterPresets)
    .where(and(eq(rosterPresets.id, presetId), eq(rosterPresets.ownerId, ownerId)))
    .limit(LIMIT_ONE);
  return rows[0];
}

/** The owner's presets, NAME-sorted (the picker's order — a party is picked by name). */
export async function listOwnedPresetRows(db: Db, ownerId: UserId): Promise<PresetRow[]> {
  const rows = await db.select().from(rosterPresets).where(eq(rosterPresets.ownerId, ownerId)).orderBy(asc(rosterPresets.name));
  return rows;
}

/** Does the owner already hold a DIFFERENT preset with this name? The typed-conflict pre-check the
 *  `(ownerId, name)` UNIQUE backstops (`excludeId` = the row being updated, so a same-name save is a
 *  no-op rename, not a self-conflict). */
export async function ownedPresetNameTaken(db: Db, ownerId: UserId, name: string, excludeId?: RosterPresetId): Promise<boolean> {
  const clauses = [eq(rosterPresets.ownerId, ownerId), eq(rosterPresets.name, name)];
  if (excludeId !== undefined) {
    clauses.push(ne(rosterPresets.id, excludeId));
  }
  const rows = await db
    .select({ id: rosterPresets.id })
    .from(rosterPresets)
    .where(and(...clauses))
    .limit(LIMIT_ONE);
  return rows.length > 0;
}

/** The members of `presetIds` with their card joins, FLAT and ordered (presetId, position) — the
 *  per-preset grouping is the pure `groupMemberViews` in `substrate/members.ts` (persistence holds no Map). */
export async function loadMemberCardRows(db: Db, presetIds: readonly RosterPresetId[]): Promise<MemberCardRow[]> {
  if (presetIds.length === 0) {
    return [];
  }
  const rows = await db
    .select({ member: rosterPresetMembers, name: characters.name, avatarHash: assets.hash })
    .from(rosterPresetMembers)
    .innerJoin(characters, eq(rosterPresetMembers.characterId, characters.id))
    .leftJoin(assets, eq(characters.avatarAssetId, assets.id))
    .where(inArray(rosterPresetMembers.presetId, [...presetIds]))
    .orderBy(asc(rosterPresetMembers.presetId), asc(rosterPresetMembers.position));
  return rows.map((row) => ({
    presetId: row.member.presetId,
    view: {
      characterId: row.member.characterId,
      position: row.member.position,
      talkativeness: row.member.talkativeness,
      disabled: row.member.disabled,
      name: row.name,
      avatarHash: row.avatarHash ?? null,
    },
  }));
}

/** The BARE member rows of one preset in position order — applyToChat's read (no card join; the knob
 *  columns + ids are all it drives the injected verbs with). */
export async function loadMemberRows(db: Db, presetId: RosterPresetId): Promise<MemberRow[]> {
  const rows = await db.select().from(rosterPresetMembers).where(eq(rosterPresetMembers.presetId, presetId)).orderBy(asc(rosterPresetMembers.position));
  return rows;
}

/** Insert a preset + its seats as ONE batch (atomic — a crash can never land a memberless party). */
export async function insertPresetWithMembers(db: Db, preset: typeof rosterPresets.$inferInsert, members: readonly MemberWrite[]): Promise<void> {
  const statements: BatchStmt[] = [
    db.insert(rosterPresets).values(preset),
    db.insert(rosterPresetMembers).values(members.map((m) => ({ ...m, presetId: preset.id }))),
  ];
  await db.batch(batchMany(statements));
}

/** Full-replace update: patch the row + swap the whole member list in ONE batch. The owner predicate
 *  rides the WRITE itself (the verb already gated on an owned read — this is the belt against the
 *  cross-tenant write hole: whatever the caller's id, only the owner's row can move). */
export async function updatePresetWithMembers(
  db: Db,
  args: {
    readonly ownerId: UserId;
    readonly presetId: RosterPresetId;
    readonly patch: Pick<typeof rosterPresets.$inferInsert, "anchorPersonaId" | "description" | "groupConfig" | "name" | "updatedAt">;
    readonly members: readonly MemberWrite[];
  },
): Promise<void> {
  const { ownerId, presetId, patch, members } = args;
  const statements: BatchStmt[] = [
    db
      .update(rosterPresets)
      .set(patch)
      .where(and(eq(rosterPresets.id, presetId), eq(rosterPresets.ownerId, ownerId))),
    db.delete(rosterPresetMembers).where(eq(rosterPresetMembers.presetId, presetId)),
    db.insert(rosterPresetMembers).values(members.map((m) => ({ ...m, presetId }))),
  ];
  await db.batch(batchMany(statements));
}

/** Delete the preset row (seats CASCADE; chats started from it are untouched — no back-reference). Owner
 *  predicate in the WRITE, same belt as the update above. */
export async function deletePresetRow(db: Db, ownerId: UserId, presetId: RosterPresetId): Promise<void> {
  await db.delete(rosterPresets).where(and(eq(rosterPresets.id, presetId), eq(rosterPresets.ownerId, ownerId)));
}

/** Project a row + its resolved members into the full wire view. */
export function viewOf(row: PresetRow, members: readonly RosterPresetMemberView[]): RosterPresetView {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    anchorPersonaId: row.anchorPersonaId,
    groupConfig: row.groupConfig ?? null,
    members,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Project a row + members into the picker's summary. */
export function summaryOf(row: PresetRow, members: readonly RosterPresetMemberView[]): RosterPresetSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    memberCount: members.length,
    members,
    anchorPersonaId: row.anchorPersonaId,
    hasGroupConfig: row.groupConfig !== null,
    updatedAt: row.updatedAt,
  };
}
