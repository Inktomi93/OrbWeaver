// Corpus workbench state restoration on the committed corpus: the Insights drill on desktop and the Tags editor push on a phone.
import { CORPUS_MODE_LABELS, testId } from "@orb/client/lib";
import type { Page } from "@playwright/test";
import { ownerActor } from "./support/actors.ts";
import { waitForAppReady } from "./support/chat-room.ts";
import { expect, test } from "./support/corpus-test.ts";
import { SELECTED_CORPUS_FIXTURE } from "./support/modes.ts";

const CORPUS_LIST = '.shell-panel[data-panel-side="list"]';

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

    const row = list.getByRole("button", { name: ranked.name, exact: true });
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
});
