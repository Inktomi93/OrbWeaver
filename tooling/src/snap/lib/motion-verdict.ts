import type { TimingEvidencePolicy } from "../../_shared/timing-capability.ts";
import type { MotionMeasurement } from "../contract/motion.ts";
import type { SnapArmState } from "../contract/run-facts.ts";

type MotionVerdictInput = Pick<MotionMeasurement, "gaps" | "pass" | "timing" | "loadSuspect">;

/** The FACT's member — the terminal's twin, so a run-index reader reaches the same verdict (#1616). A
 *  load-suspect window read as `passed` would be exactly the promotion the ruling forbids. */
export function motionFactState(requested: boolean, measurement: MotionVerdictInput | null): SnapArmState {
  if (!requested) {
    return "off";
  }
  if (measurement === null || measurement.gaps.length > 0) {
    return "refused";
  }
  if (!measurement.pass) {
    return "failed";
  }
  if (measurement.loadSuspect !== null) {
    return "load-suspect";
  }
  return measurement.timing.policy === "record" ? "recorded" : "passed";
}

/** The arm's own member. `LOAD-SUSPECT` sits between REFUSED and PASS/FAIL (#1616): the window MEASURED,
 *  so it is not a refusal, and nothing may promote the numbers, so it is neither PASS nor FAIL. */
export function motionStatus(snapshot: MotionVerdictInput): string {
  if (snapshot.gaps.length > 0) {
    return "REFUSED";
  }
  if (!snapshot.pass) {
    return "FAIL";
  }
  if (snapshot.loadSuspect !== null) {
    return "LOAD-SUSPECT";
  }
  return snapshot.timing.policy === "record" ? "RECORDED" : "PASS";
}

export function motionTimingPolicy(snapshot: MotionVerdictInput): TimingEvidencePolicy {
  return snapshot.loadSuspect === null ? snapshot.timing.policy : "record";
}
