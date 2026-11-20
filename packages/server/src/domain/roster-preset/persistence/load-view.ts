// The detail re-read create, update and get share; the write-side belts live in `substrate/authored-input.ts`.

import type { RosterPresetView } from "@orb/contracts/roster-preset";
import type { RosterPresetId, UserId } from "@orb/kit/ids";
import { RosterPresetNotFoundError } from "../contract/errors.ts";
import type { RosterPresetContext } from "../contract/service.ts";
import { groupMemberViews } from "../substrate/members.ts";
import { groupCastRuleViews } from "../substrate/rules.ts";
import { loadCastRuleRows, loadMemberCardRows, loadOwnedPresetRow, viewOf } from "./queries.ts";

/** The detail read create/update/get share (card names + avatar hashes joined; members in position
 *  order; cast rules in stored order). The not-owned and not-found answers collapse into one leak-free
 *  NotFound. */
export async function loadView(ctx: RosterPresetContext, ownerId: UserId, presetId: RosterPresetId): Promise<RosterPresetView> {
  const row = await loadOwnedPresetRow(ctx.db, ownerId, presetId);
  if (row === undefined) {
    throw new RosterPresetNotFoundError(presetId);
  }
  const members = groupMemberViews(await loadMemberCardRows(ctx.db, ownerId, [presetId])).get(presetId) ?? [];
  const rules = groupCastRuleViews(await loadCastRuleRows(ctx.db, [presetId])).get(presetId) ?? [];
  return viewOf(row, members, rules);
}
