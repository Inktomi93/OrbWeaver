// The DOM-hook pass (tooling/src/unwired/graph/dom.ts header): a sheet selector nothing writes, a data-* attribute
// nothing reads and a test id no lookup names are reported; a name held in a constant, a table, a list or a parameter is
// followed through the checker to the attribute site it reaches; sealed, dependency-spelled and owner-published names are
// not dead; a snap read counts as the product's, a read in tests or other tooling only annotates a product hook, save a
// test's read of a test id; a whole data-*
// string no site reaches is listed as unresolved and keeps its name out of every bucket. The pass reads source, so it
// refuses a dump.
import { join } from "node:path";
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import { EXIT } from "../../../tooling/src/floor/cli/exit-contract.ts";
import { OWNER_CSS_SURFACE } from "../../../tooling/src/unwired/graph/css.ts";
import type { DomReport, Unresolved } from "../../../tooling/src/unwired/index.ts";
import { domGraph } from "../../../tooling/src/unwired/index.ts";
import { GRAPH_SOURCE, graphTree, JSX_NAMESPACE, LIB, WORLD } from "./_planted.ts";

const SHEET = `${GRAPH_SOURCE}/hooks.css`;
const TIMEOUT = { timeout: 120_000 };
// A ceiling on the (node, position) answers one diamond level may cost: the memo answers each level's calls once.
const STEPS_PER_LEVEL = 4;
// A ceiling on the (node, position) answers one list element may cost.
const STEPS_PER_LIST = 8;

// The element the planted code writes and reads through: the DOM library's own, since an attribute call counts only
// when its method resolves there.
const ELEMENT = "export type El = HTMLElement;";
const DOM_LIB = [...LIB, "DOM"];

// A browser test runner, installed as the real one is: its page and locator types come from playwright-core, which
// declares the in-page `evaluate` family, and its `getByTestId` and `toHaveAttribute` read hooks.
const RUNNER = "@playwright/test";
const DRIVER = "playwright-core";
const DRIVER_TYPES = [
  "export interface Locator {",
  "  evaluate<A>(fn: (element: HTMLElement, arg: A) => unknown, arg: A): Promise<unknown>;",
  "}",
  "export interface Page {",
  "  getByTestId(id: string): Locator;",
  "  locator(selector: string): Locator;",
  "  evaluate<A>(fn: (arg: A) => unknown, arg: A): Promise<unknown>;",
  "}",
].join("\n");
const MATCHERS = "playwright";
const MATCHER_TYPES = [
  `import type { Locator } from "${DRIVER}";`,
  "export declare function expect(locator: Locator): { toHaveAttribute(name: string): Promise<void> };",
].join("\n");
const RUNNER_TYPES = [`export * from "${DRIVER}";`, `export * from "${MATCHERS}";`].join("\n");

const owner = (lines: readonly string[]): string => [...lines, "export const OWNER_CSS_SURFACE = [];"].join("\n");

async function dom(plantedTree: (tree: Record<string, string>) => Promise<string>, files: Readonly<Record<string, string>>): Promise<DomReport> {
  const root = await plantedTree(
    graphTree(
      {
        // The merged program takes its options from the browser world's config.
        "tsconfig.world-browser.json": plantedTsconfig({ lib: DOM_LIB, include: [], jsx: "preserve" }),
        [WORLD]: plantedTsconfig({ lib: DOM_LIB, include: ["../*/src", "../../tests", "../../tooling"], jsx: "preserve" }),
        [`${GRAPH_SOURCE}/jsx-env.ts`]: JSX_NAMESPACE,
        [`${GRAPH_SOURCE}/el.ts`]: ELEMENT,
        [`node_modules/${RUNNER}/package.json`]: JSON.stringify({ name: RUNNER, types: "index.d.ts" }),
        [`node_modules/${RUNNER}/index.d.ts`]: RUNNER_TYPES,
        [`node_modules/${DRIVER}/package.json`]: JSON.stringify({ name: DRIVER, types: "index.d.ts" }),
        [`node_modules/${DRIVER}/index.d.ts`]: DRIVER_TYPES,
        [`node_modules/${MATCHERS}/package.json`]: JSON.stringify({ name: MATCHERS, types: "index.d.ts" }),
        [`node_modules/${MATCHERS}/index.d.ts`]: MATCHER_TYPES,
        [OWNER_CSS_SURFACE]: owner([]),
        ...files,
      },
      { jsx: true },
    ),
  );
  return await domGraph(root, () => undefined);
}

// Where each unresolved mention sits; its reason is the pass's own wording, which a case does not pin.
const placed = (rows: readonly Unresolved[]): readonly Omit<Unresolved, "why">[] => rows.map(({ text, at, world }) => ({ text, at, world }));

const names = (rows: readonly string[]): readonly string[] => rows.map((row) => row.slice(0, row.indexOf(" ")));

test("a class selector no product string writes is reported; a sealed, dependency-spelled or owner-published one is not", TIMEOUT, async ({ plantedTree }) => {
  const report = await dom(plantedTree, {
    [SHEET]:
      ".live { color: red; } .dead { color: red; } .pre-sm { color: red; } .cm-line { color: red; } .lib-skin { color: red; } .shell-grid { color: red; }",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the case is planted template source the pass reads.
    [`${GRAPH_SOURCE}/box.ts`]: ['export const box = "flex live";', "export const sized = (size: string): string => `pre-${size}`;"].join("\n"),
    [OWNER_CSS_SURFACE]: owner(['export const OWNER_CSS_SHELL_CLASSES = ["shell-grid"] as const;']),
    "packages/a/node_modules/skin-lib/package.json": JSON.stringify({ name: "skin-lib", main: "index.js" }),
    "packages/a/node_modules/skin-lib/index.js": 'export const skin = "lib-skin";',
  });
  expect(report.buckets["css-class-unwritten"]).toEqual([`${SHEET}:.dead`]);
  expect(report.buckets["css-class-owner-css-only"]).toEqual([`${SHEET}:.shell-grid`]);
});

