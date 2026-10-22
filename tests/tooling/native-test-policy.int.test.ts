// Native test rules must reject broken assertions through the configured runner audience.
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";

const pw = "tests/client/components/list-pane-header.ct.tsx";
const vt = "tests/tooling/vitest-composed-imports.int.test.ts";

const controls = [
  [
    pw,
    "orb/evaluate-no-scope-capture",
    'const label="Ready"; test("x", async ({page}) => { await page.getByRole("button").evaluate(element => element.textContent === label); });',
    'const label="Ready"; test("x", async ({page}) => { await page.getByRole("button").evaluate((element, value) => element.textContent === value, label); });',
  ],
  [
    pw,
    "orb/evaluate-no-scope-capture",
    'const label="Ready"; test("x", async ({page}) => { await page.getByRole("button").evaluateAll(elements => elements.some(element => element.textContent === label)); });',
    'const label="Ready"; test("x", async ({page}) => { await page.getByRole("button").evaluateAll((elements, value) => elements.some(element => element.textContent === value), label); });',
  ],
  [
    pw,
    "playwright/prefer-web-first-assertions",
    'test("x", async ({page}) => { expect(await page.getByRole("button").isVisible()).toBe(true); });',
    'test("x", async ({page}) => { await expect(page.getByRole("button")).toBeVisible(); });',
  ],
  [
    pw,
    "playwright/no-unnecessary-assertions",
    'test("x", async ({page}) => { expect(page.getByRole("button")).toBeTruthy(); });',
    'test("x", async ({page}) => { await expect(page.getByRole("button")).toBeVisible(); });',
  ],
  [
    pw,
    "playwright/no-unused-locators",
    'test("x", async ({page}) => { page.getByRole("button"); });',
    'test("x", async ({page}) => { await page.getByRole("button").click(); });',
  ],
  [
    pw,
    "playwright/no-unsafe-references",
    'const label="Ready"; test("x", async ({page}) => { await page.evaluate(() => label); });',
    'const label="Ready"; test("x", async ({page}) => { await page.evaluate(value => value, label); });',
  ],
  [
    pw,
    "playwright/no-unsafe-references",
    'const label="Ready"; test("x", async ({page}) => { await page.addInitScript(() => label); });',
    'const label="Ready"; test("x", async ({page}) => { await page.addInitScript(value => value, label); });',
  ],
  [
    pw,
    "playwright/no-unnecessary-assertions",
    'test("x", async ({mount}) => { const component = await mount<typeof Story>("tests/example/Story", {}); expect(component.getByRole("button")).toBeDefined(); });',
    'test("x", async ({mount}) => { const component = await mount<typeof Story>("tests/example/Story", {}); await expect(component.getByRole("button")).toBeVisible(); });',
  ],
  [
    pw,
    "playwright/valid-expect",
    'test("x", async ({page}) => { expect(page); });',
    'test("x", async ({page}) => { await expect(page).toHaveTitle("Ready"); });',
  ],
  [
    vt,
    "vitest/valid-describe-callback",
    'describe("x", (done) => {});',
    'describe.each([1])("x", (value) => { test("valid", () => { expect(value).toBe(1); }); });',
  ],
  [
    vt,
    "vitest/valid-describe-callback",
    'describe("x", () => { return true; });',
    'describe("x", async () => { await Promise.resolve(); test("valid", () => { expect(1).toBe(1); }); });',
  ],
  [
    vt,
    "vitest/no-disabled-tests",
    'test.skip("x", () => { expect(1).toBe(1); });',
    'test.skipIf(process.platform === "win32")("x", () => { expect(1).toBe(1); });',
  ],
  [vt, "vitest/no-disabled-tests", 'describe.skip("x", () => {});', 'describe.skipIf(process.platform === "win32")("x", () => {});'],
  [
    vt,
    "vitest/no-disabled-tests",
    'test("x", { skip: true }, () => { expect(1).toBe(1); });',
    'test("x", { skip: process.platform === "win32" }, () => { expect(1).toBe(1); });',
  ],
  [vt, "vitest/warn-todo", 'test.todo("x");', 'test.runIf(process.platform !== "win32")("x", () => { expect(1).toBe(1); });'],
  [vt, "vitest/warn-todo", 'test("x", { todo: true }, () => { expect(1).toBe(1); });', 'test("x", () => { expect(1).toBe(1); });'],
  [vt, "vitest/no-import-node-test", 'import { test } from "node:test";', 'test("valid", () => { expect(1).toBe(1); });'],
  [
    vt,
    "vitest/no-interpolation-in-snapshots",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: The fixture asserts literal template-source bytes, not interpolation in this test.
    'test("x", () => { const value="x"; expect(value).toMatchInlineSnapshot(`${value}`); });',
    'test("x", () => { expect("x").toMatchInlineSnapshot(`"x"`); });',
  ],
  [
    vt,
    "vitest/require-local-test-context-for-concurrent-snapshots",
    'test.concurrent("x", () => { expect(1).toMatchSnapshot(); });',
    'test.concurrent("x", ({expect}) => { expect(1).toMatchSnapshot(); });',
  ],
] as const;

