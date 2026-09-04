// @instrument-absence-proof: perf-meter's rate is the one output whose ABSENCE must never read as a
// measurement — a contended box, software acceleration and an unknown acceleration posture each WITHHOLD
// before the arm votes, and the quiet planted control proves the withhold is a measurement rather than a
// blanket refusal. The marker moved here at #1315 with the deletion of `pnpm perf-meter`'s argv door; the
// firing half stays on the boot-trace suite (docs/architecture/core/Core-Tooling-Law.md §4.5).
// §7.1 load honesty at perf-meter's actual RATE-result seam. The injected readings are planted controls:
// a contended box must print the shared WITHHELD receipt, publish perf=withheld and force exit 2; the
// quiet twin must remain measured and preserve its app verdict. Boot-trace facts do not enter this seam.
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

test("a planted contended box withholds perf-meter's rate before it votes", () => {
  const { stdout, value: disposition } = capture(() => perfRateDisposition(HARDWARE, () => ({ loadavg1: 8, cpuCount: 2 })));

  expect(disposition).toMatchObject({ withheld: true });
  expect(stdout).toContain("WITHHELD (ORB-LOAD-WITHHOLD");
  expect(stdout).toContain("loadavg 8.0 / 2 cores");
  expect(perfRatePair(disposition)).toEqual(["perf", "withheld"]);
  expect(perfRateExit(disposition, EXIT.violations)).toBe(2);
});

test("the quiet planted control still measures and emits no withhold banner", () => {
  const { stdout, value: disposition } = capture(() => perfRateDisposition(HARDWARE, () => ({ loadavg1: 0.6, cpuCount: 2 })));

  expect(disposition).toMatchObject({ withheld: false });
  expect(stdout).toBe("");
  expect(perfRatePair(disposition)).toEqual(["perf", "measured"]);
  expect(perfRateExit(disposition, EXIT.clean)).toBe(0);
});

test("software acceleration withholds the rate even on a quiet box", () => {
  const { stdout, value: disposition } = capture(() =>
    perfRateDisposition({ ...HARDWARE, backend: "SwiftShader", posture: "software" }, () => ({ loadavg1: 0.6, cpuCount: 2 })),
  );

  expect(disposition.withheld).toBe(true);
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

  expect(disposition.withheld).toBe(true);
  expect(stdout).toContain("BROWSER-ACCELERATION-WITHHOLD");
  expect(perfRatePair(disposition)).toEqual(["perf", "withheld"]);
  expect(perfRateExit(disposition, EXIT.clean)).toBe(2);
});
