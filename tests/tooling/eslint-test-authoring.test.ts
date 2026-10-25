// Native ESLint guards for how tests are authored: appearance channel names, story roots, shell DOM in stories, hand-copied
// labels and cases that only prove an absence. Each rule has planted failing controls and a passing control.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";

const CONFIG_LOAD_TIMEOUT = { timeout: 120_000 };

const APPEARANCE = "orb/no-hand-typed-appearance-channel";
const STORY_ROOT = "orb/ct-story-root-composition";
const SHELL_DOM = "orb/no-hand-built-shell-dom";
const LABEL = "orb/no-hand-copied-label";
const ABSENCE = "orb/ct-negative-only-case";

const SPEC = "tests/client/features/probe/probe.ct.tsx";
const E2E_SPEC = "tests/e2e/probe.spec.ts";
const UI_STORY = "tests/ui/primitives/probe/_probe-stories.tsx";
const CLIENT_STORY = "tests/client/features/probe/_probe-stories.tsx";
const SHELL_STORY = "tests/client/features/app-shell/_probe-stories.tsx";

async function findings(root: string, rule: string, source: string, path: string): Promise<readonly Linter.LintMessage[]> {
  const filename = join(root, path);
  const config = await new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: root }).calculateConfigForFile(filename);
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

test.for([
  ["a hand-typed attribute", `const attribute = "data-appearance-density";`, SPEC, 1],
  ["a hand-typed property", `const property = "--appearance-font-scale";`, SPEC, 1],
  ["a selector that embeds the attribute", `const selector = '[data-appearance-reduced-motion="on"]';`, SPEC, 1],
  // biome-ignore lint/suspicious/noTemplateCurlyInString: The fixture asserts literal template-source bytes, not interpolation in this test.
  ["a template that builds a name", "const name = `--appearance-${key}`;", SPEC, 1],
  ["a support helper", `export const ATTRIBUTE = "data-appearance-contrast";`, "tests/support/browser/probe.ts", 1],
  ["a tooling suite that is not a lint fixture", `const flag = "--appearance-preset";`, "tests/tooling/floor/probe.test.ts", 1],
  ["a name read from the manifest", `const attribute = channelName("density");`, SPEC, 0],
  ["a comment that names the channel", `// the manifest owns data-appearance-density\nconst attribute = channelName("density");`, SPEC, 0],
  ["an unrelated data attribute", `const slot = "data-slot";`, SPEC, 0],
  ["a lint fixture of the appearance rule", `const attribute = "data-appearance-density";`, "tests/tooling/eslint-appearance-name.test.ts", 0],
] as const)("test authoring wall, appearance channel: %s", CONFIG_LOAD_TIMEOUT, async ([, source, path, count], { repoRoot }) => {
  expect(await findings(repoRoot, APPEARANCE, source, path)).toHaveLength(count);
});

const ISOLATED = `<CtIsolation subject="Tabs" isolates="The glide needs no services."><div /></CtIsolation>`;

test.for([
  ["a function story rooted at a bare element", "export function A() {\n  return <div />;\n}", UI_STORY, 1],
  ["an arrow story rooted at a bare element", "export const A = () => <div />;", UI_STORY, 1],
  ["a block arrow story rooted at a bare element", "export const A = () => {\n  return <section />;\n};", UI_STORY, 1],
  ["a fragment root", `export function A() {\n  return <><CtIsolation subject="x" isolates="y" /></>;\n}`, UI_STORY, 1],
  ["a client story rooted at a bare element", "export function A() {\n  return <div />;\n}", CLIENT_STORY, 1],
  ["a story rooted at an unrelated provider", "export function A() {\n  return <CtProviders><div /></CtProviders>;\n}", UI_STORY, 1],
  ["a story rooted at CtIsolation", `export function A() {\n  return ${ISOLATED};\n}`, UI_STORY, 0],
  ["an arrow story rooted at CtIsolation", `export const A = () => ${ISOLATED};`, UI_STORY, 0],
  [
    "a story rooted at the production providers",
    `export function A() {\n  return <CtClientProviders registry={isolationRegistry("x", "y", [])}><div /></CtClientProviders>;\n}`,
    CLIENT_STORY,
    0,
  ],
  ["a helper that is not exported", "function Row() {\n  return <div />;\n}", UI_STORY, 0],
  ["a spec is not a story module", "export function A() {\n  return <div />;\n}", SPEC, 0],
] as const)("test authoring wall, story root: %s", CONFIG_LOAD_TIMEOUT, async ([, source, path, count], { repoRoot }) => {
  expect(await findings(repoRoot, STORY_ROOT, source, path)).toHaveLength(count);
});

