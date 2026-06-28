import type { ListPresetsParams } from "../contract/params";
import type { PresetContext, PresetService } from "../contract/service";
import type { PresetSummary } from "../contract/views";
import { listReadable } from "../persistence/queries";
import { toPresetSummary } from "../substrate/views";

// verb: list — the owner's library rows PLUS the shared system default, as summaries (the two-armed read).
// Read-only; no audit.

export function createList(ctx: PresetContext): Pick<PresetService, "list"> {
  async function list(params: ListPresetsParams): Promise<PresetSummary[]> {
    const rows = await listReadable(ctx.db, params.userId);
    return rows.map(toPresetSummary);
  }
  return { list };
}
