// @instrument-absence-proof: perf-meter's rate is the one output whose ABSENCE must never read as a
// measurement — software acceleration and an unknown acceleration posture each WITHHOLD before the arm
// votes, and the quiet planted control proves the withhold is a measurement rather than a blanket refusal.
// The marker moved here at #1315 with the deletion of the retired `pnpm perf-meter`'s door; the firing half
// stays on the boot-trace suite (docs/law/Core-Tooling-Law.md §4.5).
// §7.1 load honesty at perf-meter's actual RATE-result seam, AS AMENDED BY #1616's owner ruling: a
// CONTENDED box no longer withholds — it MEASURES, prints the LOAD-SUSPECT receipt, publishes
// `perf=load-suspect` and leaves the exit alone. Only an unproven browser (NO number at all) still
// withholds and forces exit 2. The injected readings are planted controls in every direction.
import process from "node:process";
import { vi } from "vitest";
import { EXIT } from "../../../../tooling/src/_shared/exit-contract.ts";
import { perfRateDisposition, perfRateExit, perfRatePair } from "../../../../tooling/src/cpu-profile/lib/rate.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const HARDWARE = {
  backend: "Mesa Intel UHD 770",
  posture: "hardware",
  gpuCompositing: "enabled",
  rasterization: "enabled",
  webgl: "enabled",
  webgpu: "enabled",
} as const;

function capture<T>(run: () => T): { readonly stdout: string; readonly value: T } {
  let stdout = "";
  const write = vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
    stdout += chunk.toString();
    return true;
  }) as typeof process.stdout.write);
  try {
    const value = run();
    return { stdout, value };
  } finally {
    write.mockRestore();
  }
}

test("a planted contended box MEASURES and labels the rate load-suspect, never moving the exit (#1616)", () => {
  const { stdout, value: disposition } = capture(() => perfRateDisposition(HARDWARE, () => ({ loadavg1: 8, cpuCount: 2 })));

  expect(disposition).toMatchObject({ disposition: "load-suspect" });
  expect(stdout).toContain("LOAD-SUSPECT (ORB-LOAD-SUSPECT");
  expect(stdout).toContain("loadavg 8.0/2 cores");
  expect(perfRatePair(disposition)).toEqual(["perf", "load-suspect"]);
  // THE NO-PROMOTION RULE, both directions: a load-suspect arm cannot turn a violation into a tool error…
  expect(perfRateExit(disposition, EXIT.violations)).toBe(EXIT.violations);
  // …and cannot turn a clean run into anything else either.
  expect(perfRateExit(disposition, EXIT.clean)).toBe(EXIT.clean);
});

test("the quiet planted control still measures and emits no banner at all", () => {
  const { stdout, value: disposition } = capture(() => perfRateDisposition(HARDWARE, () => ({ loadavg1: 0.6, cpuCount: 2 })));

  expect(disposition).toMatchObject({ disposition: "complete" });
  expect(stdout).toBe("");
  expect(perfRatePair(disposition)).toEqual(["perf", "measured"]);
  expect(perfRateExit(disposition, EXIT.clean)).toBe(0);
});

test("software acceleration STILL withholds — the withheld member's remaining occupant (#1616)", () => {
  const { stdout, value: disposition } = capture(() =>
    perfRateDisposition({ ...HARDWARE, backend: "SwiftShader", posture: "software" }, () => ({ loadavg1: 0.6, cpuCount: 2 })),
  );

  expect(disposition.disposition).toBe("withheld");
  expect(stdout).toContain("SOFTWARE-ACCELERATION-WITHHOLD");
  expect(perfRatePair(disposition)).toEqual(["perf", "withheld"]);
  expect(perfRateExit(disposition, EXIT.clean)).toBe(2);
});

test("unknown acceleration withholds the rate before it can look measured", () => {
  const { stdout, value: disposition } = capture(() =>
    perfRateDisposition({ ...HARDWARE, backend: "unknown", posture: "unknown", gpuCompositing: "unknown", rasterization: "unknown" }, () => ({
      loadavg1: 0.6,
      cpuCount: 2,
    })),
  );

  expect(disposition.disposition).toBe("withheld");
  expect(stdout).toContain("BROWSER-ACCELERATION-WITHHOLD");
  expect(perfRatePair(disposition)).toEqual(["perf", "withheld"]);
  expect(perfRateExit(disposition, EXIT.clean)).toBe(2);
});
