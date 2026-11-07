import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { aridCensus, readStrykerMutants } from "@orb/tooling/mutation-arid";
import { ZodError } from "zod";

function writeReport(root: string, body: unknown): string {
  const path = join(root, "mutation.json");
  writeFileSync(path, JSON.stringify(body));
  return path;
}

test("the census groups ignored mutants by reason and scores only what was tested", ({ scratch }) => {
  const report = writeReport(scratch, {
    files: {
      "a.ts": {
        mutants: [
          { status: "Ignored", statusReason: "trace" },
          { status: "Ignored", statusReason: "trace" },
          { status: "Ignored", statusReason: "arm" },
          { status: "CompileError" },
          { status: "Killed" },
        ],
      },
    },
  });
  expect(aridCensus(report)).toEqual({
    reportPath: report,
    ignored: 3,
    scoredDenominator: 1,
    byReason: [
      { reason: "trace", count: 2 },
      { reason: "arm", count: 1 },
    ],
  });
});

test("a payload that is not a report, or has a status this tool does not know, throws", ({ scratch }) => {
  expect(() => readStrykerMutants(writeReport(scratch, { schemaVersion: "2" }))).toThrow(ZodError);
  expect(() => readStrykerMutants(writeReport(scratch, { files: { "a.ts": { mutants: [{ status: "Exploded" }] } } }))).toThrow(ZodError);
});

test("a report with no mutants has no census", ({ scratch }) => {
  expect(() => aridCensus(writeReport(scratch, { files: { "a.ts": { mutants: [] } } }))).toThrow(/ZERO mutants/u);
});
