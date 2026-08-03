import type { PresetContext } from "../context.ts";
import { PresetNotFoundError } from "../contract/errors.ts";
import type { GetPresetParams } from "../contract/params.ts";
import type { PresetService } from "../contract/service.ts";
import type { PresetDetail } from "../contract/views.ts";
import { readablePreset } from "../persistence/queries.ts";
import { toPresetDetail } from "../substrate/views.ts";

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
