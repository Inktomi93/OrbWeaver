import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";

const ROOT = join(import.meta.dirname, "../../../..");
const RULE = "orb/commented-code";
const SUBJECT = "packages/ui/src/x/probe.ts";
const eslint = new ESLint({ cwd: ROOT, overrideConfigFile: join(ROOT, "eslint-hard.config.js") });

// The first config calculation loads the whole repo config; it must not bill to a test's timeout.
beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, SUBJECT));
}, 120_000);

async function findings(source: string, path = SUBJECT): Promise<readonly Linter.LintMessage[]> {
  const config = await eslint.calculateConfigForFile(join(ROOT, path));
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config?.plugins ?? {},
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, programs: null, ecmaFeatures: { jsx: true } } },
      linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: "off" },
      rules: { [RULE]: config?.rules?.[RULE] ?? "off" },
    },
    { filename: join(ROOT, path) },
  );
  expect(
    found.filter(({ fatal }) => fatal === true),
    source,
  ).toEqual([]);
  return found.filter(({ ruleId }) => ruleId === RULE);
}

async function inScope(path: string): Promise<boolean> {
  const config = await eslint.calculateConfigForFile(join(ROOT, path));
  return config?.rules?.[RULE] !== undefined && config.rules[RULE] !== "off" && config.rules[RULE][0] === 2;
}

test("a parked const statement is code retained as a comment, reported at its own line", async () => {
  const found = await findings("// const dead = compute();\nexport const x = 1;\n");
  expect(found.map(({ line }) => line)).toEqual([1]);
});

test("a trailing comment and every statement keyword are parked code", async () => {
  expect(await findings("export const x = 1; // return x;\n")).toHaveLength(1);
  expect(await findings("// if (x) {\n// for (const a of b) {\n// await run();\n// throw new Error();\n")).toHaveLength(4);
});

test.for([
  ["prose carrying no statement keyword and terminator", "// this explains WHY the value is 1 (a prose comment)\nexport const x = 1;\n"],
  ["comment-looking text inside a template string is data", "export const source = `\n// const rendered = true;\n`;\n"],
  ["the terminator fence: prose that opens with a keyword", "// if the value is missing we fall back to the seed\nexport const x = 1;\n"],
  ["the comment-kind fence: a block comment is out of subject", "/* const dead = compute(); */\nexport const x = 1;\n"],
] as const)("%s", async ([, source]) => {
  expect(await findings(source)).toEqual([]);
});

test("the self-scan fence: gate modules and legacy tests are outside, every other source stays inside", async () => {
  expect(await inScope("packages/ui/src/x/anchor.ts")).toBe(true);
  expect(await inScope("tooling/src/verify/ops/anchor.ts")).toBe(true);
  expect(await inScope("tests/client/lib/anchor.test.ts")).toBe(true);
  expect(await inScope("scripts/anchor.ts")).toBe(true);
  expect(await inScope("tooling/src/verify/gates/x-example.ts")).toBe(false);
  expect(await inScope("tests/legacy/client/anchor.test.ts")).toBe(false);
});

test("the native Node helper executables are inside the population", async () => {
  expect(await inScope("tests/support/node/anchor.mjs")).toBe(true);
});

test("the rule does not strip the compiler context the tooling-entry rules need on the same files", async () => {
  for (const path of ["tooling/src/snap/cli.ts", "tooling/src/verify/ops/eslint.ts"]) {
    const config = await eslint.calculateConfigForFile(join(ROOT, path));
    expect(config?.rules?.[RULE]?.[0], path).toBe(2);
    expect(config?.languageOptions?.parserOptions?.projectService, path).toBe(true);
  }
});

test("the HARD profile cannot be disabled by a subject comment", async () => {
  const [result] = await eslint.lintText(`/* eslint-disable ${RULE} -- Attempted bypass. */\n// const dead = compute();\nexport const x = 1;\n`, {
    filePath: join(ROOT, SUBJECT),
  });
  expect(result?.fatalErrorCount).toBe(0);
  expect(result?.messages.filter(({ ruleId }) => ruleId === RULE)).toHaveLength(1);
});
