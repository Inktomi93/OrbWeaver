import { vi } from "vitest";
import { NATIVE_TIMING_CASE_ANNOTATION, TIMING_MEASUREMENT_ANNOTATION, timingCapability } from "../../../tooling/src/_shared/timing-capability.ts";
import { expect, test } from "../fixtures.ts";
import { assertTimingBudget } from "./timing-budget.ts";

test("record-only timing retains its native number and breach without replacing behavioral assertions", async () => {
  const attach = vi.fn().mockResolvedValue(undefined);
  const annotations: { type: string; description?: string }[] = [NATIVE_TIMING_CASE_ANNOTATION];
  await assertTimingBudget({ file: "measurement.ct.tsx", attach, annotations }, { metric: "blocking-ms", measured: 181, budget: 50 }, timingCapability({}));
  expect(attach).toHaveBeenCalledOnce();
  expect(JSON.parse(annotations.find((annotation) => annotation.type === TIMING_MEASUREMENT_ANNOTATION)?.description ?? "null")).toMatchObject({
    measured: 181,
    budget: 50,
    overBudget: true,
    failed: false,
    capability: { policy: "record", hardwareClass: null },
  });
});

test("qualified timing records the receipt before failing a breach", async () => {
  const attach = vi.fn().mockResolvedValue(undefined);
  const annotations: { type: string; description?: string }[] = [NATIVE_TIMING_CASE_ANNOTATION];
  const capability = timingCapability({ ["ORB_TIMING_HARDWARE_CLASS"]: "inktomi-owner", ["ORB_TEST_CAPABILITIES"]: "stable-timing" });
  await expect(
    assertTimingBudget({ file: "measurement.ct.tsx", attach, annotations }, { metric: "blocking-ms", measured: 181, budget: 50 }, capability),
  ).rejects.toThrow("181 exceeds 50 on inktomi-owner");
  expect(attach).toHaveBeenCalledOnce();
  expect(JSON.parse(annotations.find((annotation) => annotation.type === TIMING_MEASUREMENT_ANNOTATION)?.description ?? "null")).toMatchObject({
    overBudget: true,
    failed: true,
  });
});

test("missing artifact integrity still fails record-only evidence", async () => {
  const attach = vi.fn().mockRejectedValue(new Error("artifact write failed"));
  await expect(
    assertTimingBudget(
      { file: "measurement.ct.tsx", attach, annotations: [NATIVE_TIMING_CASE_ANNOTATION] },
      { metric: "blocking-ms", measured: 181, budget: 50 },
      timingCapability({}),
    ),
  ).rejects.toThrow("artifact write failed");
});

test("native timing refuses an undeclared measurement case", async () => {
  const attach = vi.fn().mockResolvedValue(undefined);
  await expect(
    assertTimingBudget({ file: "measurement.ct.tsx", attach, annotations: [] }, { metric: "blocking-ms", measured: 181, budget: 50 }, timingCapability({})),
  ).rejects.toThrow("declared native timing case");
  expect(attach).not.toHaveBeenCalled();
});
