// The real roster producer owns normalization and atomic child writes; capture all three canonical row shapes together.
import type { Db } from "@orb/db";
import { rosterPresetMembers, rosterPresetRules, rosterPresets } from "@orb/db";
import type { RosterPresetService } from "@orb/server/domain/roster-preset";
import { asc, eq, inArray } from "drizzle-orm";

export type RosterPresetRow = typeof rosterPresets.$inferSelect;
export type RosterPresetMemberRow = typeof rosterPresetMembers.$inferSelect;
export type RosterPresetRuleRow = typeof rosterPresetRules.$inferSelect;

/** One real producer's parent and embedded FK rows, not a second application view. */
export interface SeededRosterPreset {
  readonly view: Awaited<ReturnType<RosterPresetService["create"]>>;
  readonly preset: RosterPresetRow;
  readonly members: readonly RosterPresetMemberRow[];
  readonly rules: readonly RosterPresetRuleRow[];
}

/** Produces the roster through its real belts and captures the complete persisted parent/child census. */
export async function seedRosterPreset(
  db: Db,
  create: RosterPresetService["create"],
  params: Parameters<RosterPresetService["create"]>[0],
): Promise<SeededRosterPreset> {
  const view = await create(params);
  const [preset, members, rules] = await Promise.all([
    db.select().from(rosterPresets).where(eq(rosterPresets.id, view.id)).get(),
    db.select().from(rosterPresetMembers).where(eq(rosterPresetMembers.presetId, view.id)).orderBy(asc(rosterPresetMembers.position)),
    db.select().from(rosterPresetRules).where(eq(rosterPresetRules.presetId, view.id)).orderBy(asc(rosterPresetRules.position)),
  ]);
  if (preset === undefined) {
    throw new Error("production roster creation left no canonical roster-preset row");
  }
  if (members.length !== view.members.length || rules.length !== view.rules.length) {
    throw new Error("production roster rows do not match the produced member/rule census");
  }
  return { view, preset, members, rules };
}

/** Capture the exact created roster IDs and their full child sets, including legitimately empty rule sets. */
export async function captureRosterRows(db: Db, ids: readonly RosterPresetRow["id"][]): Promise<CapturedRosterRows> {
  const [presets, members, rules] = await Promise.all([
    db.select().from(rosterPresets).where(inArray(rosterPresets.id, ids)).orderBy(rosterPresets.id),
    db.select().from(rosterPresetMembers).where(inArray(rosterPresetMembers.presetId, ids)).orderBy(rosterPresetMembers.presetId, rosterPresetMembers.position),
    db.select().from(rosterPresetRules).where(inArray(rosterPresetRules.presetId, ids)).orderBy(rosterPresetRules.presetId, rosterPresetRules.position),
  ]);
  if (presets.length !== new Set(ids).size) {
    throw new Error("produced roster preset IDs do not all have canonical rows");
  }
  return { presets, members, rules };
}

interface CapturedRosterRows {
  readonly presets: readonly RosterPresetRow[];
  readonly members: readonly RosterPresetMemberRow[];
  readonly rules: readonly RosterPresetRuleRow[];
}
