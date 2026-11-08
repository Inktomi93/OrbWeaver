import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";
import { resolvedConfig } from "./_eslint-config.ts";

const ROOT = join(import.meta.dirname, "../..");
const RULE = "orb/commented-code";
const SUBJECT = "packages/ui/src/x/probe.ts";
const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });

// The first config calculation loads the whole repo config; it must not bill to a test's timeout.
beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, SUBJECT));
}, 120_000);

async function findings(source: string, path = SUBJECT): Promise<readonly Linter.LintMessage[]> {
  const config = await resolvedConfig(eslint, join(ROOT, path));
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config.plugins,
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, programs: null, ecmaFeatures: { jsx: true } } },
      linterOptions: { reportUnusedDisableDirectives: "error" },
      rules: { [RULE]: config.rules[RULE] ?? "off" },
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

// One parked line per leading keyword the rule knows, so a keyword dropped from its list fails its own row.
test.for([
  'import { run } from "./run.ts";',
  "export const kept = 1;",
  "const dead = compute();",
  "let dead = compute();",
  "var dead = compute();",
  "function dead() {",
  "class Dead {",
  "interface Dead {",
  "type Dead = string;",
  "return dead;",
  "if (dead) {",
  "for (const item of items) {",
  "while (dead) {",
  "switch (dead) {",
  "throw new Error();",
  "await run();",
])("a line comment opening with its keyword is parked code: %s", async (line) => {
  expect(await findings(`// ${line}\nexport const x = 1;\n`)).toHaveLength(1);
});

test.for([
  ["prose carrying no statement keyword and terminator", "// this explains WHY the value is 1 (a prose comment)\nexport const x = 1;\n"],
  ["comment-looking text inside a template string is data", "export const source = `\n// const rendered = true;\n`;\n"],
  ["the terminator fence: prose that opens with a keyword", "// if the value is missing we fall back to the seed\nexport const x = 1;\n"],
  ["JSDoc example", "/** @example\n * const sample = 1;\n */\nexport const x = 1;\n"],
  ["block prose", "/* if the value is missing, use the seed; then continue. */\nexport const x = 1;\n"],
] as const)("%s", async ([, source]) => {
  expect(await findings(source)).toEqual([]);
});

test("block comments cannot park statements", async () => {
  expect(await findings("/* const dead = compute(); */\nexport const x = 1;\n")).toHaveLength(1);
  expect(await findings("/*\nconst dead = compute();\nreturn dead;\n*/\nexport const x = 1;\n")).toHaveLength(1);
});
