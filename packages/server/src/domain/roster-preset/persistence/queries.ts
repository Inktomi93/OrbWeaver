// All db access for the feature (queries only). Every preset read is OWNERSHIP-scoped in the WHERE
// (`ownerId = ?`), never a post-filter; member reads derive through the preset row (D23 — the junction
// stamps no owner) AND carry that derivation as a JOIN PREDICATE, not as an assumption about the caller
// (#1480 item 6 — see `loadMemberCardRows`). Member views join the LIVE card (name + avatar hash, the
// ParticipantView resolution posture — joined server-side, the client has no id→hash resolver): an INNER
// join, because a deleted character CASCADEs its seat row out, so an unresolvable member is
// unrepresentable, not a degrade arm.
//
// NO `chat_participants` access anywhere in this directory — `applyToChat` drives chat's own verbs via
// injected ops (the no-second-add-path law, D61 B6; grep-provable, dep-cruiser-backstopped).

import type { RosterPresetMemberView, RosterPresetRuleView, RosterPresetSummary, RosterPresetView } from "@orb/contracts/roster-preset";
import type { Db } from "@orb/db";
import { assets, characters, rosterPresetMembers, rosterPresetRules, rosterPresets } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany } from "@orb/db/kit";
import type { RosterPresetId, UserId } from "@orb/kit/ids";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { RosterPresetNotFoundError } from "../contract/errors.ts";
import type { CastRuleWrite, MemberCardRow, MemberWrite } from "../contract/service.ts";

const LIMIT_ONE = 1;

