import { expect, test } from "@orb/testkit/tooling";
import type { CensusClass, CensusSource, TestEvidence } from "../../../tooling/src/label-census/index.ts";
import { authoredStrings, classifySite, inFeature, nameSites, productionIndex } from "../../../tooling/src/label-census/index.ts";

// The production row renders a template; its placeholder is split so this file holds no template syntax in a string.
const REACHED_TEMPLATE = ["{`Reached $", "{count} of the limit`}"].join("");
// A template placeholder for `name`, spelled in pieces for the same reason.
const hole = (name: string): string => ["$", "{", name, "}"].join("");

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

const HELPERS: CensusSource = {
  path: "tests/client/features/chat/_row-helpers.ts",
  text: "export function clickNamed(page, text) { return page.getByText(text).click(); }",
};

const HELPER_SPEC: CensusSource = {
  path: "tests/client/features/chat/row-helpers.ct.tsx",
  text: [
    'import { clickNamed } from "./_row-helpers.ts";',
    "const press = async (page, label) => { await page.getByRole('button', { name: label }).click(); };",
    "const twice = (page, label) => press(page, label);",
    "await press(page, 'Create schedule');",
    "await twice(page, 'Save schedule');",
    "await clickNamed(page, 'Imported label');",
    "await press(page, OPTIONS[0]);",
  ].join("\n"),
};

test("a literal handed to a helper whose parameter reaches a name position counts at the call", () => {
  const sites = nameSites(HELPER_SPEC, (path) => (path === HELPERS.path ? HELPERS : undefined));
  expect(sites.map((site) => `${String(site.line)} ${site.text}`)).toEqual(["4 'Create schedule'", "5 'Save schedule'", "6 'Imported label'"]);
});

const HOMES: CensusSource[] = [
  { path: "packages/client/src/features/character/components/list.tsx", text: "export const L = () => <button>Load more</button>;" },
  { path: "packages/client/src/features/notifications/components/inbox.tsx", text: "export const I = () => <button>Load more</button>;" },
  { path: "packages/client/src/features/databank/components/bank.tsx", text: "export const B = () => <button>Load more</button>;" },
  {
    path: "packages/client/src/features/roster-preset/components/picker.tsx",
    text: `export const P = ({ n }) => <b aria-label={\`Add ${hole("n")} to this chat\`} />;`,
  },
  { path: "packages/client/src/features/chat/components/docs.tsx", text: `export const D = ({ d }) => <b aria-label={\`Feed ${hole("d")} to this chat\`} />;` },
  { path: "packages/client/src/components/form-dialog-names.ts", text: 'export const CREATE_TITLE = "Create a schedule";' },
];

function rowOf(source: CensusSource, evidence: TestEvidence): [string, CensusClass, string][] {
  const index = productionIndex(HOMES);
  return nameSites(source).map((site) => {
    const row = classifySite(site, index, evidence);
    return [site.text, row.class, row.feature];
  });
}

test("a text several features spell is filed under the spec's own feature, then a feature it imports", () => {
  const evidence: TestEvidence = { authored: new Set(), features: new Map([["tests/client/components/bank.ct.tsx", ["databank"]]]) };
  const mirrored = { path: "tests/client/features/notifications/inbox.ct.tsx", text: 'await page.getByText("Load more").click();' };
  const imports = { path: "tests/client/components/bank.ct.tsx", text: 'await page.getByText("Load more").click();' };
  const neither = { path: "tests/client/components/other.ct.tsx", text: 'await page.getByText("Load more").click();' };
  expect([...rowOf(mirrored, evidence), ...rowOf(imports, evidence), ...rowOf(neither, evidence)]).toEqual([
    ['"Load more"', "inline", "client/src/features/notifications"],
    ['"Load more"', "inline", "client/src/features/databank"],
    ['"Load more"', "inline", "client/src/features/character"],
  ]);
});

test("a template's short fixed word finds the file whose fragment spells it with its spaces", () => {
  const spec = {
    path: "tests/client/features/roster-preset/row.ct.tsx",
    text: `await page.getByRole('button', { name: \`Add ${hole("ROSTER_NAME")} to this chat\` }).click();`,
  };
  const index = productionIndex(HOMES);
  const [site] = nameSites(spec);
  expect(site === undefined ? undefined : classifySite(site, index, { authored: new Set() }).homes).toEqual([
    "packages/client/src/features/roster-preset/components/picker.tsx",
  ]);
});

test("a string the spec's own mounted story authors is the story's, ahead of a production export", () => {
  const spec = {
    path: "tests/client/components/form-dialog.ct.tsx",
    text: 'await expect(page.getByRole("dialog", { name: "Create a schedule" })).toBeVisible();',
  };
  const mounted = new Map([[spec.path, new Set(["Create a schedule"])]]);
  expect(rowOf(spec, { authored: new Set(), mounted })).toEqual([['"Create a schedule"', "authored", "client/components"]]);
  expect(rowOf(spec, { authored: new Set() })).toEqual([['"Create a schedule"', "exported", "client/src/components"]]);
});

test("the feature filter keeps the production owner's rows and names the test directory for the rest", () => {
  const index = productionIndex(PRODUCTION);
  const rows = nameSites(SPEC).map((site) => classifySite(site, index, { authored: authoredStrings([STORY]) }));
  expect(inFeature(rows, "client/src/features/chat").map((row) => row.text)).toEqual(['"Pinned row"', 'new RegExp(`^Reached \\\\d+ of the limit$`, "u")']);
  expect(inFeature(rows, "client/features/chat").map((row) => row.class)).toEqual(["authored", "unresolved", "non-word", "non-word", "guest"]);
});
