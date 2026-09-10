import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import type { CompilerProgram } from "@orb/tooling/verify";
import { ESLint } from "eslint";
import { eslintConfiguredPaths } from "../../../../tooling/src/verify/ops/config-snapshot.ts";
import { partitionEslintFiles } from "../../../../tooling/src/verify/ops/eslint.ts";
import { discoverEslintFiles } from "../../../../tooling/src/verify/ops/eslint-discovery.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function program(id: string, files: readonly string[]): CompilerProgram {
  return { id, config: id, files, references: [], configPaths: [id], commandLine: {} as CompilerProgram["commandLine"] };
}

test("discovery filenames equal native dot semantics across ignored, untracked, dotfile, and symlink arms", async () => {
  const root = mkdtempSync(join(tmpdir(), "orb-eslint-discovery-"));
  try {
    writeFileSync(join(root, "package.json"), '{"type":"module"}\n');
    writeFileSync(join(root, ".gitignore"), "gitignored.js\n");
    writeFileSync(join(root, "eslint.config.js"), 'export default [{ ignores: ["ignored/**"] }, { files: ["**/*.{js,ts}"] }];\n');
    writeFileSync(join(root, ".hidden.js"), "export const hidden = true;\n");
    writeFileSync(join(root, "gitignored.js"), "export const ignoredByGitOnly = true;\n");
    writeFileSync(join(root, "untracked.ts"), "export const untracked = true;\n");
    writeFileSync(join(root, "target.js"), "export const target = true;\n");
    mkdirSync(join(root, "ignored"));
    writeFileSync(join(root, "ignored", "excluded.js"), "throw new Error();\n");
    symlinkSync("target.js", join(root, "linked.js"));

    const native = await new ESLint({ cwd: root }).lintFiles(["."]);
    const nativePaths = native.map(({ filePath }) => relative(root, filePath).split(sep).join("/")).toSorted();
    const discovered = await discoverEslintFiles(root);
    expect(discovered).toEqual(nativePaths);
    expect(await eslintConfiguredPaths(root, "eslint.config.js", [...discovered, "ignored/excluded.js"])).toEqual(discovered);
    expect(discovered).toEqual(expect.arrayContaining([".hidden.js", "gitignored.js", "untracked.ts", "target.js"]));
    expect(discovered).not.toContain("ignored/excluded.js");
    expect(discovered.includes("linked.js")).toBe(nativePaths.includes("linked.js"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("discovery refuses a malformed native config instead of emitting an empty population", async () => {
  const root = mkdtempSync(join(tmpdir(), "orb-eslint-discovery-broken-"));
  try {
    writeFileSync(join(root, "package.json"), '{"type":"module"}\n');
    writeFileSync(join(root, "eslint.config.js"), "export default [{ files: [ ;\n");
    await expect(discoverEslintFiles(root)).rejects.toThrow();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("partition uses one native compiler owner, keeps untyped residuals, and refuses unowned typed files", () => {
  const programs = [program("tsconfig.json", ["root.ts"]), program("packages/ui/tsconfig.json", ["packages/ui/src/x.ts"])] as const;
  expect(Object.fromEntries(partitionEslintFiles(["root.ts", "packages/ui/src/x.ts", "tool.js"], programs))).toEqual({
    "<untyped>": ["tool.js"],
    "packages/ui/tsconfig.json": ["packages/ui/src/x.ts"],
    "tsconfig.json": ["root.ts"],
  });
  expect(() => partitionEslintFiles(["missing.ts"], programs)).toThrow("no native compiler owner");
  expect(() => partitionEslintFiles([], programs)).toThrow("empty population");
  expect(() => partitionEslintFiles(["root.ts", "root.ts"], programs)).toThrow("duplicate file identities");
});
