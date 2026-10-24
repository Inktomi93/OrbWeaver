// The Corpus workbench on the committed corpus: its three modes, focus on each mode's landing, and state restoration
// across the Insights drill and the Labels editor push.
import { CORPUS_MODE_LABELS, CORPUS_WHOLE_LABEL, LEADERBOARD_ROW_ATTR, pruneConfirmLabel, testId } from "@orb/client/lib";
import type { Page } from "@playwright/test";
import { ownerActor } from "./support/actors.ts";
import { waitForAppReady } from "./support/chat-room.ts";
import { expect, test } from "./support/corpus-test.ts";
import { SELECTED_CORPUS_FIXTURE } from "./support/modes.ts";

const CORPUS_LIST = '.shell-panel[data-panel-side="list"]';
const CORPUS_CONTEXT = '.shell-panel[data-panel-side="context"]';
const MAIN = "main.shell-content";

async function openCorpusOnPhone(page: Page): Promise<void> {
  await page.goto("/");
  await waitForAppReady(page);
  await page.getByRole("button", { name: "You", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Corpus", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test.describe("committed corpus workbench", () => {
  test.skip(SELECTED_CORPUS_FIXTURE === undefined, "Requires the committed corpus");

  test("Back from an Insights drill keeps the leaderboard's search and sort", { tag: "@smoke" }, async ({ page, baseURL, isMobile }) => {
    test.skip(isMobile, "The phone lands Insights on its dashboard; the phone drill is its own flow");
    const host = ownerActor(baseURL ?? "");
    const ranked = (await host.trpc.stats.leaderboard.query()).rows[0];
    if (ranked === undefined) {
      throw new Error("Corpus has no ranked character");
    }
    await page.goto("/");
    await waitForAppReady(page);
    await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: "Corpus", exact: true }).click();
    const list = page.locator(CORPUS_LIST);
    await list.getByRole("radio", { name: CORPUS_MODE_LABELS.insights }).click();
    const search = list.getByRole("textbox", { name: "Search characters", exact: true });
    await search.fill(ranked.name.slice(0, 3).toLowerCase());
    const bySwipes = list.getByRole("button", { name: "Sort by Swipes", exact: true });
    await bySwipes.click();
    await expect(bySwipes).toHaveAttribute("aria-pressed", "true");

    // The row is found by its character, because a name two characters share is disambiguated in the row.
    const row = list.locator(`[${LEADERBOARD_ROW_ATTR}="${ranked.characterId}"]`).getByRole("button");
    await row.click();
    const main = page.locator("main.shell-content");
    await expect(main.getByTestId(testId("analyticsCharacterSurface"))).toBeVisible();
    // One Back grammar across the modes: `Back to <mode>`.
    await main.getByRole("button", { name: `Back to ${CORPUS_MODE_LABELS.insights}`, exact: true }).click();

    await expect(main.getByTestId(testId("analyticsOverviewSurface"))).toBeVisible();
    // Focus returns to the row that opened the drill, never to <body>.
    await expect(row).toBeFocused();
    await expect(search).toHaveValue(ranked.name.slice(0, 3).toLowerCase());
    await expect(bySwipes).toHaveAttribute("aria-pressed", "true");
  });

  test("Labels: a tag pushes its editor, and Back restores the finder with its filter", { tag: "@smoke" }, async ({ page, baseURL, isMobile }) => {
    test.skip(!isMobile, "The editor push over the finder is the phone's navigation model");
    const host = ownerActor(baseURL ?? "");
    const tag = (await host.trpc.tag.listTagsWithUsage.query())[0];
    if (tag === undefined) {
      throw new Error("Corpus has no tag");
    }
    const filter = tag.name.slice(0, 1).toLowerCase();
    await openCorpusOnPhone(page);
    const list = page.locator(CORPUS_LIST);
    await list.getByRole("radio", { name: CORPUS_MODE_LABELS.labels }).click();
    const filterBox = list.getByRole("textbox", { name: "Filter tags", exact: true });
    await filterBox.fill(filter);
    await list.getByRole("button", { name: tag.name, exact: true }).click();

    const main = page.locator("main.shell-content");
    await expect(list).toHaveAttribute("data-panel-mode", "collapsed");
    await expect(main.locator('[data-slot="tag-member-editor"]').getByRole("heading", { name: tag.name })).toBeVisible();
    await expect(page.locator(".shell-topbar-title")).toHaveText(tag.name);

    await page.getByRole("button", { name: `Back to ${CORPUS_MODE_LABELS.labels}`, exact: true }).click();
    await expect(list).toHaveAttribute("data-panel-mode", "docked");
    await expect(filterBox).toHaveValue(filter);
    await expect(main.locator('[data-slot="tag-member-editor"]')).toHaveCount(0);
  });

  test("desktop: Corpus holds Explore, Insights and Labels in one workspace, with no Analytics door", { tag: "@smoke" }, async ({ page, isMobile }) => {
    test.skip(isMobile, "The desktop rail and docked panes");
    await page.goto("/");
    await waitForAppReady(page);
    const rail = page.getByRole("navigation", { name: "Primary" });
    await expect(rail.getByRole("button", { name: "Analytics" })).toHaveCount(0);
    await rail.getByRole("button", { name: "Corpus", exact: true }).click();

    const list = page.locator(CORPUS_LIST);
    const modes = list.getByRole("radiogroup", { name: "Corpus mode" });
    const main = page.locator(MAIN);
    const context = page.locator(CORPUS_CONTEXT);
    await expect(modes.getByRole("radio", { name: CORPUS_MODE_LABELS.explore })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("button", { name: "Show details", exact: true }).click();
    await expect(context.getByText(CORPUS_WHOLE_LABEL, { exact: true })).toBeVisible();
    await expect(context.getByRole("tab", { name: "Archetypes", exact: true })).toBeVisible();

    // Insights: the leaderboard is the finder, the dashboard is CONTENT, and its dimension tabs replace Explore's.
    await modes.getByRole("radio", { name: CORPUS_MODE_LABELS.insights }).click();
    await expect(list.getByRole("textbox", { name: "Search characters", exact: true })).toBeVisible();
    await expect(main.getByTestId(testId("analyticsOverviewSurface"))).toBeVisible();
    await expect(context.getByRole("tab", { name: "Models", exact: true })).toBeVisible();
    await expect(context.getByRole("tab", { name: "Archetypes", exact: true })).toHaveCount(0);

    // Labels: the tag library is the finder, its facts are CONTENT, and its one inspector explains labels.
    await modes.getByRole("radio", { name: CORPUS_MODE_LABELS.labels }).click();
    await expect(list.getByRole("textbox", { name: "Filter tags", exact: true })).toBeVisible();
    await expect(main.getByRole("heading", { name: CORPUS_MODE_LABELS.labels, level: 2 })).toBeVisible();
    await expect(context.getByRole("region", { name: "Usage", exact: true })).toBeVisible();
    await expect(context.getByRole("tab", { name: "Models", exact: true })).toHaveCount(0);
  });

  test("desktop: a keyboard mode switch moves focus into the new mode's CONTENT", { tag: "@smoke" }, async ({ page, isMobile }) => {
    test.skip(isMobile, "The desktop mode switch beside CONTENT");
    await page.goto("/");
    await waitForAppReady(page);
    await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: "Corpus", exact: true }).click();
    const insights = page.locator(CORPUS_LIST).getByRole("radio", { name: CORPUS_MODE_LABELS.insights });
    await insights.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId(testId("analyticsOverviewSurface"))).toBeFocused();
  });

  test("phone: Corpus enters through You; Explore and Labels land on their finder, Insights on its dashboard", { tag: "@smoke" }, async ({
    page,
    baseURL,
    isMobile,
  }) => {
    test.skip(!isMobile, "The phone's landing pane per mode");
    const board = await ownerActor(baseURL ?? "").trpc.stats.leaderboard.query({});
    await page.goto("/");
    await waitForAppReady(page);
    await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: "Corpus", exact: true })).toHaveCount(0);
    await openCorpusOnPhone(page);

    const list = page.locator(CORPUS_LIST);
    const main = page.locator(MAIN);
    await expect(list).toHaveAttribute("data-panel-mode", "docked");
    await expect(list.getByRole("radio", { name: CORPUS_MODE_LABELS.explore })).toHaveAttribute("aria-checked", "true");

    await list.getByRole("radio", { name: CORPUS_MODE_LABELS.insights }).click();
    await expect(list).toHaveAttribute("data-panel-mode", "collapsed");
    await expect(main.getByTestId(testId("analyticsOverviewSurface"))).toBeVisible();
    await expect(main.getByRole("radio", { name: CORPUS_MODE_LABELS.insights })).toHaveAttribute("aria-checked", "true");
    const screenName = page.locator(".shell-topbar-title");
    // The committed corpus ranks fewer characters than one leaderboard page holds, so the census is the bare count;
    // the shell spec's narrowed Characters census owns the `n of m` arm.
    if (board.rows.length !== board.total) {
      throw new Error("The phone Insights case expects the whole leaderboard on one page");
    }
    await expect(screenName).toHaveText(`${CORPUS_MODE_LABELS.insights} · ${String(board.total)}`);

    await main.getByRole("radio", { name: CORPUS_MODE_LABELS.labels }).click();
    await expect(list).toHaveAttribute("data-panel-mode", "docked");
    await expect(list.getByRole("textbox", { name: "Filter tags", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: `Show ${CORPUS_MODE_LABELS.labels} overview`, exact: true })).toBeVisible();
  });

  test("phone Insights: the list door opens the leaderboard, a row drills, and Back returns to the dashboard", { tag: "@smoke" }, async ({
    page,
    baseURL,
    isMobile,
  }) => {
    test.skip(!isMobile, "The phone's leaderboard door over the dashboard");
    const ranked = (await ownerActor(baseURL ?? "").trpc.stats.leaderboard.query({})).rows[0];
    if (ranked === undefined) {
      throw new Error("Corpus has no ranked character");
    }
    await openCorpusOnPhone(page);
    const list = page.locator(CORPUS_LIST);
    const main = page.locator(MAIN);
    await list.getByRole("radio", { name: CORPUS_MODE_LABELS.insights }).click();
    await expect(main.getByTestId(testId("analyticsOverviewSurface"))).toBeVisible();
    // With nothing drilled the lead control is the list door, never a Back with nothing to go back from.
    await expect(page.getByRole("button", { name: `Back to ${CORPUS_MODE_LABELS.insights}`, exact: true })).toHaveCount(0);
    const door = page.locator(".shell-topbar").getByRole("button", { name: "Characters", exact: true });
    await door.click();
    await expect(list).toHaveAttribute("data-panel-mode", "overlay");
    await list.locator(`[${LEADERBOARD_ROW_ATTR}="${ranked.characterId}"]`).getByRole("button").click();

    await expect(main.getByTestId(testId("analyticsCharacterSurface"))).toBeVisible();
    await expect(list).toHaveAttribute("data-panel-mode", "collapsed");
    // One Back on a phone: the topbar's. The drill draws no second one inside CONTENT.
    await expect(main.getByRole("button", { name: /^Back to/u })).toHaveCount(0);
    await page.getByRole("button", { name: `Back to ${CORPUS_MODE_LABELS.insights}`, exact: true }).click();
    await expect(main.getByTestId(testId("analyticsOverviewSurface"))).toBeVisible();
    await expect(door).toBeVisible();
  });

  test("phone: entering Corpus from You lands focus in the finder, and the CONTEXT sheet takes focus", { tag: "@smoke" }, async ({ page, isMobile }) => {
    test.skip(!isMobile, "The phone's finder screen and CONTEXT sheet");
    await openCorpusOnPhone(page);
    const list = page.locator(CORPUS_LIST);
    await expect.poll(() => list.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    await page.getByRole("button", { name: "Show details", exact: true }).click();
    const context = page.locator(CORPUS_CONTEXT);
    await expect(context).toHaveAttribute("data-panel-mode", "overlay");
    await expect.poll(() => context.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  });

  test("phone Labels: a prune lands focus on the finder, never <body>", { tag: "@smoke" }, async ({ page, baseURL, isMobile }, info) => {
    test.skip(!isMobile, "On a phone the library CONTENT is inert behind the finder");
    const host = ownerActor(baseURL ?? "");
    // An unused tag of this cell's own, so the prune has something real to remove.
    const created = await host.trpc.tag.createTag.mutate({ input: { name: `e2e prune ${info.project.name}` } });
    // Unused is attached to nothing and suggested for nothing: the prune's own set.
    const unusedTags = async (): Promise<readonly string[]> =>
      (await host.trpc.tag.listTagsWithUsage.query()).filter((tag) => tag.usage.total === 0 && tag.pendingSuggestions === 0).map((tag) => tag.id);
    const unused = await unusedTags();
    expect(unused).toContain(created.id);
    await openCorpusOnPhone(page);
    const list = page.locator(CORPUS_LIST);
    await list.getByRole("radio", { name: CORPUS_MODE_LABELS.labels }).click();
    await list.getByRole("button", { name: "More tag actions", exact: true }).click();
    await page.getByRole("menuitem", { name: "Prune unused tags" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: pruneConfirmLabel(unused.length), exact: true })
      .click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    // The finder keeps focus; the library CONTENT behind it is inert, and <body> is never the landing.
    const finder = list.locator('[data-slot="labels-finder"]');
    await expect.poll(() => finder.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    expect(await unusedTags()).toEqual([]);
  });
});
