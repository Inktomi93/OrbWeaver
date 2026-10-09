import { writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { spawnNiced } from "@orb/tooling/_shared/proc";
import { expect, test } from "../support/tool-fixtures.ts";

for (const scenario of [
  "qualified",
  "record",
  "empty",
  "missing-case",
  "skipped",
  "retry",
  "wrong-class",
  "breach",
  "duplicate",
  "stale-status",
  "diagnostic-skipped",
  "malformed-flags",
] as const) {
  test(`owner timing receipt refuses an invalid ${scenario} claim`, async ({ repoRoot, scratch }) => {
    const expected = [{ file: "native.ct.tsx", title: "native", titlePath: ["chromium", "native"] }];
    const attempt = { file: "native.ct.tsx", title: "native", titlePath: ["chromium", "native"], status: "passed", retry: 0 };
    const attempts = [attempt];
    const detail = {
      metric: "loaf-blocking-ms",
      measured: 1,
      budget: 2,
      capability: { hardwareClass: "inktomi-owner", stableTiming: true, policy: "assert" },
      overBudget: false,
      failed: false,
    };
    if (scenario === "record") {
      detail.capability = { hardwareClass: "inktomi-owner", stableTiming: false, policy: "record" };
    }
    if (scenario === "wrong-class") {
      detail.capability.hardwareClass = "other-box";
    }
    if (scenario === "breach") {
      detail.measured = 3;
      detail.overBudget = true;
      detail.failed = true;
    }
    if (scenario === "retry") {
      attempt.retry = 1;
    }
    if (scenario === "skipped") {
      attempt.status = "skipped";
    }
    if (scenario === "malformed-flags") {
      detail.measured = 3;
    }
    const measurement = { ...attempt, detail: JSON.stringify(detail) };
    const measurements = [measurement];
    if (scenario === "empty") {
      measurements.splice(0);
    }
    if (scenario === "duplicate") {
      measurements.push({ ...measurement });
    }
    if (scenario === "missing-case") {
      expected.push({ file: "native.ct.tsx", title: "missing", titlePath: ["chromium", "missing"] });
    }
    const path = join(scratch, "receipt.json");
    writeFileSync(
      path,
      JSON.stringify({
        status: scenario === "stale-status" ? "interrupted" : "passed",
        tally: { passed: 1, failed: 0, flaky: 0, skipped: scenario === "diagnostic-skipped" ? 2 : 0 },
        nativeTiming: { expected, attempts },
        timingMeasurements: measurements,
      }),
    );
    const result = await spawnNiced(process.execPath, [join(repoRoot, "scripts/ci/owner-timing-receipt.ts"), path, "inktomi-owner"]);
    expect(result.code, result.stderr).toBe(scenario === "qualified" || scenario === "diagnostic-skipped" ? 0 : 2);
  });
}
