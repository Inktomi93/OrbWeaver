// Native ESLint guards for how tests are authored: appearance channel names, story roots, shell DOM in stories, hand-copied
// labels and cases that only prove an absence. Each rule has planted failing controls and a passing control.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { exportedLabels, exportedProductionValues } from "../../tooling/src/eslint/test-labels.ts";

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

async function lint(
  root: string,
  source: string,
  path: string,
  rulesOf: (configured: Linter.RulesRecord) => Linter.RulesRecord,
): Promise<readonly Linter.LintMessage[]> {
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
      rules: rulesOf(config.rules),
    },
    { filename },
  );
  expect(found.some(({ fatal }) => fatal === true)).toBe(false);
  return found;
}

/** The rule as the repository configures it for this file. */
const findings = (root: string, rule: string, source: string, path: string): Promise<readonly Linter.LintMessage[]> =>
  lint(root, source, path, (configured) => ({ [rule]: configured[rule] ?? "off" }));

/** The rule at scope `all`, which the repository config leaves off until a sweep has fixed its sites. */
const findingsAll = (root: string, rule: string, source: string, path: string): Promise<readonly Linter.LintMessage[]> =>
  lint(root, source, path, () => ({ [rule]: ["error", { scope: "all" }] }));

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
  ["a hoisted label", `const label = "View raw source"; await page.getByText(label).click();`, SPEC, 1, "control-labels.ts"],
  ["an accessible-name assertion", `await expect(control).toHaveAccessibleName("View raw source");`, SPEC, 1, "control-labels.ts"],
  ["an imported accessible name", "await expect(control).toHaveAccessibleName(IMMERSIVE_CARD_LABELS.rawSource);", SPEC, 0, ""],
  ["a role name typed by hand", `await page.getByRole("button", { name: "View raw source" }).click();`, SPEC, 1, "control-labels.ts"],
  ["a label typed by hand", `await page.getByLabel("Open card fullscreen").click();`, SPEC, 1, "IMMERSIVE_CARD_LABELS.fullscreen"],
  ["a name in a plain template", "await page.getByRole('button', { name: `Collapse card` }).click();", SPEC, 1, "IMMERSIVE_CARD_LABELS.collapse"],
  ["an e2e spec", `await page.getByRole("button", { name: "Show rendered card" }).click();`, E2E_SPEC, 1, "control-labels.ts"],
  ["a name imported from its module", `await page.getByRole("button", { name: IMMERSIVE_CARD_LABELS.rawSource }).click();`, SPEC, 0, ""],
  ["a name no module exports", `await page.getByRole("button", { name: "A sentence only this spec spells" }).click();`, SPEC, 0, ""],
  ["a pattern name", `await page.getByRole("button", { name: /View raw source/u }).click();`, SPEC, 0, ""],
  ["a text locator", `await page.getByText("View raw source", { exact: true }).click();`, SPEC, 1, "control-labels.ts"],
] as const)("test authoring wall, hand-copied label: %s", CONFIG_LOAD_TIMEOUT, async ([, source, path, count, owner], { repoRoot }) => {
  const found = await findings(repoRoot, LABEL, source, path);
  expect(found).toHaveLength(count);
  expect(found[0]?.message ?? "").toContain(owner);
});

const SERVER_TEST = "tests/server/domain/probe/probe.int.test.ts";

