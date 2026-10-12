import type { PresetId, UserId } from "@orb/kit/ids";
import type { PresetDetail } from "./views.ts";
/** A missing or foreign preset is optional; operational failures are not. */
export type LoadOptionalPreset = (userId: UserId, id: PresetId) => Promise<PresetDetail | null>;
