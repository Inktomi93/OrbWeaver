// The rate posture belongs to one Snap run. Every rate arm must consume the same acceleration/load
// sample even when a hypothetical second read would disagree.
import type { Browser } from "@playwright/test";
import { vi } from "vitest";
import type { BrowserAccelerationEvidence } from "../../../../tooling/src/_shared/browser-acceleration.ts";
import { ratePostureDisposition, sampleSnapRatePosture } from "../../../../tooling/src/snap/lib/rate-posture.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const HARDWARE: BrowserAccelerationEvidence = {
  backend: "Mesa Intel UHD 770",
  posture: "hardware",
  gpuCompositing: "enabled",
  rasterization: "enabled",
  webgl: "enabled",
  webgpu: "enabled",
};

test("one immutable run posture keeps all rate consumers consistent when a second read would disagree", async () => {
  const acceleration = vi
    .fn()
    .mockResolvedValueOnce(HARDWARE)
    .mockResolvedValueOnce({ ...HARDWARE, backend: "SwiftShader", posture: "software" });
  const load = vi.fn().mockReturnValueOnce({ loadavg1: 0.5, cpuCount: 8 }).mockReturnValueOnce({ loadavg1: 64, cpuCount: 8 });

  // FABRICATION-OK: this sentinel can reach only the injected readAcceleration spy, which ignores Browser fields; the test asserts that exact injected boundary is called once.
  const receipt = await sampleSnapRatePosture({} as Browser, { readAcceleration: acceleration, readLoad: load });
  const dispositions = ["app-snapshot", "motion", "interaction-perf"].map((arm) => ratePostureDisposition(receipt, arm));

  expect(acceleration).toHaveBeenCalledOnce();
  expect(load).toHaveBeenCalledOnce();
  expect(Object.isFrozen(receipt)).toBe(true);
  expect(dispositions.map((row) => row.withheld)).toEqual([false, false, false]);
  expect(new Set(dispositions.map((row) => row.postureId))).toEqual(new Set([receipt.id]));
  expect(receipt.load).toEqual({ loadavg1: 0.5, cpuCount: 8 });
  expect(receipt.id).toMatch(/^sha256:[a-f0-9]{64}$/u);
  expect(receipt.id).not.toContain("Mesa");
});

test("one failed acceleration read is owned once and withholds every rate consumer", async () => {
  const acceleration = vi.fn().mockRejectedValueOnce(new Error("planted SystemInfo refusal"));
  const load = vi.fn().mockReturnValue({ loadavg1: 0.5, cpuCount: 8 });

  // FABRICATION-OK: this sentinel can reach only the injected readAcceleration spy, which rejects before reading Browser fields; the test asserts that exact injected boundary is called once.
  const receipt = await sampleSnapRatePosture({} as Browser, { readAcceleration: acceleration, readLoad: load });
  const dispositions = ["app-snapshot", "motion", "interaction-perf"].map((arm) => ratePostureDisposition(receipt, arm));

  expect(acceleration).toHaveBeenCalledOnce();
  expect(load).toHaveBeenCalledOnce();
  expect(dispositions.every((row) => row.withheld)).toBe(true);
  expect(dispositions.every((row) => row.reason.includes("planted SystemInfo refusal"))).toBe(true);
});
