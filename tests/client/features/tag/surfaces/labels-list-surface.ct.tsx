import type { TagTargetType } from "@orb/contracts/tag";
// CT: the Corpus Labels mode (D271) — the tag library's ONE home. Mounted through the mode contribution the
// door hands the Corpus section, so every pin runs on production wiring: the finder (filter · sort · overflow
// over the rows), the band's one primary verb, the library landing, the autosaving editor, and the CONTEXT tab.
//
// The finder's controls moved here from the Configuration host with the tag library; the rows' half of each
// ruling stays pinned in `tests/client/features/tag/components/tag-collection-rows.ct.tsx`.

import { rowActionsName } from "@orb/client/lib";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import type { TrpcRecorder, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc, trpcError, trpcHold } from "../../../../support/node/route-trpc.ts";
import { LabelsWorkspaceStory } from "../_ct-stories.tsx";

type TagWithUsage = TrpcWireOutput<"tag.listTagsWithUsage">[number];

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
    pendingSuggestions: 0,
    usage: { characters, chats, worldBooks: 0, personas: 0, presets: 0, total: characters + chats },
  };
}

/** Three tags, one unused — enough to sort by two axes and to count a prune. */
const FEW_TAGS = [tagRow("tag_zeal", "zeal", 9, 3), tagRow("tag_adventure", "adventure", 5, 2), tagRow("tag_orphan", "orphan", 0)];

/** One more than the windowing cap (30) disables drag; the count is stated here, never imported. */
const MANY_TAGS = Array.from({ length: 60 }, (_unused, index) =>
  tagRow(`tag_${String(index).padStart(3, "0")}`, `tag-${String(index).padStart(3, "0")}`, 60 - index),
);

/** The tag the create verb answers with. The library read already lists it, because a CT runs no user bus to
 *  refresh the read after a create. */
const CREATED = tagRow("tag_created", "New tag 2", 0);

