// domain/rpg/verbs/read/get-tracker-view — getTrackerView (rpg-design/05 §4.8). The aggregate the takeover
// renders in ONE query. MEMBER-gated (`resolveMember`), then delegates to the SHARED `buildTrackerView`
// projection (`./tracker-view` — the same projection the gather's steering reminder reads, so the panel and the
// injection never drift). Resolves `trackersReadOnly` (the CP read-only pill) and hands it to the projection.
//
// THE HIDDEN-SPAN STRIP LIVES HERE, NOT IN THE PROJECTION (#1528). `buildTrackerView` is principal-free and is
// ALSO the gather's reminder source, which feeds the MODEL — and the model must read the hidden truth (that is
// the whole deception mechanic). So the belt is a property of THIS READ: a viewer who does not read hidden
// (`viewerReadsHidden` = every present role but the host) gets every free-text plane of the view stripped, the
// host gets canon verbatim through the reveal-eye plane. Same walk the member→host fork runs on the same
// bytes (`substrate/hidden-spans.ts`) — before this, the fork refused to COPY a secret the panel had already
// SHOWN the same human.
//
// NO HISTORY FLOOR HERE, stated so its absence is a decision: the view resolves ONE current state image, not a
// per-turn archive — there is no pre-floor row in it to withhold. `listJournal` is the rpg read that keeps
// per-turn rows, and that is where the D16 floor lands.

import type { RpgTrackerView } from "@orb/contracts/rpg";
import { buildTrackerView } from "../../chat-ops/tracker-view.ts";
import type { ReadGameParams } from "../../contract/params.ts";
import type { RpgContext, RpgService } from "../../contract/service.ts";
import { resolveMember } from "../../guard.ts";
import { stripHiddenForViewer } from "../../substrate/hidden-spans.ts";

export function createGetTrackerView(ctx: RpgContext): Pick<RpgService, "getTrackerView"> {
  async function getTrackerView(params: ReadGameParams): Promise<RpgTrackerView> {
    const { game } = await resolveMember(ctx, params.principal, params.chatId);
    const [{ trackersReadOnly }, visibility] = await Promise.all([
      ctx.resolveStateDelivery(params.chatId, params.principal.userId),
      ctx.resolveViewerVisibility(params.chatId, params.principal.userId),
    ]);
    const view = await buildTrackerView(ctx, game, trackersReadOnly);
    // A `null` visibility cannot happen behind `resolveMember` — and if it ever did, it means "not a present
    // member", so the fail-CLOSED reading is "does not read hidden".
    return stripHiddenForViewer(view, visibility?.readsHidden ?? false);
  }
  return { getTrackerView };
}
