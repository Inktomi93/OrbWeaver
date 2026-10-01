import type { TagTargetType } from "@orb/contracts/tag";
// CT: the Corpus Labels mode (D271) — the tag library's ONE home. Mounted through the mode contribution the
// door hands the Corpus section, so every pin runs on production wiring: the finder (filter · sort · overflow
// over the rows), the band's one primary verb, the library landing, the autosaving editor, and the CONTEXT tab.
//
// The finder's controls moved here from the Configuration host with the tag library; the rows' half of each
// ruling stays pinned in `tests/client/features/tag/components/tag-collection-rows.ct.tsx`.

import { rowActionsName } from "@orb/client/lib";
import type { CharacterId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
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
const CREATED = tagRow("tag_created", "New label 2", 0);

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

test("the finder reads filter · sort · overflow, the band carries New label, and CONTENT states the library", async ({ mount, page }) => {
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
  await expect(band.getByRole("button", { name: "New label" })).toBeVisible();
  await expect(band).toContainText("Labels");
  await expect(band).toContainText("3");

  // CONTENT states what no row can: orphans, with the verb that clears them, and the taxonomy's reach by kind.
  await expect(content(workspace).getByRole("heading", { name: "Labels", level: 2 })).toBeVisible();
  const facts = content(workspace).locator('[data-slot="labels-library-facts"]');
  await expect(facts).toContainText("Unattached1 of 3");
  await expect(facts).toContainText("Labels on characters2");
  await expect(facts).toContainText("Labels on chats2");
  // The orphan fact's door acts on EVERY orphan, not the first one: it opens the prune confirm.
  await test.info().attach("0314-labels", { body: await workspace.screenshot(), contentType: "image/png" });
  await workspace.evaluate((element) => {
    element.setAttribute("data-theme", "light");
    (element as HTMLElement).style.backgroundColor = "var(--color-background)";
    (element as HTMLElement).style.color = "var(--color-foreground)";
  });
  await test.info().attach("0314-labels-light", { body: await workspace.screenshot(), contentType: "image/png" });
  await facts.getByRole("button", { name: "Prune 1 unused" }).click();
  await expect(page.getByRole("heading", { name: "Delete 1 unused label?" })).toBeVisible();
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
  await expect(manual).toHaveAccessibleDescription("Drag to reorder is off above 30 labels.");
  await expect(page.getByRole("option", { name: "A–Z" })).not.toHaveAttribute("data-disabled", "");
});

test("the overflow carries Prune unused labels, and the item alone deletes nothing", async ({ mount, page }) => {
  const trpc = await stub(page);
  const workspace = await mount(<LabelsWorkspaceStory />);
  await finder(workspace).getByRole("button", { name: "More label actions" }).click();
  await page.getByRole("menuitem", { name: "Prune unused labels" }).click();

  // The item only OPENS the rows' confirm; the count and the cascade are the rows' knowledge.
  await expect(page.getByRole("heading", { name: "Delete 1 unused label?" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect.poll(() => trpc.count("tag.pruneUnusedTags"), { intervals: [20, 50, 100] }).toBe(0);
});

// A second create must not collide with the first: the default name is unique in the library, and the Name
// field takes focus so the reader can type the real one at once.
test("New label creates a uniquely named tag and focuses its Name field", async ({ mount, page }) => {
  const trpc = await stub(page, [...FEW_TAGS, tagRow("tag_first_new", "New label", 0), CREATED]);
  const workspace = await mount(<LabelsWorkspaceStory />);
  await workspace.locator('[data-slot="ct-labels-band"]').getByRole("button", { name: "New label" }).click();

  await expect.poll(() => trpc.lastInput("tag.createTag"), { intervals: [20, 50, 100] }).toEqual({ input: { name: "New label 3" } });
  const editor = content(workspace).locator('[data-slot="tag-member-editor"]');
  await expect(editor.getByRole("heading", { name: "New label 2" })).toBeVisible();
  const name = editor.getByRole("textbox", { name: "Name" });
  await expect(name).toBeFocused();
  // The placeholder name is selected, so the first keystroke replaces it.
  await expect
    .poll(() => name.evaluate((el) => el instanceof HTMLInputElement && el.selectionStart === 0 && el.selectionEnd === el.value.length && el.value.length > 0))
    .toBe(true);
});

// The server's name index is case-folded (`lower(name)`), so `new label` already takes `New label`.
test("New label skips a name the library holds in another casing", async ({ mount, page }) => {
  const trpc = await stub(page, [...FEW_TAGS, tagRow("tag_lower_new", "new label", 0)]);
  const workspace = await mount(<LabelsWorkspaceStory />);
  await workspace.locator('[data-slot="ct-labels-band"]').getByRole("button", { name: "New label" }).click();
  await expect.poll(() => trpc.lastInput("tag.createTag"), { intervals: [20, 50, 100] }).toEqual({ input: { name: "New label 2" } });
});

// The rows learn a new name only on the bus refetch, so a second click during the create would offer the
// same name again: the door holds shut until the create settles.
test("a double click on New label creates once", async ({ mount, page }) => {
  const hold = trpcHold();
  const { usage: _usage, pendingSuggestions: _pending, ...created } = CREATED;
  const trpc = await routeTrpc(page, {
    "tag.listTagsWithUsage": () => [...FEW_TAGS, CREATED],
    "tag.createTag": hold,
    "tag.listPendingSuggestions": [],
    "tag.listAttachedEntities": { entities: [], hasMore: false },
  });
  const workspace = await mount(<LabelsWorkspaceStory />);
  await workspace.locator('[data-slot="ct-labels-band"]').getByRole("button", { name: "New label" }).dblclick();
  await hold.requested;
  hold.release(created);
  await expect(content(workspace).locator('[data-slot="tag-member-editor"]').getByRole("heading", { name: "New label 2" })).toBeVisible();
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
  await workspace.locator('[data-slot="ct-labels-band"]').getByRole("button", { name: "New label" }).click();
  await expect(content(workspace).locator('[data-slot="tag-member-editor"]').getByRole("heading", { name: "New label 2" })).toBeVisible();
  await expect.poll(() => trpc.inputs("tag.createTag")).toEqual([{ input: { name: "New label" } }, { input: { name: "New label 3" } }]);
});

// A merge closes the editor; focus lands on the library, never on <body>.
test("merging a tag returns focus to the library landing", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<LabelsWorkspaceStory />);
  await finder(workspace).getByRole("button", { name: "orphan", exact: true }).click();
  const editor = content(workspace).locator('[data-slot="tag-member-editor"]');
  await editor.getByRole("button", { name: "Merge into…" }).click();
  await page.getByRole("combobox", { name: "Merge target label" }).click();
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

// AN EMPTY LIBRARY TEACHES IN BOTH PANES WITH ONE VERB: the band's `New label` is the only create control on
// the workspace, the ruled count the Configuration host held (side-eye 2026-08-08 P2).
test("an empty library says so in the finder and on the landing, with exactly ONE New label", async ({ mount, page }) => {
  await stub(page, []);
  const workspace = await mount(<LabelsWorkspaceStory />);
  await expect(finder(workspace).locator('[data-slot="labels-finder-empty"]')).toContainText("No labels yet");
  await expect(content(workspace).getByText("Create a label with New label", { exact: false })).toBeVisible();
  await expect(workspace.getByRole("button", { name: "New label" })).toHaveCount(1);
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
  const suggestionFor = (row: TagWithUsage, characterId: CharacterId, characterName: string): TrpcWireOutput<"tag.listPendingSuggestions">[number] => {
    const { usage: _usage, pendingSuggestions: _pending, ...view } = row;
    return { ...view, characterId, characterName };
  };
  const stagedCharacterId = mintTypeId(ID_PREFIX.character);
  let suggestions = [suggestionFor(staged, stagedCharacterId, "Aria"), suggestionFor(rejected, mintTypeId(ID_PREFIX.character), "Bolt")];
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
    .toEqual({ tagId: "tag_staged", targetType: "character", targetId: stagedCharacterId, status: "accepted" });
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

test("rapid creates reserve settled names before the library refresh", async ({ mount, page }) => {
  const names: string[] = [];
  await routeTrpc(page, {
    "tag.listTagsWithUsage": FEW_TAGS,
    "tag.listPendingSuggestions": [],
    "tag.createTag": (input) => {
      names.push(input.input.name);
      const { usage: _usage, pendingSuggestions: _pending, ...created } = tagRow(mintTypeId(ID_PREFIX.tag), input.input.name, 0);
      return created;
    },
  });
  const workspace = await mount(<LabelsWorkspaceStory />);
  const create = workspace.getByRole("button", { name: "New label", exact: true });
  for (let index = 0; index < 3; index += 1) {
    await create.click();
    await expect.poll(() => names.length).toBe(index + 1);
    await expect(create).toBeEnabled();
  }
  expect(names).toEqual(["New label", "New label 2", "New label 3"]);
});

test("a stale label filter has a clear door", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<LabelsWorkspaceStory />);
  await finder(workspace).getByRole("textbox", { name: "Filter labels" }).fill("merged-away");
  await expect(finder(workspace).getByRole("status")).toContainText("No labels match");
  await finder(workspace).getByRole("button", { name: "Clear filter", exact: true }).click();
  await expect(rowTitles(workspace)).toHaveText(["zeal", "adventure", "orphan"]);
  await expect(finder(workspace).getByRole("textbox", { name: "Filter labels" })).toBeFocused();
});

test("prune names the exact unused labels and excludes pending suggestions", async ({ mount, page }) => {
  await stub(page, [...FEW_TAGS, { ...tagRow(mintTypeId(ID_PREFIX.tag), "pending", 0), pendingSuggestions: 1 }]);
  const workspace = await mount(<LabelsWorkspaceStory />);
  await content(workspace).getByRole("button", { name: "Prune 1 unused" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByRole("listitem")).toHaveText(["orphan"]);
  await expect(dialog).not.toContainText("pending");
  await test.info().attach("0314-named-prune", { body: await page.screenshot(), contentType: "image/png" });
  await test.info().attach("0314-named-prune-aria", { body: Buffer.from(await dialog.ariaSnapshot()), contentType: "text/plain" });
});

test("a delete decision survives a bus refresh before its response and does not poison the next Cancel", async ({ mount, page }) => {
  const hold = trpcHold();
  let rows = FEW_TAGS;
  await routeTrpc(page, {
    "tag.listTagsWithUsage": () => rows,
    "tag.listPendingSuggestions": [],
    "tag.removeTag": hold,
  });
  const workspace = await mount(<LabelsWorkspaceStory />);
  const orphan = finder(workspace).locator('[data-slot="list-row-root"]', { hasText: "orphan" });
  await orphan.hover();
  await orphan.getByRole("button", { name: rowActionsName("orphan"), exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).click();
  await hold.requested;
  rows = FEW_TAGS.filter((row) => row.name !== "orphan");
  await workspace.getByRole("button", { name: "deliver tag change", includeHidden: true }).evaluate((button) => (button as HTMLButtonElement).click());
  await expect(orphan).toHaveCount(0);
  await expect(page.getByRole("alertdialog")).toBeVisible();
  hold.release(null);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(finder(workspace).locator('[data-slot="labels-finder"]')).toBeFocused();
  const adventure = finder(workspace).locator('[data-slot="list-row-root"]', { hasText: "adventure" });
  await adventure.hover();
  const opener = adventure.getByRole("button", { name: rowActionsName("adventure"), exact: true });
  await opener.click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("a failed delete stays as one retryable decision and keeps the selected editor", async ({ mount, page }) => {
  await routeTrpc(page, {
    "tag.listTagsWithUsage": FEW_TAGS,
    "tag.listPendingSuggestions": [],
    "tag.listAttachedEntities": { entities: [], hasMore: false },
    "tag.removeTag": () => trpcError({ message: "delete failed" }),
  });
  const workspace = await mount(<LabelsWorkspaceStory />);
  await finder(workspace).getByRole("button", { name: "orphan", exact: true }).click();
  await finder(workspace).locator('[data-slot="list-row-root"]', { hasText: "orphan" }).hover();
  await finder(workspace)
    .getByRole("button", { name: rowActionsName("orphan"), exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("alertdialog").getByRole("alert")).toContainText("delete failed");
  await expect(page.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true })).toBeEnabled();
  await expect(content(workspace).locator('[data-slot="tag-member-editor"]')).toBeAttached();
  await expect(page.getByText("Couldn't delete the label.", { exact: true })).toHaveCount(0);
});

for (const kind of ["delete", "prune"] as const) {
  for (const outcome of ["success", "failure"] as const) {
    test(`${kind}: an abandoned pending ${outcome} cannot settle a later decision`, async ({ mount, page }) => {
      const hold = trpcHold();
      await routeTrpc(page, {
        "tag.listTagsWithUsage": FEW_TAGS,
        "tag.listPendingSuggestions": [],
        "tag.removeTag": hold,
        "tag.pruneUnusedTags": hold,
      });
      const workspace = await mount(<LabelsWorkspaceStory />);
      const open = async (name: string): Promise<void> => {
        if (kind === "prune") {
          await content(workspace).getByRole("button", { name: "Prune 1 unused", exact: true }).click();
          return;
        }
        const row = finder(workspace).locator('[data-slot="list-row-root"]', { hasText: name });
        await row.hover();
        await row.getByRole("button", { name: rowActionsName(name), exact: true }).click();
        await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
      };
      await open("orphan");
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: kind === "prune" ? "Delete it" : "Delete", exact: true })
        .click();
      await hold.requested;
      const pending = workspace.getByRole("status", { name: "Label mutations in flight", exact: true, includeHidden: true });
      await expect(pending).toHaveText("1");
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(page.getByRole("alertdialog")).toHaveCount(0);
      await open("adventure");
      const heading = page
        .getByRole("alertdialog")
        .getByRole("heading", { name: kind === "prune" ? "Delete 1 unused label?" : 'Delete "adventure"?', exact: true });
      await expect(heading).toBeVisible();
      const success = kind === "prune" ? { removed: 1 } : null;
      hold.release(outcome === "failure" ? trpcError({ message: "earlier decision failed" }) : success);
      await expect(pending).toHaveText("0");
      await expect(heading).toBeVisible();
      await expect(page.getByRole("alertdialog").getByRole("alert")).toHaveCount(0);
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(page.getByRole("alertdialog")).toHaveCount(0);
    });
  }
}
