// Every roster the production section registry mounts, visited through the rail: each list pane carries the structural
// band (a titled identity) and its search, and so does each Corpus mode's roster.
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import type { AppShellStory } from "./_app-shell-stories.tsx";
import { routeRoom, SHELL_STORIES } from "./app-shell-ct.tsx";

const LIST = '.shell-panel[data-panel-side="list"]';
const SEARCH_SETTLE_MS = 5000;

let root: Awaited<ReturnType<typeof createCorpusHarness>>;

test.beforeAll(async () => {
  root = await createCorpusHarness();
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

/** What the list pane shows: its band's title, how many identities it paints, and whether a search box is on screen. */
async function rosterShape(page: Page): Promise<{ readonly title: string; readonly identities: number; readonly search: boolean }> {
  const pane = page.locator(LIST);
  await pane.locator('[data-slot="list-pane-title"]').first().waitFor();
  const search: Locator = pane.locator('[data-slot="list-search"] input');
  return {
    title: ((await pane.locator('[data-slot="list-pane-title"]').first().textContent()) ?? "").trim(),
    identities: await pane.locator('[data-slot="list-pane-identity"]').count(),
    // The search box rides the roster's own body, which can land a beat after the band.
    search: await search
      .first()
      .waitFor({ timeout: SEARCH_SETTLE_MS })
      .then(() => true)
      .catch(() => false),
  };
}

test("every section roster and every Corpus mode roster has a titled band, one identity and a search", async ({ corpus, mount, page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await routeRoom(page, corpus, await root.internalCallerFor(root.ownerId));
  await mount<typeof AppShellStory>(`${SHELL_STORIES}/AppShellStory`, {});
  const rail = page.locator(".shell-rail");
  const grid = page.locator(".shell-grid");
  const labels = (
    await rail
      .locator("button[aria-label]")
      .evaluateAll((buttons) => buttons.filter((button) => button.checkVisibility()).map((button) => button.getAttribute("aria-label") ?? ""))
  ).filter((label) => label !== "");
  const shapes: Record<string, Awaited<ReturnType<typeof rosterShape>>> = {};
  for (const label of labels) {
    await rail.getByRole("button", { name: label, exact: true }).click();
    // A section door makes its button the current page; any other rail door opens a modal instead.
    const landed = await page.waitForFunction((name) => {
      if (document.querySelector('[role="dialog"]') !== null) {
        return "modal";
      }
      return document.querySelector(`.shell-rail button[aria-label="${name}"]`)?.getAttribute("aria-current") === "page" ? "section" : null;
    }, label);
    if ((await landed.jsonValue()) === "modal") {
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "detached" });
    } else if ((await page.locator(LIST).getAttribute("data-panel-available")) !== "false" && (await grid.getAttribute("data-section")) !== "corpus") {
      shapes[label] = await rosterShape(page);
    }
  }
  // Corpus hosts one roster per mode; each mode is the screen its radio selects.
  await rail.getByRole("button", { name: "Corpus", exact: true }).click();
  await expect(grid).toHaveAttribute("data-section", "corpus");
  const modes = page.locator(LIST).getByRole("radiogroup").getByRole("radio");
  for (const index of Array.from({ length: await modes.count() }, (_, at) => at)) {
    const mode = modes.nth(index);
    await mode.click();
    await expect(mode).toHaveAttribute("aria-checked", "true");
    shapes[`Corpus/${((await mode.textContent()) ?? "").trim()}`] = await rosterShape(page);
  }
  test.info().annotations.push({ type: "rosters", description: JSON.stringify(shapes) });
  expect(Object.keys(shapes).length).toBeGreaterThan(3);
  expect(Object.entries(shapes).filter(([, shape]) => shape.title === "" || shape.identities !== 1 || !shape.search)).toStrictEqual([]);
});
