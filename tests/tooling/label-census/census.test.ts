import { expect, test } from "@orb/testkit/tooling";
import type { CensusClass, CensusSource } from "../../../tooling/src/label-census/index.ts";
import { authoredStrings, classifySite, inFeature, nameSites, productionIndex } from "../../../tooling/src/label-census/index.ts";

// The production row renders a template; its placeholder is split so this file holds no template syntax in a string.
const REACHED_TEMPLATE = ["{`Reached $", "{count} of the limit`}"].join("");

const PRODUCTION: CensusSource[] = [
  { path: "packages/client/src/lib/dialog-verbs.ts", text: 'export const DIALOG_VERBS = { cancel: "Cancel", remove: "Remove" } as const;' },
  {
    path: "packages/client/src/features/chat/components/row.tsx",
    text: `export const Row = ({ count }) => <div><button aria-label="Remove">x</button><span>Pinned row</span><p>${REACHED_TEMPLATE}</p></div>;`,
  },
  { path: "packages/ui/src/primitives/field/field-names.ts", text: 'export const FIELD_HINT_NAME = "Field hint";' },
  { path: "packages/showcase-plugins/src/frame.ts", text: 'const html = "<button>Guest only</button>";' },
];

const STORY: CensusSource = {
  path: "tests/client/features/chat/_row-stories.tsx",
  text: 'export const Story = () => <Row title="Pinned row" note="Story note" />;',
};

const SPEC: CensusSource = {
  path: "tests/client/features/chat/row.ct.tsx",
  text: [
    'await page.getByRole("button", { name: "Cancel", exact: true }).click();',
    'await page.getByRole("button", { name: "Remove" }).click();',
    'await expect(page.getByText("Pinned row")).toBeVisible();',
    'await expect(row).toHaveText(new RegExp(`^Reached \\\\d+ of the limit$`, "u"));',
    'await page.getByRole("button", isMobile ? { name: "Story note" } : { name: "Nowhere at all" }).click();',
    'await expect(cell).toHaveText(["1", value ?? ""]);',
    'await page.getByRole("button", { name: DIALOG_VERBS.cancel }).click();',
    'await page.getByRole("textbox", { name: "Guest only" }).fill("typed into the field");',
  ].join("\n"),
};

const UI_SPEC: CensusSource = {
  path: "tests/ui/primitives/field/hint.ct.tsx",
  text: 'await page.getByLabel("Cancel").focus(); await page.getByLabel("Field hint").focus();',
};

function classes(source: CensusSource): [string, CensusClass][] {
  const index = productionIndex(PRODUCTION);
  const evidence = { authored: authoredStrings([STORY]) };
  return nameSites(source).map((site) => [site.text, classifySite(site, index, evidence).class]);
}

test("each name site gets the class its production home implies", () => {
  expect(classes(SPEC)).toEqual([
    ['"Cancel"', "exported"],
    ['"Remove"', "exported-also-inline"],
    ['"Pinned row"', "inline-also-authored"],
    ['new RegExp(`^Reached \\\\d+ of the limit$`, "u")', "inline-template"],
    ['"Story note"', "authored"],
    ['"Nowhere at all"', "unresolved"],
    ['"1"', "non-word"],
    ['""', "non-word"],
    ['"Guest only"', "guest"],
  ]);
});

test("a ui spec cannot reach a client export, and reaches its own package's", () => {
  expect(classes(UI_SPEC)).toEqual([
    ['"Cancel"', "export-out-of-reach"],
    ['"Field hint"', "exported"],
  ]);
});

const NAMES_HELPER: CensusSource = {
  path: "tests/client/features/chat/_row-names.ts",
  text: 'export const SHARED_ROW_NAME = "Pinned row"; export const UNUSED_NAME = "Never located";',
};

