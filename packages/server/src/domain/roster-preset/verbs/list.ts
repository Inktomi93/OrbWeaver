// verb: list — the caller's saved parties, NAME-sorted (a party is picked by name), each with its
// position-ordered member preview (the picker's avatar stack). One batched member read for the whole
// page — never a per-row N+1.

import type { RosterPresetContext } from "../context.ts";
import type { ListRosterPresetsParams } from "../contract/params.ts";
import type { RosterPresetService } from "../contract/service.ts";
import { listOwnedPresetRows, loadCastRuleRows, loadMemberCardRows, summaryOf } from "../persistence/queries.ts";
import { groupMemberViews } from "../substrate/members.ts";
import { groupCastRuleViews } from "../substrate/rules.ts";

export function createList(ctx: RosterPresetContext): RosterPresetService["list"] {
  return async ({ principal }: ListRosterPresetsParams) => {
    const rows = await listOwnedPresetRows(ctx.db, principal.userId);
    const presetIds = rows.map((row) => row.id);
    const members = groupMemberViews(await loadMemberCardRows(ctx.db, principal.userId, presetIds));
    const rules = groupCastRuleViews(await loadCastRuleRows(ctx.db, presetIds));
    return rows.map((row) => summaryOf(row, members.get(row.id) ?? [], rules.get(row.id) ?? []));
  };
}
