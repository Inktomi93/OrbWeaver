// The list band inside the production shell: a section's name stays whole and the band's secondary actions fold into their menu
// first, with the context pane docked beside the content, while its primary create action stays inline. The shell's own
// stylesheet decides this, so the cases mount the shell.
import { seedShellState } from "@orb/testkit/browser/spec";
import { SECTION_LABELS, SECTION_PROCEDURES } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import type { AppShellStory } from "./_app-shell-stories.tsx";
import { routeShell, SHELL_STORIES } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellStory`;
const BAND = '.shell-panel[data-panel-side="list"] .shell-panel-header';
const TRIGGER = '[data-slot="overflow-actions-trigger"]';
// A search that matches nothing turns the band's census into "0 of N", the widest figure the band prints.
const NOTHING_MATCHES = "no item has this name";
// The band's shown actions: each is a cell of the action row, and a folded cell is marked out of the row.
const SHOWN_CONTROLS = `[data-slot="list-pane-action"] > :not([data-overflowed]) :is(button, a)`;
// A band whose secondary action is a lone icon keeps it beside the primary's icon, so it has no menu; the others run
// short of room at the widest census and fold their secondary actions into the menu.
const FOLDING = [
  { id: "characters", label: SECTION_LABELS.characters },
  { id: "databank", label: SECTION_LABELS.databank },
] as const;
const UNFOLDED = [
  { id: "chats", label: SECTION_LABELS.chats },
  { id: "presets", label: SECTION_LABELS.presets },
] as const;

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

let root: Root;

test.beforeAll(async () => {
  root = await createCorpusHarness();
});

test.beforeEach(async ({ corpus, page }) => {
  await routeShell(page, corpus, await root.internalCallerFor(root.ownerId), SECTION_PROCEDURES);
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

test.use({ viewport: { width: 1280, height: 900 } });

/** The band at its widest census, its name whole, and its shown primary: the last control the band shows. */
async function widestBand(page: Page, label: string): Promise<{ readonly band: Locator; readonly primary: Locator }> {
  const band = page.locator(BAND);
  const title = band.getByRole("heading", { level: 2 });
  const name = title.locator("> span").first();
  await expect(name).toHaveText(label);
  await page.locator('[data-slot="list-search"] input').first().fill(NOTHING_MATCHES);
  await expect(title).toContainText(" of ");
  await expect.poll(() => name.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  const primary = band.locator(SHOWN_CONTROLS).last();
  await expect(primary).toBeVisible();
  return { band, primary };
}

for (const collection of FOLDING) {
  test(`the ${collection.id} band keeps its whole name and its primary inline while its other actions fold into the menu, with Context docked`, async ({
    mount,
    page,
  }) => {
    await seedShellState(page, { activeSection: collection.id, panelOverrides: { [collection.id]: { list: "docked", context: "docked" } } });
    await mount<typeof AppShellStory>(STORY, {});
    const { band, primary } = await widestBand(page, collection.label);
    const primaryName = await primary.evaluate((element) => element.getAttribute("aria-label") ?? element.textContent.trim());
    // The positive control: the band really is short of room, so its secondary actions are in the menu and its primary is not.
    await band.locator(TRIGGER).click();
    await expect(page.getByRole("menuitem").first()).toBeVisible();
    await expect(page.getByRole("menuitem").filter({ hasText: primaryName })).toHaveCount(0);
  });
}

for (const collection of UNFOLDED) {
  test(`the ${collection.id} band keeps its whole name, its secondary action and its primary inline, with Context docked`, async ({ mount, page }) => {
    await seedShellState(page, { activeSection: collection.id, panelOverrides: { [collection.id]: { list: "docked", context: "docked" } } });
    await mount<typeof AppShellStory>(STORY, {});
    const { band } = await widestBand(page, collection.label);
    await expect(band.locator(SHOWN_CONTROLS)).toHaveCount(2);
    await expect(band.locator(TRIGGER)).toHaveCount(0);
  });
}
