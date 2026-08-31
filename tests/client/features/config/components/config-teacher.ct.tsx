// CT: the Settings CONTEXT pane as the TEACHER (#866 S3, config-revamp-design.md §7.2) — mounted through
// the PRODUCTION resolve (`makeConfigSection` → `SectionContextHost` → the #860 bracket), never a
// hand-assembled pair. Supersedes `config-context-body.ct.tsx` (the `single`-context band/body pair died
// with the tabs flip — surface-flip retires the CT premise; the say-it-once law it pinned is re-pinned
// here on the new anatomy).
//
// WHAT IT PINS:
//  · nothing selected → the section's empty arm, ONCE;
//  · focusing a knob row (the `SettingRow` seam) swaps the pane's head + About body to that leaf's teach;
//  · the foot tab KEEPS across a focus change (focus-follows-content over `contextTab`, CP-4 §4.1);
//  · Learn is ABSENT while no contribution supplies `more` (applicability, never a disabled husk);
//  · an open member turns Applies into the collection's own arm (the "Where it's attached" answer), and a
//    `none` collection renders ITS copy once;
//  · the row's `i` is the teacher's door (accname derived from the row label).

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
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
};

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
  substituteRegex: "none",
};

const SETTINGS_VIEW = { userId: "user_ct_config", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 };

function stub(page: Page): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    // The Appearance skimmer's sections all read the settings blob — fed the real defaults so the knob
    // rows (the SettingRow seam under test) mount for real instead of suspending forever.
    "settings.getUserSettings": () => SETTINGS_VIEW,
    // The Looks section (#866 S4) reads the theme library — three seeds, no owned rows.
    "settings.listThemes": () => [
      { id: "theme_00000000000000000000000001", name: "Hearth", override: {}, css: null, isSeed: true, createdAt: 0, updatedAt: 0 },
      { id: "theme_00000000000000000000000002", name: "Mocha", override: {}, css: null, isSeed: true, createdAt: 0, updatedAt: 0 },
      { id: "theme_00000000000000000000000003", name: "Light", override: {}, css: null, isSeed: true, createdAt: 0, updatedAt: 0 },
    ],
    "rosterPreset.list": [],
    "sessions.me": { userId: "user_ct_config", handle: "ct_config", globalRole: "user" },
    "tag.listTagsWithUsage": () => [TAG],
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

test("focusing a knob row teaches THAT setting — head and About swap, and the i is its door", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  // Open the Appearance group: with nothing focused the pane teaches the GROUP (its description).
  await workspace
    .locator('[data-slot="config-roster"]')
    .getByRole("button", { name: /Appearance/ })
    .click();
  const pane = workspace.locator(CONTEXT_PANE);
  await expect(pane.getByRole("button", { name: "About" })).toBeVisible();

  // Focus the Chat-display row through the real SettingRow seam (a click inside the row publishes
  // focus). A PLAIN section's row on purpose — the folded sections' rows are behind the collapsed
  // "Customize this look" arm and have their own landing pins.
  const row = workspace.locator('[data-setting="chat-style"]');
  // FOCUS the control (the focus-within seam) — clicking the LABEL would forward to the Select trigger
  // and open its popup, whose Base UI inert backdrop then swallows every later click.
  await row.getByRole("combobox").focus();
  await expect(pane.getByText("How every message in the transcript is shaped", { exact: false })).toBeVisible();
  // The `i` carries the row's accessible subject — the teacher's pull-revelation door.
  await expect(row.getByRole("button", { name: "More info about Chat display" })).toBeVisible();

  // Learn is ABSENT: no appearance leaf supplies `more`.
  await expect(pane.getByRole("button", { name: "Learn" })).toHaveCount(0);
});

test("the foot tab KEEPS across a focus change — a reader on Applies stays on Applies", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();
  await workspace
    .locator('[data-slot="config-roster"]')
    .getByRole("button", { name: /Appearance/ })
    .click();

  const pane = workspace.locator(CONTEXT_PANE);
  await workspace.locator('[data-setting="chat-style"]').getByRole("combobox").focus();
  await pane.getByRole("button", { name: "Applies" }).click();
  await expect(pane.getByRole("button", { name: "Applies" })).toHaveAttribute("aria-current", "true");

  // Move focus to a different row (the focus-within seam): the head/body swap, the TAB does not.
  await workspace.locator('[data-setting="color-quoted-speech"]').getByRole("switch").focus();
  await expect(pane.getByRole("button", { name: "Applies" })).toHaveAttribute("aria-current", "true");
});

test("an open member turns Applies into the collection's own arm — stated ONCE", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  await workspace.locator('[data-slot="config-roster"]').getByRole("button", { name: REGEX_BAND }).click();
  await workspace.locator('[data-slot="config-roster"]').getByText("strip ooc").click();

  const pane = workspace.locator(CONTEXT_PANE);
  await pane.getByRole("button", { name: "Applies" }).click();
  await expect(pane.getByText("Where it’s attached")).toHaveCount(1);
});

test("a member of a NONE collection renders that collection's copy, once", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  await workspace.locator('[data-slot="config-roster"]').getByRole("button", { name: TAGS_BAND }).click();
  await workspace.locator('[data-slot="config-roster"]').getByText("tag-000").click();
  await expect(workspace.getByRole("heading", { name: "tag-000" })).toBeVisible();

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
    "settings.updateUserSettingsSection": () => ({}),
    "settings.listThemes": () => [],
    "rosterPreset.list": [],
    "sessions.me": { userId: "user_ct_config", handle: "ct_config", globalRole: "user" },
    "tag.listTagsWithUsage": () => [TAG],
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
    .locator('[data-slot="config-roster"]')
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
    .locator('[data-slot="config-roster"]')
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
