import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";
import { resolvedConfig } from "./_eslint-config.ts";

const ROOT = join(import.meta.dirname, "../..");
const RULE = "orb/page-template-shapes";
const FEATURE = "packages/client/src/features/chat/components/probe.tsx";
const TEMPLATE = "packages/client/src/components/probe.tsx";
const EDITOR_COLUMN = "mx-auto inline-full max-inline-(--width-content-col)";
const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });

// The first config calculation loads the whole repo config; it must not bill to a test's timeout.
beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, FEATURE));
}, 120_000);

async function findings(source: string, path: string): Promise<readonly Linter.LintMessage[]> {
  const config = await resolvedConfig(eslint, join(ROOT, path));
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config.plugins,
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, programs: null, ecmaFeatures: { jsx: true } } },
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

test.for([
  ["a list search", "export const A = () => <ListSearch><Input /></ListSearch>;"],
  ["a shell-deferred name", 'export const A = () => <Text data-shell-identity="defer">Name</Text>;'],
  ["the editor column", `export const A = () => <Stack className="${EDITOR_COLUMN}" />;`],
  ["the editor column in a template string", `export const A = () => <Stack className={\`${EDITOR_COLUMN} \${pad}\`} />;`],
  ["a list grid", 'export const A = () => <Grid cols="auto" role="list" />;'],
  ["a hand-built horizontal field row", 'export const A = () => <FieldLayout orientation="horizontal"><Field label="A"><Input /></Field></FieldLayout>;'],
] as const)("%s in a feature is a finding", async ([, source]) => {
  expect(await findings(source, FEATURE)).toHaveLength(1);
});

test("a start-aligned measure, a plain grid and a template's own file pass", async () => {
  expect(
    await findings(
      'export const A = () => <><Stack className="max-inline-(--width-content-col)" /><Grid cols="auto" /><Row role="list" /><Text data-shell="x" /></>;',
      FEATURE,
    ),
  ).toEqual([]);
  expect(await findings('export const A = () => <FieldLayout orientation="inline" />;', FEATURE)).toEqual([]);
  expect(
    await findings(
      'export const A = () => <><ListSearch /><Grid role="list" /><Text data-shell-identity="defer" /><FieldLayout orientation="horizontal" /></>;',
      TEMPLATE,
    ),
  ).toEqual([]);
});
