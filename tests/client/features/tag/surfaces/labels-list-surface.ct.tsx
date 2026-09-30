// CT: the Corpus Labels mode (D271) — the tag library's ONE home. Mounted through the mode contribution the
// door hands the Corpus section, so every pin runs on production wiring: the finder (filter · sort · overflow
// over the rows), the band's one primary verb, the library landing, the autosaving editor, and the CONTEXT tab.
//
// The finder's controls moved here from the Configuration host with the tag library; the rows' half of each
// ruling stays pinned in `tests/client/features/tag/components/tag-collection-rows.ct.tsx`.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import type { TrpcFixtureOutput, TrpcRecorder } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { LabelsWorkspaceStory } from "../_ct-stories.tsx";

type TagWithUsage = TrpcFixtureOutput<"tag.listTagsWithUsage">[number];

function tagRow(id: string, name: string, characters: number, chats = 0): TagWithUsage {
  return {
    id,
    name,
    color: null,
    color2: null,
    source: "manual",
    folderType: "NONE",
    sortOrder: null,
    isHiddenOnCard: false,
    usage: { characters, chats, worldBooks: 0, personas: 0, presets: 0, total: characters + chats },
  };
}

/** Three tags, one unused — enough to sort by two axes and to count a prune. */
const FEW_TAGS = [tagRow("tag_zeal", "zeal", 9, 3), tagRow("tag_adventure", "adventure", 5, 2), tagRow("tag_orphan", "orphan", 0)];

/** One more than the windowing cap (30) disables drag; the count is stated here, never imported. */
const MANY_TAGS = Array.from({ length: 60 }, (_unused, index) =>
  tagRow(`tag_${String(index).padStart(3, "0")}`, `tag-${String(index).padStart(3, "0")}`, 60 - index),
);

function stub(page: Page, tags: readonly TagWithUsage[] = FEW_TAGS): Promise<TrpcRecorder> {
  // The library read answers what the create verb has written, so a created tag is really in the library.
  const library: TagWithUsage[] = [...tags];
  return routeTrpc(page, {
    "tag.listTagsWithUsage": () => library,
    "tag.pruneUnusedTags": () => ({ removed: 1 }),
    "tag.setTagOrder": () => undefined,
    "tag.createTag": () => {
      const created = tagRow("tag_created", "New tag", 0);
      library.push(created);
      const { usage: _usage, ...view } = created;
      return view;
    },
  });
}

function finder(workspace: Locator): Locator {
  return workspace.locator('[data-slot="ct-labels-list"]');
}
function content(workspace: Locator): Locator {
  return workspace.locator('[data-slot="ct-labels-content"]');
}
function rowTitles(workspace: Locator): Locator {
  return finder(workspace).locator('[data-slot="list-row-title"]');
}

test("the finder reads filter · sort · overflow, the band carries New tag, and CONTENT states the library", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<LabelsWorkspaceStory />);
  const row = finder(workspace).locator('[data-slot="labels-control-row"]');

  // GEOMETRY, never DOM order: the claim is about what the eye sweeps.
  const filter = await row.getByRole("textbox", { name: "Filter labels" }).boundingBox();
  const sort = await row.getByRole("combobox", { name: "Sort labels" }).boundingBox();
  const overflow = await row.getByRole("button", { name: "More label actions" }).boundingBox();
  expect(filter?.x ?? 0).toBeLessThan(sort?.x ?? 0);
  expect(sort?.x ?? 0).toBeLessThan(overflow?.x ?? 0);
  // The finder's ONE primary verb rides the band, with the library census beside the mode's name.
  const band = workspace.locator('[data-slot="ct-labels-band"]');
  await expect(band.getByRole("button", { name: "New tag" })).toBeVisible();
  await expect(band).toContainText("Labels");
  await expect(band).toContainText("3");

  // CONTENT states what no row can: orphans, with a real door to one, and the taxonomy's reach by kind.
  await expect(content(workspace).getByRole("heading", { name: "Labels", level: 2 })).toBeVisible();
  const facts = content(workspace).locator('[data-slot="labels-library-facts"]');
  await expect(facts).toContainText("Labelling nothing1 of 3");
  await expect(facts).toContainText("Tags on characters2");
  await expect(facts).toContainText("Tags on chats2");
  await facts.getByRole("button", { name: "Open orphan" }).click();
  await expect(content(workspace).locator('[data-slot="tag-member-editor"]').getByRole("heading", { name: "orphan" })).toBeVisible();
});

test("the finder's sort Select writes the mode the rows read", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<LabelsWorkspaceStory />);
  await expect(rowTitles(workspace)).toHaveText(["zeal", "adventure", "orphan"]);

  await finder(workspace).getByRole("combobox", { name: "Sort labels" }).click();
  await page.getByRole("option", { name: "A–Z" }).click();
  await expect(rowTitles(workspace)).toHaveText(["adventure", "orphan", "zeal"]);
});

