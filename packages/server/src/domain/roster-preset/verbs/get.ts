// verb: get — one owned party, members in position order with their live-card display floor. The
// not-owned and not-found answers collapse into one leak-free NotFound (the persona `get` posture).

import type { RosterPresetContext } from "../context.ts";
import type { GetRosterPresetParams } from "../contract/params.ts";
import type { RosterPresetService } from "../contract/service.ts";
import { loadView } from "../substrate/authored-input.ts";

export function createGet(ctx: RosterPresetContext): RosterPresetService["get"] {
  return async ({ principal, presetId }: GetRosterPresetParams) => loadView(ctx, principal.userId, presetId);
}
