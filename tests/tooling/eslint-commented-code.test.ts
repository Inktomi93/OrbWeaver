import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";

const ROOT = join(import.meta.dirname, "../..");
const RULE = "orb/commented-code";
const SUBJECT = "packages/ui/src/x/probe.ts";
const eslint = new ESLint({ cwd: ROOT });

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
      linterOptions: { reportUnusedDisableDirectives: "error" },
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