function stub(page: Page, tags: readonly TagWithUsage[] = FEW_TAGS): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "tag.listTagsWithUsage": () => tags,
    "tag.listPendingSuggestions": [],
    "tag.listAttachedEntities": { entities: [], hasMore: false },
    "tag.pruneUnusedTags": () => ({ removed: 1 }),
    "tag.setTagOrder": () => undefined,
    "tag.mergeTags": () => null,
    "tag.removeTag": () => null,
    "tag.createTag": () => {
      const { usage: _usage, pendingSuggestions: _pending, ...view } = CREATED;
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

  // CONTENT states what no row can: orphans, with the verb that clears them, and the taxonomy's reach by kind.
  await expect(content(workspace).getByRole("heading", { name: "Labels", level: 2 })).toBeVisible();
  const facts = content(workspace).locator('[data-slot="labels-library-facts"]');
  await expect(facts).toContainText("Unattached1 of 3");
  await expect(facts).toContainText("Tags on characters2");
  await expect(facts).toContainText("Tags on chats2");
  // The orphan fact's door acts on EVERY orphan, not the first one: it opens the prune confirm.
  await facts.getByRole("button", { name: "Prune 1 unused" }).click();
  await expect(page.getByRole("heading", { name: "Delete 1 unused tag?" })).toBeVisible();
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

// A second create must not collide with the first: the default name is unique in the library, and the Name
// field takes focus so the reader can type the real one at once.
test("New tag creates a uniquely named tag and focuses its Name field", async ({ mount, page }) => {
  const trpc = await stub(page, [...FEW_TAGS, tagRow("tag_first_new", "New tag", 0), CREATED]);
  const workspace = await mount(<LabelsWorkspaceStory />);
  await workspace.locator('[data-slot="ct-labels-band"]').getByRole("button", { name: "New tag" }).click();

  await expect.poll(() => trpc.lastInput("tag.createTag"), { intervals: [20, 50, 100] }).toEqual({ input: { name: "New tag 3" } });
  const editor = content(workspace).locator('[data-slot="tag-member-editor"]');
  await expect(editor.getByRole("heading", { name: "New tag 2" })).toBeVisible();
  const name = editor.getByRole("textbox", { name: "Name" });
  await expect(name).toBeFocused();
  // The placeholder name is selected, so the first keystroke replaces it.
  await expect
    .poll(() => name.evaluate((el) => el instanceof HTMLInputElement && el.selectionStart === 0 && el.selectionEnd === el.value.length && el.value.length > 0))
    .toBe(true);
});

// The server's name index is case-folded (`lower(name)`), so `new tag` already takes `New tag`.
test("New tag skips a name the library holds in another casing", async ({ mount, page }) => {
  const trpc = await stub(page, [...FEW_TAGS, tagRow("tag_lower_new", "new tag", 0)]);
  const workspace = await mount(<LabelsWorkspaceStory />);
  await workspace.locator('[data-slot="ct-labels-band"]').getByRole("button", { name: "New tag" }).click();
  await expect.poll(() => trpc.lastInput("tag.createTag"), { intervals: [20, 50, 100] }).toEqual({ input: { name: "New tag 2" } });
});

// The rows learn a new name only on the bus refetch, so a second click during the create would offer the
// same name again: the door holds shut until the create settles.
test("a double click on New tag creates once", async ({ mount, page }) => {
  const hold = trpcHold();
  const { usage: _usage, pendingSuggestions: _pending, ...created } = CREATED;
  const trpc = await routeTrpc(page, {
    "tag.listTagsWithUsage": () => [...FEW_TAGS, CREATED],
    "tag.createTag": hold,
    "tag.listPendingSuggestions": [],
    "tag.listAttachedEntities": { entities: [], hasMore: false },
  });
  const workspace = await mount(<LabelsWorkspaceStory />);
  await workspace.locator('[data-slot="ct-labels-band"]').getByRole("button", { name: "New tag" }).dblclick();
  await hold.requested;
  hold.release(created);
  await expect(content(workspace).locator('[data-slot="tag-member-editor"]').getByRole("heading", { name: "New tag 2" })).toBeVisible();
  await expect.poll(() => trpc.count("tag.createTag")).toBe(1);
});

// A conflict the cached rows could not predict (another tab, a stale read) retries once with the next name.
test("a create the name index refuses retries once with the next free name", async ({ mount, page }) => {
  const { usage: _usage, pendingSuggestions: _pending, ...created } = CREATED;
  let calls = 0;
  const trpc = await routeTrpc(page, {
    "tag.listTagsWithUsage": () => [...FEW_TAGS, CREATED],
    "tag.listPendingSuggestions": [],
    "tag.listAttachedEntities": { entities: [], hasMore: false },
    "tag.createTag": () => {
      calls += 1;
      return calls === 1 ? trpcError({ code: "CONFLICT" }) : created;
    },
  });
  const workspace = await mount(<LabelsWorkspaceStory />);
  await workspace.locator('[data-slot="ct-labels-band"]').getByRole("button", { name: "New tag" }).click();
  await expect(content(workspace).locator('[data-slot="tag-member-editor"]').getByRole("heading", { name: "New tag 2" })).toBeVisible();
  await expect.poll(() => trpc.inputs("tag.createTag")).toEqual([{ input: { name: "New tag" } }, { input: { name: "New tag 3" } }]);
});

// A merge closes the editor; focus lands on the library, never on <body>.
test("merging a tag returns focus to the library landing", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<LabelsWorkspaceStory />);
  await finder(workspace).getByRole("button", { name: "orphan", exact: true }).click();
  const editor = content(workspace).locator('[data-slot="tag-member-editor"]');
  await editor.getByRole("button", { name: "Merge into…" }).click();
  await page.getByRole("combobox", { name: "Merge target tag" }).click();
  await page.getByRole("option", { name: "zeal" }).click();
  await page.getByRole("button", { name: "Merge", exact: true }).click();

  await expect(content(workspace).locator('[data-slot="labels-library"]')).toBeFocused();
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

async function deleteRow(page: Page, workspace: Locator, name: string): Promise<void> {
  await finder(workspace).locator('[data-slot="list-row-root"]', { hasText: name }).hover();
  await finder(workspace)
    .getByRole("button", { name: rowActionsName(name), exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
}

// A delete removes the kebab that opened its confirm, so the confirm names where focus lands instead.
test("deleting the open tag lands focus on the library", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<LabelsWorkspaceStory />);
  await finder(workspace).getByRole("button", { name: "orphan", exact: true }).click();
  await expect(content(workspace).locator('[data-slot="tag-member-editor"]')).toBeVisible();
  await deleteRow(page, workspace, "orphan");
  await expect(content(workspace).locator('[data-slot="labels-library"]')).toBeFocused();
});

test("deleting a row that is not open lands focus on its finder", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<LabelsWorkspaceStory />);
  await deleteRow(page, workspace, "orphan");
  await expect(finder(workspace).locator('[data-slot="labels-finder"]')).toBeFocused();
});

// At zero unused the fact's Prune button leaves the tree, so the confirm lands focus on the library.
test("a prune lands focus on the library", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<LabelsWorkspaceStory />);
  await content(workspace).getByRole("button", { name: "Prune 1 unused" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete it", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(content(workspace).locator('[data-slot="labels-library"]')).toBeFocused();
});