test("an attribute selector is written through a constant, an import, a table, a list, a template head and a parameter", TIMEOUT, async ({ plantedTree }) => {
  const report = await dom(plantedTree, {
    [SHEET]: [
      "[data-dead] { color: red; }",
      "[data-held] { color: red; }",
      "[data-imported] { color: red; }",
      "[data-table-flip] { color: red; }",
      "[data-listed] { color: red; }",
      "[data-theme-motion] { color: red; }",
      "[data-helper] { color: red; }",
      "[data-base-ui-open] { color: red; }",
      "[data-streamy] { color: red; }",
    ].join("\n"),
    [`${GRAPH_SOURCE}/names.ts`]: 'export const IMPORTED = "data-imported";',
    [`${GRAPH_SOURCE}/stamp.ts`]: [
      'import type { El } from "./el.ts";',
      'import { IMPORTED } from "./names.ts";',
      'const HELD = "data-held";',
      'const TABLE = { a: { flip: "data-table-flip" }, b: { flip: "data-other-flip" } };',
      'const LISTED = ["data-listed"] as const;',
      'const PREFIX = "data-theme-";',
      "const mark = (el: El, name: string): void => {",
      "  el.toggleAttribute(name, true);",
      "};",
      "export function stamp(el: El, which: keyof typeof TABLE, key: string): void {",
      '  el.setAttribute(HELD, "");',
      '  el.setAttribute(IMPORTED, "");',
      '  el.setAttribute(TABLE[which].flip, "");',
      "  for (const name of LISTED) {",
      '    el.setAttribute(name, "");',
      "  }",
      `  el.setAttribute(\`\${PREFIX}\${key}\`, "on");`,
      '  mark(el, "data-helper");',
      "}",
    ].join("\n"),
    "packages/a/node_modules/stream-lib/package.json": JSON.stringify({ name: "stream-lib", main: "index.js" }),
    "packages/a/node_modules/stream-lib/index.js": 'export const stamp = (el) => el.setAttribute("data-streamy", "");',
  });
  expect(report.buckets["css-attr-unwritten"]).toEqual([`${SHEET}:[data-dead]`]);
  // The template's wide part leaves its name open: it writes what its head starts, and is listed.
  // biome-ignore lint/suspicious/noTemplateCurlyInString: the expected text is the planted template's source.
  expect(placed(report.unresolved)).toEqual([{ text: "`${PREFIX}${key}`", at: `${GRAPH_SOURCE}/stamp.ts:17`, world: "product" }]);
});

test("a selector value no write can hold is reported; a value a wide prop writes is any value", TIMEOUT, async ({ plantedTree }) => {
  const report = await dom(plantedTree, {
    [SHEET]: '[data-state="open"] { color: red; } [data-state="gone"] { color: red; } [data-tone="calm"] { color: red; }',
    [`${GRAPH_SOURCE}/row.tsx`]:
      'export const Row = ({ open, tone }: { open: boolean; tone: string }) => <div data-state={open ? "open" : "shut"} data-tone={tone} />;',
  });
  expect(report.buckets["css-attr-value-unwritten"]).toEqual([`${SHEET}:[data-state=gone]`]);
});

test("a written data-* attribute no product or snap read reaches is reported, a test or other tooling read annotated", TIMEOUT, async ({ plantedTree }) => {
  const report = await dom(plantedTree, {
    [SHEET]: "[data-styled] { color: red; }",
    [OWNER_CSS_SURFACE]: owner(['export const OWNER_CSS_APPEARANCE_ATTRIBUTES = [{ "name": "data-theme-grain", "values": ["on"] }] as const;']),
    [`${GRAPH_SOURCE}/marks.tsx`]: [
      'import type { El } from "./el.ts";',
      'const READ = "data-held-read";',
      'const SELECTED = "data-selected";',
      "export const Marks = () => (",
      '  <div data-orphan="x" data-styled data-held-read="1" data-selected data-asserted data-variant data-dataset-read data-theme-grain="on" data-base-ui-x data-snapped data-driven data-lookalike className="data-variant:flex" />',
      ");",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the case is planted template source the pass reads.
      "export const read = (el: El): unknown => [el.getAttribute(READ), el.querySelector(`[${SELECTED}]`), el.dataset.datasetRead];",
    ].join("\n"),
    "tests/a/marks.test.ts": [
      `import { expect, type Locator } from "${RUNNER}";`,
      "declare const row: Locator;",
      "declare const el: HTMLElement;",
      'void expect(row).toHaveAttribute("data-asserted");',
      'el.setAttribute("data-test-only", "");',
      // A matcher of our own spelled like the runner's reads nothing.
      "declare const lookalike: { toHaveAttribute(name: string): void };",
      'lookalike.toHaveAttribute("data-lookalike");',
    ].join("\n"),
    "tooling/src/snap/drive.ts": [
      'import type { El } from "../../../packages/a/src/el.ts";',
      'export const driven = (el: El): string | null => el.getAttribute("data-driven");',
    ].join("\n"),
    "tooling/src/probe.ts": [
      'import type { El } from "../../packages/a/src/el.ts";',
      'export const snapped = (el: El): string | null => el.getAttribute("data-snapped");',
    ].join("\n"),
  });
  const at = `${GRAPH_SOURCE}/marks.tsx:5`;
  expect(report.buckets["dom-attr-unread"]).toEqual([
    `data-asserted ${at} read by tests`,
    `data-lookalike ${at}`,
    `data-orphan ${at}`,
    `data-snapped ${at} read by tooling`,
  ]);
  expect(names(report.buckets["dom-attr-owner-css-only"])).toEqual(["data-theme-grain"]);
});

