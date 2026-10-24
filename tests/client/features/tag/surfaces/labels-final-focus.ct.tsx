// A Labels prune or delete removes the control that opened its confirm, so the close must land on the finder root.
import type { TrpcWireOutput } from "@orb/testkit/ct";
import { routeTrpc } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import type { LabelsListStory } from "./_labels-list-stories.tsx";

const STORY = "tests/client/features/tag/surfaces/_labels-list-stories/LabelsListStory";
const UNUSED = "Unattached label";

test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

interface LabelStates {
  readonly before: TrpcWireOutput<"tag.listTagsWithUsage">;
  readonly after: TrpcWireOutput<"tag.listTagsWithUsage">;
  readonly viewer: TrpcWireOutput<"sessions.me">;
  readonly settings: TrpcWireOutput<"settings.getUserSettings">;
  readonly pruned: TrpcWireOutput<"tag.pruneUnusedTags"> | null;
}

/** Server-produced tag reads either side of one mutation, so each responder answers what production would. */
async function labelStates(mutate: "prune" | "delete"): Promise<LabelStates> {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const created = await caller.tag.createTag({ input: { name: UNUSED } });
  const before = await caller.tag.listTagsWithUsage();
  const viewer = await caller.sessions.me();
  const settings = await caller.settings.getUserSettings();
  if (mutate === "prune") {
    const pruned = await caller.tag.pruneUnusedTags();
    return { before, after: await caller.tag.listTagsWithUsage(), viewer, settings, pruned };
  }
  await caller.tag.removeTag({ tagId: created.id });
  return { before, after: await caller.tag.listTagsWithUsage(), viewer, settings, pruned: null };
}

/** The corpus library is windowed, so the finder's own filter brings the new label's row into the tree. */
async function showUnused(page: Page): Promise<Locator> {
  await page.getByRole("textbox", { name: "Filter tags", exact: true }).fill(UNUSED);
  const row = page.getByRole("button", { name: UNUSED, exact: true });
  await expect(row).toBeVisible();
  return row;
}

/** Both pointer kinds: Base UI resolves a close's focus return per interaction type. */
const POINTERS = ["mouse", "touch"] as const;

function press(target: Locator, pointer: (typeof POINTERS)[number]): Promise<void> {
  return pointer === "touch" ? target.tap() : target.click();
}

for (const pointer of POINTERS) {
  test(`a prune confirm closes onto the finder root, not the overflow trigger that opened it (${pointer})`, async ({ mount, page }) => {
    const state = await labelStates("prune");
    if (state.pruned === null) {
      throw new Error("the prune arm produced no prune result");
    }
    const { pruned } = state;
    let done = false;
    await routeTrpc(page, {
      "sessions.me": () => state.viewer,
      "settings.getUserSettings": () => state.settings,
      "tag.listTagsWithUsage": () => (done ? state.after : state.before),
      "tag.pruneUnusedTags": () => {
        done = true;
        return pruned;
      },
    });
    await mount<typeof LabelsListStory>(STORY, {});
    const overflow = page.getByRole("button", { name: "More tag actions", exact: true });
    await expect(page.getByRole("list", { name: "Tags", exact: true })).toBeVisible();

    await press(overflow, pointer);
    await press(page.getByRole("menuitem", { name: "Prune unused tags" }), pointer);
    const confirm = page.getByRole("alertdialog");
    await press(confirm.getByRole("button", { name: /^Delete/u }), pointer);
    // The rows refresh from the user bus, which no component mount carries; the focus handoff is the subject.
    await expect(confirm).toHaveCount(0);
    await expect(page.locator('[data-slot="labels-finder"]')).toBeFocused();
  });

  test(`a row delete confirm closes onto the finder root, not the row's own actions (${pointer})`, async ({ mount, page }) => {
    const state = await labelStates("delete");
    let done = false;
    await routeTrpc(page, {
      "sessions.me": () => state.viewer,
      "settings.getUserSettings": () => state.settings,
      "tag.listTagsWithUsage": () => (done ? state.after : state.before),
      "tag.removeTag": () => {
        done = true;
        // A removal answers nothing on the wire.
        return null;
      },
    });
    await mount<typeof LabelsListStory>(STORY, {});
    await showUnused(page);

    await press(page.getByRole("button", { name: `Actions for ${UNUSED}`, exact: true }), pointer);
    await press(page.getByRole("menuitem", { name: "Delete" }), pointer);
    const confirm = page.getByRole("alertdialog");
    await press(confirm.getByRole("button", { name: "Delete", exact: true }), pointer);
    await expect(confirm).toHaveCount(0);
    await expect(page.locator('[data-slot="labels-finder"]')).toBeFocused();
  });
}
