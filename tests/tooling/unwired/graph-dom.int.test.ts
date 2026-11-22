// The DOM-hook pass (tooling/src/unwired/graph/dom.ts header): a sheet selector nothing writes, a data-* attribute
// nothing reads and a test id no lookup names are reported; a name held in a constant, a table, a list or a parameter is
// followed through the checker to the attribute site it reaches; sealed, dependency-spelled and owner-published names are
// not dead; a snap read counts as the product's, a read in tests or other tooling only annotates a product hook, save a
// test's read of a test id; a whole data-*
// string no site reaches is listed as unresolved and keeps its name out of every bucket.
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import type { DomReport } from "../../../tooling/src/unwired/index.ts";
import { domGraph } from "../../../tooling/src/unwired/index.ts";
import { GRAPH_SOURCE, graphTree, JSX_NAMESPACE, LIB, WORLD } from "./_planted.ts";

const SHEET = `${GRAPH_SOURCE}/hooks.css`;
const OWNER_CSS = "packages/client/owner-css-surface.ts";
const TIMEOUT = { timeout: 120_000 };

// The element surface the planted code writes and reads through, since a planted tree has no DOM lib.
const ELEMENT = [
  "export interface El {",
  "  setAttribute(name: string, value: string): void;",
  "  toggleAttribute(name: string, force?: boolean): boolean;",
  "  getAttribute(name: string): string | null;",
  "  querySelector(selector: string): El | null;",
  "  readonly dataset: Record<string, string | undefined>;",
  "}",
].join("\n");

const owner = (lines: readonly string[]): string => [...lines, "export const OWNER_CSS_SURFACE = [];"].join("\n");

async function dom(plantedTree: (tree: Record<string, string>) => Promise<string>, files: Readonly<Record<string, string>>): Promise<DomReport> {
  const root = await plantedTree(
    graphTree(
      {
        [WORLD]: plantedTsconfig({ lib: LIB, include: ["../*/src", "../../tests", "../../tooling"], jsx: "preserve" }),
        [`${GRAPH_SOURCE}/jsx-env.ts`]: JSX_NAMESPACE,
        [`${GRAPH_SOURCE}/el.ts`]: ELEMENT,
        [OWNER_CSS]: owner([]),
        ...files,
      },
      { jsx: true },
    ),
  );
  return await domGraph(root, () => undefined);
}

const names = (rows: readonly string[]): readonly string[] => rows.map((row) => row.slice(0, row.indexOf(" ")));

