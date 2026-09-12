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

// ─── #2213: a NESTED tool cache is a derived artifact too ────────────────────────────────────────────
//
// THE INCIDENT. `lint:eslint`'s first whole-repo verdict after #2211 fixed its ENOBUFS discovery came back
// exit 1 with 117 errors — and 106 of them were in `playwright/.cache/assets/*.js`, the MINIFIED Playwright
// component-test bundles. That directory is gitignored and carries zero tracked files, so those errors were
// reported against source that does not exist in the repository. Five of them were read as
// `react-hooks/rules-of-hooks` violations (a rule about call ORDER, i.e. real runtime misbehaviour) and
// routed as a correctness fix; every one was actually `Definition for rule … was not found` — an
// unknown-rule REFERENCE inside a bundled `eslint-disable` comment that React ships in its own source.
//
// THE CAUSE IS ONE MISSING PREFIX. `eslint.config.js` ignores `".cache/**"` while its siblings in the same
// array are `"**/node_modules/**"` and `"**/dist/**"`. Without the `**/` the pattern is anchored at the
// config's directory, so it covers the ROOT cache and misses every nested one — and the row's own comment
// states the intent it failed to implement: "Local tool caches are derived scratch artifacts, never
// authored inputs."
//
// WHY THIS IS PINNED AGAINST THE REAL CONFIG rather than a synthetic one: the defect was IN the real
// config's pattern, and a fixture would have reproduced whatever pattern the fixture author wrote. The
// negative controls are what stop this from passing vacuously — an over-broad ignore that swallowed the
// authored trees would satisfy the subject assertion while blinding the whole stage, which is a far worse
// failure than the one being fixed.
test("a nested tool cache is IGNORED while authored sources stay linted (#2213)", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  const ignored = async (rel: string): Promise<boolean> => eslint.isPathIgnored(join(repoRoot, rel));

  // THE SUBJECT: the nested cache that supplied 106 of 117 errors, five of them read as hook-order bugs.
  expect(await ignored("playwright/.cache/assets/index-C2Y8FrOW.js"), "playwright/.cache is a build cache, not authored input").toBe(true);
  // The root cache — the pattern's literal reading, which already worked and must keep working.
  expect(await ignored(".cache/anything.js")).toBe(true);
  // A `**/`-prefixed sibling row, proving the prefix is the house spelling for depth-independence.
  expect(await ignored("packages/ui/node_modules/x.js")).toBe(true);

  // NEGATIVE CONTROLS — an ignore that reaches authored code would blind the stage far worse than the
  // defect it fixes, and `isPathIgnored` returning `true` for everything would satisfy the arms above.
  expect(await ignored("packages/client/src/main.tsx"), "authored client source must stay linted").toBe(false);
  expect(await ignored("packages/ui/src/index.ts"), "authored ui source must stay linted").toBe(false);
  expect(await ignored("tooling/src/verify/ops/eslint.ts"), "authored tooling source must stay linted").toBe(false);
});