test(
  "a plain test id no test lookup names is reported; one a test reaches through a table is read, a tooling lookup annotated",
  TIMEOUT,
  async ({ plantedTree }) => {
    const report = await dom(plantedTree, {
      [`${GRAPH_SOURCE}/ids.ts`]: 'export const IDS = { found: "found" };',
      [`${GRAPH_SOURCE}/rows.tsx`]:
        'export const Rows = () => [<div data-testid="lonely" />, <div data-testid="found" />, <div data-testid="selected" />, <div data-testid="snapped" />, <div data-testid="driven" />, <div data-testid="twin" />];',
      "tests/a/rows.test.ts": [
        'import { IDS } from "../../packages/a/src/ids.ts";',
        `import type { Page } from "${RUNNER}";`,
        "declare const page: Page;",
        "page.getByTestId(IDS.found);",
        // A lookup of our own spelled like the runner's names no test id.
        "declare const own: { getByTestId(id: string): unknown };",
        'own.getByTestId("twin");',
        "page.locator('[data-testid=\"selected\"]');",
      ].join("\n"),
      "tooling/src/snap/ids.ts": [`import type { Page } from "${RUNNER}";`, "declare const page: Page;", 'page.getByTestId("driven");'].join("\n"),
      "tooling/src/snap.ts": [`import type { Page } from "${RUNNER}";`, "declare const page: Page;", 'page.getByTestId("snapped");'].join("\n"),
    });
    const at = `${GRAPH_SOURCE}/rows.tsx:1`;
    expect(report.buckets["dom-value-unread"]).toEqual([`data-testid=lonely ${at}`, `data-testid=snapped ${at} read by tooling`]);
    // The look-alike lookup reads nothing: its argument is only a string equal to a test id, listed unresolved.
    expect(placed(report.unresolved)).toEqual([{ text: "twin", at: "tests/a/rows.test.ts:6", world: "tests" }]);
  },
);

test(
  "a whole data-* string no site reaches and a site whose name no hop resolves are listed; only a product mention keeps a name out",
  TIMEOUT,
  async ({ plantedTree }) => {
    const report = await dom(plantedTree, {
      [SHEET]: "[data-stray] { color: red; } [data-dead] { color: red; } [data-tooling-named] { color: red; }",
      [`${GRAPH_SOURCE}/stray.ts`]: [
        'import type { El } from "./el.ts";',
        'export const NAMES = { stray: "data-stray" };',
        "export function wide(el: El, name: string): void {",
        '  el.setAttribute(name, "");',
        "}",
        "export const bag = (key: string): Record<string, number> => ({ [key]: 1 });",
      ].join("\n"),
      "tests/a/set.test.ts": ["declare const el: HTMLElement;", 'el.setAttribute("data-test-set", "");'].join("\n"),
      "tooling/src/named.ts": 'export const NAMED = ["data-tooling-named"];',
    });
    expect(report.buckets["css-attr-unwritten"]).toEqual([`${SHEET}:[data-dead]`, `${SHEET}:[data-tooling-named]`]);
    expect(placed(report.unresolved)).toEqual([
      { text: "data-stray", at: `${GRAPH_SOURCE}/stray.ts:2`, world: "product" },
      { text: "name", at: `${GRAPH_SOURCE}/stray.ts:4`, world: "product" },
      { text: "data-tooling-named", at: "tooling/src/named.ts:1", world: "tooling" },
    ]);
  },
);

test("an attribute call or a dataset use inside script source a string holds is a site", TIMEOUT, async ({ plantedTree }) => {
  const report = await dom(plantedTree, {
    [SHEET]: "[data-script-written] { color: red; }",
    [`${GRAPH_SOURCE}/frame.ts`]: [
      "export const FRAME_SCRIPT =",
      `  'var root=document.documentElement;if(root.hasAttribute("data-in-script")){root.setAttribute("data-script-written","");}var s=root.dataset.scriptSet;';`,
      'export const PROSE = "the frame stamps data-in-prose";',
    ].join("\n"),
    [`${GRAPH_SOURCE}/marks.tsx`]: "export const Marks = () => <div data-in-script data-script-set data-in-prose />;",
  });
  expect(report.buckets["css-attr-unwritten"]).toEqual([]);
  expect(names(report.buckets["dom-attr-unread"])).toEqual(["data-in-prose"]);
});

test("a name is followed through a call's returns, a mapped table's field and a Map's get", TIMEOUT, async ({ plantedTree }) => {
  const report = await dom(plantedTree, {
    [SHEET]: "[data-chan-alpha] { color: red; } [data-chan-gamma] { color: red; }",
    [`${GRAPH_SOURCE}/channel.tsx`]: [
      'import type { El } from "./el.ts";',
      "interface Row {",
      "  readonly key: string;",
      "  readonly name: string;",
      "}",
      'const PREFIX = "data-chan-";',
      'const KEYS = ["alpha", "beta"];',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the case is planted template source the pass reads.
      "const ROWS: readonly Row[] = KEYS.flatMap((key): Row[] => [{ key, name: `${PREFIX}${key}` }]);",
      "const BY_KEY = new Map(ROWS.map((row) => [row.key, row]));",
      'const returned = (): string => "data-returned";',
      "export function write(el: El): void {",
      "  for (const row of ROWS) {",
      '    el.setAttribute(row.name, "");',
      "  }",
      "}",
      "export const clear = (el: El, key: string): void => {",
      '  el.removeAttribute(BY_KEY.get(key)?.name ?? "");',
      "};",
      "export const read = (el: El): string | null => el.getAttribute(returned());",
      "export const Returned = () => <div data-returned />;",
    ].join("\n"),
  });
  expect(report.buckets["css-attr-unwritten"]).toEqual([`${SHEET}:[data-chan-gamma]`]);
  expect(report.buckets["dom-attr-unread"]).toEqual([]);
  expect(placed(report.unresolved)).toEqual([]);
});