test("a class selector no product string writes is reported; a sealed, dependency-spelled or owner-published one is not", TIMEOUT, async ({ plantedTree }) => {
  const report = await dom(plantedTree, {
    [SHEET]:
      ".live { color: red; } .dead { color: red; } .pre-sm { color: red; } .cm-line { color: red; } .lib-skin { color: red; } .shell-grid { color: red; }",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the case is planted template source the pass reads.
    [`${GRAPH_SOURCE}/box.ts`]: ['export const box = "flex live";', "export const sized = (size: string): string => `pre-${size}`;"].join("\n"),
    [OWNER_CSS]: owner(['export const OWNER_CSS_SHELL_CLASSES = ["shell-grid"] as const;']),
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
  expect(report.unresolved).toEqual([]);
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
    [OWNER_CSS]: owner(['export const OWNER_CSS_APPEARANCE_ATTRIBUTES = [{ "name": "data-theme-grain", "values": ["on"] }] as const;']),
    [`${GRAPH_SOURCE}/marks.tsx`]: [
      'import type { El } from "./el.ts";',
      'const READ = "data-held-read";',
      'const SELECTED = "data-selected";',
      "export const Marks = () => (",
      '  <div data-orphan="x" data-styled data-held-read="1" data-selected data-asserted data-variant data-dataset-read data-theme-grain="on" data-base-ui-x data-snapped data-driven className="data-variant:flex" />',
      ");",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the case is planted template source the pass reads.
      "export const read = (el: El): unknown => [el.getAttribute(READ), el.querySelector(`[${SELECTED}]`), el.dataset.datasetRead];",
    ].join("\n"),
    "tests/a/marks.test.ts": [
      "declare const expectEl: { toHaveAttribute(name: string): void; setAttribute(name: string, value: string): void };",
      'expectEl.toHaveAttribute("data-asserted");',
      'expectEl.setAttribute("data-test-only", "");',
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
  expect(report.buckets["dom-attr-unread"]).toEqual([`data-asserted ${at} read by tests`, `data-orphan ${at}`, `data-snapped ${at} read by tooling`]);
  expect(names(report.buckets["dom-attr-owner-css-only"])).toEqual(["data-theme-grain"]);
});

test(
  "a plain test id no test lookup names is reported; one a test reaches through a table is read, a tooling lookup annotated",
  TIMEOUT,
  async ({ plantedTree }) => {
    const report = await dom(plantedTree, {
      [`${GRAPH_SOURCE}/ids.ts`]: 'export const IDS = { found: "found" };',
      [`${GRAPH_SOURCE}/rows.tsx`]:
        'export const Rows = () => [<div data-testid="lonely" />, <div data-testid="found" />, <div data-testid="selected" />, <div data-testid="snapped" />, <div data-testid="driven" />];',
      "tests/a/rows.test.ts": [
        'import { IDS } from "../../packages/a/src/ids.ts";',
        "declare const page: { getByTestId(id: string): unknown; locator(selector: string): unknown };",
        "page.getByTestId(IDS.found);",
        "page.locator('[data-testid=\"selected\"]');",
      ].join("\n"),
      "tooling/src/snap/ids.ts": ["declare const page: { getByTestId(id: string): unknown };", 'page.getByTestId("driven");'].join("\n"),
      "tooling/src/snap.ts": ["declare const page: { getByTestId(id: string): unknown };", 'page.getByTestId("snapped");'].join("\n"),
    });
    const at = `${GRAPH_SOURCE}/rows.tsx:1`;
    expect(report.buckets["dom-value-unread"]).toEqual([`data-testid=lonely ${at}`, `data-testid=snapped ${at} read by tooling`]);
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
      "tests/a/set.test.ts": ["declare const el: { setAttribute(name: string, value: string): void };", 'el.setAttribute("data-test-set", "");'].join("\n"),
      "tooling/src/named.ts": 'export const NAMED = ["data-tooling-named"];',
    });
    expect(report.buckets["css-attr-unwritten"]).toEqual([`${SHEET}:[data-dead]`, `${SHEET}:[data-tooling-named]`]);
    expect(report.unresolved).toEqual([
      { text: "data-stray", at: `${GRAPH_SOURCE}/stray.ts:2`, world: "product", why: "held by stray, which no attribute site reads" },
      { text: "name", at: `${GRAPH_SOURCE}/stray.ts:4`, world: "product", why: "an attribute write whose name no hop resolves" },
      { text: "data-tooling-named", at: "tooling/src/named.ts:1", world: "tooling", why: "an element of a list no attribute site reads" },
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
  expect(report.unresolved).toEqual([]);
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
  expect(report.unresolved).toEqual([]);
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
    "tooling/src/eslint/ui-classes/source.ts": "export interface Elem {\n  readonly attrs: ReadonlyMap<string, unknown>;\n}",
    "tooling/src/ui-facts/cohorts.ts": [
      'import type { Elem } from "../eslint/ui-classes/source.ts";',
      'export const shell = (elem: Elem): boolean => elem.attrs.has("data-facts-model");',
    ].join("\n"),
    [`${GRAPH_SOURCE}/models.tsx`]: [
      "const bag: { readonly attributes: Readonly<Record<string, string>> } = { attributes: {} };",
      'export const other = bag.attributes["data-not-model"];',
      "export const Models = () => <div data-snap-model data-facts-model data-not-model />;",
    ].join("\n"),
  });
  expect(report.buckets["dom-attr-unread"]).toEqual([`data-facts-model ${GRAPH_SOURCE}/models.tsx:3 read by tooling`]);
  expect(report.unresolved).toEqual([
    { text: "data-not-model", at: `${GRAPH_SOURCE}/models.tsx:2`, world: "product", why: "a string no attribute site reaches" },
  ]);
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
  expect(report.unresolved).toEqual([]);
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
  expect(report.unresolved).toEqual([]);
  expect(names(report.buckets["dom-attr-unread"])).toEqual(["data-obs-lost"]);
});

test("an observer's attributeFilter and a record's attributeName compare read the names they hold", TIMEOUT, async ({ plantedTree }) => {
  const report = await dom(plantedTree, {
    [`${GRAPH_SOURCE}/watch.tsx`]: [
      "interface Options {",
      "  readonly attributes: boolean;",
      "  readonly attributeFilter: readonly string[];",
      "}",
      "interface Mutation {",
      "  readonly attributeName: string | null;",
      "}",
      'const MOVING: readonly string[] = ["data-watch-moving"];',
      'export const options = (): Options => { const attributeFilter = [...MOVING, "style"]; return { attributes: true, attributeFilter }; };',
      'export const literal: Options = { attributes: true, attributeFilter: ["data-watch-literal"] };',
      'export const flipped = (record: Mutation): boolean => record.attributeName === "data-watch-compared";',
      "export const Watched = () => <div data-watch-moving data-watch-literal data-watch-compared data-watch-none />;",
    ].join("\n"),
  });
  expect(names(report.buckets["dom-attr-unread"])).toEqual(["data-watch-none"]);
  expect(report.unresolved).toEqual([]);
});

test("a callback a browser driver runs in the page holds the argument the driver hands it", TIMEOUT, async ({ plantedTree }) => {
  const report = await dom(plantedTree, {
    [`${GRAPH_SOURCE}/marked.tsx`]: "export const Marked = () => <div data-page-mark data-element-mark />;",
    "tests/a/driver.ts": [
      'import type { El } from "../../packages/a/src/el.ts";',
      "interface Page {",
      "  evaluate<A>(fn: (arg: A) => unknown, arg: A): Promise<unknown>;",
      "}",
      "interface Locator {",
      "  evaluate<A>(fn: (element: El, arg: A) => unknown, arg: A): Promise<unknown>;",
      "}",
      'const PAGE_MARK = "data-page-mark";',
      'const ELEMENT_MARK = "data-element-mark";',
      "export async function marks(page: Page, locator: Locator, root: El): Promise<void> {",
      "  await page.evaluate((key) => root.getAttribute(key), PAGE_MARK);",
      "  await locator.evaluate((element, attribute) => element.removeAttribute(attribute), ELEMENT_MARK);",
      "}",
    ].join("\n"),
  });
  expect(report.buckets["dom-attr-unread"]).toEqual([
    `data-element-mark ${GRAPH_SOURCE}/marked.tsx:1 read by tests`,
    `data-page-mark ${GRAPH_SOURCE}/marked.tsx:1 read by tests`,
  ]);
  expect(report.unresolved).toEqual([]);
});
