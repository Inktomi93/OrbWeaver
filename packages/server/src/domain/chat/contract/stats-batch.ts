// The stats batch ops D337 rules into chat's committed turn. Stats builds them; chat folds each into its batch and the
// composition root wires them, so the signatures are chat's own, over `@orb/db` handles.

import type { ApplyStatsDelta, BumpStatsCanonVersion, SettleRetainedChatRebase } from "@orb/contracts/stats";
import type { BatchHandle, DatabaseHandle } from "@orb/db/wiring";

export interface ChatStatsBatchWiring {
  readonly applyStatsDelta: ApplyStatsDelta<BatchHandle, DatabaseHandle>;
  readonly applyCharacterStatsDelta: ApplyStatsDelta<BatchHandle, DatabaseHandle>;
  readonly settleRetainedChatRebase: SettleRetainedChatRebase<BatchHandle, DatabaseHandle>;
  readonly bumpStatsCanonVersion: BumpStatsCanonVersion<BatchHandle, DatabaseHandle>;
}
