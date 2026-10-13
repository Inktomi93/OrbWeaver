// The greeting consumer needs prompt configuration, not a foreign service context or detail DTO.

import type { PromptConfig } from "@orb/contracts/preset";
import type { PresetId, UserId } from "@orb/kit/ids";

export type ReadOptionalPresetConfig = (userId: UserId, id: PresetId) => Promise<PromptConfig | null>;