test("a name is followed through a destructured tuple and a list method's callback element", TIMEOUT, async ({ plantedTree }) => {
  const report = await dom(plantedTree, {
    [SHEET]: '[data-cb-flip] { color: red; } [data-tuple-name="on"] { color: red; } [data-tuple-name="off"] { color: red; }',
    [`${GRAPH_SOURCE}/arms.ts`]: [
      'import type { El } from "./el.ts";',
      "interface Flip {",
      "  readonly flip: string;",
      "}",
      'const FLIPS: readonly Flip[] = [{ flip: "data-cb-flip" }];',
      'const PAIRS: readonly (readonly [string, string])[] = [["data-tuple-name", "on"]];',
      "export function stamp(el: El): unknown {",
      '  FLIPS.forEach((arm) => el.setAttribute(arm.flip, ""));',
      "  for (const [name, value] of PAIRS) {",
      "    el.setAttribute(name, value);",
      "  }",
      "  return PAIRS.map(([name]) => el.getAttribute(name));",
      "}",
    ].join("\n"),
  });
  expect(report.buckets["css-attr-unwritten"]).toEqual([]);
  expect(report.buckets["css-attr-value-unwritten"]).toEqual([`${SHEET}:[data-tuple-name=off]`]);
  expect(placed(report.unresolved)).toEqual([]);
});

test("a read of snap's or ui-facts' attribute model by name reads that attribute; a look-alike record does not", TIMEOUT, async ({ plantedTree }) => {
  const report = await dom(plantedTree, {
    "tooling/src/snap/ops/appearance-invariant-dom.ts":
      "export interface AppearanceElementFacts {\n  readonly attributes: Readonly<Record<string, string | null>>;\n}",
    "tooling/src/snap/ops/checks.ts": [
      'import type { AppearanceElementFacts } from "./appearance-invariant-dom.ts";',
      "function attr(facts: AppearanceElementFacts, name: string): string | null {",
      "  return facts.attributes[name] ?? null;",
      "}",
      'export const density = (facts: AppearanceElementFacts): string | null => attr(facts, "data-snap-model");',
    ].join("\n"),
    "tooling/src/eslint/ui-classes/source.ts": [
      "export interface Elem {\n  readonly attrs: ReadonlyMap<string, unknown>;\n}",
      // The model's member typed by a lookup of our own: its `has` is no collection's, so it reads no attribute.
      "export interface Other {\n  readonly attrs: { has(name: string): boolean };\n}",
    ].join("\n"),
    "tooling/src/ui-facts/cohorts.ts": [
      'import type { Elem, Other } from "../eslint/ui-classes/source.ts";',
      'export const shell = (elem: Elem): boolean => elem.attrs.has("data-facts-model");',
      'export const near = (other: Other): boolean => other.attrs.has("data-facts-lookalike");',
    ].join("\n"),
    [`${GRAPH_SOURCE}/models.tsx`]: [
      "const bag: { readonly attributes: Readonly<Record<string, string>> } = { attributes: {} };",
      'export const other = bag.attributes["data-not-model"];',
      "export const Models = () => <div data-snap-model data-facts-model data-facts-lookalike data-not-model />;",
    ].join("\n"),
  });
  // A look-alike record's key names a property, not an attribute read, so its hook stays unread.
  expect(report.buckets["dom-attr-unread"]).toEqual([
    `data-facts-lookalike ${GRAPH_SOURCE}/models.tsx:3`,
    `data-facts-model ${GRAPH_SOURCE}/models.tsx:3 read by tooling`,
    `data-not-model ${GRAPH_SOURCE}/models.tsx:3`,
  ]);
  // The look-alike lookup is no site, so its name is a whole data-* string no site reaches.
  expect(placed(report.unresolved)).toEqual([{ text: "data-facts-lookalike", at: "tooling/src/ui-facts/cohorts.ts:3", world: "tooling" }]);
});

test("a table a flatMap builds holds the rows its callback returns, past a branch that returns none", TIMEOUT, async ({ plantedTree }) => {
  const report = await dom(plantedTree, {
    [SHEET]: "[data-flat-alpha] { color: red; }",
    [`${GRAPH_SOURCE}/flat.ts`]: [
      'import type { El } from "./el.ts";',
      "interface Row {",
      "  readonly name: string;",
      "}",
      'const MANIFEST = { alpha: { kind: "attribute" }, beta: { kind: "none" } } as const;',
      "type Key = keyof typeof MANIFEST;",
      "const lower = (key: string): string => key.toLowerCase();",
      "const ROWS: readonly Row[] = (Object.keys(MANIFEST) as Key[]).flatMap((key): Row[] => {",
      '  if (MANIFEST[key].kind === "none") {',
      "    return [];",
      "  }",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the case is planted template source the pass reads.
      "  return [{ name: `data-flat-${lower(key)}` }];",
      "});",
      "export function write(el: El): void {",
      "  for (const row of ROWS) {",
      '    el.setAttribute(row.name, "");',
      "  }",
      "}",
    ].join("\n"),
  });
  expect(report.buckets["css-attr-unwritten"]).toEqual([]);
  // `lower()` is wide, so the write names only its head, and is listed.
  expect(placed(report.unresolved)).toEqual([{ text: "row.name", at: `${GRAPH_SOURCE}/flat.ts:16`, world: "product" }]);
});

