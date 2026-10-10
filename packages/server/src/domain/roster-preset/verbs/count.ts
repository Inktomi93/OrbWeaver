import type { RosterPresetContext } from "../context.ts";
import type { RosterPresetService } from "../contract/service.ts";
import { countOwnedPresets } from "../persistence/queries.ts";

export function createCount(ctx: RosterPresetContext): RosterPresetService["count"] {
  return async ({ principal }) => await countOwnedPresets(ctx.db, principal.userId);
}
