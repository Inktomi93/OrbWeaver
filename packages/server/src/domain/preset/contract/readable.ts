import type { PresetId, UserId } from "@orb/kit/ids";

export type PresetReadable = (presetId: PresetId, userId: UserId) => Promise<boolean>;
