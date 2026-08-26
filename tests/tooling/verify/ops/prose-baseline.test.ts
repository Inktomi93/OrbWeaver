import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateProseBaseline } from "../../../../tooling/src/verify/ops/gen/prose.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("a corrupt existing prose baseline fails loud and is never replaced", () => {
  const root = mkdtempSync(join(tmpdir(), "orb-prose-baseline-"));
  try {
    const baselineDirectory = join(root, "packages/contracts/src/prose");
    mkdirSync(baselineDirectory, { recursive: true });
    const baseline = join(baselineDirectory, "prose-baseline.json");
    writeFileSync(baseline, "{ corrupt version witness\n");

    expect(() => generateProseBaseline(root)).toThrow();
    expect(readFileSync(baseline, "utf8")).toBe("{ corrupt version witness\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
