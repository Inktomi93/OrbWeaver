// CT: the tag collection's ROWS — the OWNER half of the config seam, driven through the host's view.
//
// The row is a SCENT now (F-11): swatch · name · usage. What this pins is what that split must NOT lose —
// the usage census still reads per row, the library-level "Prune unused" verb survived the move (it rides
// the owner's half of the group body, since the host band carries only create), and it appears only when
// there IS something to prune.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { TagCollectionRowsStory } from "../_ct-stories";

const TAGS = [
  {
    id: "tag_adventure",
    name: "adventure",
    color: "#3355ff",
    color2: null,
    source: "manual",
    folderType: "NONE",
    sortOrder: 0,
    isHiddenOnCard: false,
    usage: { characters: 5, chats: 1, worldBooks: 1, personas: 0, presets: 0, total: 7 },
  },
  {
    id: "tag_orphan",
    name: "orphan",
    color: null,
    color2: null,
    source: null,
    folderType: "NONE",
    sortOrder: 1,
    isHiddenOnCard: true,
    usage: { characters: 0, chats: 0, worldBooks: 0, personas: 0, presets: 0, total: 0 },
  },
];

function stub(page: Page, tags: readonly unknown[] = TAGS): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "tag.listTagsWithUsage": () => tags,
    "tag.pruneUnusedTags": () => ({ removed: 1 }),
    "tag.setTagOrder": () => undefined,
  });
}

// A third row whose ALPHABETICAL rank and its USAGE rank disagree — without it "most-used" and "A–Z"
// produce the identical order and neither assertion proves anything.
const ZEAL = {
  id: "tag_zeal",
  name: "zeal",
  color: null,
  color2: null,
  source: "manual",
  folderType: "NONE",
  sortOrder: 2,
  isHiddenOnCard: false,
  usage: { characters: 9, chats: 3, worldBooks: 0, personas: 0, presets: 0, total: 12 },
};

const THREE = [TAGS[0], TAGS[1], ZEAL];

/** The SortableList handle's per-row accessible name ("Reorder <tag>") — hoisted (useTopLevelRegex). */
const REORDER_HANDLE = /Reorder/u;

test("SORT MODE: the roster leads with MOST-USED by default and switches to A–Z", async ({ mount, page }) => {
  await stub(page, THREE);
  const rows = await mount(<TagCollectionRowsStory />);
  // Default is most-used: zeal (12) · adventure (7) · orphan (0).
  await expect(rows.locator('[data-slot="list-row-title"]')).toHaveText(["zeal", "adventure", "orphan"]);

  await rows.getByRole("combobox", { name: "Sort tags" }).click();
  await page.getByRole("option", { name: "A–Z" }).click();
  await expect(rows.locator('[data-slot="list-row-title"]')).toHaveText(["adventure", "orphan", "zeal"]);
});

test("SORT MODE: manual order is still reachable and is the only arm that offers drag handles", async ({ mount, page }) => {
  await stub(page, THREE);
  const rows = await mount(<TagCollectionRowsStory />);
  // Most-used (the default) is a derived order — a drag handle there would write a lie.
  await expect(rows.getByRole("button", { name: REORDER_HANDLE })).toHaveCount(0);

  await rows.getByRole("combobox", { name: "Sort tags" }).click();
  await page.getByRole("option", { name: "Manual order" }).click();
  await expect(rows.locator('[data-slot="list-row-title"]')).toHaveText(["adventure", "orphan", "zeal"]);
  await expect(rows.getByRole("button", { name: REORDER_HANDLE }).first()).toBeVisible();
});

test("each row carries its name and its usage census", async ({ mount, page }) => {
  await stub(page);
  const rows = await mount(<TagCollectionRowsStory />);
  await expect(rows.getByText("adventure")).toBeVisible();
  await expect(rows.getByText("7 uses")).toBeVisible();
  await expect(rows.getByText("unused", { exact: true })).toBeVisible();
});

test("the host's filter string narrows the OWNER's rows", async ({ mount, page }) => {
  await stub(page);
  const rows = await mount(<TagCollectionRowsStory filter="orph" />);
  await expect(rows.getByText("orphan")).toBeVisible();
  await expect(rows.getByText("adventure")).toHaveCount(0);
});

