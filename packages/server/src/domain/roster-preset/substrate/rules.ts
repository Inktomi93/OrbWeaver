// Pure cast-rule projection (zero I/O) — B10's rules rider (build record §6). The `members.ts`
// sibling: persistence serves the junction rows FLAT and ordered (presetId, position); the per-preset
// grouping + the view projection live here (persistence is queries-only and holds no Map). A stored
// `rulePresetId` is projected VERBATIM — an id a later catalogue removal orphaned still displays
// (degraded, by the client's own catalogue join) and reports as a skip at apply; hiding it here would
// silently shrink a cast the owner authored.

import type { RosterPresetRuleView } from "@orb/contracts/roster-preset";
import type { rosterPresetRules } from "@orb/db";
import type { RosterPresetId } from "@orb/kit/ids";

type CastRuleRow = typeof rosterPresetRules.$inferSelect;

/** Group the FLAT junction rows per preset (order-preserving — the query already sorted by
 *  (presetId, position)) and project each onto the wire view (the array carries the order). */
export function groupCastRuleViews(rows: readonly CastRuleRow[]): Map<RosterPresetId, RosterPresetRuleView[]> {
  const byPreset = new Map<RosterPresetId, RosterPresetRuleView[]>();
  for (const row of rows) {
    const view: RosterPresetRuleView = { rulePresetId: row.rulePresetId, knobs: row.knobs };
    const bucket = byPreset.get(row.presetId);
    if (bucket === undefined) {
      byPreset.set(row.presetId, [view]);
    } else {
      bucket.push(view);
    }
  }
  return byPreset;
}
