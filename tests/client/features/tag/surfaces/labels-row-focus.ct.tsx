// The Labels finder keeps a focused row and hands focus back to it, in every reading order. A focused row keeps focus when
// a tag made elsewhere takes the library past the drag cap: in a derived order the rows were always in the window, and in
// manual order the drag list gives way to the window, so the row must re-attach focused in the new container. Back from a
// tag lands on the finder row it was opened from, past the first window and in manual order; when the tag was deleted
// elsewhere while open, focus lands on the finder's list, never the page; when the shell has collapsed the finder's pane, the
// finder cannot take focus and the library landing takes it. The finder and the content are the production corpus-mode panes
// with the app root's user bus over a corpus root, and the production shell for the collapsed pane; a tag made or deleted
// elsewhere goes through the production verb and reaches the page as the real server's own `tagsChanged` event.
// @subject packages/client/src/features/tag/components/tag-collection-rows.tsx

import type { TagSortMode } from "@orb/client/lib";
import { COLLECTION_LARGE_GROUP, CORPUS_MODE_LABELS, LIST_PANEL_NOUN, panelEdgeName, sectionBackName, tagSortItems } from "@orb/client/lib";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { seedShellState } from "@orb/testkit/browser/spec";
import { routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import { TAG_LIST_NAME, TAG_SORT_NAME } from "#client/features/tag/lib/tag-list-name.ts";
import { forwardUserEvent } from "../../../components/_forward-user-event.ts";
import type { LabelsPanesBusStory } from "./_labels-list-stories.tsx";

const STORY = "tests/client/features/tag/surfaces/_labels-list-stories/LabelsPanesBusStory";
const SHELL_STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const SERVED = [
  "sessions.me",
  "settings.getUserSettings",
  "tag.listTagsWithUsage",
  "tag.listPendingSuggestions",
  "tag.listAttachedEntities",
  "tag.updateTag",
  "tag.setTagOrder",
] as const;
// Enough tags that the last rows start outside the finder's first window.
const LONG_LIBRARY = COLLECTION_LARGE_GROUP + 15;
const BACK_TO_LABELS = sectionBackName(CORPUS_MODE_LABELS.labels);

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;
type Caller = Awaited<ReturnType<Root["internalCallerFor"]>>;

test.use({ viewport: { width: 1440, height: 900 } });

/** Routes the Labels reads to the root, forwards its first `tagsChanged` event, and mounts both panes. */
async function mountLabels(mountStory: () => Promise<unknown>, page: Page, root: Root, cleanup: AsyncDisposableStack): Promise<void> {
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, SERVED),
    "stream.attach": ({ ref }) => (ref.channel === "user" ? null : trpcError({ code: "NOT_FOUND" })),
    "stream.detach": ({ ref }) => (ref.channel === "user" ? null : trpcError({ code: "NOT_FOUND" })),
  });
  await forwardUserEvent(page, root, "tagsChanged", cleanup);
  await mountStory();
}

/** Deletes every tag the corpus holds through the production verb, so a case can size the library around the drag cap. */
async function emptyLibrary(caller: Caller): Promise<void> {
  for (const tag of await caller.tag.listTagsWithUsage()) {
    await caller.tag.removeTag({ tagId: tag.id });
  }
}

/** Fills the library with filler tags until it holds `total`. */
async function fillTo(caller: Caller, total: number): Promise<void> {
  for (let count = (await caller.tag.listTagsWithUsage()).length; count < total; count += 1) {
    await caller.tag.createTag({ input: { name: `Filler ${String(count).padStart(2, "0")}` } });
  }
}

function finder(page: Page): Locator {
  return page.getByRole("list", { name: TAG_LIST_NAME, exact: true });
}

function row(page: Page, name: string): Locator {
  return finder(page).getByRole("button", { name, exact: true });
}

async function chooseOrder(page: Page, mode: TagSortMode): Promise<void> {
  const option = tagSortItems(true, COLLECTION_LARGE_GROUP).find((item) => item.value === mode);
  if (option === undefined) {
    throw new Error(`No sort option for ${mode}`);
  }
  await page.getByRole("combobox", { name: TAG_SORT_NAME, exact: true }).click();
  await page.getByRole("option", { name: option.label }).click();
  await expect(page.getByRole("combobox", { name: TAG_SORT_NAME, exact: true })).toContainText(option.label);
}

async function openAndGoBack(page: Page, target: Locator): Promise<void> {
  await target.focus();
  await page.keyboard.press("Enter");
  const back = page.getByRole("button", { name: BACK_TO_LABELS, exact: true });
  await expect(back).toBeVisible();
  await back.focus();
  await page.keyboard.press("Enter");
  await expect(back).toHaveCount(0);
}