// PRUNE CONFIRMS (side-eye 2026-08-03 P2): it was a bare `prune.mutate()` on a ghost button, one mis-click
// from deleting every unused tag with no undo — 394 of them at the owner's library. The confirm is the
// defect's fix, so the CT pins BOTH halves: the click alone must not delete, and the count must be in the
// words the user agrees to.
test("Prune unused ASKS FIRST — the click opens a counted confirm and fires nothing", async ({ mount, page }) => {
  const trpc = await stub(page);
  const rows = await mount(<TagCollectionRowsStory />);
  await rows.getByRole("button", { name: "Prune unused" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Delete 1 unused tag?" })).toBeVisible();
  // Dismiss and settle on the CLOSED dialog before reading the recorder: the barrier is a rendered state
  // that can only exist after the whole open→cancel round-trip, so a call the click had fired would have
  // been recorded by now.
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect.poll(() => trpc.count("tag.pruneUnusedTags"), { intervals: [20, 50, 100] }).toBe(0);
});

test("Prune unused fires the library verb once the confirm is accepted", async ({ mount, page }) => {
  const trpc = await stub(page);
  const rows = await mount(<TagCollectionRowsStory />);
  await rows.getByRole("button", { name: "Prune unused" }).click();
  await page.getByRole("button", { name: "Delete them" }).click();
  await expect.poll(() => trpc.count("tag.pruneUnusedTags"), { intervals: [20, 50, 100] }).toBe(1);
});

// THE DOUBLE EMPTY STATE (side-eye 2026-08-03 P1): `empty = filtered.length === 0` printed filter copy
// with no filter set, stacked above the HOST's own zero-member slot — an empty collection said two things
// and one of them named a control that isn't even rendered. The needle is the discriminant.
test("an EMPTY library says nothing about filters (the host's empty slot is the only voice)", async ({ mount, page }) => {
  await stub(page, []);
  const rows = await mount(<TagCollectionRowsStory />);
  await expect(rows.getByText("No tags match that filter.")).toHaveCount(0);
});

test("a filter that matches nothing DOES say so", async ({ mount, page }) => {
  await stub(page);
  const rows = await mount(<TagCollectionRowsStory filter="zzzz" />);
  await expect(rows.getByText("No tags match that filter.")).toBeVisible();
});

test("no unused tags ⇒ no prune affordance (a verb with nothing to do is not offered)", async ({ mount, page }) => {
  await stub(page, [TAGS[0]]);
  const rows = await mount(<TagCollectionRowsStory />);
  await expect(rows.getByText("adventure")).toBeVisible();
  await expect(rows.getByRole("button", { name: "Prune unused" })).toHaveCount(0);
});

// RENDERED, at the roster's REAL width (the story box is the 330px config pane, not a comfortable
// default): the sort control is a `w-auto` Select precisely because FIELD_CONTROL's own `w-full` would
// claim the whole band for a three-word label. Geometry, never the class string — a class assertion is
// what would pass while the pixels were wrong.
const ROSTER_PANE_PX = 330;
const SORT_MAX_SHARE = 0.6;

test("the sort control fits the 330px roster band and does not claim it", async ({ mount, page }) => {
  await stub(page, THREE);
  const rows = await mount(<TagCollectionRowsStory />);
  const sort = rows.getByRole("combobox", { name: "Sort tags" });
  await expect(sort).toBeVisible();

  const box = await sort.boundingBox();
  const paneBox = await rows.boundingBox();
  const paneRight = (paneBox?.x ?? 0) + ROSTER_PANE_PX;
  expect((box?.x ?? 0) + (box?.width ?? Number.POSITIVE_INFINITY)).toBeLessThanOrEqual(paneRight);
  expect(box?.width ?? ROSTER_PANE_PX).toBeLessThan(ROSTER_PANE_PX * SORT_MAX_SHARE);
  // It is a real control, not a text-height sliver: the fine-pointer tap floor.
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(32);
});
