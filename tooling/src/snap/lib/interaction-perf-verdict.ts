import type { EvidenceGap } from "../../_shared/evidence.ts";
import type { TimingEvidencePolicy } from "../../_shared/timing-capability.ts";
import type { ArmFactEmission } from "../contract/arms.ts";

/** Keep hardware-unqualified timing recorded while preserving instrument refusal and load precedence. */
export function interactionPerfFact(input: {
  readonly requested: boolean;
  readonly gaps: readonly EvidenceGap[];
  readonly withheld: string | null;
  readonly loadSuspect: string | null;
  readonly breaches: number;
  readonly timingPolicy: TimingEvidencePolicy;
}): Pick<ArmFactEmission<"interaction-perf">["data"], "state" | "detail"> {
  if (!input.requested) {
    return { state: "off", detail: null };
  }
  if (input.gaps.length > 0) {
    return { state: "refused", detail: input.gaps[0]?.detail ?? "interaction performance evidence was unavailable" };
  }
  if (input.withheld !== null) {
    return { state: "withheld", detail: input.withheld };
  }
  if (input.loadSuspect !== null) {
    return { state: "load-suspect", detail: input.loadSuspect };
  }
  const measured =
    input.breaches === 0
      ? "measured; no breach steps observed; interaction thresholds are non-voting"
      : `measured; ${String(input.breaches)} breach step(s) observed; interaction thresholds are non-voting`;
  return { state: input.timingPolicy === "record" ? "recorded" : "passed", detail: measured };
}
