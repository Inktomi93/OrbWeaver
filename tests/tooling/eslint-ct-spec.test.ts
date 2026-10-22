// Native ESLint guards story test ids, tRPC route order and shared poll schedules.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { scaledBudget } from "./_load-budget.ts";

const STORY_ID = "orb/testid-typed-only-stories";
const ROUTE_ORDER = "orb/route-trpc-lifo-order";
const POLL_SCHEDULE = "orb/ct-poll-intervals-shared";
const STORY = "tests/client/features/chat/_ct-stories.tsx";
const SPEC = "tests/client/features/g/g.ct.tsx";

// The first row of a file pays the flat-config load.
const CONFIG_LOAD_BASE_MS = 60_000;
const CONFIG_LOAD = { timeout: scaledBudget(CONFIG_LOAD_BASE_MS) };

async function ordinary(root: string, rule: string, source: string, path: string): Promise<readonly Linter.LintMessage[]> {
  const filename = join(root, path);
  const config = await new ESLint({ cwd: root }).calculateConfigForFile(filename);
  expect(config).toBeDefined();
  const found = new Linter().verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config.plugins,
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: true } } },
      linterOptions: { reportUnusedDisableDirectives: "error" },
      rules: { [rule]: config.rules[rule] ?? "off" },
    },
    { filename },
  );
  expect(found.some(({ fatal }) => fatal === true)).toBe(false);
  return found;
}

const trpcRoute = 'await page.route("**/api/trpc/**", () => undefined);';
const routeTest = (body: string): string => `import { test } from "@playwright/test";\ntest("g", async ({ page }) => {\n${body}\n});\n`;

test.for([
  ["bare and braced freeform ids", `export const A = () => <div data-testid="composer"><span data-testid={'send' as string} /></div>;`, STORY, 2],
  ["a repeated id is flagged at every element", `export const A = () => <div data-testid="state"><span data-testid="state" /></div>;`, STORY, 2],
  ["the .stories.tsx spelling", `export const A = () => <div data-testid="matrix" />;`, "tests/ui/variant-arm-matrix.stories.tsx", 1],
  ["braced template without substitutions", "export const A = () => <div data-testid={`matrix`} />;", STORY, 1],
  ["a typed production id", `export const A = () => <div data-testid={testId('composer')} />;`, STORY, 0],
  ["a story-registry id", `export const A = () => <div data-testid={storyTestId("rowScrollport")} />;`, STORY, 0],
  // biome-ignore lint/suspicious/noTemplateCurlyInString: The fixture asserts literal template-source bytes, not interpolation in this test.
  ["a dynamic template", "export const A = () => <div data-testid={`row-${key}`} />;", STORY, 0],
  ["a CT spec that is not a story module", `export const B = () => <div data-testid="inline" />;`, "tests/client/features/chat/composer.ct.tsx", 0],
  ["legacy stories stay outside the wall", `export const A = () => <div data-testid="legacy" />;`, "tests/legacy/client/features/chat/_ct-stories.tsx", 0],
] as const)("native story test id wall: %s", CONFIG_LOAD, async ([, source, path, count], { repoRoot }) => {
  expect(await ordinary(repoRoot, STORY_ID, source, path)).toHaveLength(count);
});

test("a story freeform id takes a reasoned inline permission, and a stale permission is refused", async ({ repoRoot }) => {
  const bad = `export const A = () => <div data-testid="composer" />;`;
  const permission = `// eslint-disable-next-line ${STORY_ID} -- Bounded native permission control.\n`;
  expect(await ordinary(repoRoot, STORY_ID, permission + bad, STORY)).toEqual([]);
  expect(await ordinary(repoRoot, STORY_ID, `${permission}export const A = 1;`, STORY)).toMatchObject([
    { ruleId: null, message: expect.stringContaining("Unused eslint-disable directive") },
  ]);
});