test.for([
  ["a shell class on an element", `export const A = () => <div className="shell-panel" />;`, UI_STORY, 1],
  ["a shell class among others", `export const A = () => <div className="flex shell-rail gap-2" />;`, UI_STORY, 1],
  ["a shell class inside a class builder", `export const A = () => <div className={cn("flex", "shell-grid")} />;`, UI_STORY, 1],
  ["a shell class in a template", "export const A = () => <div className={`row shell-topbar`} />;", CLIENT_STORY, 1],
  ["a slot the app shell owns", `export const A = () => <div data-slot="context-bracket-band" />;`, UI_STORY, 1],
  ["a layout class that only contains the word", `export const A = () => <div className="max-inline-(--width-shell-content) my-shell-thing" />;`, UI_STORY, 0],
  ["a primitive slot", `export const A = () => <div data-slot="list-row-root" />;`, UI_STORY, 0],
  ["the app shell's own stories", `export const A = () => <div className="shell-panel" data-slot="context-bracket-band" />;`, SHELL_STORY, 0],
] as const)("test authoring wall, shell DOM: %s", CONFIG_LOAD_TIMEOUT, async ([, source, path, count], { repoRoot }) => {
  expect(await findings(repoRoot, SHELL_DOM, source, path)).toHaveLength(count);
});

test.for([
  ["a role name typed by hand", `await page.getByRole("button", { name: "View raw source" }).click();`, SPEC, 1, "control-labels.ts"],
  ["a label typed by hand", `await page.getByLabel("Open card fullscreen").click();`, SPEC, 1, "IMMERSIVE_CARD_LABELS.fullscreen"],
  ["a name in a plain template", "await page.getByRole('button', { name: `Collapse card` }).click();", SPEC, 1, "IMMERSIVE_CARD_LABELS.collapse"],
  ["an e2e spec", `await page.getByRole("button", { name: "Show rendered card" }).click();`, E2E_SPEC, 1, "control-labels.ts"],
  ["a name imported from its module", `await page.getByRole("button", { name: IMMERSIVE_CARD_LABELS.rawSource }).click();`, SPEC, 0, ""],
  ["a name no module exports", `await page.getByRole("button", { name: "A sentence only this spec spells" }).click();`, SPEC, 0, ""],
  ["a pattern name", `await page.getByRole("button", { name: /View raw source/u }).click();`, SPEC, 0, ""],
  ["a text locator", `await page.getByText("View raw source").click();`, SPEC, 0, ""],
] as const)("test authoring wall, hand-copied label: %s", CONFIG_LOAD_TIMEOUT, async ([, source, path, count, owner], { repoRoot }) => {
  const found = await findings(repoRoot, LABEL, source, path);
  expect(found).toHaveLength(count);
  expect(found[0]?.message ?? "").toContain(owner);
});

const caseOf = (body: string): string => `test("probe", async ({ page }) => {\n${body}\n});`;

test.for([
  ["a hidden dialog only", caseOf(`await expect(page.getByRole("dialog")).not.toBeVisible();`), 1],
  ["a zero count only", caseOf(`await expect(page.getByRole("dialog")).toHaveCount(0);`), 1],
  ["a missing attribute only", caseOf(`await expect(page.getByRole("dialog")).not.toHaveAttribute("open", "");`), 1],
  ["empty findings only", caseOf("expect(await findingsOf(page)).toEqual([]);"), 1],
  ["a zero length only", caseOf("expect(await findingsOf(page)).toHaveLength(0);"), 1],
  ["toBeHidden only", caseOf(`await expect(page.getByRole("dialog")).toBeHidden();`), 1],
  ["several absences and nothing else", caseOf("await expect(a).toHaveCount(0);\nawait expect(b).not.toBeVisible();"), 1],
  ["an absence inside a loop", caseOf("for (const row of rows) {\n  await expect(row).toHaveCount(0);\n}"), 1],
  ["a soft absence only", caseOf("await expect.soft(a).toHaveCount(0);"), 1],
  ["the test.for form", `test.for([1])("probe", async () => {\n  await expect(a).toHaveCount(0);\n});`, 1],
  ["a positive control beside the absence", caseOf("await expect(a).toBeVisible();\nawait expect(b).toHaveCount(0);"), 0],
  ["a value assertion beside the absence", caseOf("expect(await count()).toBe(2);\nawait expect(b).not.toBeVisible();"), 0],
  ["a helper that asserts, beside the absence", caseOf("await expectNamed(page);\nawait expect(b).toHaveCount(0);"), 0],
  ["a positive count", caseOf("await expect(a).toHaveCount(1);"), 0],
  ["a value comparison with not", caseOf("expect(await height()).not.toBeCloseTo(100, 0);"), 0],
  ["a case with no assertion", caseOf(`await page.click("button");`), 0],
  ["a describe block is not a case", `test.describe("probe", () => {\n  test.beforeEach(async () => {\n    await expect(a).toHaveCount(0);\n  });\n});`, 0],
] as const)("test authoring wall, absence only: %s", CONFIG_LOAD_TIMEOUT, async ([, source, count], { repoRoot }) => {
  expect(await findings(repoRoot, ABSENCE, source, SPEC)).toHaveLength(count);
});
