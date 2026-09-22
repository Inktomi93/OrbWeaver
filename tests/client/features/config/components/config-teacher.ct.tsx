// CT: the Settings CONTEXT pane as the TEACHER (#866 S3, config-revamp-design.md §7.2) — mounted through
// the PRODUCTION resolve (`makeConfigSection` → `SectionContextHost` → the #860 bracket), never a
// hand-assembled pair. Supersedes `config-context-body.ct.tsx` (the `single`-context band/body pair died
// with the tabs flip — surface-flip retires the CT premise; the say-it-once law it pinned is re-pinned
// here on the new anatomy).
//
// WHAT IT PINS:
//  · nothing selected → the section's empty arm, ONCE;
//  · AT REST the pane is the ROSTER of the settings currently in the CONTENT viewport, and scrolling the
//    content re-derives its membership (#926, the owner's PS5 ruling — the one-at-a-time model this file
//    used to pin was REJECTED, so those expectations were retired, not preserved);
//  · focusing a VISIBLE knob row swaps the pane to that leaf's drill (head + About), and scrolling that row
//    off screen returns the pane to the roster — keep-last focus now has a viewport horizon;
//  · every value the pane prints is the CONTROL'S OWN DISPLAY WORD, never the wire value (#1099 F15 — the
//    pane said "md." beside a picker reading "Medium");
//  · a settings state has NO Applies cell (`overriddenBy` is declared by 0 of 107 leaves) and Applies never
//    takes the landing; Learn is ABSENT while no contribution supplies `more`;
//  · an open member turns Applies into the collection's own arm (the "Where it's attached" answer), lands on
//    ABOUT, and a `none` collection renders ITS copy once; the foot tab KEEPS across a subject change
//    (focus-follows-content over `contextTab`, CP-4 §4.1) — pinned on the member arm, the one state that
//    still resolves two cells;
//  · the row's `i` is the teacher's door (accname derived from the row label).

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcFixtureOutput, TrpcRecorder } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { ConfigWorkspaceStory } from "../_ct-stories.tsx";

const TAGS_BAND = /Tags/;
const REGEX_BAND = /Regex scripts/;
const CONTEXT_PANE = '[data-slot="ct-config-context-pane"]';

const TAG = {
  id: "tag_000",
  name: "tag-000",
  color: null,
  color2: null,
  source: null,
  folderType: "NONE",
  sortOrder: 0,
  isHiddenOnCard: false,
  usage: { characters: 1, chats: 0, worldBooks: 0, personas: 0, presets: 0, total: 1 },
} satisfies TrpcFixtureOutput<"tag.listTagsWithUsage">[number];

/** A SECOND member, purely so the tab-continuity pin has a subject change to make inside the one arm that
 *  still resolves two cells (a settings state is now a single About cell — #926's applicability gate). */
const TAG_2 = { ...TAG, id: "tag_001", name: "tag-001", sortOrder: 1 };

const SCRIPT = {
  id: "regex_script_stripooc",
  name: "strip ooc",
  findRegex: "/^\\s*ooc:.*$/gim",
  replaceString: "",
  placement: ["AI_OUTPUT"],
  enabled: true,
  markdownOnly: false,
  promptOnly: false,
  runOnEdit: false,
  trimStrings: [],
  updatedAt: 1_760_000_000_000,
  substituteRegex: 0,
} satisfies TrpcFixtureOutput<"regex.listScripts">[number];

const SETTINGS_VIEW = { userId: "user_ct_config", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, configUnreadable: null, updatedAt: 0 };

