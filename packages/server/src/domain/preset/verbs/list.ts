import type { PresetContext } from "../context.ts";
import type { ListPresetsParams } from "../contract/params.ts";
import type { PresetService } from "../contract/service.ts";
import type { PresetSummary } from "../contract/views.ts";
import { listReadable } from "../persistence/queries.ts";
import { toPresetSummary } from "../substrate/views.ts";

// verb: list — the owner's library rows PLUS the shared system default, as summaries (the two-armed read).
// Read-only; no audit.

export function createList(ctx: PresetContext): Pick<PresetService, "list"> {
  async function list(params: ListPresetsParams): Promise<PresetSummary[]> {
    const rows = await listReadable(ctx.db, params.userId);
    return rows.map(toPresetSummary);
  }
  return { list };
}