test.for([
  ["page.route registered before routeTrpc", routeTest(`  ${trpcRoute}\n  await routeTrpc(page, {});`), SPEC, [4]],
  [
    "two buried registrations make one finding on the routeTrpc that buries them",
    routeTest(`  await page.route("**/api/trpc/chat.list*", () => undefined);\n  ${trpcRoute}\n  await routeTrpc(page, {});`),
    SPEC,
    [5],
  ],
  ["the test.<modifier> spelling", `test.skip("g", async ({ page }) => {\n  ${trpcRoute}\n  await routeTrpc(page, {});\n});\n`, SPEC, [3]],
  ["a bound routeTrpc handle", routeTest(`  ${trpcRoute}\n  const trpc = await routeTrpc(page, {});\n  void trpc;`), SPEC, [4]],
  ["a returned routeTrpc", routeTest(`  ${trpcRoute}\n  return routeTrpc(page, {});`), SPEC, [4]],
  ["a template-literal pattern", routeTest("  await page.route(`**/api/trpc/x`, () => undefined);\n  await routeTrpc(page, {});"), SPEC, [4]],
  [
    "a whole inversion inside a beforeEach body is the same trap",
    `declare function beforeEach(fn: (a: { page: unknown }) => Promise<void>): void;\nbeforeEach(async ({ page }) => {\n  ${trpcRoute}\n  await routeTrpc(page, {});\n});\n`,
    SPEC,
    [4],
  ],
  ["routeTrpc first, the override second", routeTest(`  await routeTrpc(page, {});\n  ${trpcRoute}`), SPEC, []],
  ["an unrelated endpoint cannot collide", routeTest(`  await page.route("**/api/auth/me", () => undefined);\n  await routeTrpc(page, {});`), SPEC, []],
  ["a trpc route with no routeTrpc anywhere", routeTest(`  ${trpcRoute}`), SPEC, []],
  [
    "a route in one scope never buries a routeTrpc in another",
    `declare function beforeEach(fn: (a: { page: unknown }) => Promise<void>): void;\nbeforeEach(async ({ page }) => {\n  ${trpcRoute}\n});\ntest("g", async ({ page }) => {\n  await routeTrpc(page, {});\n});\n`,
    SPEC,
    [],
  ],
  [
    "separate tests in one file never bury each other",
    `test("a", async ({ page }) => {\n  ${trpcRoute}\n});\ntest("b", async ({ page }) => {\n  await routeTrpc(page, {});\n});\n`,
    SPEC,
    [],
  ],
  [
    "a pattern held in a variable is unjudged",
    routeTest(`  const pattern = "**/api/trpc/**";\n  await page.route(pattern, () => undefined);\n  await routeTrpc(page, {});`),
    SPEC,
    [],
  ],
  ["a node test is outside the CT population", routeTest(`  ${trpcRoute}\n  await routeTrpc(page, {});`), "tests/client/features/g/g.test.ts", []],
  ["legacy CT specs stay outside the wall", routeTest(`  ${trpcRoute}\n  await routeTrpc(page, {});`), "tests/legacy/client/g.ct.tsx", []],
] as const)("native trpc route order: %s", CONFIG_LOAD, async ([, source, path, lines], { repoRoot }) => {
  const found = await ordinary(repoRoot, ROUTE_ORDER, source, path);
  expect(found.map(({ line }) => line)).toEqual(lines);
});

test("an inversion takes a reasoned inline permission at the routeTrpc statement", async ({ repoRoot }) => {
  const permission = `  // eslint-disable-next-line ${ROUTE_ORDER} -- Bounded native permission control.\n`;
  const source = routeTest(`  ${trpcRoute}\n${permission}  await routeTrpc(page, {});`);
  expect(await ordinary(repoRoot, ROUTE_ORDER, source, SPEC)).toEqual([]);
});

const poll = (body: string): string => `import { expect, test } from "@playwright/test";\n${body}\n`;