function stub(page: Page): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    // The Appearance skimmer's sections all read the settings blob — fed the real defaults so the knob
    // rows (the SettingRow seam under test) mount for real instead of suspending forever.
    "settings.getUserSettings": () => SETTINGS_VIEW,
    // The Looks section (#866 S4) reads the theme library — three seeds, no owned rows.
    "settings.listThemes": () => [
      { id: "theme_00000000000000000000000001", name: "Hearth", override: {}, css: null, isSeed: true, isDefault: true, createdAt: 0, updatedAt: 0 },
      { id: "theme_00000000000000000000000002", name: "Mocha", override: {}, css: null, isSeed: true, isDefault: false, createdAt: 0, updatedAt: 0 },
      { id: "theme_00000000000000000000000003", name: "Light", override: {}, css: null, isSeed: true, isDefault: false, createdAt: 0, updatedAt: 0 },
    ],
    "rosterPreset.list": [],
    "sessions.me": { userId: "user_ct_config", handle: "ct_config", globalRole: "user" },
    "tag.listTagsWithUsage": () => [TAG, TAG_2],
    "regex.listScripts": () => [SCRIPT],
    "regex.listGlobal": () => [],
    "regex.listScriptUsage": () => ({ presets: [], characters: [], rooms: [] }),
    "worldInfo.listBooksWithUsage": () => [],
    "persona.list": () => [],
    "character.list": () => ({ items: [], nextCursor: null }),
  });
}

test("with nothing selected the pane says 'Nothing selected' ONCE", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  await expect(workspace.locator(CONTEXT_PANE).getByText("Nothing selected")).toHaveCount(1);
});

// The nine Appearance sections, as the LIST spells them — the population the CONTEXT pane duplicated
// verbatim before #1101 (side-eye re-drive G2: `design-audit --panels both-docked` filed 8 ×
// `duplicate-action-door`). This story IS the both-docked arm: LIST · CONTENT · CONTEXT, all mounted.
const APPEARANCE_SECTIONS = [
  "Looks",
  "Message style",
  "Avatars",
  "Sizing & motion",
  "Message details",
  "Background",
  "Reading typography",
  "Effects",
  "Library",
];

test("CONTEXT is never navigation — with a group open the pane teaches the section you are READING, and offers no jump list", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  const list = workspace.locator('[data-slot="config-list"]');
  await list.getByRole("button", { name: /Appearance/ }).click();
  const pane = workspace.locator(CONTEXT_PANE);

  // BARRIER on a SETTLED state that exists in both worlds, so the absence sweep below can never pass
  // vacuously against a pane that has not painted: the teacher bracket is up and the group's body has
  // mounted its rows.
  await expect(pane.getByRole("button", { name: "About" })).toBeVisible();
  await expect(workspace.locator('[data-setting="chat-style"]')).toBeVisible();

  // Not one LIST row has a twin in here (UI-Architecture-and-Layout.md §4.2: "CONTEXT … Never navigation
  // — actions ON the artifact only"). The LIST keeps every one of them, which is the point.
  for (const section of APPEARANCE_SECTIONS) {
    await expect(pane.getByRole("button", { name: section, exact: true })).toHaveCount(0);
    await expect(list.getByRole("button", { name: section, exact: true })).toHaveCount(1);
  }

  // And what it teaches INSTEAD is the ROSTER of what the reader can SEE — one entry per visible setting
  // row, each carrying that leaf's own gloss. `shipped-looks` is the first row of the first section, so it
  // is in view at scrollTop 0 in every arm of this story.
  await expect(pane.locator('[data-slot="teacher-roster-entry"][data-setting="looks/shipped-looks"]')).toBeVisible();
});

test("the roster IS the viewport — scrolling the content re-derives which settings it lists", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();
  await workspace
    .locator('[data-slot="config-list"]')
    .getByRole("button", { name: /Appearance/ })
    .click();

  const pane = workspace.locator(CONTEXT_PANE);
  const entries = pane.locator('[data-slot="teacher-roster-entry"]');
  // SETTLE on a rendered state that exists in both worlds before reading the set: the group's body has
  // mounted its rows and the pane has painted at least one entry for them.
  await expect(workspace.locator('[data-setting="chat-style"]')).toBeVisible();
  await expect(entries.first()).toBeVisible();
  const atTop = await entries.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-setting")));
  expect(atTop).toContain("looks/shipped-looks");

  // Scroll the CONTENT pane (the scroller the spy listens to) to its end. The roster is a different set
  // afterwards — which is the whole ruling: "when you scroll down … it changes the number of items".
  await workspace.locator('[data-slot="config-content"]').evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await expect
    .poll(async () => entries.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-setting"))), { intervals: [50, 100, 200] })
    .not.toEqual(atTop);
  const atBottom = await entries.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-setting")));
  expect(atBottom).not.toContain("looks/shipped-looks");
});

