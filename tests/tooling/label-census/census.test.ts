import { expect, test } from "@orb/testkit/tooling";
import type { CensusClass, CensusSource, TestEvidence } from "../../../tooling/src/label-census/index.ts";
import {
  authoredStrings,
  classifySite,
  formatJudgements,
  formatSiteJudgements,
  inFeature,
  judgeOracles,
  judgeSites,
  nameSites,
  oracleCalls,
  productionIndex,
} from "../../../tooling/src/label-census/index.ts";

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

test("the done line counts exactly the home classes: a site of each prints, and a site of every other class does not", () => {
  const index = productionIndex([
    ...PRODUCTION,
    { path: "packages/client/src/features/chat/components/badge.tsx", text: "export const Badge = () => <span>Inline only</span>;" },
  ]);
  const evidence = { authored: authoredStrings([STORY]) };
  const inline: CensusSource = { path: SPEC.path, text: 'await page.getByText("Inline only").click();' };
  const rows = [SPEC, UI_SPEC, inline].flatMap((source) => nameSites(source).map((site) => classifySite(site, index, evidence)));
  const printed = formatSiteJudgements(rows, [])
    .split("\n")
    .flatMap((line) => / (\S+) in "/u.exec(line)?.[1] ?? []);
  // Every class the fixture holds, counted or not, so a dropped or an added home class changes the printed set.
  expect([...new Set(rows.map((row) => row.class))].sort()).toEqual([
    "authored",
    "export-out-of-reach",
    "exported",
    "exported-also-inline",
    "guest",
    "inline",
    "inline-also-authored",
    "inline-template",
    "non-word",
    "unresolved",
  ]);
  expect([...new Set(printed)].sort()).toEqual([
    "export-out-of-reach",
    "exported",
    "exported-also-inline",
    "inline",
    "inline-also-authored",
    "inline-template",
  ]);
});

test("a ui spec cannot reach a client export, and reaches its own package's", () => {
  expect(classes(UI_SPEC)).toEqual([
    ['"Cancel"', "export-out-of-reach"],
    ['"Field hint"', "exported"],
  ]);
});

test("a literal a production template composes is filed under that template, and only a whole fit counts", () => {
  const index = productionIndex([
    { path: "packages/client/src/components/back-link.tsx", text: `const back = \`Back to ${hole("label")}\`; const pair = \`${hole("a")}: ${hole("b")}\`;` },
  ]);
  const spec: CensusSource = {
    path: "tests/client/app-shell/back.ct.tsx",
    text: [
      'await page.getByRole("link", { name: "Back to Chats" }).click();',
      'await page.getByText("Back to").click();',
      'await page.getByText("Go Back to Chats").click();',
      'await page.getByText("Back to Notes").click();',
      'await page.getByText("Model: Local").click();',
    ].join("\n"),
  };
  const rows = nameSites(spec).map((site) => classifySite(site, index, { authored: new Set(["Back to Notes"]) }));
  expect(rows.map((row) => [row.text, row.class, row.homes])).toEqual([
    ['"Back to Chats"', "composed", ["packages/client/src/components/back-link.tsx"]],
    ['"Back to"', "unresolved", []],
    ['"Go Back to Chats"', "unresolved", []],
    ['"Back to Notes"', "authored", []],
    ['"Model: Local"', "unresolved", []],
  ]);
});

test("only an untagged renderer template with enough fixed text composes a name", () => {
  const index = productionIndex([
    { path: "packages/server/src/debug/report.ts", text: `const line = \`${hole("source")} from the ${hole("caller")}\`;` },
    { path: "packages/client/src/data/query.ts", text: `const q = sql\`Remove ${hole("id")} rows\`;` },
    { path: "packages/client/src/features/preset/readout.tsx", text: `const refs = \`${hole("count")} ref${hole("plural")}\`;` },
    { path: "packages/ui/src/primitives/chip/chip.tsx", text: `const name = \`Remove ${hole("label")}\`;` },
  ]);
  const spec: CensusSource = {
    path: "tests/client/features/preset/readout.ct.tsx",
    text: [
      'await page.getByText("Context from the caller").click();',
      'await page.getByText("Remove all rows").click();',
      'await page.getByText("the complete reference archive").click();',
      'await page.getByRole("button", { name: "Remove Beta" }).click();',
    ].join("\n"),
  };
  const rows = nameSites(spec).map((site) => classifySite(site, index, { authored: new Set() }));
  expect(rows.map((row) => [row.text, row.class, row.homes])).toEqual([
    ['"Context from the caller"', "unresolved", []],
    ['"Remove all rows"', "composed", ["packages/ui/src/primitives/chip/chip.tsx"]],
    ['"the complete reference archive"', "unresolved", []],
    ['"Remove Beta"', "composed", ["packages/ui/src/primitives/chip/chip.tsx"]],
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

// One line per position the census header claims, each with the names the census must read there. A line whose list is
// empty is a control: its text is no name, or its name is a binding.
const POSITIONS: [string, string[]][] = [
  ['page.getByText("By text");', ['"By text"']],
  ['page.getByLabel("By label");', ['"By label"']],
  ['page.getByPlaceholder("By placeholder");', ['"By placeholder"']],
  ['page.getByTitle("By title");', ['"By title"']],
  ['page.getByAltText("By alt");', ['"By alt"']],
  ['expect(row).toHaveText("Has text");', ['"Has text"']],
  ['expect(row).toContainText("Contains text");', ['"Contains text"']],
  ['expect(row).toHaveAccessibleName("Accessible name");', ['"Accessible name"']],
  ['expect(row).toHaveAccessibleDescription("Accessible description");', ['"Accessible description"']],
  ['expect(page).toHaveTitle("Page title");', ['"Page title"']],
  ['page.getByRole("button", { name: "Role name" });', ['"Role name"']],
  ['row.filter({ hasText: "Filter text" });', ['"Filter text"']],
  ['row.locator("li", { hasNotText: "Not this text" });', ['"Not this text"']],
  ['page.getByTestId("row-id");', []],
  ['select.selectOption({ label: "Option label" });', ['"Option label"']],
  ['expect(row).toHaveAttribute("aria-label", "Aria label");', ['"Aria label"']],
  ['expect(row).toHaveAttribute("aria-description", "Aria description");', ['"Aria description"']],
  ['expect(row).toHaveAttribute("title", "Title attribute");', ['"Title attribute"']],
  ['expect(row).toHaveAttribute("placeholder", "Placeholder attribute");', ['"Placeholder attribute"']],
  ['expect(row).toHaveAttribute("alt", "Alt attribute");', ['"Alt attribute"']],
  ['expect(row).toHaveAttribute("data-slot", "row-body");', []],
  [`page.getByText(\`Template ${hole("n")} text\`);`, [`\`Template ${hole("n")} text\``]],
  ["page.getByText(/Regex text/u);", ["/Regex text/u"]],
  ['page.getByText("Joined " + count);', ['"Joined " + count']],
  ['page.getByText(new RegExp("Built regex"));', ['new RegExp("Built regex")']],
  ['page.getByText(open ? "Open arm" : "Closed arm");', ['"Open arm"', '"Closed arm"']],
  ['page.getByText(given ?? "Fallback arm");', ['"Fallback arm"']],
  ['expect(await row.textContent()).toBe("Read by toBe");', ['"Read by toBe"']],
  ['expect(await row.innerText()).toEqual("Read by toEqual");', ['"Read by toEqual"']],
  ['expect(await row.allTextContents()).toStrictEqual(["All contents"]);', ['"All contents"']],
  ['expect(await row.allInnerTexts()).toContain("All inner");', ['"All inner"']],
  ["expect(node.textContent).toMatch(/Dom property/u);", ["/Dom property/u"]],
  ['expect(await row.getAttribute("title")).toBe("Read title");', ['"Read title"']],
  ['expect((await row.textContent())?.trim()).toBe("Trimmed read");', ['"Trimmed read"']],
  ['expect.soft(await row.textContent()).toBe("Soft read");', ['"Soft read"']],
  ['await expect.poll(() => row.textContent()).toBe("Polled read");', ['"Polled read"']],
  ['expect((await row.textContent())?.trimStart()).toBe("Start trimmed");', ['"Start trimmed"']],
  ['expect((await row.textContent())?.trimEnd()).toBe("End trimmed");', ['"End trimmed"']],
  ['expect((await row.textContent())?.toLowerCase()).toBe("lower read");', ['"lower read"']],
  ['expect((await row.textContent())?.toUpperCase()).toBe("UPPER READ");', ['"UPPER READ"']],
  ['expect(await row.textContent()).not.toBe("Negated read");', ['"Negated read"']],
  ['await expect(row.textContent()).resolves.toBe("Resolved read");', ['"Resolved read"']],
  ['expect(await row.getAttribute("data-slot")).toBe("row-body");', []],
  ['expect(total).toBe("Not a text read");', []],
  ['if ((await row.textContent()) === "Strict equal") {}', ['"Strict equal"']],
  ['if ("Strict unequal" !== node.innerText) {}', ['"Strict unequal"']],
  ['if ((await row.textContent()) == "Loose equal") {}', ['"Loose equal"']],
  ['if ((await row.textContent()) != "Loose unequal") {}', ['"Loose unequal"']],
  ['page.locator("text=Engine text");', ["Engine text"]],
  ['page.locator("li >> text=\\"Quoted engine\\"");', ["Quoted engine"]],
  ['page.locator("text=/engine regex/");', []],
  ["page.locator('li:has-text(\"Has text pseudo\")');", ["Has text pseudo"]],
  ["page.waitForSelector('li:text(\"Text pseudo\")');", ["Text pseudo"]],
  ["page.$('li:text-is(\"Text is pseudo\")');", ["Text is pseudo"]],
  ["page.$$('[aria-label=\"Selector aria\"]');", ["Selector aria"]],
  ["page.$eval('[aria-description=\"Selector description\"]', read);", ["Selector description"]],
  ["page.$$eval('[title=\"Selector title\"]', read);", ["Selector title"]],
  ["document.querySelector('[placeholder=\"Selector placeholder\"]');", ["Selector placeholder"]],
  ["document.querySelectorAll('[alt=\"Selector alt\"]');", ["Selector alt"]],
  ["node.closest('[aria-label*=\"Selector part\" i]');", ["Selector part"]],
  ["node.matches('[aria-label^=\"Selector start\"]');", ["Selector start"]],
  [`page.locator(\`[aria-label="${hole("NAME")}"]\`);`, []],
  ['page.locator("[data-slot=\\"row\\"]");', []],
  ['expect(row).toMatchAriaSnapshot("- button \\"Snapshot name\\"\\n- paragraph: Snapshot text");', ["Snapshot name", "Snapshot text"]],
];

test("every position the header claims is read, and its controls are not", () => {
  const spec = { path: "tests/client/features/chat/positions.ct.tsx", text: POSITIONS.map(([code]) => code).join("\n") };
  const read = nameSites(spec).map((site) => [site.line, site.value ?? site.text] as const);
  const expected = POSITIONS.flatMap(([, names], line) => names.map((name) => [line + 1, name] as const));
  expect(read).toEqual(expected);
});

const SELECTOR_CONSTANT_SPEC: CensusSource = {
  path: "tests/e2e/support/room.ts",
  text: [
    "const CHARACTER_BAR = '[aria-label=\"Characters\"]';",
    'const FRAME = "Frame title";',
    'import { BUG_REPORT_NAME } from "#client/features/app-shell/lib/app-shell-names.ts";',
    "export const bar = (page) => page.locator(CHARACTER_BAR);",
    `export const frame = (page) => page.locator(\`iframe[title="${hole("FRAME")}"]\`);`,
    `export const opened = (page) => page.locator(\`[aria-label="Open ${hole("FRAME")}"]\`);`,
    `export const bug = (page) => page.locator(\`[aria-label="${hole("BUG_REPORT_NAME")}"]\`);`,
    'const SIDE = open ? "Left" : "Right";',
    `export const side = (page) => page.locator(\`[title="${hole("SIDE")}"]\`);`,
    "const ROSTER = '[aria-label=\"Roster\"]';",
    "const CHIP = '[data-slot=\"chip\"]';",
    `export const chips = (page) => page.locator(\`${hole("ROSTER")}:not([aria-hidden="true"]) ${hole("CHIP")}\`);`,
    "const SOLO = '[title=\"Solo\"]';",
    `export const solo = (page) => page.locator(\`${hole("SOLO")} .chip\`);`,
  ].join("\n"),
};

test("a selector's names count where their text is written: a selector constant, bare or composed, a whole literal placeholder, a part-literal string", () => {
  expect(nameSites(SELECTOR_CONSTANT_SPEC).map((site) => `${String(site.line)} ${site.value ?? site.text}`)).toEqual([
    "1 Characters",
    '2 "Frame title"',
    "6 Open Frame title",
    "10 Roster",
    "13 Solo",
  ]);
});

test("a template whose every fixed word the mounted story writes is the story's", () => {
  const spec = {
    path: "tests/ui/primitives/switch/thumb-ceiling.ct.tsx",
    text: `await expect(page.getByRole("switch", { name: \`off on ${hole("host")}\` })).toBeVisible();`,
  };
  const index = productionIndex([{ path: "packages/client/src/features/credentials/row.tsx", text: `const name = \`Turn off on ${hole("host")}\`;` }]);
  const [site] = nameSites(spec);
  const classify = (mounted: ReadonlySet<string>): CensusClass | undefined =>
    site === undefined ? undefined : classifySite(site, index, { authored: new Set(), mounted: new Map([[spec.path, mounted]]) }).class;
  expect(classify(new Set(["off on"]))).toBe("authored");
  expect(classify(new Set())).toBe("inline-template");
});

const LABEL_FUNCTIONS: CensusSource = {
  path: "packages/client/src/features/chat/lib/chat-names.ts",
  text: [
    "export function starName(starred: boolean): string { return starred ? 'Unstar' : 'Star'; }",
    `export const pinName = (pinned: boolean): string => { let verb = 'Pin'; if (pinned) { verb = 'Unpin'; } return \`${hole("verb")} row\`; };`,
    `export function modeName(mode: string): string { let word = 'Other'; switch (mode) { case 'a': word = 'Alpha'; } return \`Mode ${hole("word")}\`; }`,
    `export const twiceName = (short: boolean): string => (short ? 'Short' : \`Long ${hole("x")}\`);`,
    "export function safeName(): string { try { return 'Ready'; } catch { return 'Failed'; } }",
    "export function wrapName(): string { const pick = (a: boolean) => { if (a) { return 'A'; } return 'B'; }; return 'Wrapped'; }",
    "function hiddenName(on: boolean): string { return on ? 'On' : 'Off'; }",
    `export const openName = (title: string): string => \`Open ${hole("title")}\`;`,
    "export const isOpen = (state: string): boolean => state === 'open' ? true : false;",
    `export const nowName = (): string => \`Now ${hole("STAMP")}\`;`,
    "export const fixedName = (title: string): string => 'Fixed';",
  ].join("\n"),
};

const ORACLE_SPEC: CensusSource = {
  path: "tests/client/features/chat/star.ct.tsx",
  text: [
    'import { starName, pinName, modeName, openName, isOpen } from "#client/features/chat/lib/chat-names.ts";',
    'import * as names from "#client/features/chat/lib/chat-names.ts";',
    "const expected = pinName(true);",
    "await expect(row).toHaveAccessibleName(starName(true));",
    "await expect(row).toHaveText(expected);",
    "await expect(row).toHaveAttribute('aria-label', names.modeName('a'));",
    "expect(await row.textContent()).toBe(names.twiceName(true));",
    "await expect(row).toHaveText(openName('Room'));",
    "await page.getByRole('button', { name: starName(false) }).click();",
    "expect(isOpen('open')).toBe(true);",
    'import { safeName } from "../../../../packages/client/src/features/chat/lib/chat-names.ts";',
    "if ((await row.textContent()) === safeName()) {}",
  ].join("\n"),
};

test("a label function whose name varies, called where an assertion reads a name, is an oracle candidate of its kind", () => {
  const index = productionIndex([LABEL_FUNCTIONS]);
  expect([...index.labelFunctions].map(([name, { kind }]) => `${name} ${kind}`).sort()).toEqual([
    "modeName branching",
    "openName template",
    "pinName branching",
    "safeName branching",
    "starName branching",
    "twiceName branching",
  ]);
  const rows = oracleCalls(ORACLE_SPEC, index, { authored: new Set() });
  expect(rows.map((row) => `${String(row.line)} ${row.function} ${row.kind} ${row.feature}`)).toEqual([
    "3 pinName branching client/src/features/chat",
    "4 starName branching client/src/features/chat",
    "6 modeName branching client/src/features/chat",
    "7 twiceName branching client/src/features/chat",
    "8 openName template client/src/features/chat",
    "12 safeName branching client/src/features/chat",
  ]);
});

// Minimal excerpts of two oracle defects as they stood before their fix: each label function's body, and the assertion
// that built its expected name with it inside a locator under `expect`.
const BELL_NAMES: CensusSource = {
  path: "packages/client/src/features/notifications/lib/notifications-copy.ts",
  text: `export function notificationsBellLabel(unreadCount: number, hasNextPage: boolean): string { return unreadCount === 0 ? NOTIFICATIONS_BELL_NAME : \`${hole("NOTIFICATIONS_BELL_NAME")} (${hole("String(unreadCount)")} unread)\`; }`,
};
const REFINERY_NAMES: CensusSource = {
  path: "packages/client/src/features/refinery/lib/refinery-names.ts",
  text: 'export function refineryTestOnCardLabel(running: boolean): string { return running ? "Running…" : REFINERY_TEST_ON_CARD_NAME; }',
};
const SUBJECT_SPEC: CensusSource = {
  path: "tests/client/features/notifications/notification-inbox.ct.tsx",
  text: [
    'import { notificationsBellLabel } from "#client/features/notifications/lib/notifications-copy.ts";',
    'import { refineryTestOnCardLabel } from "#client/features/refinery/lib/refinery-names.ts";',
    'await expect(page.getByRole("button", { name: notificationsBellLabel(unread, true), exact: true })).toBeVisible();',
    'await expect(page.getByRole("button", { name: refineryTestOnCardLabel(true), exact: true })).toBeDisabled();',
    'const busy = page.getByRole("button", { name: refineryTestOnCardLabel(false) });',
    "await expect(busy).toHaveCount(1);",
    'const idle = page.getByRole("button", { name: notificationsBellLabel(0, false) });',
    "await idle.click();",
  ].join("\n"),
};

test("a label function in a locator's name inside the expect subject, or in a locator constant the subject reads, is a candidate", () => {
  const rows = oracleCalls(SUBJECT_SPEC, productionIndex([BELL_NAMES, REFINERY_NAMES]), { authored: new Set() });
  expect(rows.map((row) => `${String(row.line)} ${row.function}`)).toEqual([
    "3 notificationsBellLabel",
    "4 refineryTestOnCardLabel",
    "5 refineryTestOnCardLabel",
  ]);
});

const JUDGED_SPEC: CensusSource = {
  path: "tests/client/features/chat/judged.ct.tsx",
  text: [
    'import { starName, pinName } from "#client/features/chat/lib/chat-names.ts";',
    'test("a starred row", async () => {',
    "  await expect(row).toHaveAccessibleName(starName(true));",
    "  await expect(row).toHaveAccessibleName(starName(false));",
    "});",
    'test("a pinned row", async () => { await expect(row).toHaveAccessibleName(pinName(true)); });',
    "function helper() { return expect(row).toHaveAccessibleName(pinName(false)); }",
    "await expect(row).toHaveAccessibleName(starName(true));",
  ].join("\n"),
};

test("a judgement covers its function's calls in its own case, a candidate no row covers prints unjudged, and a row no candidate matches is stale", () => {
  const rows = oracleCalls(JUDGED_SPEC, productionIndex([LABEL_FUNCTIONS]), { authored: new Set() });
  const judged = judgeOracles(rows, [
    { file: JUDGED_SPEC.path, scope: "a starred row", function: "starName", reason: "locates the row" },
    { file: JUDGED_SPEC.path, scope: "helper", function: "pinName", reason: "locates the pin" },
    { file: JUDGED_SPEC.path, scope: "a starred row", function: "pinName", reason: "matches no call" },
  ]);
  expect(judged.oracles.map((row) => `${String(row.line)} ${row.function} | ${row.scope} | ${row.judged ?? "unjudged"}`)).toEqual([
    "3 starName | a starred row | locates the row",
    "4 starName | a starred row | locates the row",
    "6 pinName | a pinned row | unjudged",
    "7 pinName | helper | locates the pin",
    "8 starName | (module) | unjudged",
  ]);
  expect(formatJudgements(judged.oracles, judged.stale).split("\n")).toEqual([
    "unjudged branching candidates: 2",
    `${JUDGED_SPEC.path}:6 pinName in "a pinned row"`,
    `${JUDGED_SPEC.path}:8 starName in "(module)"`,
    "judgements matching no candidate: 1",
    `${JUDGED_SPEC.path} pinName in "a starred row"`,
  ]);
});

const JUDGED_SITE_SPEC: CensusSource = {
  path: "tests/client/features/chat/judged-sites.ct.tsx",
  text: [
    'test("a slot id the story prints", async () => {',
    '  await expect(page.getByRole("status")).toHaveText("Cancel");',
    '  await expect(page.getByRole("log")).toHaveText("Cancel");',
    "});",
    'test("a rendered verb", async () => { await page.getByRole("button", { name: "Cancel" }).click(); });',
    'test("a story note", async () => { await page.getByText("Story note").click(); });',
  ].join("\n"),
};

test("a judgement moves its value's home-class sites in its own case to judged, a home-class site no row covers prints, and a row covering none is stale", () => {
  const index = productionIndex(PRODUCTION);
  const rows = nameSites(JUDGED_SITE_SPEC).map((site) => classifySite(site, index, { authored: authoredStrings([STORY]) }));
  const judged = judgeSites(rows, [
    { file: JUDGED_SITE_SPEC.path, scope: "a slot id the story prints", value: "Cancel", reason: "production-id", note: "the story prints the slot id" },
    { file: JUDGED_SITE_SPEC.path, scope: "a story note", value: "Story note", reason: "test-authored", note: "the story wrote it" },
  ]);
  expect(judged.rows.map((row) => `${String(row.line)} ${row.class} ${row.judged === undefined ? "-" : `${row.judged.from}/${row.judged.reason}`}`)).toEqual([
    "2 judged exported/production-id",
    "3 judged exported/production-id",
    "5 exported -",
    "6 authored -",
  ]);
  expect(formatSiteJudgements(judged.rows, judged.stale).split("\n")).toEqual([
    "sites with a production home: 1",
    `${JUDGED_SITE_SPEC.path}:5 "Cancel" exported in "a rendered verb"`,
    "judged sites: 2 (production-id 2, test-authored 0, guest-authored 0, data 0, fragment 0, literal-pin 0)",
    "site judgements matching no site: 1",
    `${JUDGED_SITE_SPEC.path} "Story note" in "a story note"`,
  ]);
});

test("the feature filter keeps the production owner's rows and names the test directory for the rest", () => {
  const index = productionIndex(PRODUCTION);
  const rows = nameSites(SPEC).map((site) => classifySite(site, index, { authored: authoredStrings([STORY]) }));
  expect(inFeature(rows, "client/src/features/chat").map((row) => row.text)).toEqual(['"Pinned row"', 'new RegExp(`^Reached \\\\d+ of the limit$`, "u")']);
  expect(inFeature(rows, "client/features/chat").map((row) => row.class)).toEqual(["authored", "unresolved", "non-word", "non-word", "guest"]);
});