test("pending-only labels stay outside In use and prune until Apply; Reject removes the staged junction", async ({ mount, page }) => {
  const staged = { ...tagRow("tag_staged", "staged", 0), pendingSuggestions: 1 };
  const rejected = { ...tagRow("tag_rejected", "rejected", 0), pendingSuggestions: 1 };
  let rows = [staged, rejected];
  const failures = [trpcError({ code: "INTERNAL_SERVER_ERROR", message: "Scripted failure" })];
  const suggestionFor = (row: TagWithUsage, characterId: string, characterName: string): TrpcWireOutput<"tag.listPendingSuggestions">[number] => {
    const { usage: _usage, pendingSuggestions: _pending, ...view } = row;
    return { ...view, characterId, characterName };
  };
  let suggestions = [suggestionFor(staged, "character_staged", "Aria"), suggestionFor(rejected, "character_rejected", "Bolt")];
  const recorder = await routeTrpc(page, {
    "tag.listTagsWithUsage": () => rows,
    "tag.listAttachedEntities": { entities: [], hasMore: false },
    "tag.listPendingSuggestions": () => suggestions,
    "tag.attachTag": (input) => {
      const failure = failures.shift();
      if (failure !== undefined) {
        return failure;
      }
      rows = rows.map((row) => (row.id === input.tagId ? { ...row, pendingSuggestions: 0, usage: { ...row.usage, characters: 1, total: 1 } } : row));
      suggestions = suggestions.filter((row) => row.id !== input.tagId);
      return null;
    },
    "tag.detachTag": (input) => {
      rows = rows.map((row) => (row.id === input.tagId ? { ...row, pendingSuggestions: 0 } : row));
      suggestions = suggestions.filter((row) => row.id !== input.tagId);
      return null;
    },
  });
  const workspace = await mount(<LabelsWorkspaceStory />);
  const facts = content(workspace).locator('[data-slot="labels-library-facts"]');
  await expect(facts).toContainText("In use0");
  await expect(finder(workspace).getByText("Suggested for 1 character", { exact: true })).toHaveCount(2);
  await expect(facts.getByRole("button", { name: /Prune/u })).toHaveCount(0);
  await expect(content(workspace).getByRole("group", { name: "Suggested staged for Aria" })).toBeVisible();
  const apply = content(workspace).getByRole("group", { name: "Suggested staged for Aria" }).getByRole("button", { name: "Apply", exact: true });
  await apply.focus();
  await apply.press("Enter");
  await expect.poll(() => recorder.count("tag.attachTag")).toBe(1);
  await expect(apply).toBeEnabled();
  await expect(apply).toBeFocused();
  await workspace.getByRole("button", { name: "deliver tag change" }).evaluate((button) => (button as HTMLButtonElement).click());
  await expect(apply).toBeFocused();
  await apply.press("Enter");
  await expect.poll(() => recorder.count("tag.attachTag")).toBe(2);
  await expect
    .poll(() => recorder.lastInput("tag.attachTag"))
    .toEqual({ tagId: "tag_staged", targetType: "character", targetId: "character_staged", status: "accepted" });
  await workspace.getByRole("button", { name: "deliver tag change" }).evaluate((button) => (button as HTMLButtonElement).click());
  await expect(facts).toContainText("In use1");
  await expect(content(workspace).getByRole("group", { name: "Suggested staged for Aria" })).toHaveCount(0);
  const remaining = content(workspace).getByRole("group", { name: "Suggested rejected for Bolt" });
  await expect(remaining.getByRole("button", { name: "Apply", exact: true })).toBeFocused();
  const reject = remaining.getByRole("button", { name: "Reject", exact: true });
  await reject.focus();
  await reject.press("Enter");
  await expect.poll(() => recorder.count("tag.detachTag")).toBe(1);
  await workspace.getByRole("button", { name: "deliver tag change" }).evaluate((button) => (button as HTMLButtonElement).click());
  await expect(content(workspace).getByRole("status")).toHaveText("No suggested labels awaiting review.");
  await expect(content(workspace).getByRole("status")).toBeFocused();
  await expect(facts.getByRole("button", { name: "Prune 1 unused" })).toBeVisible();
  expect(recorder.unstubbed()).toEqual([]);
});

const ATTACHED_DESTINATIONS = {
  character: { targetType: "character", targetId: "character_owned", name: "Owned character" },
  chat: { targetType: "chat", targetId: "chat_owned", name: "Owned chat" },
  worldBook: { targetType: "worldBook", targetId: "world_book_owned", name: "Owned book" },
  persona: { targetType: "persona", targetId: "persona_owned", name: "Owned persona" },
  preset: { targetType: "preset", targetId: "preset_owned", name: "Owned preset" },
} as const satisfies Record<TagTargetType, TrpcWireOutput<"tag.listAttachedEntities">["entities"][number]>;
const DESTINATION_SECTIONS: Record<TagTargetType, string> = {
  character: "characters",
  chat: "chats",
  worldBook: "config",
  persona: "config",
  preset: "presets",
};
for (const kind of Object.keys(ATTACHED_DESTINATIONS) as TagTargetType[]) {
  test(`Reach opens the attached ${kind} through its canonical selection`, async ({ mount, page }) => {
    await routeTrpc(page, {
      "tag.listTagsWithUsage": FEW_TAGS,
      "tag.listPendingSuggestions": [],
      "tag.listAttachedEntities": (input) => ({ entities: [ATTACHED_DESTINATIONS[input.targetType]], hasMore: false }),
    });
    const workspace = await mount(<LabelsWorkspaceStory />);
    await finder(workspace).getByRole("button", { name: "adventure", exact: true }).click();
    const destination = ATTACHED_DESTINATIONS[kind];
    await workspace.locator('[data-slot="label-reach"]').getByRole("button", { name: destination.name, exact: true }).click();
    await expect(workspace.getByRole("status", { name: "Attachment destination" })).toHaveText(`${DESTINATION_SECTIONS[kind]}:${destination.targetId}`);
  });
}
