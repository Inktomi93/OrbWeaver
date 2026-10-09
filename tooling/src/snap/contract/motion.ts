import type { EvidenceGap } from "../../_shared/evidence.ts";
import type { TimingCapability } from "../../_shared/timing-capability.ts";
import type { AuditData } from "../../motion-audit/index.ts";

export interface MotionMeasurement {
  readonly data: AuditData | null;
  readonly timing: TimingCapability;
  readonly gaps: readonly EvidenceGap[];
  readonly pass: boolean;
  readonly artifact: string | null;
  /** A loaded run still measures; only its timing thresholds become non-voting. */
  readonly loadSuspect: string | null;
}