test("a name is followed through Object.entries values and a reader a record holds, called through the record", TIMEOUT, async ({ plantedTree }) => {
  const report = await dom(plantedTree, {
    [`${GRAPH_SOURCE}/observables.tsx`]: [
      'import type { El } from "./el.ts";',
      'type Read = "attribute" | "text";',
      "interface Observable {",
      "  readonly read: Read;",
      "  readonly signals: readonly string[];",
      "}",
      'const observe = (signal: string): Observable => ({ read: "attribute", signals: [signal] });',
      "const OBSERVABLES = {",
      '  seed: { read: "attribute", signals: ["data-obs-seed"] },',
      '  made: observe("data-obs-made"),',
      "} satisfies Record<string, Observable>;",
      "const READERS: Record<Read, (el: El, signal: string) => string | null> = {",
      "  attribute: (el, signal) => el.getAttribute(signal),",
      "  text: () => null,",
      "};",
      "export function capture(el: El): void {",
      "  for (const [, observable] of Object.entries(OBSERVABLES)) {",
      "    for (const signal of observable.signals) {",
      "      READERS[observable.read](el, signal);",
      "    }",
      "  }",
      "}",
      "export const Seen = () => <div data-obs-seed data-obs-made data-obs-lost />;",
    ].join("\n"),
  });
  expect(placed(report.unresolved)).toEqual([]);
  expect(names(report.buckets["dom-attr-unread"])).toEqual(["data-obs-lost"]);
});

test(
  "an observer's attributeFilter and a record's attributeName compare read the names they hold, and same-named members of ours hold none",
  TIMEOUT,
  async ({ plantedTree }) => {
    const report = await dom(plantedTree, {
      [`${GRAPH_SOURCE}/watch.tsx`]: [
        "interface Options {",
        "  readonly attributeFilter: readonly string[];",
        "}",
        "interface Mutation {",
        "  readonly attributeName: string | null;",
        "}",
        'const MOVING: string[] = ["data-watch-moving"];',
        'export const options = (): MutationObserverInit => { const attributeFilter = [...MOVING, "style"]; return { attributes: true, attributeFilter }; };',
        'export const literal: MutationObserverInit = { attributes: true, attributeFilter: ["data-watch-literal"] };',
        'export const flipped = (record: MutationRecord): boolean => record.attributeName === "data-watch-compared";',
        "export const watched = (names: string[]): MutationObserverInit => ({ attributeFilter: names });",
        "export const changed = (record: MutationRecord, name: string): boolean => record.attributeName === name;",
        "export const ours = (names: string[]): Options => ({ attributeFilter: names });",
        "export const mine = (record: Mutation, name: string): boolean => record.attributeName === name;",
        "export const Watched = () => <div data-watch-moving data-watch-literal data-watch-compared data-watch-none />;",
      ].join("\n"),
    });
    expect(names(report.buckets["dom-attr-unread"])).toEqual(["data-watch-none"]);
    // a name the platform's filter or record holds that no literal reaches is unresolved; our own same-named members hold none
    expect(placed(report.unresolved)).toEqual([
      { text: "names", at: `${GRAPH_SOURCE}/watch.tsx:11`, world: "product" },
      { text: "name", at: `${GRAPH_SOURCE}/watch.tsx:12`, world: "product" },
    ]);
  },
);

test("a callback a browser driver runs in the page holds the argument the driver hands it", TIMEOUT, async ({ plantedTree }) => {
  const report = await dom(plantedTree, {
    [`${GRAPH_SOURCE}/marked.tsx`]: "export const Marked = () => <div data-page-mark data-element-mark data-own-mark />;",
    "tests/a/driver.ts": [
      'import type { El } from "../../packages/a/src/el.ts";',
      `import type { Locator, Page } from "${RUNNER}";`,
      'const PAGE_MARK = "data-page-mark";',
      'const ELEMENT_MARK = "data-element-mark";',
      'const OWN_MARK = "data-own-mark";',
      "interface Sandbox { evaluate<A>(fn: (arg: A) => unknown, arg: A): Promise<unknown> }",
      "export async function marks(page: Page, locator: Locator, root: El, sandbox: Sandbox): Promise<void> {",
      "  await page.evaluate((key) => root.getAttribute(key), PAGE_MARK);",
      "  await locator.evaluate((element, attribute) => element.removeAttribute(attribute), ELEMENT_MARK);",
      "  await sandbox.evaluate((key) => root.getAttribute(key), OWN_MARK);",
      "}",
    ].join("\n"),
  });
  expect(report.buckets["dom-attr-unread"]).toEqual([
    `data-element-mark ${GRAPH_SOURCE}/marked.tsx:1 read by tests`,
    `data-own-mark ${GRAPH_SOURCE}/marked.tsx:1`,
    `data-page-mark ${GRAPH_SOURCE}/marked.tsx:1 read by tests`,
  ]);
  // our own same-named `evaluate` runs nothing in the page, so its callback's parameter holds no name the driver hands
  expect(placed(report.unresolved)).toEqual([
    { text: "key", at: "tests/a/driver.ts:10", world: "tests" },
    { text: "data-own-mark", at: "tests/a/driver.ts:5", world: "tests" },
  ]);
});

test("a name held deeper than any fixed hop count still resolves, and a cycle ends", TIMEOUT, async ({ plantedTree }) => {
  const Depth = 24;
  const chain = Array.from({ length: Depth }, (_, step) =>
    step === 0 ? 'const name0 = (): string => "data-deep-end";' : `const name${String(step)} = (): string => name${String(step - 1)}();`,
  );
  const report = await dom(plantedTree, {
    [SHEET]: "[data-deep-end] { color: red; } [data-cycled] { color: red; }",
    [`${GRAPH_SOURCE}/deep.ts`]: [
      'import type { El } from "./el.ts";',
      ...chain,
      'const loop = (n: number): string => (n > 0 ? loop(n - 1) : "data-cycled");',
      "export function stamp(el: El): void {",
      `  el.setAttribute(name${String(Depth - 1)}(), "");`,
      '  el.setAttribute(loop(3), "");',
      "}",
    ].join("\n"),
  });
  expect(placed(report.unresolved)).toEqual([]);
  expect(report.buckets["css-attr-unwritten"]).toEqual([]);
});

