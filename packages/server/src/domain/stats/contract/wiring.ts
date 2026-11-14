import type {
  ApplyStatsDelta,
  BumpStatsCanonVersion,
  PrepareCanonRetirement,
  RecordLedgerSpend,
  SettleRetainedChatRebase,
  ShiftCharacterCensus,
} from "@orb/contracts/stats";
import type { BatchHandle, DatabaseHandle } from "@orb/db/wiring";

export interface StatsBatchWiring {
  readonly applyStatsDelta: ApplyStatsDelta<BatchHandle, DatabaseHandle>;
  readonly applyCharacterStatsDelta: ApplyStatsDelta<BatchHandle, DatabaseHandle>;
  readonly settleRetainedChatRebase: SettleRetainedChatRebase<BatchHandle, DatabaseHandle>;
  readonly bumpStatsCanonVersion: BumpStatsCanonVersion<BatchHandle, DatabaseHandle>;
  readonly prepareCanonRetirement: PrepareCanonRetirement<BatchHandle, DatabaseHandle>;
  readonly shiftCharacterCensus: ShiftCharacterCensus<BatchHandle, DatabaseHandle>;
  readonly recordLedgerSpend: RecordLedgerSpend<BatchHandle, DatabaseHandle>;
}