const CONSTANT_SPEC: CensusSource = {
  path: "tests/client/features/chat/row-constants.ct.tsx",
  text: [
    'import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";',
    'import { SHARED_ROW_NAME } from "./_row-names.ts";',
    'const LOCAL = "Nowhere at all";',
    'const NAMES = { remove: "Remove", unused: "Story note" } as const;',
    'const ORDER = ["Cancel", "Guest only"];',
    "for (const label of ORDER) { await page.getByRole('button', { name: label }).click(); }",
    "await page.getByRole('button', { name: LOCAL }).click();",
    "await page.getByRole('button', { name: LOCAL, exact: true }).focus();",
    "await page.getByRole('button', { name: NAMES.remove }).click();",
    "await page.getByText(SHARED_ROW_NAME).click();",
    "await page.getByRole('button', { name: DIALOG_VERBS.cancel }).click();",
    "await expect(row).toHaveAccessibleDescription('Story note');",
    "await expect(row).toHaveAttribute('aria-label', 'Pinned row');",
    "await expect(row).toHaveAttribute('data-slot', 'row-body');",
    "await select.selectOption({ label: 'Remove' });",
  ].join("\n"),
};

test("a spec's own constants, a relatively imported one and the attribute and description assertions count where the text is written", () => {
  const read = (path: string): CensusSource | undefined => (path === NAMES_HELPER.path ? NAMES_HELPER : undefined);
  const sites = nameSites(CONSTANT_SPEC, read).map((site) => `${site.file.split("/").at(-1) ?? ""}:${String(site.line)} ${site.text}`);
  expect(sites).toEqual([
    'row-constants.ct.tsx:5 "Cancel"',
    'row-constants.ct.tsx:5 "Guest only"',
    'row-constants.ct.tsx:3 "Nowhere at all"',
    'row-constants.ct.tsx:4 "Remove"',
    '_row-names.ts:1 "Pinned row"',
    "row-constants.ct.tsx:12 'Story note'",
    "row-constants.ct.tsx:13 'Pinned row'",
    "row-constants.ct.tsx:15 'Remove'",
  ]);
});

const KIT_ENTRY: CensusSource = {
  path: "tests/support/node/ct.ts",
  text: 'export * from "./labels.ts"; export { RENAMED_ROW as KIT_ROW_NAME } from "./rows.ts";',
};
const KIT_LABELS: CensusSource = { path: "tests/support/node/labels.ts", text: 'export const KIT_REGION_NAME = "Alerts";' };
const KIT_ROWS: CensusSource = { path: "tests/support/node/rows.ts", text: 'export const RENAMED_ROW = "Pinned row";' };

const KIT_SPEC: CensusSource = {
  path: "tests/client/features/chat/row-kit.ct.tsx",
  text: [
    'import { KIT_REGION_NAME, KIT_ROW_NAME } from "@orb/testkit/ct";',
    "await page.getByRole('region', { name: KIT_REGION_NAME }).click();",
    "await page.getByText(KIT_ROW_NAME).click();",
  ].join("\n"),
};

test("a constant imported through a testkit alias is followed through the entry's re-exports to where it is written", () => {
  const kit = new Map([KIT_ENTRY, KIT_LABELS, KIT_ROWS].map((source) => [source.path, source]));
  const sites = nameSites(KIT_SPEC, (path) => kit.get(path), new Map([["@orb/testkit/ct", KIT_ENTRY.path]]));
  expect(sites.map((site) => `${site.file}:${String(site.line)} ${site.text}`)).toEqual([
    'tests/support/node/labels.ts:1 "Alerts"',
    'tests/support/node/rows.ts:1 "Pinned row"',
  ]);
});

test("the feature filter keeps the production owner's rows and names the test directory for the rest", () => {
  const index = productionIndex(PRODUCTION);
  const rows = nameSites(SPEC).map((site) => classifySite(site, index, { authored: authoredStrings([STORY]) }));
  expect(inFeature(rows, "client/src/features/chat").map((row) => row.text)).toEqual(['"Pinned row"', 'new RegExp(`^Reached \\\\d+ of the limit$`, "u")']);
  expect(inFeature(rows, "client/features/chat").map((row) => row.class)).toEqual(["authored", "unresolved", "non-word", "non-word", "guest"]);
});