test("an object read by a computed key holds every property's value, and a null branch holds no name", TIMEOUT, async ({ plantedTree }) => {
  const report = await dom(plantedTree, {
    [`${GRAPH_SOURCE}/indexed.tsx`]: [
      'import type { El } from "./el.ts";',
      "interface Observable {",
      "  readonly signal: string;",
      "}",
      'const OBSERVABLES: Record<string, Observable> = { a: { signal: "data-idx-a" }, b: { signal: "data-idx-b" } };',
      "export function read(el: El, key: string, on: boolean): void {",
      "  const observable = on ? OBSERVABLES[key] : null;",
      '  el.getAttribute(observable?.signal ?? "");',
      "}",
      "export const Indexed = () => <div data-idx-a data-idx-b data-idx-none />;",
    ].join("\n"),
  });
  expect(placed(report.unresolved)).toEqual([]);
  expect(names(report.buckets["dom-attr-unread"])).toEqual(["data-idx-none"]);
});

test("a named function a browser driver runs in the page holds the argument the driver hands it", TIMEOUT, async ({ plantedTree }) => {
  const report = await dom(plantedTree, {
    [`${GRAPH_SOURCE}/named.tsx`]: "export const Named = () => <div data-named-mark />;",
    "tests/a/named-driver.ts": [
      'import type { El } from "../../packages/a/src/el.ts";',
      `import type { Locator } from "${RUNNER}";`,
      'const NAMED_MARK = "data-named-mark";',
      "function probe(root: El, { mark }: { readonly mark: string }): string | null {",
      "  return root.getAttribute(mark);",
      "}",
      "export async function named(locator: Locator): Promise<void> {",
      "  await locator.evaluate(probe, { mark: NAMED_MARK });",
      "}",
    ].join("\n"),
  });
  expect(placed(report.unresolved)).toEqual([]);
  expect(report.buckets["dom-attr-unread"]).toEqual([`data-named-mark ${GRAPH_SOURCE}/named.tsx:1 read by tests`]);
});

test("a name reached by many routes is answered once per position, so a diamond fan-out stays linear", TIMEOUT, async ({ plantedTree }) => {
  const levels = 12;
  const diamond = Array.from({ length: levels }, (_, level) =>
    level === 0
      ? 'const fan0 = (on: boolean): string => (on ? "data-fan-end" : "data-fan-end");'
      : `const fan${String(level)} = (on: boolean): string => (on ? fan${String(level - 1)}(on) : fan${String(level - 1)}(!on));`,
  );
  const report = await dom(plantedTree, {
    [SHEET]: "[data-fan-end] { color: red; } [data-fan-dead] { color: red; }",
    [`${GRAPH_SOURCE}/fan.ts`]: [
      'import type { El } from "./el.ts";',
      ...diamond,
      "export function stamp(el: El, on: boolean): void {",
      `  el.setAttribute(fan${String(levels - 1)}(on), "");`,
      "}",
    ].join("\n"),
  });
  expect(placed(report.unresolved)).toEqual([]);
  expect(report.buckets["css-attr-unwritten"]).toEqual([`${SHEET}:[data-fan-dead]`]);
  // Each level's two calls share one body, so the memo answers each node once: the work grows with the levels. A walk
  // that keyed its memo by route would answer every one of the 2^levels routes.
  expect(report.counts.steps).toBeLessThan(levels * STEPS_PER_LEVEL);
});

test("a dependency writes a name only as a whole string, a whole class token or a dataset member", TIMEOUT, async ({ plantedTree }) => {
  const report = await dom(plantedTree, {
    [SHEET]: [
      ".tab { color: red; }",
      ".chip { color: red; }",
      "[data-open] { color: red; }",
      "[data-real] { color: red; }",
      "[data-dep-set] { color: red; }",
    ].join("\n"),
    "packages/a/node_modules/x-lib/package.json": JSON.stringify({ name: "x-lib", main: "index.js" }),
    "packages/a/node_modules/x-lib/index.js": [
      'export const word = "stable";',
      'export const longer = "data-opener";',
      'export const classes = "chip big";',
      'export const stamp = (el) => { el.setAttribute("data-real", ""); el.dataset.depSet = ""; };',
    ].join("\n"),
  });
  expect(report.buckets["css-class-unwritten"]).toEqual([`${SHEET}:.tab`]);
  expect(report.buckets["css-attr-unwritten"]).toEqual([`${SHEET}:[data-open]`]);
});

test("a data-* name in a key position is a property, never an unresolved mention that hides an unread hook", TIMEOUT, async ({ plantedTree }) => {
  const report = await dom(plantedTree, {
    [`${GRAPH_SOURCE}/keys.tsx`]: [
      "interface Props {",
      '  readonly "data-zz"?: string;',
      '  readonly "data-in"?: boolean;',
      '  readonly "data-keyed"?: string;',
      "}",
      'export function Zz({ "data-zz": zz, ...props }: Props) {',
      '  const marked = "data-in" in props;',
      '  return <div data-zz={zz} data-in={marked} data-keyed={props["data-keyed"]} />;',
      "}",
    ].join("\n"),
  });
  expect(placed(report.unresolved)).toEqual([]);
  expect(names(report.buckets["dom-attr-unread"])).toEqual(["data-in", "data-keyed", "data-zz"]);
});

