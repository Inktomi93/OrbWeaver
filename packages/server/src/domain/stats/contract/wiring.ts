import type { ApplyStatsDelta, BumpStatsCanonVersion, SettleRetainedChatRebase } from "@orb/contracts/stats";
import type { BatchHandle, DatabaseHandle } from "@orb/db/wiring";

export interface StatsBatchWiring {
  readonly applyStatsDelta: ApplyStatsDelta<BatchHandle, DatabaseHandle>;
  readonly applyCharacterStatsDelta: ApplyStatsDelta<BatchHandle, DatabaseHandle>;
  readonly settleRetainedChatRebase: SettleRetainedChatRebase<BatchHandle, DatabaseHandle>;
  readonly bumpStatsCanonVersion: BumpStatsCanonVersion<BatchHandle, DatabaseHandle>;
}
