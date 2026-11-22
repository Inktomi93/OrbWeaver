// The DOM-hook pass (tooling/src/unwired/graph/dom.ts header): a sheet selector nothing writes, a data-* attribute
// nothing reads and a test id no lookup names are reported; a name held in a constant, a table, a list or a parameter is
// followed through the checker to the attribute site it reaches; sealed, dependency-spelled and owner-published names are
// not dead; a whole data-* string no site reaches is listed as unresolved and keeps its name out of every bucket.
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
        [WORLD]: plantedTsconfig({ lib: LIB, include: ["../*/src", "../../tests"], jsx: "preserve" }),
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

test("a written data-* attribute no sheet, selector, getter, dataset, variant or test reads is reported", TIMEOUT, async ({ plantedTree }) => {
  const report = await dom(plantedTree, {
    [SHEET]: "[data-styled] { color: red; }",
    [OWNER_CSS]: owner(['export const OWNER_CSS_APPEARANCE_ATTRIBUTES = [{ "name": "data-theme-grain", "values": ["on"] }] as const;']),
    [`${GRAPH_SOURCE}/marks.tsx`]: [
      'import type { El } from "./el.ts";',
      'const READ = "data-held-read";',
      'const SELECTED = "data-selected";',
      "export const Marks = () => (",
      '  <div data-orphan="x" data-styled data-held-read="1" data-selected data-asserted data-variant data-dataset-read data-theme-grain="on" data-base-ui-x className="data-variant:flex" />',
      ");",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the case is planted template source the pass reads.
      "export const read = (el: El): unknown => [el.getAttribute(READ), el.querySelector(`[${SELECTED}]`), el.dataset.datasetRead];",
    ].join("\n"),
    "tests/a/marks.test.ts": [
      "declare const expectEl: { toHaveAttribute(name: string): void; setAttribute(name: string, value: string): void };",
      'expectEl.toHaveAttribute("data-asserted");',
      'expectEl.setAttribute("data-test-only", "");',
    ].join("\n"),
  });
  expect(names(report.buckets["dom-attr-unread"])).toEqual(["data-orphan"]);
  expect(report.buckets["dom-attr-unread"][0]).toMatch(new RegExp(`^data-orphan ${GRAPH_SOURCE}/marks\\.tsx:5$`, "u"));
  expect(names(report.buckets["dom-attr-owner-css-only"])).toEqual(["data-theme-grain"]);
});

test("a plain test id no lookup names is reported; one a lookup reaches through a table is read", TIMEOUT, async ({ plantedTree }) => {
  const report = await dom(plantedTree, {
    [`${GRAPH_SOURCE}/ids.ts`]: 'export const IDS = { found: "found" };',
    [`${GRAPH_SOURCE}/rows.tsx`]: 'export const Rows = () => [<div data-testid="lonely" />, <div data-testid="found" />, <div data-testid="selected" />];',
    "tests/a/rows.test.ts": [
      'import { IDS } from "../../packages/a/src/ids.ts";',
      "declare const page: { getByTestId(id: string): unknown; locator(selector: string): unknown };",
      "page.getByTestId(IDS.found);",
      "page.locator('[data-testid=\"selected\"]');",
    ].join("\n"),
  });
  expect(names(report.buckets["dom-value-unread"])).toEqual(["data-testid=lonely"]);
});

test("a whole data-* string no site reaches and a site whose name no hop resolves are listed, never bucketed", TIMEOUT, async ({ plantedTree }) => {
  const report = await dom(plantedTree, {
    [SHEET]: "[data-stray] { color: red; } [data-dead] { color: red; }",
    [`${GRAPH_SOURCE}/stray.ts`]: [
      'import type { El } from "./el.ts";',
      'export const NAMES = { stray: "data-stray" };',
      "export function wide(el: El, name: string): void {",
      '  el.setAttribute(name, "");',
      "}",
    ].join("\n"),
  });
  expect(report.buckets["css-attr-unwritten"]).toEqual([`${SHEET}:[data-dead]`]);
  expect(report.unresolved).toEqual([
    { text: "data-stray", at: `${GRAPH_SOURCE}/stray.ts:2`, why: "held by stray, which no attribute site reads" },
    { text: "name", at: `${GRAPH_SOURCE}/stray.ts:4`, why: "an attribute write whose name no hop resolves" },
  ]);
});