test("a settings state offers NO Applies cell, and About is the landing", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();
  await workspace
    .locator('[data-slot="config-list"]')
    .getByRole("button", { name: /Appearance/ })
    .click();

  const pane = workspace.locator(CONTEXT_PANE);
  await expect(pane.getByRole("button", { name: "About" })).toHaveAttribute("aria-current", "true");
  // `overriddenBy` is declared by ZERO of the 107 live teach declarations, so the cell's only content was
  // its own null state — a permanent cell teaching nothing (#926's census, #864's furniture ban).
  await expect(pane.getByRole("button", { name: "Applies" })).toHaveCount(0);
  await expect(pane.getByRole("button", { name: "Learn" })).toHaveCount(0);
});

test("the pane prints the CONTROL'S display word, never the wire value", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();
  await workspace
    .locator('[data-slot="config-list"]')
    .getByRole("button", { name: /Appearance/ })
    .click();

  // Avatar size stores "md" and its picker reads "Medium" (#1099 F15: the teacher printed "Using the
  // default — md."). The ROSTER prints it first — every visible row carries its value — and the DRILL
  // prints it again in the default-vs-current block.
  const row = workspace.locator('[data-setting="avatar-size"]');
  await row.scrollIntoViewIfNeeded();
  const pane = workspace.locator(CONTEXT_PANE);
  await expect(pane.locator('[data-slot="teacher-roster-entry"][data-setting="avatars/avatar-size"]')).toContainText("Medium");

  await row.getByRole("combobox").focus();
  await expect(pane.getByText("Using the default — Medium.")).toBeVisible();
});

test("focusing a knob row teaches THAT setting — head and About swap, and the i is its door", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  // Open the Appearance group: with nothing focused the pane teaches the GROUP (its description).
  await workspace
    .locator('[data-slot="config-list"]')
    .getByRole("button", { name: /Appearance/ })
    .click();
  const pane = workspace.locator(CONTEXT_PANE);
  await expect(pane.getByRole("button", { name: "About" })).toBeVisible();

  // Focus the Chat-display row through the real SettingRow seam (a click inside the row publishes
  // focus). A PLAIN section's row on purpose — the folded sections' rows are behind the collapsed
  // "Customize this look" arm and have their own landing pins.
  const row = workspace.locator('[data-setting="chat-style"]');
  // BRING THE ROW INTO THE CONTENT VIEWPORT FIRST — the drill has a viewport horizon since #926, and a
  // reader who focuses a row has always scrolled it into view (the browser does it for a Tab). Playwright's
  // `.focus()` alone can leave the row outside the scroller's box, which is a state the pane deliberately
  // answers with the roster.
  await row.scrollIntoViewIfNeeded();
  // FOCUS a cell (the focus-within seam) — chat-style is preview cells in a RADIOGROUP since #981 F20
  // (they were N aria-pressed buttons); a focus is the publish, no popup involved.
  await row.getByRole("radio", { name: "Bubble", exact: true }).focus();
  await expect(pane.getByText("How every message in the transcript is shaped", { exact: false })).toBeVisible();
  // The `i` carries the row's accessible subject — the teacher's pull-revelation door.
  await expect(row.getByRole("button", { name: "More info about Chat display" })).toBeVisible();

  // Learn is ABSENT: no appearance leaf supplies `more`.
  await expect(pane.getByRole("button", { name: "Learn" })).toHaveCount(0);

  // AND THE DRILL HAS A VIEWPORT HORIZON (#926): keep-last focus still never clears on blur, but scrolling
  // the focused row off screen returns the pane to the roster — the at-rest state — rather than teaching a
  // row the reader can no longer see.
  await workspace.locator('[data-slot="config-content"]').evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await expect(pane.locator('[data-slot="teacher-roster-entry"]').first()).toBeVisible();
  await expect(pane.getByText("How every message in the transcript is shaped", { exact: false })).toHaveCount(0);
});

