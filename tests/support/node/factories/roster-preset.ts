// The Roster preset row and result shapes; the reads that return them live in the rows tier (`rows/roster-preset.ts`).

import type { rosterPresetMembers, rosterPresetRules, rosterPresets } from "@orb/db";
import type { RosterPresetService } from "@orb/server/domain/roster-preset";

export type RosterPresetRow = typeof rosterPresets.$inferSelect;
type RosterPresetMemberRow = typeof rosterPresetMembers.$inferSelect;
type RosterPresetRuleRow = typeof rosterPresetRules.$inferSelect;

/** One real producer's parent and embedded FK rows, not a second application view. */
export interface SeededRosterPreset {
  readonly view: Awaited<ReturnType<RosterPresetService["create"]>>;
  readonly preset: RosterPresetRow;
  readonly members: readonly RosterPresetMemberRow[];
  readonly rules: readonly RosterPresetRuleRow[];
}

export interface CapturedRosterRows {
  readonly presets: readonly RosterPresetRow[];
  readonly members: readonly RosterPresetMemberRow[];
  readonly rules: readonly RosterPresetRuleRow[];
}