test("a write into an attribute record by a data-* key is an attribute write", TIMEOUT, async ({ plantedTree }) => {
  const report = await dom(plantedTree, {
    [SHEET]: "[data-tone] { color: red; } [data-size] { color: red; } [data-plain] { color: red; } [data-gone] { color: red; }",
    [`${GRAPH_SOURCE}/record.ts`]: [
      'const AXES = ["tone", "size"] as const;',
      "export function attrs(arm: string): Record<string, string> {",
      "  const out: Record<string, string> = {};",
      "  for (const axis of AXES) {",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the case is planted template source the pass reads.
      "    out[`data-${axis}`] = arm;",
      "  }",
      '  out["data-plain"] = arm;',
      '  out.label = "not an attribute";',
      "  return out;",
      "}",
    ].join("\n"),
  });
  expect(report.buckets["css-attr-unwritten"]).toEqual([`${SHEET}:[data-gone]`]);
  expect(placed(report.unresolved)).toEqual([]);
});

test("a write whose name is only the data- namespace and a wide part writes no name and is listed", TIMEOUT, async ({ plantedTree }) => {
  const report = await dom(plantedTree, {
    [SHEET]: "[data-dead-one] { color: red; }",
    [`${GRAPH_SOURCE}/wide.ts`]: [
      'import type { El } from "./el.ts";',
      "export function stamp(el: El, key: string): void {",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the case is planted template source the pass reads.
      '  el.setAttribute(`data-${key}`, "");',
      "}",
    ].join("\n"),
  });
  expect(report.buckets["css-attr-unwritten"]).toEqual([`${SHEET}:[data-dead-one]`]);
  // biome-ignore lint/suspicious/noTemplateCurlyInString: the expected text is the planted template's source.
  expect(placed(report.unresolved)).toEqual([{ text: "`data-${key}`", at: `${GRAPH_SOURCE}/wide.ts:3`, world: "product" }]);
});

const listOf = (letter: string, size: number): string => Array.from({ length: size }, (_, index) => `"${letter}${String(index + 1)}"`).join(", ");

test("a template of finite lists writes the names its lists combine to, matched part by part", TIMEOUT, async ({ plantedTree }) => {
  const report = await dom(plantedTree, {
    [SHEET]: "[data-dead-one] { color: red; } [data-a9-b9] { color: red; } [data-a1-b5] { color: red; }",
    [`${GRAPH_SOURCE}/combined.ts`]: [
      'import type { El } from "./el.ts";',
      `const A: readonly string[] = [${listOf("a", 9)}];`,
      `const B: readonly string[] = [${listOf("b", 9)}];`,
      "export function stamp(el: El): void {",
      "  for (const a of A) {",
      "    for (const b of B) {",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the case is planted template source the pass reads.
      '      el.setAttribute(`data-${a}-${b}`, "");',
      "    }",
      "  }",
      "}",
    ].join("\n"),
  });
  expect(report.buckets["css-attr-unwritten"]).toEqual([`${SHEET}:[data-dead-one]`]);
  // The sheet reads two of the 81 names, so the template is read.
  expect(report.buckets["dom-attr-unread"]).toEqual([]);
});

test("a template no read matches is one unread row with its name count, however large its product", TIMEOUT, async ({ plantedTree }) => {
  const size = 40;
  const report = await dom(plantedTree, {
    [SHEET]: "[data-a7-b40-c3] { color: red; } [data-a7-b40-d3] { color: red; }",
    [`${GRAPH_SOURCE}/cube.ts`]: [
      'import type { El } from "./el.ts";',
      `const A: readonly string[] = [${listOf("a", size)}];`,
      `const B: readonly string[] = [${listOf("b", size)}];`,
      `const C: readonly string[] = [${listOf("c", size)}];`,
      "export function stamp(el: El): void {",
      "  for (const a of A) {",
      "    for (const b of B) {",
      "      for (const c of C) {",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the case is planted template source the pass reads.
      '        el.setAttribute(`data-cube-${a}-${b}-${c}`, "");',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the case is planted template source the pass reads.
      '        el.setAttribute(`data-${a}-${b}-${c}`, "");',
      "      }",
      "    }",
      "  }",
      "}",
    ].join("\n"),
  });
  expect(report.buckets["css-attr-unwritten"]).toEqual([`${SHEET}:[data-a7-b40-d3]`]);
  const rows = report.buckets["dom-attr-unread"];
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatch(new RegExp(`^data-cube-\\{a1\\|.*\\(${String(size ** 3)} names\\) ${GRAPH_SOURCE}/cube\\.ts:9$`, "u"));
  expect(report.counts.steps).toBeLessThan(size * STEPS_PER_LIST);
});

test("a template read matches a template write part by part", TIMEOUT, async ({ plantedTree }) => {
  const report = await dom(plantedTree, {
    [`${GRAPH_SOURCE}/axes.ts`]: [
      'import type { El } from "./el.ts";',
      'const WRITTEN: readonly string[] = ["tone", "size"];',
      'const READ: readonly string[] = ["size", "gap"];',
      'const PICKS: readonly string[] = ["data-picked-tone-x", "data-picked-gap-x"];',
      "export function stamp(el: El): void {",
      "  for (const axis of WRITTEN) {",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the case is planted template source the pass reads.
      '    el.setAttribute(`data-axis-${axis}`, "");',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the case is planted template source the pass reads.
      '    el.setAttribute(`data-lone-${axis}`, "");',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the case is planted template source the pass reads.
      '    el.setAttribute(`data-picked-${axis}-x`, "");',
      "  }",
      "  for (const axis of READ) {",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the case is planted template source the pass reads.
      "    el.getAttribute(`data-axis-${axis}`);",
      "  }",
      "  for (const pick of PICKS) {",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the case is planted template source the pass reads.
      "    el.querySelector(`[${pick}]`);",
      "  }",
      "}",
    ].join("\n"),
  });
  expect(names(report.buckets["dom-attr-unread"])).toEqual(["data-lone-{tone|size}"]);
});