// CP-4 §4.1 (focus-follows-content over `contextTab`) is RE-HOMED, not dropped: it used to be pinned on a
// settings row moving to another settings row, and a settings state now resolves ONE cell, so that arm can
// no longer express a tab to keep. The member arm still resolves About + Applies, and a member→member
// change is the same subject change through the same seam.
test("the foot tab KEEPS across a subject change — a reader on Applies stays on Applies", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  const list = workspace.locator('[data-slot="config-list"]');
  const content = workspace.locator('[data-slot="config-content"]');
  await list.getByRole("button", { name: TAGS_BAND }).click();
  // THE MEMBER ROWS ARE IN CONTENT SINCE #1725 — the band is the LIST's whole contribution now.
  // THE ROWS ARE VIRTUALIZED at this fixture's 400 tags and ordered by USAGE, so the subject is addressed
  // as "the first rendered row" and "the second" rather than by a name the window may never mount.
  const rows = content.locator('[data-slot="list-row-root"]');
  // BOTH NAMES ARE READ BEFORE THE FIRST CLICK: drilling swaps CONTENT to the member's editor, so the
  // second row stops existing the moment the first is opened — reading it afterwards times out on a
  // locator that can no longer resolve. Names, not indices, are what survives the swap.
  await expect(rows.nth(1)).toBeVisible();
  const firstName = (await rows.nth(0).locator('[data-slot="list-row-title"]').textContent()) ?? "";
  const second = (await rows.nth(1).locator('[data-slot="list-row-title"]').textContent()) ?? "";
  await rows.nth(0).click();
  await expect(workspace.getByRole("heading", { name: firstName })).toBeVisible();

  const pane = workspace.locator(CONTEXT_PANE);
  // A MEMBER LANDS ON ABOUT (#926): the old `defaultTab` opened every member on Applies, which for a `none`
  // collection is a null state — the pane's landing was its emptiest arm.
  await expect(pane.getByRole("button", { name: "About" })).toHaveAttribute("aria-current", "true");
  await pane.getByRole("button", { name: "Applies" }).click();
  await expect(pane.getByRole("button", { name: "Applies" })).toHaveAttribute("aria-current", "true");

  // Back to the library, then the SECOND row — a member→member change through the same seam.
  await content.getByRole("button", { name: /^Back to / }).click();
  await content.getByRole("button", { name: second, exact: true }).click();
  await expect(workspace.getByRole("heading", { name: second })).toBeVisible();
  await expect(pane.getByRole("button", { name: "Applies" })).toHaveAttribute("aria-current", "true");
});

test("an open member turns Applies into the collection's own arm — stated ONCE", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  await workspace.locator('[data-slot="config-list"]').getByRole("button", { name: REGEX_BAND }).click();
  // `exact` and by ROLE: the library's own insights sit above the rows and their doors are named after
  // members ("Open strip ooc"), so a bare text match resolves two nodes.
  await workspace.locator('[data-slot="config-content"]').getByRole("button", { name: "strip ooc", exact: true }).click();

  const pane = workspace.locator(CONTEXT_PANE);
  await pane.getByRole("button", { name: "Applies" }).click();
  await expect(pane.getByText("Where it’s attached")).toHaveCount(1);
});

test("a member of a NONE collection renders that collection's copy, once", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  await workspace.locator('[data-slot="config-list"]').getByRole("button", { name: TAGS_BAND }).click();
  const firstRow = workspace.locator('[data-slot="config-content"]').locator('[data-slot="list-row-root"]').first();
  const firstName = (await firstRow.locator('[data-slot="list-row-title"]').textContent()) ?? "";
  await firstRow.click();
  await expect(workspace.getByRole("heading", { name: firstName })).toBeVisible();

  const pane = workspace.locator(CONTEXT_PANE);
  await pane.getByRole("button", { name: "Applies" }).click();
  await expect(pane.getByText("Nothing to attach")).toHaveCount(1);
});

