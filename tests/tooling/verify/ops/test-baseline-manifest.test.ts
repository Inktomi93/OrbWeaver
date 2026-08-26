import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateTestBaselineManifest } from "../../../../tooling/src/verify/ops/gen/test-baseline-manifest.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

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
