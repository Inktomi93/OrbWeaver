// CT: the Configuration workspace — the host frame over the REAL tag + regex collections.
//
// This is the seam's acceptance test: the host draws bands, disclosure, counts, create and the filter; the
// contributions draw rows, editors and context bodies; and the ONE kinded selection routes between them.
//
// AT SCALE, ON PURPOSE (owner ruling 2026-08-02): the tags fixture is FOUR HUNDRED rows, because that is
// the owner's real library and every decision here — collapsed by default, the count-driven filter, the
// windowed rows — exists for that size. A five-row toy would pass while the shipped surface stalled.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { ConfigWorkspaceStory } from "../_ct-stories";

/** The group bands, by their accessible name — a band is `<disclosure> <icon> LABEL <count>`, so the
 *  name carries the count and only a pattern can address it. */
const TAGS_BAND = /Tags/;
const REGEX_BAND = /Regex scripts/;

const TAG_COUNT = 400;

// The workspace mounts all three panes, and TWO of them legitimately offer a collection's create verb: the
// group BAND (the per-group `+`) and the welcome's LAUNCHER CARD. That is the drawn design, so the CTs
// address the region they mean by its slot rather than by a bare name.
const ROSTER = '[data-slot="config-roster"]';
const WELCOME = '[data-slot="config-welcome"]';

function tagRow(index: number): Record<string, unknown> {
  return {
    id: `tag_${String(index).padStart(3, "0")}`,
    name: `tag-${String(index).padStart(3, "0")}`,
    color: null,
    color2: null,
    source: null,
    folderType: "NONE",
    sortOrder: index,
    isHiddenOnCard: false,
    usage: { characters: index % 3, chats: 0, worldBooks: 0, personas: 0, presets: 0, total: index % 3 },
  };
}

const MANY_TAGS = Array.from({ length: TAG_COUNT }, (_unused, index) => tagRow(index));

const SCRIPTS = [
  {
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
  },
];

function stub(page: Page, tags: readonly unknown[] = MANY_TAGS): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "tag.listTagsWithUsage": () => tags,
    "tag.createTag": () => tagRow(TAG_COUNT),
    "regex.listScripts": () => SCRIPTS,
    "regex.listGlobal": () => [],
    "regex.createScript": () => SCRIPTS[0],
  });
}

test("every group starts COLLAPSED, showing its band, count and create verb — never its rows", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  // The roster is the MAP: both libraries are named, counted, and creatable at rest.
  const roster = workspace.locator(ROSTER);
  await expect(roster.getByRole("button", { name: TAGS_BAND })).toBeVisible();
  await expect(roster.getByText(String(TAG_COUNT))).toBeVisible();
  await expect(roster.getByRole("button", { name: "New tag" })).toBeVisible();
  await expect(roster.getByRole("button", { name: "New script" })).toBeVisible();
  // …and not one of the 400 rows is mounted.
  await expect(roster.getByRole("button", { name: TAGS_BAND })).toHaveAttribute("aria-expanded", "false");
  await expect(workspace.getByText("tag-000")).toHaveCount(0);
});

test("expanding a 400-member group renders its rows and offers the count-driven filter", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  await workspace.locator(ROSTER).getByRole("button", { name: TAGS_BAND }).click();
  await expect(workspace.locator(ROSTER).getByRole("button", { name: TAGS_BAND })).toHaveAttribute("aria-expanded", "true");
  await expect(workspace.getByText("tag-000")).toBeVisible();

  // The filter is HOST chrome, shown by COUNT — and applied by the contribution's own rows.
  const filter = workspace.getByRole("textbox", { name: "Filter tags" });
  await expect(filter).toBeVisible();
  await filter.fill("tag-137");
  await expect(workspace.getByText("tag-137")).toBeVisible();
  await expect(workspace.getByText("tag-000")).toHaveCount(0);

  // Create stays reachable with a 400-row list open (the band is chrome, not a list item).
  await expect(workspace.locator(ROSTER).getByRole("button", { name: "New tag" })).toBeVisible();
});

test("a small group gets NO filter (the affordance is count-driven, not per-collection)", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  await workspace.locator(ROSTER).getByRole("button", { name: REGEX_BAND }).click();
  await expect(workspace.getByText("strip ooc")).toBeVisible();
  await expect(workspace.getByRole("textbox", { name: "Filter regex scripts" })).toHaveCount(0);
});

test("no selection renders the host WELCOME with a launcher card per collection", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  const welcome = workspace.locator(WELCOME);
  await expect(welcome.getByRole("heading", { name: "The parts every chat is built from" })).toBeVisible();
  // Each card is drawn from the CONTRACT (label · icon · count · blurb · create), never a host string table.
  await expect(welcome.getByText("Colour-coded labels for characters, chats, books, personas and presets.")).toBeVisible();
  await expect(welcome.getByText("Find/replace that runs on input, output, or both — everywhere, or only where you attach it.")).toBeVisible();
});

test("selecting a member routes CONTENT to its owner's editor and CONTEXT to its owner's arm", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  // A TAG: its editor mounts in CONTENT, and its collection declares NO context arm — so the pane shows
  // that collection's OWN copy, not a generic "nothing selected" over a selected thing.
  await workspace.locator(ROSTER).getByRole("button", { name: TAGS_BAND }).click();
  await workspace.getByText("tag-001").click();
  await expect(workspace.getByRole("heading", { name: "tag-001" })).toBeVisible();
  await expect(workspace.getByText("Nothing to attach")).toBeVisible();

  // A SCRIPT: the same host, a different owner's editor and a real context body.
  await workspace.locator(ROSTER).getByRole("button", { name: REGEX_BAND }).click();
  await workspace.getByText("strip ooc").click();
  await expect(workspace.getByRole("textbox", { name: "Name" })).toBeVisible();
  await expect(workspace.getByText("Runs in every chat")).toBeVisible();
});

test("the group create verb fires the OWNER's create mutation", async ({ mount, page }) => {
  const trpc = await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  await workspace.locator(ROSTER).getByRole("button", { name: "New tag" }).click();
  await expect.poll(() => trpc.lastInput("tag.createTag"), { intervals: [20, 50, 100] }).toEqual({ input: { name: "New tag" } });
});

test("a zero-member group keeps its band and says so, with its own create verb", async ({ mount, page }) => {
  await stub(page, []);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  const roster = workspace.locator(ROSTER);
  await expect(roster.getByText("No tags yet.")).toBeVisible();
  // The empty slot repeats the collection's OWN create verb as the inline next step, BESIDE the band's `+`
  // (two affordances, one verb, both in the roster — the drawn design).
  await expect(roster.getByRole("button", { name: "New tag" })).toHaveCount(2);
});
