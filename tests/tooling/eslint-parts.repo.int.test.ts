// The whole-tree ESLint parts in `scripts/eslint-parts.ts` are the parts CI lints, and together they lint every file a
// whole-tree run lints, each once. The file sets come from ESLint's own enumeration, with every rule filtered out and a
// parser that reads nothing, so no typed program loads.
// @subject scripts/eslint-parts.ts
import { relative } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import type { Linter } from "eslint";
import { ESLint } from "eslint";
import { ESLINT_PARTS, eslintPartArgs } from "../../scripts/eslint-parts.ts";
import { workflowJobs } from "./_workflow-support.ts";

// `pnpm lint:eslint` passes this flag; the enumeration loads the same config the same way.
const CONFIG_FLAG = "unstable_native_nodejs_ts_config";

// A parser that returns an empty program: which files ESLint lints does not depend on what they hold.
const EMPTY_PROGRAM_PARSER: Linter.Parser = {
  parseForESLint: (text: string) => ({
    ast: {
      type: "Program",
      body: [],
      sourceType: "module",
      range: [0, text.length],
      loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
      tokens: [],
      comments: [],
    },
  }),
};

async function lintedFiles(repoRoot: string, targets: readonly string[], ignorePatterns: readonly string[]): Promise<string[]> {
  const eslint = new ESLint({
    cwd: repoRoot,
    flags: [CONFIG_FLAG],
    ignorePatterns: [...ignorePatterns],
    ruleFilter: (): boolean => false,
    overrideConfig: { languageOptions: { parser: EMPTY_PROGRAM_PARSER } },
  });
  const results = await eslint.lintFiles([...targets]);
  return results.map(({ filePath }) => relative(repoRoot, filePath).replaceAll("\\", "/"));
}

test("the CI eslint matrix runs exactly the parts the pre-push runner runs", ({ repoRoot }) => {
  const parts = workflowJobs(repoRoot, "ci")["eslint"]?.strategy?.matrix;
  const matrix = typeof parts === "object" ? parts.part : undefined;
  expect(matrix).toEqual(ESLINT_PARTS.map((part) => ({ name: part.name, args: eslintPartArgs(part).join(" ") })));
});

test("the parts lint every file a whole-tree run lints, and no file twice", { timeout: 300_000 }, async ({ repoRoot }) => {
  const whole = await lintedFiles(repoRoot, ["."], []);
  const byPart = await Promise.all(ESLINT_PARTS.map((part) => lintedFiles(repoRoot, part.targets, part.ignorePatterns)));
  const linted = byPart.flat();
  const twice = linted.filter((file, index) => linted.indexOf(file) !== index);
  expect(whole.length).toBeGreaterThan(0);
  expect(twice).toEqual([]);
  expect([...linted].sort()).toEqual([...whole].sort());
});
