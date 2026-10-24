import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";

const ROOT = join(import.meta.dirname, "../..");
const RULE = "orb/no-layout-context-props";
const CLIENT = "packages/client/src/features/chat/components/probe.tsx";
const UI = "packages/ui/src/primitives/card/probe.tsx";
const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });

// The first config calculation loads the whole repo config; it must not bill to a test's timeout.
beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, CLIENT));
}, 120_000);

async function findings(source: string, path: string): Promise<readonly Linter.LintMessage[]> {
  const config = await eslint.calculateConfigForFile(join(ROOT, path));
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config?.plugins ?? {},
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, programs: null, ecmaFeatures: { jsx: true } } },
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

test.for([
  ["compact", "export const A = () => <Row compact={width < 40} />;"],
  ["inDrawer", "export const A = () => <Panel inDrawer />;"],
  ["inModal", "export const A = () => <Panel inModal={true} />;"],
  ["isMobile", "export const A = () => <Panel isMobile={mobile} />;"],
  ["narrow", 'export const A = () => <Panel narrow="yes" />;'],
] as const)("a %s attribute in a client file is a finding", async ([, source]) => {
  expect(await findings(source, CLIENT)).toHaveLength(1);
});

test("the same attribute in an @orb/ui file is a finding", async () => {
  expect(await findings("export const A = () => <Card compact />;", UI)).toHaveLength(1);
});

test("a variant value, a data attribute and an unrelated prop pass", async () => {
  expect(await findings('export const A = () => <Badge size="compact" data-compact={true} density="compact" tone="soft" />;', CLIENT)).toEqual([]);
});
