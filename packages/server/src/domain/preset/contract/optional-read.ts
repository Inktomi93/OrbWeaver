import type { PresetDetail } from "@orb/contracts/preset";
import type { PresetId, UserId } from "@orb/kit/ids";
/** A missing or foreign preset is optional; operational failures are not. */
export type LoadOptionalPreset = (userId: UserId, id: PresetId) => Promise<PresetDetail | null>;
