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

test("Prune unused fires the library verb — and only shows when something is unused", async ({ mount, page }) => {
  const trpc = await stub(page);
  const rows = await mount(<TagCollectionRowsStory />);
  await rows.getByRole("button", { name: "Prune unused" }).click();
  await expect.poll(() => trpc.count("tag.pruneUnusedTags"), { intervals: [20, 50, 100] }).toBe(1);
});

test("no unused tags ⇒ no prune affordance (a verb with nothing to do is not offered)", async ({ mount, page }) => {
  await stub(page, [TAGS[0]]);
  const rows = await mount(<TagCollectionRowsStory />);
  await expect(rows.getByText("adventure")).toBeVisible();
  await expect(rows.getByRole("button", { name: "Prune unused" })).toHaveCount(0);
});