test("a class template writes every class its head starts, however short the head", TIMEOUT, async ({ plantedTree }) => {
  const report = await dom(plantedTree, {
    [SHEET]: ".p-4 { color: red; } .q-4 { color: red; }",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the case is planted template source the pass reads.
    [`${GRAPH_SOURCE}/pad.ts`]: "export const pad = (n: string): string => `p-${n}`;",
  });
  expect(report.buckets["css-class-unwritten"]).toEqual([`${SHEET}:.q-4`]);
});

const followCase = (body: readonly string[]): Record<string, string> => ({
  [SHEET]: "[data-held-x] { color: red; } [data-held-dead] { color: red; }",
  [`${GRAPH_SOURCE}/follow.ts`]: ['import type { El } from "./el.ts";', ...body].join("\n"),
});

test.for([
  {
    step: "a copy a list method makes",
    body: [
      'const ALL: readonly string[] = ["data-held-x"];',
      "const SOME = ALL.filter(() => true);",
      'export const stamp = (el: El): void => { for (const name of SOME) { el.setAttribute(name, ""); } };',
    ],
  },
  {
    step: "the element find hands back",
    body: [
      "interface Row { readonly name: string }",
      'const ROWS: readonly Row[] = [{ name: "data-held-x" }];',
      'export const stamp = (el: El): void => { el.setAttribute(ROWS.find(() => true)?.name ?? "", ""); };',
    ],
  },
  {
    step: "a parameter's default",
    body: ['export function stamp(el: El, name: string = "data-held-x"): void { el.setAttribute(name, ""); }'],
  },
  {
    step: "an Object.values element",
    body: [
      'const TABLE: Record<string, string> = { a: "data-held-x" };',
      'export const stamp = (el: El): void => { for (const name of Object.values(TABLE)) { el.setAttribute(name, ""); } };',
    ],
  },
  {
    step: "an enum member's value",
    body: ['enum Hook { X = "data-held-x" }', "const name: string = Hook.X;", 'export const stamp = (el: El): void => { el.setAttribute(name, ""); };'],
  },
  {
    step: "a property an object spread carries",
    body: [
      'const BASE = { name: "data-held-x" };',
      "const FULL: { readonly name: string } = { ...BASE };",
      'export const stamp = (el: El): void => { el.setAttribute(FULL.name, ""); };',
    ],
  },
])("a name is followed through $step", TIMEOUT, async ({ body }, { plantedTree }) => {
  const report = await dom(plantedTree, followCase(body));
  expect(placed(report.unresolved)).toEqual([]);
  expect(report.buckets["css-attr-unwritten"]).toEqual([`${SHEET}:[data-held-dead]`]);
});

// A same-named binding of ours is no platform holder: the walk follows the platform's `Object.values` and `Map`, never a
// local `Object` or `Map` that shadows them, so the name handed through ours stays unresolved.
test.for([
  {
    step: "a local Object's values",
    body: [
      'const Object = { values: (table: Readonly<Record<string, string>>): readonly string[] => [table["a"] ?? ""] };',
      'const TABLE: Record<string, string> = { a: "data-held-x" };',
      'export const stamp = (el: El): void => { for (const name of Object.values(TABLE)) { el.setAttribute(name, ""); } };',
    ],
    held: "name",
  },
  {
    step: "a local Map's get",
    body: [
      "class Map<K, V> { constructor(readonly entries: readonly (readonly [K, V])[]) {} get(_key: K): V | undefined { return this.entries[0]?.[1]; } }",
      'const BY_KEY = new Map([["k", "data-held-x"]]);',
      'export const stamp = (el: El): void => { el.setAttribute(BY_KEY.get("k") ?? "", ""); };',
    ],
    held: 'BY_KEY.get("k") ?? ""',
  },
])("a name is not followed through $step", TIMEOUT, async ({ body, held }, { plantedTree }) => {
  const report = await dom(plantedTree, followCase(body));
  const at = `${GRAPH_SOURCE}/follow.ts`;
  expect(placed(report.unresolved)).toEqual([
    { text: "data-held-x", at: `${at}:3`, world: "product" },
    { text: held, at: `${at}:4`, world: "product" },
  ]);
});

test("a walk that returns to a node at a path that only grew in front ends as a cycle", TIMEOUT, async ({ plantedTree }) => {
  const report = await dom(
    plantedTree,
    followCase([
      "interface Wrap { readonly wrapped: Wrap; readonly name: string }",
      "const deep = (): Wrap => deep().wrapped;",
      'export const stamp = (el: El): void => { el.setAttribute(deep().name, ""); el.setAttribute("data-held-x", ""); };',
    ]),
  );
  expect(placed(report.unresolved)).toEqual([]);
  expect(report.buckets["css-attr-unwritten"]).toEqual([`${SHEET}:[data-held-dead]`]);
});

test("graph-dom refuses --from before any world loads, since a dump carries no source", TIMEOUT, async ({ runCli, scratch }) => {
  const onDump = (verb: string): ReturnType<typeof runCli> => runCli("unwired", [verb, `--root=${scratch}`, `--from=${join(scratch, "graph.dump")}`]);
  const refused = await onDump("graph-dom");
  await expect(refused).toExitWith(EXIT.misuse);
  expect(refused.stderr).toContain("graph-dom reads the program's source, which a dump does not carry");
  // another graph verb passes the flag check on the same dump and fails only on the missing file
  expect((await onDump("graph")).stderr).not.toContain("a dump does not carry");
});