test.for(controls)("native test policy %#: %s %s", async ([file, rule, bad, good], { repoRoot }) => {
  const config = await new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: repoRoot }).calculateConfigForFile(file);
  const doors =
    file === pw ? ["@playwright/test", "@orb/testkit/node/ct-corpus.ts"] : ["vitest", "@orb/testkit/node/fixtures.ts", "@orb/testkit/node/tool-fixtures.ts"];

  const native = {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false } },
    plugins: config.plugins,
    settings: config.settings ?? {},
    rules: { [rule]: config.rules[rule] ?? "off" },
  };
  const linter = new Linter();
  for (const door of doors) {
    const prefix = `import { test, expect${file === vt ? ", describe" : ""} } from "${door}";\n`;
    const rejected = linter.verify(prefix + bad, native, { filename: file });
    expect(
      rejected.map(({ ruleId }) => ruleId),
      door,
    ).toEqual([rule]);
    expect(linter.verify(prefix + good, native, { filename: file }), door).toEqual([]);
  }
});

test("the Node runner import restriction excludes executable child-process helpers", async ({ repoRoot }) => {
  const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: repoRoot });
  const helper = await eslint.calculateConfigForFile("tests/server/domain/chat/assembly/world-info-watchdog-child.ts");
  expect(helper.rules["vitest/no-import-node-test"]).toBeUndefined();
  const spec = await eslint.calculateConfigForFile("tests/e2e/corpus.spec.ts");
  expect(spec.rules["vitest/no-import-node-test"]).toBeUndefined();
  expect(spec.rules["playwright/valid-expect"]).toEqual([2]);
});

test("Node suites beside E2E helpers retain Vitest assertion checks", async ({ repoRoot }) => {
  const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: repoRoot });
  for (const file of ["tests/e2e/support/sse.test.ts", "tests/e2e/support/trpc.dom.test.ts"]) {
    const config = await eslint.calculateConfigForFile(file);
    expect(config.rules["vitest/valid-expect"]).toMatchObject([2, { maxArgs: 2 }]);
    expect(config.rules["vitest/no-import-node-test"]).toEqual([2]);
    expect(config.rules["playwright/valid-expect"]).toBeUndefined();
    expect(config.rules["orb/evaluate-no-scope-capture"]).toBeUndefined();
  }
  const helper = await eslint.calculateConfigForFile("tests/e2e/support/sse.ts");
  expect(helper.rules["playwright/valid-expect"]).toEqual([2]);
  expect(helper.rules["orb/evaluate-no-scope-capture"]).toEqual([2]);
  expect(helper.rules["vitest/valid-expect"]).toBeUndefined();
});