type PresetRow = typeof rosterPresets.$inferSelect;
type MemberRow = typeof rosterPresetMembers.$inferSelect;
type CastRuleRow = typeof rosterPresetRules.$inferSelect;

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
 *  per-preset grouping is the pure `groupMemberViews` in `substrate/members.ts` (persistence holds no Map).
 *
 *  OWNER-SCOPED ON BOTH AXES (#1480 item 6). `presetIds` is caller-supplied, and this is the feature's only
 *  read that leaves the roster tables: a foreign presetId used to read back that preset's whole member list
 *  WITH each seated card's `name` and `avatarHash`. The two live callers resolve their ids one hop earlier
 *  from an owner-scoped read (`listOwnedPresetRows` in `verbs/list`, `loadOwnedPresetRow` in
 *  `substrate/authored-input`), so the belt is local rather than a live fix — the same disposition the
 *  seven-seam pass took (00d770fa4): a predicate at the seam, not a dataflow argument.
 *   • THE PRESET axis rides `roster_presets.owner_id` through a join, because the junction stamps no owner
 *     by design (D23 derive-don't-stamp) — the identical belt `updatePresetWithMembers` puts on its DELETE.
 *   • THE CARD axis is an INNER-join predicate, and it is fail-closed rather than restrictive:
 *     `substrate/authored-input::ensureMembersOwned` gates every member characterId to the preset's owner
 *     at BOTH write verbs, so same-owner is already an invariant of every member row. A row that violated
 *     it would be corrupt, and this read drops it exactly as it already drops a member whose card was
 *     deleted (the header's "unresolvable member is unrepresentable" posture). */
export async function loadMemberCardRows(db: Db, ownerId: UserId, presetIds: readonly RosterPresetId[]): Promise<MemberCardRow[]> {
  if (presetIds.length === 0) {
    return [];
  }
  const rows = await db
    .select({ member: rosterPresetMembers, name: characters.name, avatarHash: assets.hash })
    .from(rosterPresetMembers)
    .innerJoin(rosterPresets, and(eq(rosterPresets.id, rosterPresetMembers.presetId), eq(rosterPresets.ownerId, ownerId)))
    .innerJoin(characters, and(eq(rosterPresetMembers.characterId, characters.id), eq(characters.ownerId, ownerId)))
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

/** The cast rules of `presetIds`, FLAT and ordered (presetId, position) — the per-preset grouping is
 *  the pure `groupCastRuleViews` in `substrate/rules.ts` (persistence holds no Map; the
 *  `loadMemberCardRows` posture). No join: a rule preset is a CODE catalogue member, so the id + bag
 *  columns are the whole row. */
export async function loadCastRuleRows(db: Db, presetIds: readonly RosterPresetId[]): Promise<CastRuleRow[]> {
  if (presetIds.length === 0) {
    return [];
  }
  const rows = await db
    .select()
    .from(rosterPresetRules)
    .where(inArray(rosterPresetRules.presetId, [...presetIds]))
    .orderBy(asc(rosterPresetRules.presetId), asc(rosterPresetRules.position));
  return rows;
}

/** Insert a preset + its seats + its cast rules as ONE batch (atomic — a crash can never land a
 *  memberless party or a half-captured rule list). The rules insert is CONDITIONAL: drizzle's
 *  `.values([])` throws, and an empty capture is the common (rules-free) cast. */
export async function insertPresetWithMembers(
  db: Db,
  preset: typeof rosterPresets.$inferInsert,
  members: readonly MemberWrite[],
  rules: readonly CastRuleWrite[],
): Promise<void> {
  const statements: BatchStmt[] = [
    db.insert(rosterPresets).values(preset),
    db.insert(rosterPresetMembers).values(members.map((m) => ({ ...m, presetId: preset.id }))),
  ];
  if (rules.length > 0) {
    statements.push(db.insert(rosterPresetRules).values(rules.map((r) => ({ ...r, presetId: preset.id }))));
  }
  await db.batch(batchMany(statements));
}

/** Full-replace update: patch the row + swap the whole member list in ONE batch. The whole op is GATED
 *  on the owner (a mismatched caller throws the same leak-free NotFound the verb throws — the persona
 *  `ensureAssetOwned` posture), and the owner predicate ALSO rides every write: the row UPDATE directly,
 *  and the junction DELETE through an owned-preset subquery. The junction has no ownerId by design
 *  (D23 derive-don't-stamp), so its belt IS the join — without it a verb-bypassing caller's bare
 *  presetId would no-op the row yet silently WIPE+replace a foreign preset's member list (stickler F2).
 *  The gate precedes the batch, so the re-INSERT can never target a foreign preset either; ownership
 *  never transfers (no such verb exists), so gate-then-batch has no exploitable window. */
export async function updatePresetWithMembers(
  db: Db,
  args: {
    readonly ownerId: UserId;
    readonly presetId: RosterPresetId;
    readonly patch: Pick<typeof rosterPresets.$inferInsert, "anchorPersonaId" | "description" | "gameTemplate" | "groupConfig" | "name" | "updatedAt">;
    readonly members: readonly MemberWrite[];
    readonly rules: readonly CastRuleWrite[];
  },
): Promise<void> {
  const { ownerId, presetId, patch, members, rules } = args;
  const owned = await loadOwnedPresetRow(db, ownerId, presetId);
  if (owned === undefined) {
    throw new RosterPresetNotFoundError(presetId);
  }
  const ownedPresetIds = db.select({ id: rosterPresets.id }).from(rosterPresets).where(eq(rosterPresets.ownerId, ownerId));
  const statements: BatchStmt[] = [
    db
      .update(rosterPresets)
      .set(patch)
      .where(and(eq(rosterPresets.id, presetId), eq(rosterPresets.ownerId, ownerId))),
    db.delete(rosterPresetMembers).where(and(eq(rosterPresetMembers.presetId, presetId), inArray(rosterPresetMembers.presetId, ownedPresetIds))),
    db.insert(rosterPresetMembers).values(members.map((m) => ({ ...m, presetId }))),
    // The cast-rule full replace rides the same batch + the same owned-preset belt as the member swap
    // (the junction has no ownerId by design — D23 derive-don't-stamp — so its belt IS the join).
    db.delete(rosterPresetRules).where(and(eq(rosterPresetRules.presetId, presetId), inArray(rosterPresetRules.presetId, ownedPresetIds))),
  ];
  if (rules.length > 0) {
    statements.push(db.insert(rosterPresetRules).values(rules.map((r) => ({ ...r, presetId }))));
  }
  await db.batch(batchMany(statements));
}

/** Delete the preset row (seats CASCADE; chats started from it are untouched — no back-reference). Owner
 *  predicate in the WRITE, same belt as the update above. */
export async function deletePresetRow(db: Db, ownerId: UserId, presetId: RosterPresetId): Promise<void> {
  await db.delete(rosterPresets).where(and(eq(rosterPresets.id, presetId), eq(rosterPresets.ownerId, ownerId)));
}

/** Project a row + its resolved members + its cast rules into the full wire view. */
export function viewOf(row: PresetRow, members: readonly RosterPresetMemberView[], rules: readonly RosterPresetRuleView[]): RosterPresetView {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    anchorPersonaId: row.anchorPersonaId,
    groupConfig: row.groupConfig ?? null,
    game: row.gameTemplate ?? null,
    members,
    rules,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Project a row + members + cast rules into the picker's summary. */
export function summaryOf(row: PresetRow, members: readonly RosterPresetMemberView[], rules: readonly RosterPresetRuleView[]): RosterPresetSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    characterCount: members.length,
    members,
    anchorPersonaId: row.anchorPersonaId,
    hasGroupConfig: row.groupConfig !== null,
    game: row.gameTemplate ?? null,
    rules,
    updatedAt: row.updatedAt,
  };
}
