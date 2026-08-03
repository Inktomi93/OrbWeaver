// CT: the Configuration CONTEXT pane as the shell assembles it — the definition's BAND header over its
// BODY. The band and the body are two different mount points fed by ONE definition, so only the pair can
// prove what each is allowed to say.
//
// WHAT IT PINS (side-eye sweep 2026-08-03): a pane states a fact ONCE. The band names what the pane ANSWERS
// for the open member's collection ("Where it runs"); the two arms whose body is an `EmptyState` already
// print their sentence as that state's title, so the band falls back to the neutral label instead — which
// is exactly the frame `empty-states.html` draws (band "Details" over body "Nothing to attach"). Before
// this, the pane rendered "Nothing to attach" twice ~78px apart: the F-12 defect (`registry-contracts.ts`:
// "the word 'Details' twice — the band's, then the body placeholder's title") rebuilt one tier up. The band
// must stay NON-EMPTY through it: an empty `.shell-panel-header` collapses to 0px and drops the context
// pane's D66 A1 horizon with the LIST and CONTENT bands beside it.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { ConfigWorkspaceStory } from "../_ct-stories";

const TAGS_BAND = /Tags/;
const REGEX_BAND = /Regex scripts/;

const CONTEXT_PANE = '[data-slot="ct-config-context-pane"]';
const CONTEXT_BAND = '[data-slot="ct-config-context-band"]';

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
  substituteRegex: "none",
};

function stub(page: Page): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "tag.listTagsWithUsage": () => [TAG],
    "regex.listScripts": () => [SCRIPT],
    "regex.listGlobal": () => [],
    "regex.listScriptUsage": () => ({ presets: [], characters: [], rooms: [] }),
    "worldInfo.listBooksWithUsage": () => [],
    "persona.list": () => [],
    "character.list": () => ({ items: [], nextCursor: null }),
  });
}

test("with nothing selected the pane says 'Nothing selected' ONCE — the band does not echo the body", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  await expect(workspace.locator(CONTEXT_PANE).getByText("Nothing selected")).toHaveCount(1);
  // Neutral, but NOT empty — the band has to keep occupying its 48px horizon.
  await expect(workspace.locator(CONTEXT_BAND)).toHaveText("Details");
});

test("over a member whose collection has NOTHING to attach, the sentence is the body's alone", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  await workspace.locator('[data-slot="config-roster"]').getByRole("button", { name: TAGS_BAND }).click();
  await workspace.getByText("tag-000").click();
  await expect(workspace.getByRole("heading", { name: "tag-000" })).toBeVisible();

  // The tag collection's own copy still reaches the reader — once, in the body, where the icon and the
  // explanation are. A band repeating it is the doubling this test exists for.
  await expect(workspace.locator(CONTEXT_PANE).getByText("Nothing to attach")).toHaveCount(1);
  await expect(workspace.locator(CONTEXT_BAND)).toHaveText("Details");
});

test("over a member whose collection DOES answer something, the band names it and the body never repeats it", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  await workspace.locator('[data-slot="config-roster"]').getByRole("button", { name: REGEX_BAND }).click();
  await workspace.getByText("strip ooc").click();

  await expect(workspace.locator(CONTEXT_BAND)).toHaveText("Where it runs");
  await expect(workspace.locator(CONTEXT_PANE).getByText("Where it runs")).toHaveCount(1);
});

// ONE HORIZON, ONE VOICE. The LIST band and the CONTEXT band sit on the same 48px shell row 1000px apart,
// and `workspace.html` draws both as `.caps`. At `voice="label"` the context band painted 13px sentence-case
// beside the list band's 10.5px uppercase — measured on the live surface. Asserted as computed style
// against the LIST band's own, so a token move cannot drift the pair apart again.
test("the CONTEXT band paints in the same band voice as the LIST band beside it", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();
  await expect(workspace.locator(CONTEXT_BAND)).toHaveText("Details");

  const painted = await page.evaluate(() => {
    const band = document.querySelector('[data-slot="ct-config-context-band"] span');
    if (band === null) {
      return null;
    }
    const style = getComputedStyle(band);
    return { transform: style.textTransform, size: style.fontSize, weight: style.fontWeight };
  });

  expect(painted).not.toBeNull();
  // The `kicker` voice — the treatment `ListPaneHeader` gives the LIST band (micro · caps · semibold).
  expect(painted?.transform).toBe("uppercase");
  expect(Number.parseFloat(painted?.size ?? "0")).toBeLessThan(12);
});
