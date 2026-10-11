import type { TimingCapability } from "../../floor/host/timing-capability.ts";
import type { EvidenceGap } from "../../floor/verdict/evidence.ts";
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
