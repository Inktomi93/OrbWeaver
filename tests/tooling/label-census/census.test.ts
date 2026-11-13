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

test("the feature filter keeps the production owner's rows and names the test directory for the rest", () => {
  const index = productionIndex(PRODUCTION);
  const rows = nameSites(SPEC).map((site) => classifySite(site, index, { authored: authoredStrings([STORY]) }));
  expect(inFeature(rows, "client/src/features/chat").map((row) => row.text)).toEqual(['"Pinned row"', 'new RegExp(`^Reached \\\\d+ of the limit$`, "u")']);
  expect(inFeature(rows, "client/features/chat").map((row) => row.class)).toEqual(["authored", "unresolved", "non-word", "non-word", "guest"]);
});
