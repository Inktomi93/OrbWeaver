// The rate posture belongs to one Snap run. Every rate arm must consume the same acceleration/load
// sample even when a hypothetical second read would disagree.

import { expect, test } from "@orb/testkit/tooling";
import { vi } from "vitest";
import { launchProbeSession, withProbeSession } from "../../../../tooling/src/floor/browser/browser.ts";
import type { BrowserAccelerationEvidence } from "../../../../tooling/src/floor/browser/browser-acceleration.ts";
import type { ProbeLaunchOptions } from "../../../../tooling/src/floor/browser/browser-contract.ts";
import { snapRatePostureSchema } from "../../../../tooling/src/snap/contract/rate-posture.ts";
import { ratePostureDisposition, sampleSnapRatePosture } from "../../../../tooling/src/snap/lib/rate-posture.ts";

const HARDWARE: BrowserAccelerationEvidence = {
  backend: "Mesa Intel UHD 770",
  posture: "hardware",
  gpuCompositing: "enabled",
  rasterization: "enabled",
  webgl: "enabled",
  webgpu: "enabled",
};

const BROWSER_OPTIONS = {
  headless: true,
  viewport: { width: 640, height: 480 },
  colorScheme: null,
  reducedMotion: false,
  contrast: null,
  reducedTransparency: false,
  localStorage: [],
} satisfies ProbeLaunchOptions;

test("one immutable run posture keeps all rate consumers consistent when a second read would disagree", async () => {
  await withProbeSession(await launchProbeSession(BROWSER_OPTIONS), async ({ browser }) => {
    const acceleration = vi
      .fn()
      .mockResolvedValueOnce(HARDWARE)
      .mockResolvedValueOnce({ ...HARDWARE, backend: "SwiftShader", posture: "software" });
    const load = vi.fn().mockReturnValueOnce({ loadavg1: 0.5, cpuCount: 8 }).mockReturnValueOnce({ loadavg1: 64, cpuCount: 8 });

    const receipt = await sampleSnapRatePosture(browser, { readAcceleration: acceleration, readLoad: load });
    const dispositions = ["app-snapshot", "motion", "interaction-perf"].map((arm) => ratePostureDisposition(receipt, arm));

    expect(acceleration).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledOnce();
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(dispositions.map((row) => row.disposition)).toEqual(["complete", "complete", "complete"]);
    expect(new Set(dispositions.map((row) => row.postureId))).toEqual(new Set([receipt.id]));
    expect(receipt.load).toEqual({ loadavg1: 0.5, cpuCount: 8 });
    expect(receipt.id).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(receipt.id).not.toContain("Mesa");
  });
});

test("one failed acceleration read is owned once and withholds every rate consumer", async () => {
  await withProbeSession(await launchProbeSession(BROWSER_OPTIONS), async ({ browser }) => {
    const acceleration = vi.fn().mockRejectedValueOnce(new Error("planted SystemInfo refusal"));
    const load = vi.fn().mockReturnValue({ loadavg1: 0.5, cpuCount: 8 });

    const receipt = await sampleSnapRatePosture(browser, { readAcceleration: acceleration, readLoad: load });
    const dispositions = ["app-snapshot", "motion", "interaction-perf"].map((arm) => ratePostureDisposition(receipt, arm));

    expect(acceleration).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledOnce();
    expect(dispositions.every((row) => row.disposition === "withheld")).toBe(true);
    expect(dispositions.every((row) => row.reason.includes("planted SystemInfo refusal"))).toBe(true);
  });
});

test("historical rate receipts without hardware identity never acquire timing qualification", () => {
  const receipt = snapRatePostureSchema.parse({
    id: `sha256:${"0".repeat(64)}`,
    acceleration: HARDWARE,
    accelerationError: null,
    load: { loadavg1: 0.5, cpuCount: 24 },
  });
  expect(receipt.timing).toMatchObject({ hardwareClass: null, stableTiming: false, policy: "record" });
});

test("artifact timing qualification rejects an unknown class or contradictory capability", () => {
  const base = { id: `sha256:${"0".repeat(64)}`, acceleration: HARDWARE, accelerationError: null, load: { loadavg1: 0.5, cpuCount: 24 } };
  expect(
    snapRatePostureSchema.safeParse({ ...base, timing: { hardwareClass: "arbitrary-box", stableTiming: true, policy: "assert", reason: "forged" } }).success,
  ).toBe(false);
  expect(
    snapRatePostureSchema.safeParse({ ...base, timing: { hardwareClass: "inktomi-owner", stableTiming: false, policy: "assert", reason: "forged" } }).success,
  ).toBe(false);
  expect(
    snapRatePostureSchema.safeParse({ ...base, timing: { hardwareClass: "arbitrary-box", stableTiming: false, policy: "record", reason: "unqualified" } })
      .success,
  ).toBe(true);
});
