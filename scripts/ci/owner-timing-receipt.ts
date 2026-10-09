// D308 qualification requires the declared native cases and their actual successful assert-policy measurements.
import { readFileSync } from "node:fs";
import process from "node:process";
import { runTool } from "@orb/tooling/_shared/run-tool";
import { TIMING_HARDWARE_CLASSES } from "@orb/tooling/_shared/timing-capability";
import { z } from "zod";
import type { CtNativeTimingCase } from "../../tooling/src/verify/contract/ct-run.ts";

await runTool(() => {
  const path = process.argv[2];
  const expectedClass = z.enum(TIMING_HARDWARE_CLASSES).parse(process.argv[3]);
  if (path === undefined) {
    throw new Error("Usage: owner-timing-receipt.ts <completed ct-flaky.json> <hardware-class>");
  }
  const identity = z.object({ file: z.string().min(1), title: z.string(), titlePath: z.array(z.string()).min(1) });
  const attempt = identity.extend({ status: z.literal("passed"), retry: z.literal(0) });
  const detail = z.object({
    metric: z.string().min(1),
    measured: z.number().nonnegative(),
    budget: z.number().nonnegative(),
    capability: z.object({ hardwareClass: z.literal(expectedClass), stableTiming: z.literal(true), policy: z.literal("assert") }),
    overBudget: z.literal(false),
    failed: z.literal(false),
  });
  const schema = z.object({
    status: z.literal("passed"),
    tally: z.object({ passed: z.number().int().positive(), failed: z.literal(0), flaky: z.literal(0), skipped: z.number().int().nonnegative() }),
    nativeTiming: z.object({ expected: z.array(identity).min(1), attempts: z.array(attempt).min(1) }),
    timingMeasurements: z.array(attempt.extend({ detail: z.string().transform((text) => detail.parse(JSON.parse(text))) })).min(1),
  });
  const receipt = schema.parse(JSON.parse(readFileSync(path, "utf8")));
  const caseKey = (row: CtNativeTimingCase): string => JSON.stringify([row.file, row.titlePath]);
  const expected = new Set(receipt.nativeTiming.expected.map(caseKey));
  const attempts = new Set(receipt.nativeTiming.attempts.map(caseKey));
  if (expected.size !== receipt.nativeTiming.expected.length || attempts.size !== receipt.nativeTiming.attempts.length) {
    throw new Error("Duplicate native timing case identity");
  }
  if (expected.size !== attempts.size || [...expected].some((key) => !attempts.has(key))) {
    throw new Error("A declared native timing case did not pass on its first attempt");
  }
  const measured = new Set<string>();
  const metrics = new Set<string>();
  for (const row of receipt.timingMeasurements) {
    if (row.detail.measured > row.detail.budget) {
      throw new Error("Timing measurement exceeds its declared budget");
    }
    const key = caseKey(row);
    if (!expected.has(key)) {
      throw new Error("An undeclared case supplied timing qualification");
    }
    const metric = JSON.stringify([key, row.detail.metric]);
    if (metrics.has(metric)) {
      throw new Error("Duplicate timing measurement identity");
    }
    metrics.add(metric);
    measured.add(key);
  }
  if ([...expected].some((key) => !measured.has(key))) {
    throw new Error("A declared native timing case supplied no measurements");
  }
  console.log(`Qualified ${String(expected.size)} native cases and ${String(metrics.size)} measurements on ${expectedClass}.`);
  return 0;
});
