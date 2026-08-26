import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { survivorsOf } from "../../../../tooling/src/mutation-probe/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const SRC_REL = "packages/server/src/domain/admin/guard.ts";
const SOURCE = "export const can = 1;\n";

function mutantAt(line: number, column: number, status: string): unknown {
  return {
    mutatorName: "EqualityOperator",
    replacement: "2",
    status,
    location: { start: { line, column }, end: { line, column: column + 1 } },
  };
}

function reportFile(body: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "mutation-probe-"));
  const path = join(dir, "report.json");
  writeFileSync(path, JSON.stringify(body));
  return path;
}

test("survivors come back sorted by location", () => {
  const path = reportFile({
    files: { [SRC_REL]: { source: SOURCE, mutants: [mutantAt(1, 20, "Survived"), mutantAt(1, 8, "Survived"), mutantAt(1, 5, "Killed")] } },
  });
  const survivors = survivorsOf(path, SRC_REL, SOURCE);
  expect(survivors.map((m) => m.location.start.column)).toEqual([8, 20]);
  rmSync(path, { force: true });
});

// The three refusals. Each one is a case where a silent empty result would read EXACTLY like "nothing
// wrong here" — the #409 absent-evidence class. A probe that cannot measure must say so, never pass.

test("REFUSES when the report's recorded source has drifted from disk", () => {
  const path = reportFile({ files: { [SRC_REL]: { source: SOURCE, mutants: [mutantAt(1, 8, "Survived")] } } });
  expect(() => survivorsOf(path, SRC_REL, "export const can = 999;\n")).toThrow(/changed since the report was written/u);
  rmSync(path, { force: true });
});

test("REFUSES when the report does not cover the requested source", () => {
  const path = reportFile({ files: { "packages/server/src/other.ts": { source: SOURCE, mutants: [] } } });
  expect(() => survivorsOf(path, SRC_REL, SOURCE)).toThrow(/does not cover/u);
  rmSync(path, { force: true });
});

test("REFUSES an empty survivor population rather than reporting a clean zero", () => {
  const path = reportFile({ files: { [SRC_REL]: { source: SOURCE, mutants: [mutantAt(1, 8, "Killed")] } } });
  expect(() => survivorsOf(path, SRC_REL, SOURCE)).toThrow(/ZERO survivors/u);
  rmSync(path, { force: true });
});

test("REFUSES a payload that is not a Stryker report at all", () => {
  const path = reportFile({ schemaVersion: "1" });
  expect(() => survivorsOf(path, SRC_REL, SOURCE)).toThrow(/not a Stryker JSON report/u);
  rmSync(path, { force: true });
});
