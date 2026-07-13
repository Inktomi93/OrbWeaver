import type { PresetContext } from "../context";
import { PresetNotFoundError } from "../contract/errors";
import type { GetPresetParams } from "../contract/params";
import type { PresetService } from "../contract/service";
import type { PresetDetail } from "../contract/views";
import { readablePreset } from "../persistence/queries";
import { toPresetDetail } from "../substrate/views";

// verb: get — one preset readable by this owner (their own row OR the shared system default). Throws
// PresetNotFoundError when nothing readable matches. Read-only; no audit.

export function createGet(ctx: PresetContext): Pick<PresetService, "get"> {
  async function get(params: GetPresetParams): Promise<PresetDetail> {
    const row = await readablePreset(ctx.db, params.userId, params.id);
    if (row === undefined) {
      throw new PresetNotFoundError(params.id);
    }
    return toPresetDetail(row);
  }
  return { get };
}