for (const mode of ["alpha", "manual"] as const) {
  test(`a focused finder row keeps focus when a tag made elsewhere takes the library past the drag cap (${mode})`, async ({ mount, page }) => {
    await using root = await createCorpusHarness();
    await using cleanup = new AsyncDisposableStack();
    const caller = await root.internalCallerFor(root.ownerId);
    await emptyLibrary(caller);
    await caller.tag.createTag({ input: { name: "Aa held tag" } });
    await fillTo(caller, COLLECTION_LARGE_GROUP);
    await mountLabels(() => mount<typeof LabelsPanesBusStory>(STORY, {}), page, root, cleanup);
    await chooseOrder(page, mode);
    const held = row(page, "Aa held tag");
    await held.focus();
    await expect(held).toBeFocused();

    await caller.tag.createTag({ input: { name: "Aa arrived elsewhere" } });

    await expect(row(page, "Aa arrived elsewhere")).toHaveCount(1);
    await expect(held).toBeFocused();
  });
}

test("Back from a tag opened past the finder's first window returns focus to its row", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  await using cleanup = new AsyncDisposableStack();
  const caller = await root.internalCallerFor(root.ownerId);
  await fillTo(caller, LONG_LIBRARY - 1);
  await caller.tag.createTag({ input: { name: "Zz last tag" } });
  await mountLabels(() => mount<typeof LabelsPanesBusStory>(STORY, {}), page, root, cleanup);
  await chooseOrder(page, "alpha");
  await expect(row(page, "Zz last tag")).toHaveCount(0);
  await finder(page).evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const target = row(page, "Zz last tag");
  await expect(target).toBeVisible();

  await openAndGoBack(page, target);

  await expect(row(page, "Zz last tag")).toBeFocused();
});

test("Back from a tag opened in manual order returns focus to its row in the drag list", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  await using cleanup = new AsyncDisposableStack();
  const caller = await root.internalCallerFor(root.ownerId);
  await emptyLibrary(caller);
  await caller.tag.createTag({ input: { name: "Manual tag" } });
  await fillTo(caller, 2);
  await mountLabels(() => mount<typeof LabelsPanesBusStory>(STORY, {}), page, root, cleanup);
  await chooseOrder(page, "manual");

  await openAndGoBack(page, row(page, "Manual tag"));

  await expect(row(page, "Manual tag")).toBeFocused();
});

test("Back from a tag deleted elsewhere while it was open lands on the finder's list, not the page", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  await using cleanup = new AsyncDisposableStack();
  const caller = await root.internalCallerFor(root.ownerId);
  const doomed = await caller.tag.createTag({ input: { name: "Doomed tag" } });
  await mountLabels(() => mount<typeof LabelsPanesBusStory>(STORY, {}), page, root, cleanup);
  await row(page, "Doomed tag").focus();
  await page.keyboard.press("Enter");
  const back = page.getByRole("button", { name: BACK_TO_LABELS, exact: true });
  await expect(back).toBeVisible();

  await caller.tag.removeTag({ tagId: doomed.id });
  await expect(row(page, "Doomed tag")).toHaveCount(0);
  await back.focus();
  await page.keyboard.press("Enter");

  // Positive control: the finder still lists rows, so focus on its root is the named fallback, not an empty list.
  await expect(finder(page).getByRole("button").first()).toBeVisible();
  const focused = page.locator(":focus");
  await expect(focused).toHaveCount(1);
  await expect(focused.getByRole("list", { name: TAG_LIST_NAME, exact: true })).toHaveCount(1);
});

test("Back from a tag while the shell has collapsed the finder's pane lands on the library, not the page", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.tag.createTag({ input: { name: "Aa collapsed finder tag" } });
  await routeTrpc(page, serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES, ...SERVED]));
  await seedShellState(page, { activeSection: "corpus" });
  await mount<typeof ShellAmbientStory>(SHELL_STORY, {});
  await page.getByRole("radio", { name: CORPUS_MODE_LABELS.labels, exact: true }).click();
  await chooseOrder(page, "alpha");
  const target = row(page, "Aa collapsed finder tag");
  await target.focus();
  await page.keyboard.press("Enter");
  const back = page.getByRole("button", { name: BACK_TO_LABELS, exact: true });
  await expect(back).toBeVisible();

  await page.getByRole("button", { name: panelEdgeName(LIST_PANEL_NOUN, true), exact: true }).click();
  // Positive control: the shell collapsed the finder's pane, which stays mounted and inert, so its row cannot take focus.
  const pane = page.locator('.shell-panel[data-panel-side="list"]');
  await expect(pane).toHaveAttribute("data-panel-mode", "collapsed");
  await expect(pane.getByRole("button", { name: "Aa collapsed finder tag", exact: true, includeHidden: true })).toHaveCount(1);
  await back.focus();
  await page.keyboard.press("Enter");

  await expect(back).toHaveCount(0);
  // The library landing is the focused box that carries the Labels heading.
  const focused = page.getByRole("main").locator(":focus");
  await expect(focused).toHaveCount(1);
  await expect(focused.getByRole("heading", { level: 2, name: CORPUS_MODE_LABELS.labels, exact: true })).toHaveCount(1);
});
