import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";

const ROOT = join(import.meta.dirname, "../../../..");
const RULE = "orb/ct-story-single-import";
const SUBJECT = "tests/ui/probe.ct.tsx";
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

const STORY = 'import { Story } from "./_ct-stories.tsx";\n';
const STORY_A = 'import { StoryA } from "./_ct-stories.tsx";\n';
const CT = 'import { test } from "@playwright/experimental-ct-react";\n';

test.for([
  [
    "the same local name bound by two import specifiers",
    'import { StoryA } from "./_ct-stories.tsx";\nimport { StoryA as StoryA } from "./_ct-stories.tsx";\nStoryA;\n',
    "StoryA",
  ],
  [
    "the same story as two tuple values",
    `${CT}${STORY_A}const rows: readonly [string, typeof StoryA][] = [\n  ["a", StoryA],\n  ["b", StoryA],\n];\ntest("x", () => {\n  rows;\n});\n`,
    "StoryA",
  ],
  ["two self-closing references in one tree", `${STORY}export const Cases = () => <>\n  <Story />\n  <Story />\n</>;\n`, "Story"],
  ["two paired references in one tree", `${STORY}export const Cases = () => <>\n  <Story>one</Story>\n  <Story>two</Story>\n</>;\n`, "Story"],
  ["one paired and one self-closing reference in one tree", `${STORY}export const Cases = () => <>\n  <Story>one</Story>\n  <Story />\n</>;\n`, "Story"],
  [
    "an attribute-embedded reference beside a child reference",
    `${STORY}const Wrap = (props: { readonly slot: unknown; readonly children?: unknown }): unknown => props;\nexport const Cases = () => <Wrap slot={<Story />}>\n  <Story />\n</Wrap>;\n`,
    "Story",
  ],
] as const)("flags %s", async ([, source, token]) => {
  const found = await findings(source);
  expect(found).toHaveLength(1);
  const text = source.split("\n")[(found[0]?.line ?? 1) - 1] ?? "";
  expect(text.slice((found[0]?.column ?? 1) - 1, (found[0]?.endColumn ?? 1) - 1)).toContain(token);
});

test.for([
  [
    "two different stories, each referenced once",
    `${CT}${STORY_A}import { StoryB } from "./_ct-stories.tsx";\nconst rows: readonly [string, unknown][] = [\n  ["a", StoryA],\n  ["b", StoryB],\n];\ntest("x", () => {\n  rows;\n});\n`,
  ],
  ["a single import and a single reference", `${STORY_A}StoryA;\n`],
  ["the same story rendered across separate test bodies", `${CT}${STORY_A}test("a", () => <StoryA />);\ntest("b", () => <StoryA />);\n`],
  ["separate mount trees in one test", `${CT}${STORY_A}test("a", async ({ mount }) => {\n  await mount(<StoryA />);\n  await mount(<StoryA />);\n});\n`],
  [
    "the specifier fence: UI primitives may repeat in one tree",
    'import { Button } from "@orb/ui/button";\nexport const Pair = () => <>\n  <Button>One</Button>\n  <Button>Two</Button>\n</>;\n',
  ],
  [
    "the component-name fence: a lowercase story export is data",
    `${CT}import { storyRow } from "./_ct-stories.tsx";\nconst rows: readonly unknown[] = [storyRow, storyRow];\ntest("x", () => {\n  rows;\n});\n`,
  ],
  [
    "the array rewrite-scope fence: one array reference per test callback",
    `${CT}${STORY_A}test("a", () => {\n  const rows = [StoryA];\n  return rows;\n});\ntest("b", () => {\n  const rows = [StoryA];\n  return rows;\n});\n`,
  ],
  ["a story module defines the export instead of importing it", "export function StoryA() {\n  return null;\n}\n"],
] as const)("passes %s", async ([, source]) => {
  expect(await findings(source)).toEqual([]);
});

test("only the second reference is reported, at its own line", async () => {
  const found = await findings(`${STORY}export const Cases = () => <>\n  <Story />\n  <Story />\n</>;\n`);
  expect(found.map(({ line }) => line)).toEqual([4]);
});

test("the population is CT files and story modules under tests, legacy excluded", async () => {
  expect(await inScope("tests/ui/charts/x.ct.tsx")).toBe(true);
  expect(await inScope("tests/ui/charts/_ct-stories.tsx")).toBe(true);
  expect(await inScope("tests/client/a11y/__probe_ct-stories.tsx")).toBe(true);
  expect(await inScope("tests/ui/charts/x.test.tsx")).toBe(false);
  expect(await inScope("tests/legacy/client/features/chat/components/message-row.ct.tsx")).toBe(false);
  expect(await inScope("packages/client/src/x.ct.tsx")).toBe(false);
});

test("the HARD profile cannot be disabled by a subject comment", async () => {
  const [result] = await eslint.lintText(
    `/* eslint-disable ${RULE} -- Attempted bypass. */\n${STORY}export const Cases = () => <>\n  <Story />\n  <Story />\n</>;\n`,
    { filePath: join(ROOT, SUBJECT) },
  );
  expect(result?.fatalErrorCount).toBe(0);
  expect(result?.messages.filter(({ ruleId }) => ruleId === RULE)).toHaveLength(1);
});