test("picking Manual order puts drag handles on the rows", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<LabelsWorkspaceStory />);
  await expect(finder(workspace).getByRole("button", { name: /Reorder/u })).toHaveCount(0);

  await finder(workspace).getByRole("combobox", { name: "Sort labels" }).click();
  await page.getByRole("option", { name: "Manual order" }).click();
  await expect(
    finder(workspace)
      .getByRole("button", { name: /Reorder/u })
      .first(),
  ).toBeVisible();
});

// ABOVE THE CAP the mode is unselectable and the OPTION says why, in its `aria-describedby`-wired slot.
test("ABOVE the cap: Manual order is disabled and its option carries the reason", async ({ mount, page }) => {
  await stub(page, MANY_TAGS);
  const workspace = await mount(<LabelsWorkspaceStory />);
  await finder(workspace).getByRole("combobox", { name: "Sort labels" }).click();
  const manual = page.getByRole("option", { name: "Manual order" });
  await expect(manual).toHaveAttribute("data-disabled", "");
  await expect(manual).toHaveAccessibleDescription("Drag to reorder is off above 30 tags.");
  await expect(page.getByRole("option", { name: "A–Z" })).not.toHaveAttribute("data-disabled", "");
});

test("the overflow carries Prune unused tags, and the item alone deletes nothing", async ({ mount, page }) => {
  const trpc = await stub(page);
  const workspace = await mount(<LabelsWorkspaceStory />);
  await finder(workspace).getByRole("button", { name: "More label actions" }).click();
  await page.getByRole("menuitem", { name: "Prune unused tags" }).click();

  // The item only OPENS the rows' confirm; the count and the cascade are the rows' knowledge.
  await expect(page.getByRole("heading", { name: "Delete 1 unused tag?" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect.poll(() => trpc.count("tag.pruneUnusedTags"), { intervals: [20, 50, 100] }).toBe(0);
});

test("New tag creates through the tag verb and opens the new tag in the editor", async ({ mount, page }) => {
  const trpc = await stub(page);
  const workspace = await mount(<LabelsWorkspaceStory />);
  await workspace.locator('[data-slot="ct-labels-band"]').getByRole("button", { name: "New tag" }).click();

  await expect.poll(() => trpc.lastInput("tag.createTag"), { intervals: [20, 50, 100] }).toEqual({ input: { name: "New tag" } });
  // The created tag is OPEN: CONTENT swaps from the library to its drill. (The library read refreshes on the
  // user bus in production, which a CT does not run, so this pins the selection rather than the refetch.)
  await expect(content(workspace).getByRole("button", { name: "Back to Labels" })).toBeVisible();
  await expect(content(workspace).getByRole("heading", { name: "Labels", level: 2 })).toHaveCount(0);
});

// LABELS RESTORATION (D271): Back from the editor returns to the library with the finder exactly as the reader
// left it — the filter, the sort — and releases the open tag.
test("Back from the editor keeps the finder's filter and sort, and releases the open tag", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<LabelsWorkspaceStory />);
  await finder(workspace).getByRole("textbox", { name: "Filter labels" }).fill("e");
  await finder(workspace).getByRole("combobox", { name: "Sort labels" }).click();
  await page.getByRole("option", { name: "A–Z" }).click();
  await expect(rowTitles(workspace)).toHaveText(["adventure", "zeal"]);

  await finder(workspace).getByRole("button", { name: "adventure", exact: true }).click();
  const editor = content(workspace).locator('[data-slot="tag-member-editor"]');
  await expect(editor.getByRole("heading", { name: "adventure" })).toBeVisible();
  // The CONTEXT tab follows the open tag: its reach by kind and its origin.
  const context = workspace.locator('[data-slot="ct-labels-context"]');
  await expect(context.locator('[data-slot="label-reach"]')).toContainText("Characters5");
  await expect(context.locator('[data-slot="label-reach"]')).toContainText("You created it");

  await editor.getByRole("button", { name: "Back to Labels" }).click();
  await expect(content(workspace).getByRole("heading", { name: "Labels", level: 2 })).toBeVisible();
  await expect(content(workspace).locator('[data-slot="tag-member-editor"]')).toHaveCount(0);
  await expect(finder(workspace).getByRole("textbox", { name: "Filter labels" })).toHaveValue("e");
  await expect(finder(workspace).getByRole("combobox", { name: "Sort labels" })).toContainText("A–Z");
  await expect(rowTitles(workspace)).toHaveText(["adventure", "zeal"]);
  // With nothing open, CONTEXT explains labels against generated facets.
  await expect(context.locator('[data-slot="labels-meaning"]')).toContainText("generated facets");
});

// AN EMPTY LIBRARY TEACHES IN BOTH PANES WITH ONE VERB: the band's `New tag` is the only create control on
// the workspace, the ruled count the Configuration host held (side-eye 2026-08-08 P2).
test("an empty library says so in the finder and on the landing, with exactly ONE New tag", async ({ mount, page }) => {
  await stub(page, []);
  const workspace = await mount(<LabelsWorkspaceStory />);
  await expect(finder(workspace).locator('[data-slot="labels-finder-empty"]')).toContainText("No tags yet");
  await expect(content(workspace).getByText("No tags yet", { exact: false })).toBeVisible();
  await expect(workspace.getByRole("button", { name: "New tag" })).toHaveCount(1);
});
