import type {
  ApplyStatsDelta,
  BumpStatsCanonVersion,
  RecordLedgerSpend,
  RetireCharacterCensus,
  SettleRetainedChatRebase,
  ShiftCharacterCensus,
} from "@orb/contracts/stats";
import type { BatchHandle, DatabaseHandle } from "@orb/db/wiring";

export interface StatsBatchWiring {
  readonly applyStatsDelta: ApplyStatsDelta<BatchHandle, DatabaseHandle>;
  readonly applyCharacterStatsDelta: ApplyStatsDelta<BatchHandle, DatabaseHandle>;
  readonly settleRetainedChatRebase: SettleRetainedChatRebase<BatchHandle, DatabaseHandle>;
  readonly bumpStatsCanonVersion: BumpStatsCanonVersion<BatchHandle, DatabaseHandle>;
  readonly retireCharacterCensus: RetireCharacterCensus<BatchHandle, DatabaseHandle>;
  readonly shiftCharacterCensus: ShiftCharacterCensus<BatchHandle, DatabaseHandle>;
  readonly recordLedgerSpend: RecordLedgerSpend<BatchHandle, DatabaseHandle>;
}
