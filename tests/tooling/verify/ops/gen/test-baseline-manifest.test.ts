import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestBaselineManifest } from "../../../../../tooling/src/verify/contract/test-baseline.ts";
import { monotonicTests } from "../../../../../tooling/src/verify/gates/monotonic-tests.ts";
import { generateTestBaselineManifest } from "../../../../../tooling/src/verify/ops/gen/test-baseline-manifest.ts";
import { expect, test } from "../../../../support/tool-fixtures.ts";
import { ctxAt, withTree } from "../../../_support.ts";

test("a corrupt existing deletion ledger fails loud and is never reset by regeneration", () => {
  const root = mkdtempSync(join(tmpdir(), "orb-test-baseline-"));
  try {
    mkdirSync(join(root, "tests"), { recursive: true });
    mkdirSync(join(root, "docs", "test-baseline"), { recursive: true });
    writeFileSync(join(root, "tests", "live.test.ts"), "export {};\n");
    const manifest = join(root, "docs", "test-baseline", "manifest.json");
    writeFileSync(manifest, "{ corrupt deletion ledger\n");
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["add", "tests/live.test.ts"], { cwd: root });

    expect(() => generateTestBaselineManifest(root)).toThrow();
    expect(readFileSync(manifest, "utf8")).toBe("{ corrupt deletion ledger\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("regeneration cannot erase an unaccounted deletion from the real monotonic gate", () => {
  withTree({ "tests/kept.test.ts": "export {};\n", "docs/test-baseline/manifest.json": '{"testFiles":[],"deletions":{}}' }, (root) => {
    execFileSync("git", ["init", "--quiet", "--template="], { cwd: root });
    execFileSync("git", ["add", "tests"], { cwd: root });
    generateTestBaselineManifest(root);
    rmSync(join(root, "tests/kept.test.ts"));
    execFileSync("git", ["add", "-u", "tests"], { cwd: root });
    expect(monotonicTests.run(ctxAt(root))).toEqual([expect.objectContaining({ file: "tests/kept.test.ts" })]);

    generateTestBaselineManifest(root);
    expect(monotonicTests.run(ctxAt(root))).toEqual([expect.objectContaining({ file: "tests/kept.test.ts" })]);

    const path = join(root, "docs/test-baseline/manifest.json");
    const manifest = JSON.parse(readFileSync(path, "utf8")) as TestBaselineManifest;
    writeFileSync(path, JSON.stringify({ ...manifest, deletions: { "tests/kept.test.ts": { why: "  " } } }));
    generateTestBaselineManifest(root);
    expect(monotonicTests.run(ctxAt(root))).toEqual([expect.objectContaining({ file: "tests/kept.test.ts" })]);
  });
});

test("an accounted move retains its destination and new tests, while a returned source makes the deletion stale", () => {
  withTree({ "tests/old.test.ts": "export {};\n", "docs/test-baseline/manifest.json": '{"testFiles":[],"deletions":{}}' }, (root) => {
    execFileSync("git", ["init", "--quiet", "--template="], { cwd: root });
    execFileSync("git", ["add", "tests"], { cwd: root });
    generateTestBaselineManifest(root);
    execFileSync("git", ["mv", "tests/old.test.ts", "tests/new.test.ts"], { cwd: root });
    writeFileSync(join(root, "tests/added.test.ts"), "export {};\n");
    execFileSync("git", ["add", "tests"], { cwd: root });
    const path = join(root, "docs/test-baseline/manifest.json");
    const before = JSON.parse(readFileSync(path, "utf8")) as TestBaselineManifest;
    writeFileSync(
      path,
      JSON.stringify({ ...before, deletions: { "tests/old.test.ts": { why: "Moved to tests/new.test.ts; remove this record if moved back." } } }),
    );

    generateTestBaselineManifest(root);
    const after = JSON.parse(readFileSync(path, "utf8")) as TestBaselineManifest;
    expect(after.testFiles).toEqual(["tests/added.test.ts", "tests/new.test.ts"]);
    expect(monotonicTests.run(ctxAt(root))).toEqual([]);

    writeFileSync(join(root, "tests/old.test.ts"), "export {};\n");
    execFileSync("git", ["add", "tests"], { cwd: root });
    generateTestBaselineManifest(root);
    expect(monotonicTests.run(ctxAt(root))).toEqual([expect.objectContaining({ file: "tests/old.test.ts", message: expect.stringContaining("stale") })]);
  });
});