test.for([
  ["a label function's string at a locator", `await page.getByRole("button", { name: "Show details" }).click();`, SPEC, 1, "contextToggleLabel"],
  ["a label function's other arm", `await expect(control).toHaveAccessibleName("Hide details");`, SPEC, 1, "contextToggleLabel"],
  ["a label function called", `await page.getByRole("button", { name: contextToggleLabel(true) }).click();`, SPEC, 0, ""],
  ["a rpg code in an assertion", `expect(refusal).toMatchObject({ code: "rpg_state_corrupt" });`, SERVER_TEST, 1, "RPG_OP_CODES.stateCorrupt"],
  ["a chat code in a comparison", `expect(code).toBe("not_host");`, SERVER_TEST, 1, "CHAT_OP_CODES.notHost"],
  ["a code read from its object", "expect(refusal).toMatchObject({ code: RPG_OP_CODES.stateCorrupt });", SERVER_TEST, 0, ""],
  ["a code used as an object key", "const byCode = { rpg_state_corrupt: 1 };", SERVER_TEST, 0, ""],
  ["a code in a type", `type Code = "rpg_state_corrupt";`, SERVER_TEST, 0, ""],
  ["a one-word code stays prose", `expect(reason).toBe("locked");`, SERVER_TEST, 0, ""],
  ["a route in a request", `await root.http.request("/api/import/bundle");`, SERVER_TEST, 1, "PORTABILITY_ROUTES.importBundle"],
  ["the longer of two routes", `await root.http.request("/api/import/tree/review");`, SERVER_TEST, 1, "PORTABILITY_ROUTES.importTreeReview"],
  ["a route with a query", `await root.http.request("/api/export/library?kinds=tag");`, SERVER_TEST, 1, "PORTABILITY_ROUTES.exportLibrary"],
  // biome-ignore lint/suspicious/noTemplateCurlyInString: The fixture asserts literal template-source bytes, not interpolation in this test.
  ["a route with an id", "await root.http.request(`/api/export/character/${id}?format=json`);", SERVER_TEST, 1, "PORTABILITY_ROUTES.exportCharacter"],
  ["a route read from the contract", "await root.http.request(PORTABILITY_ROUTES.importBundle);", SERVER_TEST, 0, ""],
  ["a path that merely resembles a route", `await root.http.request("/api/importer");`, SERVER_TEST, 0, ""],
  ["an env key as a record key", `const env = { ORB_ENV_NO_FILE: "1" };`, SERVER_TEST, 0, ""],
  ["an env key as a computed key", `const env = { ["ORB_ENV_NO_FILE"]: "1" };`, SERVER_TEST, 1, "ENV_NO_FILE_KEY"],
  ["an env key read", `expect(environment["ORB_ENV_NO_FILE"]).toBe("1");`, SERVER_TEST, 1, "ENV_NO_FILE_KEY"],
  ["an env key imported", `const env = { [ENV_NO_FILE_KEY]: "1" };`, SERVER_TEST, 0, ""],
] as const)("test authoring wall, hand-copied production value: %s", CONFIG_LOAD_TIMEOUT, async ([, source, path, count, owner], { repoRoot }) => {
  const found = await findingsAll(repoRoot, LABEL, source, path);
  expect(found).toHaveLength(count);
  expect(found[0]?.message ?? "").toContain(owner);
});

test("the extended kinds are findings only under scope all", CONFIG_LOAD_TIMEOUT, async ({ repoRoot }) => {
  const source = `expect(code).toBe("not_host");\nawait page.getByRole("button", { name: "Show details" }).click();`;
  expect(await findings(repoRoot, LABEL, source, SPEC)).toHaveLength(0);
  expect(await findingsAll(repoRoot, LABEL, source, SPEC)).toHaveLength(2);
});

const caseOf = (body: string): string => `test("probe", async ({ page }) => {\n${body}\n});`;

