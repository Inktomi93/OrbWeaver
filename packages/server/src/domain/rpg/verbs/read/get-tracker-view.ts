// domain/rpg/verbs/read/get-tracker-view — getTrackerView (rpg-design/05 §4.8). The aggregate the takeover
// renders in ONE query. MEMBER-gated (`resolveMember`), then delegates to the SHARED `buildTrackerView`
// projection (`./tracker-view` — the same projection the gather's steering reminder reads, so the panel and the
// injection never drift). Resolves `trackersReadOnly` (the CP read-only pill) and hands it to the projection.

import type { RpgTrackerView } from "@orb/contracts/rpg";
import { buildTrackerView } from "../../chat-ops/tracker-view";
import type { ReadGameParams } from "../../contract/params";
import type { RpgContext, RpgService } from "../../contract/service";
import { resolveMember } from "../../guard";

export function createGetTrackerView(ctx: RpgContext): Pick<RpgService, "getTrackerView"> {
  async function getTrackerView(params: ReadGameParams): Promise<RpgTrackerView> {
    const { game } = await resolveMember(ctx, params.principal, params.chatId);
    const trackersReadOnly = await ctx.resolveTrackersReadOnly(params.chatId);
    return buildTrackerView(ctx, game, trackersReadOnly);
  }
  return { getTrackerView };
}
