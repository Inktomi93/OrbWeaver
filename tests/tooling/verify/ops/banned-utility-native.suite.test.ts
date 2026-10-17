import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";

const RULE = "orb/no-banned-tw-utility";
const BUBBLE = "packages/client/src/lib/message-bubble-class.ts";

async function messages(eslint: ESLint, filename: string, source: string): Promise<readonly Linter.LintMessage[]> {
  const config = await eslint.calculateConfigForFile(filename);
  expect(config, filename).toBeDefined();
  return new Linter().verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config.plugins,
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: true } } },
      linterOptions: { reportUnusedDisableDirectives: "error" },
      rules: { [RULE]: config.rules[RULE] ?? "off" },
    },
    { filename },
  );
}

for (const row of [
  { name: "direct JSX", source: 'export const x=<div className="max-w-prose"/>;', count: 1 },
  { name: "important positions", source: 'export const x="md:!max-w-prose max-w-prose! !max-w-prose!";', count: 1 },
  { name: "bare return", source: 'export function recipe(){return "max-w-prose";}', count: 1 },
  { name: "unfenced object value", source: 'export const data={copy:"never max-w-prose"};', count: 1 },
  { name: "unfenced string key", source: 'export const data={"max-w-prose":true};', count: 1 },
  { name: "type literal", source: 'export type X="max-w-prose";', count: 1 },
  { name: "no-substitution template", source: "export const x=`max-w-prose`;", count: 1 },
  { name: "paren variant is a blocked diagnostic", source: 'export const x="[&:where(.x:y)]:max-w-prose";', count: 1 },
  { name: "nested quoted variant", source: `export const x="[&:not([title='x:y'])]:max-w-prose";`, count: 1 },
  { name: "unmatched opening bracket strengthening", source: 'export const x="data-[x:max-w-prose";', count: 1 },
  { name: "unmatched closing bracket strengthening", source: 'export const x="x]:max-w-prose";', count: 1 },
  { name: "one repeated carrier", source: 'export const x="max-w-prose max-w-prose";', count: 1 },
  { name: "two distinct carriers", source: 'export const x="max-w-prose", y="md:max-w-prose";', count: 2 },
  { name: "well-formed arbitrary data", source: 'export const x="content-[x:max-w-prose] [x:max-w-prose]:flex";', count: 0 },
  { name: "quoted arbitrary data", source: `export const x="content-['max-w-prose']";`, count: 0 },
  { name: "exact utility near misses", source: 'export const x="max-w-prose-wide not-max-w-prose -max-w-prose";', count: 0 },
  { name: "token replacements", source: 'export const x="max-w-(--reading-measure-prose) max-w-(--width-content-col)";', count: 0 },
  { name: "raw escape is not cooked", source: String.raw`export const x="max-w-\u0070rose";`, count: 0 },
  { name: "interpolated head remains outside old scope", source: "export const x=`max-w-prose ${tone}`;", count: 0 },
  { name: "interpolated middle and tail remain outside old scope", source: "export const x=`${tone} max-w-prose ${tone} max-w-prose`;", count: 0 },
  { name: "comment is not a carrier", source: '// max-w-prose\nexport const x="max-w-full";', count: 0 },
]) {
  test(`native banned utility: ${row.name}`, async ({ repoRoot }) => {
    const found = await messages(new ESLint({ cwd: repoRoot }), join(repoRoot, "packages/ui/src/probe.tsx"), row.source);
    expect(found, row.source).toHaveLength(row.count);
    expect(found.every(({ ruleId }) => ruleId === RULE)).toBe(true);
  });
}

test("product generated and declaration sources retain the restriction", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  for (const path of ["packages/ui/src/tokens/index.ts", "packages/client/src/probe.gen.ts", "packages/ui/src/probe.d.ts"]) {
    expect(await messages(eslint, join(repoRoot, path), 'export type X="max-w-prose";'), path).toMatchObject([{ ruleId: RULE }]);
  }
});

test("tests, legacy and foreign packages remain outside the product rule", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  for (const path of [
    "tests/ui/probe.test.ts",
    "tests/legacy/ui/probe.test.ts",
    "tests/e2e/probe.spec.ts",
    "packages/kit/src/probe.ts",
    "tooling/src/probe.ts",
  ]) {
    expect(await messages(eslint, join(repoRoot, path), 'export const x="max-w-prose";'), path).toEqual([]);
  }
});

test("the actual transcript recipe is one line-local permission, not a file home", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  const filename = join(repoRoot, BUBBLE);
  const source = readFileSync(filename, "utf8");
  const unlicensed = source.replace(/^.*eslint-disable-next-line orb\/no-banned-tw-utility.*\n/gmu, "");
  expect(await messages(eslint, filename, unlicensed)).toMatchObject([{ ruleId: RULE }]);
  expect(await messages(eslint, filename, source)).toEqual([]);
  expect(await messages(eslint, filename, `${source}\nexport const fresh="max-w-prose";\n`)).toMatchObject([{ ruleId: RULE }]);
  const recipe = source.split("\n").find((line) => line.includes("return cn("));
  expect(recipe).toBeDefined();
  if (recipe === undefined) {
    throw new Error("The canonical transcript recipe is missing");
  }
  expect(await messages(eslint, filename, source.replace(recipe, recipe.replace("max-w-prose", "max-w-full")))).toMatchObject([
    { message: expect.stringContaining("Unused eslint-disable directive") },
  ]);
});