test.for([
  ["a null equality only", caseOf("expect(await lookup(page)).toBe(null);"), 1],
  ["a falsy only", caseOf("expect(await lookup(page)).toBeFalsy();"), 1],
  ["a negated falsy control", caseOf("expect(await lookup(page)).not.toBeFalsy(); await expect(a).toHaveCount(0);"), 0],
  ["a null only", caseOf("expect(await lookup(page)).toBeNull();"), 1],
  ["an undefined only", caseOf("expect(await lookup(page)).toBeUndefined();"), 1],
  [
    "a positive inside a closure the case never runs",
    caseOf("const check = async () => {\n  await expect(a).toBeVisible();\n};\nawait expect(b).toHaveCount(0);"),
    1,
  ],
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
  ["a double negative that asserts presence", caseOf("await expect(a).not.toBeHidden();\nawait expect(b).toHaveCount(0);"), 0],
  [
    "a positive inside a closure the case calls",
    caseOf("const check = async () => {\n  await expect(a).toBeVisible();\n};\nawait check();\nawait expect(b).toHaveCount(0);"),
    0,
  ],
  [
    "a positive inside a callback handed to a call",
    caseOf("await poll(async () => {\n  await expect(a).toBeVisible();\n});\nawait expect(b).toHaveCount(0);"),
    0,
  ],
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

test("a constant outranks a table field, and a string two same-rank exports hold has no owner", async ({ plantedTree }) => {
  const root = await plantedTree({
    "packages/a/src/one.ts": 'export const ALPHA_LABEL = "Alphabet";\nexport const TABLE_LABELS = { a: "Alphabet", b: "Tablet" } as const;\n',
    "packages/a/src/two.ts": 'export const BETA_NAME = "Shared";\n',
    "packages/b/src/three.ts": 'export const GAMMA_NAME = "Shared";\nexport const OTHER_TITLES = { x: "Tablet", y: "Tabloid" } as const;\n',
  });
  const labels = exportedLabels(root);
  expect(labels.get("Alphabet")).toEqual({ module: "packages/a/src/one.ts", exportName: "ALPHA_LABEL" });
  expect(labels.has("Shared")).toBe(false);
  expect(labels.has("Tablet")).toBe(false);
  expect(labels.get("Tabloid")).toEqual({ module: "packages/b/src/three.ts", exportName: "OTHER_TITLES.y" });
});

test("the extended index reads label functions, zero-import copy modules, codes, routes and env keys", async ({ plantedTree }) => {
  const root = await plantedTree({
    // A copy module no door exports: every string it exports counts, whatever the export is called.
    "packages/a/src/feature/lib/empty-copy.ts": 'export const EMPTY_STATE = "Nothing here yet";\nexport const HINTS = { first: "Try a search" } as const;\n',
    // A copy module that imports a value is not a leaf, so only the export-name rule judges it.
    "packages/a/src/feature/lib/heavy-copy.ts":
      'import { thing } from "./thing.ts";\nexport const EMPTY_STATE = "Nothing to see";\nexport const OTHER_COPY = thing("Named copy");\n',
    "packages/a/src/feature/lib/toggle.ts":
      'export function toggleLabel(open: boolean): string {\n  return open ? "Close drawer" : "Open drawer";\n}\nexport const rowName = (kind: string): string => (kind === "x" ? "Row of x" : "Row of " + kind);\nexport function helper(): string {\n  return "Not a label";\n}\n',
    "packages/a/src/feature/contract/errors.ts":
      'export const THING_OP_CODES = { gone: "thing_gone", short: "gone" } as const;\nexport const SINGLE_OP_CODE = "single_code";\nexport const PLAIN_TABLE = { a: "plain_value" } as const;\n',
    "packages/a/src/feature/routes.ts": 'export const THING_ROUTES = { list: "/api/things", one: "/api/things/:thingId", root: "/api" } as const;\n',
    "packages/a/src/feature/env.ts": 'export const THING_ENV = "THING_HOME";\nexport const SKIPPED_KEY = "lower_value";\nexport const WORD_ENV = "PORT";\n',
  });
  const held = exportedProductionValues(root);
  const owner = (value: string): string | undefined => {
    const found = held.get(value);
    return found === undefined ? undefined : `${found.kind}:${found.exportName}`;
  };
  expect(owner("Nothing here yet")).toBe("copy:EMPTY_STATE");
  expect(owner("Try a search")).toBe("copy:HINTS.first");
  expect(owner("Nothing to see")).toBeUndefined();
  expect(owner("Close drawer")).toBe("function:toggleLabel");
  expect(owner("Open drawer")).toBe("function:toggleLabel");
  expect(owner("Row of x")).toBe("function:rowName");
  expect(owner("Not a label")).toBeUndefined();
  expect(owner("thing_gone")).toBe("code:THING_OP_CODES.gone");
  expect(owner("single_code")).toBe("code:SINGLE_OP_CODE");
  expect(owner("gone")).toBeUndefined();
  expect(owner("plain_value")).toBeUndefined();
  expect(owner("/api/things")).toBe("route:THING_ROUTES.list");
  expect(owner("/api/things/:thingId")).toBe("route:THING_ROUTES.one");
  expect(owner("/api")).toBeUndefined();
  expect(owner("THING_HOME")).toBe("env:THING_ENV");
  expect(owner("lower_value")).toBeUndefined();
  expect(owner("PORT")).toBeUndefined();
  // The named index stays what it was: no extended entry reaches it.
  expect(exportedLabels(root).size).toBe(0);
});
