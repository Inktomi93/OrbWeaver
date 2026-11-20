import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";
import { resolvedConfig } from "./_eslint-config.ts";

const ROOT = join(import.meta.dirname, "../..");
const RULE = "orb/content-pane-scroller";
const SURFACE = "packages/client/src/features/preset/surfaces/probe.tsx";
const COMPONENT = "packages/client/src/features/preset/components/probe.tsx";
const ROOM = "packages/client/src/features/chat/surfaces/chat-room-surface.tsx";
const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });

// The first config calculation loads the whole repo config; it must not bill to a test's timeout.
beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, SURFACE));
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
  ["a scrolling Stack", 'export const A = () => <Stack height="fill" scroll="y" />;'],
  ["a scrolling Container", 'export const A = () => <Container scroll="y" />;'],
] as const)("%s in a surface is a finding", async ([, source]) => {
  expect(await findings(source, SURFACE)).toHaveLength(1);
});

test("a content pane, a sideways strip, a component's own scroller and the room pass", async () => {
  const scroller = 'export const A = () => <Stack scroll="y" />;';
  // The positive control: the same source is refused in a surface, so the passes below are the scope, not a dead rule.
  expect(await findings(scroller, SURFACE)).toHaveLength(1);
  expect(await findings('export const A = () => <><ContentPane /><Row scroll="x" /></>;', SURFACE)).toEqual([]);
  expect(await findings(scroller, COMPONENT)).toEqual([]);
  expect(await findings(scroller, ROOM)).toEqual([]);
});