// ── ABOUT's default-vs-current block (§3.4 row chrome, #866 — the deferred leg): the COARSE pointer's
// one Reset door, resolved through the SAME `useConfigLeaf` the row's stripe reads. Both arms planted:
// at default the honest one-liner with NO button; modified, the pair + a Reset that fires the section's
// exact wire.

const QUOTED_DEFAULT_WORD = DEFAULT_USER_SETTINGS.appearance.colorQuotedSpeech ? "On" : "Off";
const QUOTED_MODIFIED_WORD = DEFAULT_USER_SETTINGS.appearance.colorQuotedSpeech ? "Off" : "On";

/** The `stub` twin with ONE planted difference — `chat.colorQuotedSpeech` flipped off its default. */
function stubModified(page: Page): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "settings.getUserSettings": () => ({
      ...SETTINGS_VIEW,
      config: {
        ...DEFAULT_USER_SETTINGS,
        appearance: { ...DEFAULT_USER_SETTINGS.appearance, colorQuotedSpeech: !DEFAULT_USER_SETTINGS.appearance.colorQuotedSpeech },
      },
    }),
    "settings.updateUserSettingsSection": () => ({
      ...SETTINGS_VIEW,
      config: {
        ...DEFAULT_USER_SETTINGS,
        appearance: { ...DEFAULT_USER_SETTINGS.appearance, colorQuotedSpeech: !DEFAULT_USER_SETTINGS.appearance.colorQuotedSpeech },
      },
    }),
    "settings.listThemes": () => [],
    "rosterPreset.list": [],
    "sessions.me": { userId: "user_ct_config", handle: "ct_config", globalRole: "user" },
    "tag.listTagsWithUsage": () => [TAG, TAG_2],
    "regex.listScripts": () => [SCRIPT],
    "regex.listGlobal": () => [],
    "regex.listScriptUsage": () => ({ presets: [], characters: [], rooms: [] }),
    "worldInfo.listBooksWithUsage": () => [],
    "persona.list": () => [],
    "character.list": () => ({ items: [], nextCursor: null }),
  });
}

test("About states 'Using the default' on an unmodified leaf — and offers NO Reset", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();
  await workspace
    .locator('[data-slot="config-list"]')
    .getByRole("button", { name: /Appearance/ })
    .click();

  await workspace.locator('[data-setting="color-quoted-speech"]').getByRole("switch").focus();
  const pane = workspace.locator(CONTEXT_PANE);
  await expect(pane.getByText(`Using the default — ${QUOTED_DEFAULT_WORD}.`)).toBeVisible();
  await expect(pane.getByRole("button", { name: "Reset to default" })).toHaveCount(0);
});

test("About shows Current vs Default on a MODIFIED leaf, and its Reset fires the section's exact wire", async ({ mount, page }) => {
  const trpc = await stubModified(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();
  await workspace
    .locator('[data-slot="config-list"]')
    .getByRole("button", { name: /Appearance/ })
    .click();

  await workspace.locator('[data-setting="color-quoted-speech"]').getByRole("switch").focus();
  const pane = workspace.locator(CONTEXT_PANE);
  await expect(pane.getByText(`Current ${QUOTED_MODIFIED_WORD}`)).toBeVisible();
  await expect(pane.getByText(`Default ${QUOTED_DEFAULT_WORD}`)).toBeVisible();

  await pane.getByRole("button", { name: "Reset to default" }).click();
  await expect
    .poll(() => trpc.lastInput("settings.updateUserSettingsSection"), { intervals: [20, 50, 100] })
    .toEqual({ section: "appearance", patch: { colorQuotedSpeech: DEFAULT_USER_SETTINGS.appearance.colorQuotedSpeech } });
});
