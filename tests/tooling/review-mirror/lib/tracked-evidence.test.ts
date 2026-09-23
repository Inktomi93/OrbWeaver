import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { depositTrackedEvidence, resolveTrackedEvidencePath } from "../../../../tooling/src/review-mirror/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const SERIALIZED = `${JSON.stringify({ schemaVersion: 1, findings: 3 }, null, 2)}\n`;

test("no --evidence-out means no tracked deposit (behavior is unchanged without the flag)", ({ scratch }) => {
  expect(resolveTrackedEvidencePath(scratch, undefined)).toBeNull();
  expect(depositTrackedEvidence(scratch, undefined, SERIALIZED)).toBeNull();
});

test("a relative --evidence-out lands in-repo, resolved against the root", ({ scratch }) => {
  const resolved = resolveTrackedEvidencePath(scratch, "reports/tooling/sweep.json");
  expect(resolved).toBe(join(scratch, "reports/tooling/sweep.json"));
  expect(isAbsolute(resolved ?? "")).toBe(true);
});

test("an absolute --evidence-out is honoured verbatim", ({ scratch }) => {
  const absolute = join(scratch, "elsewhere", "sweep.json");
  expect(resolveTrackedEvidencePath("/some/other/root", absolute)).toBe(absolute);
});

test("depositTrackedEvidence writes the exact bytes and creates parent directories", ({ scratch }) => {
  const written = depositTrackedEvidence(scratch, "reviews/nested/sweep.json", SERIALIZED);
  const expected = join(scratch, "reviews/nested/sweep.json");
  expect(written).toBe(expected);
  expect(existsSync(expected)).toBe(true);
  expect(readFileSync(expected, "utf8")).toBe(SERIALIZED);
});

test("depositTrackedEvidence overwrites an existing tracked file so a re-run refreshes the artifact", ({ scratch }) => {
  const out = join(scratch, "reviews");
  mkdirSync(out, { recursive: true });
  depositTrackedEvidence(scratch, "reviews/sweep.json", "stale\n");
  const written = depositTrackedEvidence(scratch, "reviews/sweep.json", SERIALIZED);
  expect(readFileSync(written ?? "", "utf8")).toBe(SERIALIZED);
});
