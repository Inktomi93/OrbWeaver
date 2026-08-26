import { execFileSync } from "node:child_process";
import rootConfig from "../../vitest.config.ts";
import { expect, test } from "../support/tool-fixtures.ts";

const coverage = rootConfig.test?.coverage;

function trackedFilesUnder(path: string): readonly string[] {
  return execFileSync("git", ["ls-files", path], { encoding: "utf8" }).split("\n").filter(Boolean);
}

test.describe("Vitest coverage source scope", () => {
  test("admits both TypeScript source dialects under packages", () => {
    const packageSources = trackedFilesUnder("packages");
    expect(coverage?.include).toContain("packages/*/src/**/*.{ts,tsx}");
    expect(packageSources.filter((path) => path.endsWith(".ts")).length).toBeGreaterThan(0);
    expect(packageSources.filter((path) => path.endsWith(".tsx")).length).toBeGreaterThan(0);
  });

  test("admits the tooling source tree", () => {
    expect(coverage?.include).toContain("tooling/src/**/*.ts");
    expect(trackedFilesUnder("tooling/src").filter((path) => path.endsWith(".ts")).length).toBeGreaterThan(0);
  });

  test("retains the deliberate source exclusions", () => {
    expect(coverage?.exclude).toEqual(expect.arrayContaining(["**/index.ts", "**/*.d.ts", "**/*.test-d.ts"]));
  });
});
