// Snap's perf RATE is one arm among independent verdict members. These planted load readings exercise
// the real arm capture and RESULT-pair functions: contention withholds before page.evaluate, while the
// quiet twin collects navigation evidence. Neither path contributes a pass/fail count.
import process from "node:process";
import type { Page } from "@playwright/test";
import { vi } from "vitest";
import type { BrowserAccelerationEvidence } from "../../../../../tooling/src/_shared/browser-acceleration.ts";
import { snapRatePostureIdSchema } from "../../../../../tooling/src/snap/contract/rate-posture.ts";
import type { SnapRatePosture } from "../../../../../tooling/src/snap/lib/rate-posture.ts";
import { APP_SNAPSHOT_ARM, appSnapshotResultPair, capturePerfEvidence } from "../../../../../tooling/src/snap/ops/arms/perf.ts";
import { expect, test } from "../../../../support/tool-fixtures.ts";

const HARDWARE: BrowserAccelerationEvidence = {
  backend: "Mesa Intel UHD 770",
  posture: "hardware",
  gpuCompositing: "enabled",
  rasterization: "enabled",
  webgl: "enabled",
  webgpu: "enabled",
};

function testPage(evaluate: Page["evaluate"]): Pick<Page, "evaluate"> {
  return { evaluate };
}

function posture(acceleration: BrowserAccelerationEvidence = HARDWARE, load: SnapRatePosture["load"] = { loadavg1: 0.6, cpuCount: 2 }): SnapRatePosture {
  return { id: snapRatePostureIdSchema.parse(`sha256:${"0".repeat(64)}`), acceleration, accelerationError: null, load };
}

async function captureStdout<T>(run: () => Promise<T>): Promise<{ readonly stdout: string; readonly value: T }> {
  let stdout = "";
  const write = vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
    stdout += chunk.toString();
    return true;
  }) as typeof process.stdout.write);
  try {
    const value = await run();
    return { stdout, value };
  } finally {
    write.mockRestore();
  }
}

test("a planted contended box withholds the perf arm and never reads rate evidence", async () => {
  const evaluate = vi.fn() as Page["evaluate"];
  const { stdout, value: evidence } = await captureStdout(
    async () => await capturePerfEvidence(testPage(evaluate), posture(HARDWARE, { loadavg1: 8, cpuCount: 2 })),
  );

  expect(evaluate).not.toHaveBeenCalled();
  expect(evidence?.rate.status).toBe("withheld");
  expect(stdout).toContain("WITHHELD (ORB-LOAD-WITHHOLD");
  expect(appSnapshotResultPair([evidence])).toEqual(["app-snapshot", "withheld"]);
  expect(APP_SNAPSHOT_ARM.lifecycle.failures()).toEqual({});
});

test("the quiet planted control collects the real arm shape and reports measured", async () => {
  const evaluate = vi.fn().mockResolvedValue({
    navigation: { domContentLoadedMs: 11, loadMs: 22, responseMs: 7 },
    orb: { queries: 3 },
  }) as Page["evaluate"];
  const evidence = await capturePerfEvidence(testPage(evaluate), posture());

  expect(evaluate).toHaveBeenCalledOnce();
  expect(evidence).toMatchObject({
    rate: { status: "measured" },
    navigation: { domContentLoadedMs: 11, loadMs: 22, responseMs: 7 },
  });
  expect(appSnapshotResultPair([evidence])).toEqual(["app-snapshot", "measured"]);
});

test("software acceleration withholds Snap's perf arm without creating a failure vote", async () => {
  const evaluate = vi.fn() as Page["evaluate"];
  const software: BrowserAccelerationEvidence = { ...HARDWARE, backend: "SwiftShader", posture: "software" };
  const evidence = await capturePerfEvidence(testPage(evaluate), posture(software));

  expect(evaluate).not.toHaveBeenCalled();
  expect(evidence?.rate.status).toBe("withheld");
  expect(appSnapshotResultPair([evidence])).toEqual(["app-snapshot", "withheld"]);
  expect(APP_SNAPSHOT_ARM.lifecycle.failures()).toEqual({});
});

test("unknown acceleration withholds Snap's perf arm before page evidence can look measured", async () => {
  const evaluate = vi.fn() as Page["evaluate"];
  const unknown: BrowserAccelerationEvidence = {
    ...HARDWARE,
    backend: "unknown",
    posture: "unknown",
    gpuCompositing: "unknown",
    rasterization: "unknown",
  };
  const { stdout, value: evidence } = await captureStdout(async () => await capturePerfEvidence(testPage(evaluate), posture(unknown)));

  expect(evaluate).not.toHaveBeenCalled();
  expect(evidence?.rate.status).toBe("withheld");
  expect(stdout).toContain("BROWSER-ACCELERATION-WITHHOLD");
  expect(appSnapshotResultPair([evidence])).toEqual(["app-snapshot", "withheld"]);
  expect(APP_SNAPSHOT_ARM.lifecycle.failures()).toEqual({});
});
