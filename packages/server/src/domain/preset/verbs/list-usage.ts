import type { PresetContext } from "../context.ts";
import { PresetNotFoundError } from "../contract/errors.ts";
import type { ListPresetUsageParams } from "../contract/params.ts";
import type { PresetService } from "../contract/service.ts";
import type { PresetUsageView } from "../contract/views.ts";
import { readablePreset } from "../persistence/queries.ts";

// verb: listUsage — where this preset is bound from OUTSIDE the library (#279): the caller's active-pick
// flag + the rooms whose rpg GM voice redirects to it. The CONTEXT panel's backward-bindings block.
//
// THE GATE IS HERE, THE READ IS INJECTED. Readability is preset's own rule (own row OR the shared system
// default), so this verb resolves it exactly as `get` does and collapses a miss to `PresetNotFoundError` —
// no existence oracle, and no way to ask "which rooms use SOMEONE ELSE's preset". Everything after the gate
// belongs to other domains (settings' active pick; rpg's `gmPresetId`; chat's membership), so it arrives
// through ONE injected op assembled at the composition root — preset imports no sibling runtime.
//
// A read: no audit, no write, and nothing about it is order-sensitive.

export function createListUsage(ctx: PresetContext): Pick<PresetService, "listUsage"> {
  async function listUsage({ principal, id }: ListPresetUsageParams): Promise<PresetUsageView> {
    const row = await readablePreset(ctx.db, principal.userId, id);
    if (row === undefined) {
      throw new PresetNotFoundError(id);
    }
    return ctx.resolvePresetUsage(principal, id);
  }
  return { listUsage };
}
