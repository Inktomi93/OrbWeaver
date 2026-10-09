import type { TestInfo } from "@playwright/test";
import { classifyTestFilename } from "../../../tooling/src/_shared/test-kinds.ts";
import type { TimingCapability, TimingMeasurement } from "../../../tooling/src/_shared/timing-capability.ts";
import {
  NATIVE_TIMING_CASE_ANNOTATION,
  TIMING_MEASUREMENT_ANNOTATION,
  timingCapability,
  timingMeasurementResult,
} from "../../../tooling/src/_shared/timing-capability.ts";

/** Attach before asserting, so both qualified failures and record-only breaches retain the same evidence. */
export async function assertTimingBudget(
  info: Pick<TestInfo, "file" | "annotations" | "attach">,
  measurement: TimingMeasurement,
  capability: TimingCapability = timingCapability(),
): Promise<void> {
  const kind = classifyTestFilename(info.file)?.definition;
  if (kind === undefined || kind.timingCapability === null) {
    throw new Error("native timing evidence requires a registered timing-capable test kind");
  }
  if (!info.annotations.some((annotation) => annotation.type === NATIVE_TIMING_CASE_ANNOTATION.type && annotation.description === kind.timingCapability)) {
    throw new Error("native timing requires a declared native timing case");
  }
  const result = timingMeasurementResult(measurement, capability);
  info.annotations.push({ type: TIMING_MEASUREMENT_ANNOTATION, description: JSON.stringify(result) });
  await info.attach(`timing-${measurement.metric}`, { body: JSON.stringify(result), contentType: "application/json" });
  if (result.failed) {
    throw new Error(`${measurement.metric}: ${String(measurement.measured)} exceeds ${String(measurement.budget)} on ${capability.hardwareClass}`);
  }
}
