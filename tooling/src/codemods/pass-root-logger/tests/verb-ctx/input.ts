import { getLog, securityEvent } from "#foundation/observability";

export function createCreate(ctx: PresetContext): Pick<PresetService, "create"> {
  async function create(params: CreatePresetParams): Promise<PresetDetail> {
    const id = ctx.newPresetId();
    getLog().info({ userId: params.userId, presetId: id }, "preset: created");
    securityEvent(
      "preset_owner_mismatch",
      { presetId: id },
      "security: preset owner mismatch",
    );
    securityEvent("preset_refused", { presetId: id }, "security: preset refused");
    return toPresetDetail(id);
  }
  return { create };
}
