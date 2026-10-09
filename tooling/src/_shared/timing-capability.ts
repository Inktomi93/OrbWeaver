// D308: hardware qualification is explicit; completion deadlines and deterministic verdict math are not timing evidence.
import { inheritedProcessEnv } from "./process-env.ts";

export const TIMING_HARDWARE_CLASS_ENV = "ORB_TIMING_HARDWARE_CLASS";
export const TEST_CAPABILITIES_ENV = "ORB_TEST_CAPABILITIES";
export const TIMING_CAPABILITY_ANNOTATION = "orb-timing-capability";
export const TIMING_MEASUREMENT_ANNOTATION = "orb-timing-measurement";
export const STABLE_TIMING_CAPABILITY = "stable-timing";
export const NATIVE_TIMING_CASE_ANNOTATION = { type: "orb-native-timing", description: STABLE_TIMING_CAPABILITY } as const;
export const TIMING_HARDWARE_CLASSES = ["inktomi-owner"] as const;
export const TIMING_EVIDENCE_POLICIES = ["assert", "record"] as const;
export type TimingEvidencePolicy = (typeof TIMING_EVIDENCE_POLICIES)[number];

export type TimingCapability = {
  readonly [P in TimingEvidencePolicy]: {
    readonly hardwareClass: P extends "assert" ? (typeof TIMING_HARDWARE_CLASSES)[number] : string | null;
    readonly stableTiming: P extends "assert" ? true : false;
    readonly policy: P;
    readonly reason: string;
  };
}[TimingEvidencePolicy];

/** Resolve configured capability, never host CPU count or an absent CI flag. */
export function timingCapability(env: NodeJS.ProcessEnv = inheritedProcessEnv()): TimingCapability {
  const requestedHardwareClass = env[TIMING_HARDWARE_CLASS_ENV]?.trim() ?? "";
  const hardwareClass = requestedHardwareClass === "" ? null : requestedHardwareClass;
  const requestedStableTiming = (env[TEST_CAPABILITIES_ENV] ?? "").split(",").some((capability) => capability.trim() === STABLE_TIMING_CAPABILITY);
  const hosted = env["GITHUB_ACTIONS"] === "true" || env["RUNNER_ENVIRONMENT"] !== undefined;
  const named = TIMING_HARDWARE_CLASSES.find((name) => name === hardwareClass);
  if (!hosted && named !== undefined && requestedStableTiming) {
    return { hardwareClass: named, stableTiming: true, policy: "assert", reason: "named hardware with stable-timing capability" };
  }
  const reason = hosted
    ? "GitHub Actions records timing without local hardware qualification"
    : "named hardware and stable-timing capability are both required";
  return { hardwareClass, stableTiming: false, policy: "record", reason };
}

export interface TimingMeasurement {
  readonly metric: string;
  readonly measured: number;
  readonly budget: number;
}

/** Preserve the breach even when its measurement class cannot issue a verdict. */
export function timingMeasurementResult(
  measurement: TimingMeasurement,
  capability: TimingCapability,
): TimingMeasurement & {
  readonly capability: TimingCapability;
  readonly overBudget: boolean;
  readonly failed: boolean;
} {
  const overBudget = measurement.measured > measurement.budget;
  return { ...measurement, capability, overBudget, failed: capability.policy === "assert" && overBudget };
}
