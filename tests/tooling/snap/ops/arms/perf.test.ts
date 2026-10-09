// Snap's perf RATE is one arm among independent verdict members. These planted load readings exercise
// the real arm capture and RESULT-pair functions: contention MEASURES and LABELS (owner ruling
// 2026-09-05, #1616 — the arm used to skip the `page.evaluate` entirely and publish nothing, which on a
// box that is never quiet meant no number ever), while the quiet twin collects the same evidence
// unlabelled. Neither path contributes a pass/fail count, and `load-suspect` moves no exit code.
// The one remaining WITHHELD cause is an unproven/software browser — no number exists there at all.
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
  return {
    id: snapRatePostureIdSchema.parse(`sha256:${"0".repeat(64)}`),
    acceleration,
    accelerationError: null,
    timing: { hardwareClass: "inktomi-owner", stableTiming: true, policy: "assert", reason: "deterministic fixture" },
    load,
  };
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

test("a planted contended box MEASURES and labels the perf arm load-suspect — it never withholds for load (#1616)", async () => {
  const evaluate = vi.fn().mockResolvedValue({
    navigation: { domContentLoadedMs: 11, loadMs: 22, responseMs: 7 },
    orb: { queries: 3 },
  }) as Page["evaluate"];
  const { stdout, value: evidence } = await captureStdout(
    async () => await capturePerfEvidence(testPage(evaluate), posture(HARDWARE, { loadavg1: 8, cpuCount: 2 })),
  );

  // THE NUMBER EXISTS. The read happens, the navigation evidence lands, and the label is what stops the
  // reader (and the RESULT line) from promoting it.
  expect(evaluate).toHaveBeenCalledTimes(1);
  expect(evidence?.navigation).toEqual({ domContentLoadedMs: 11, loadMs: 22, responseMs: 7 });
  expect(evidence?.rate.status).toBe("load-suspect");
  expect(stdout).toContain("LOAD-SUSPECT (ORB-LOAD-SUSPECT");
  expect(stdout, "load must never print the withhold marker again").not.toContain("ORB-LOAD-WITHHOLD");
  expect(appSnapshotResultPair([evidence])).toEqual(["app-snapshot", "load-suspect"]);
  // NO PROMOTION IN EITHER DIRECTION: a labelled number is not a failure count and not a pass.
  expect(APP_SNAPSHOT_ARM.lifecycle.failures()).toEqual({});
});

test("an unproven browser still WITHHOLDS — the member that survives is the one with no number at all", async () => {
  const evaluate = vi.fn() as Page["evaluate"];
  const software: BrowserAccelerationEvidence = {
    backend: "SwiftShader",
    posture: "software",
    gpuCompositing: "disabled",
    rasterization: "disabled",
    webgl: "disabled",
    webgpu: "disabled",
  };
  const { stdout, value: evidence } = await captureStdout(
    async () => await capturePerfEvidence(testPage(evaluate), posture(software, { loadavg1: 0.2, cpuCount: 2 })),
  );

  expect(evaluate).not.toHaveBeenCalled();
  expect(evidence?.rate.status).toBe("withheld");
  expect(stdout).toContain("WITHHELD (");
  expect(appSnapshotResultPair([evidence])).toEqual(["app-snapshot", "withheld"]);
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