test("native gallery authoring keeps composition and callbacks in typed browser stories", CONFIG_LOAD, async ({ repoRoot }) => {
  const rule = "no-restricted-syntax";
  for (const source of [
    'async function run(mount) { await mount("tests/example/Story", { label: "Ready" }); }',
    'async function run(mount) { await mount<typeof Story>("tests/example/Story", { onClick: () => undefined }); }',
    "const component = <Story />;",
    'import { Story } from "./_ct-stories.tsx";',
  ]) {
    expect(await ordinary(repoRoot, rule, source, SPEC), source).not.toEqual([]);
  }
  const typed =
    'import type { Story } from "./_ct-stories.tsx"; async function run(mount) { await mount<typeof Story>("tests/example/Story", { label: "Ready" }); }';
  expect(await ordinary(repoRoot, rule, typed, SPEC)).toEqual([]);
  expect(
    await ordinary(
      repoRoot,
      rule,
      'async function run(mount) { await mount<typeof Story>("tests/example/Story", { rows: [1].map(value => ({ value })) }); }',
      SPEC,
    ),
  ).toEqual([]);
  expect(await ordinary(repoRoot, rule, "export const Story = () => <div />;", STORY)).toEqual([]);
});

test.for([
  [
    "a module-scope array handed to intervals",
    'const SCHEDULE = [50, 100, 250];\ntest("g", async () => {\n  await expect.poll(() => 1, { intervals: SCHEDULE, timeout: 10_000 }).toBe(1);\n});',
    1,
  ],
  [
    "the whole options object shared by identifier",
    'const POLL_OPTS = { intervals: [50, 100], timeout: 10_000 };\ntest("g", async () => {\n  await expect.poll(() => 1, POLL_OPTS).toBe(1);\n});',
    1,
  ],
  [
    "a spread of the shared options object",
    'const BASE = { intervals: [50, 100], timeout: 10_000 };\ntest("g", async () => {\n  await expect.poll(() => 1, { ...BASE, timeout: 20_000 }).toBe(1);\n});',
    1,
  ],
  [
    "the shorthand spelling",
    'const intervals = [50, 100];\ntest("g", async () => {\n  await expect.poll(() => 1, { intervals, timeout: 10_000 }).toBe(1);\n});',
    1,
  ],
  [
    "toPass is the other door into the same loop",
    'const SCHEDULE = [50, 100];\ntest("g", async () => {\n  await expect(() => {}).toPass({ intervals: SCHEDULE });\n});',
    1,
  ],
  ["an inline array", 'test("g", async () => {\n  await expect.poll(() => 1, { intervals: [50, 100, 200, 250], timeout: 10_000 }).toBe(1);\n});', 0],
  [
    "a factory call mints a fresh object",
    'function evidencePoll() {\n  return { intervals: [50, 100, 200, 250], timeout: 10_000 };\n}\ntest("g", async () => {\n  await expect.poll(() => 1, evidencePoll()).toBe(1);\n});',
    0,
  ],
  [
    "an imported options object is unresolvable here",
    'import { POLL_OPTS } from "./support.ts";\ntest("g", async () => {\n  await expect.poll(() => 1, POLL_OPTS).toBe(1);\n});',
    0,
  ],
  [
    "a computed intervals value is not judged",
    'const FAST = [50, 100];\ntest("g", async () => {\n  await expect.poll(() => 1, { intervals: FAST.slice(), timeout: 10_000 }).toBe(1);\n});',
    0,
  ],
  [
    "options minted per call inside a function are fresh",
    "async function check() {\n  const pollOptions = { intervals: [20, 50] };\n  await expect.poll(() => 1, pollOptions).toBe(1);\n}",
    0,
  ],
  ["a poll with no options", 'test("g", async () => {\n  await expect.poll(() => 1).toBe(1);\n});', 0],
] as const)("native poll schedule: %s", CONFIG_LOAD, async ([, source, count], { repoRoot }) => {
  const found = await ordinary(repoRoot, POLL_SCHEDULE, poll(source), SPEC);
  expect(found.map(({ ruleId }) => ruleId)).toEqual(Array.from({ length: count }, () => POLL_SCHEDULE));
});
