// Keyboard arrival into a list surface lands on the LIST band's first control, so a forward Tab runs the band's New (inline
// in every pane width: a band folds its other actions first), then the search field, then the rows. Each case arrives
// through the rail the way a keyboard user does, on the production section registry.
import { seedShellState } from "@orb/testkit/browser/spec";
import { SECTION_LABELS, SECTION_PROCEDURES } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import type { AppShellStory } from "./_app-shell-stories.tsx";
import { routeShell, SHELL_STORIES } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellStory`;
const LIST = '.shell-panel[data-panel-side="list"]';
const BAND = `${LIST} .shell-panel-header`;
// The most forward Tabs from arrival to a row: the Chats band, its filter chips and the search sit ahead of its rows.
const MAX_TAB_STOPS = 14;
const SECTIONS = [
  { id: "chats", label: SECTION_LABELS.chats },
  { id: "characters", label: SECTION_LABELS.characters },
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

/** Where focus sits relative to the list pane: its band, its body, or elsewhere. */
function focusRegion(page: Page): Promise<"band" | "body" | "elsewhere"> {
  return page.evaluate(
    ({ bandSelector, listSelector }) => {
      const active = document.activeElement;
      if (active === null) {
        return "elsewhere";
      }
      if (document.querySelector(bandSelector)?.contains(active) === true) {
        return "band";
      }
      return document.querySelector(listSelector)?.contains(active) === true ? "body" : "elsewhere";
    },
    { bandSelector: BAND, listSelector: LIST },
  );
}

const STOP_KINDS = ["band-action", "new", "fold", "search", "row", "other"] as const;
type StopKind = (typeof STOP_KINDS)[number];

/** What the focused control is in the list pane's tab order: a band action (New and the fold's menu apart), the search field, a row's control, or anything else. */
function stopKind(page: Page): Promise<StopKind> {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (active === null) {
      return "other";
    }
    if (active.closest('[data-slot="list-pane-action"]') !== null) {
      if (active.getAttribute("data-slot") === "overflow-actions-trigger") {
        return "fold";
      }
      const label = active.getAttribute("aria-label") ?? active.textContent.trim();
      return /^New\b/u.test(label) ? "new" : "band-action";
    }
    if (active.closest('[data-slot="list-search"]') !== null) {
      return "search";
    }
    return active.getAttribute("data-slot") === "list-row-body" ? "row" : "other";
  });
}

for (const section of SECTIONS) {
  test(`arriving in ${section.id} from the rail lands focus on the band's action, and a forward Tab runs New, then the search field, then the rows`, async ({
    mount,
    page,
  }) => {
    await seedShellState(page, { activeSection: "home" });
    await mount<typeof AppShellStory>(STORY, {});
    const entry = page.locator(".shell-rail").getByRole("button", { name: section.label, exact: true });
    await entry.focus();
    await entry.press("Enter");
    await expect(page.locator(".shell-grid")).toHaveAttribute("data-section", section.id);
    await expect.poll(() => focusRegion(page)).toBe("band");
    // The search field sits above the library's query boundary, so it exists before the rows do; a Tab walk that starts
    // while the list query is pending leaves the pane instead of reaching a row.
    await expect(page.locator(`${LIST} [data-slot="list-row-body"]`).first()).toBeVisible();
    const stops: StopKind[] = [await stopKind(page)];
    for (let step = 0; step < MAX_TAB_STOPS && !stops.includes("row"); step += 1) {
      await page.keyboard.press("Tab");
      stops.push(await stopKind(page));
    }
    // Arrival is the band's own control, never the surface root a Tab would start past the band from.
    expect(["band-action", "new", "fold"]).toContain(stops[0]);
    // New is in the tab order whatever room the pane has: the band folds its other actions, never its primary.
    const door = stops.indexOf("new");
    // Every kind is reached, so the order below is a comparison of real stops and not of missing ones.
    expect([door, stops.indexOf("search"), stops.indexOf("row")]).not.toContain(-1);
    expect(door).toBeLessThan(stops.indexOf("search"));
    expect(stops.indexOf("search")).toBeLessThan(stops.indexOf("row"));
  });
}

for (const section of SECTIONS) {
  test(`returning to ${section.id} from Home by the rail lands focus on the band's control again`, async ({ mount, page }) => {
    await seedShellState(page, { activeSection: "home" });
    await mount<typeof AppShellStory>(STORY, {});
    const rail = page.locator(".shell-rail");
    for (const label of [section.label, SECTION_LABELS.home, section.label]) {
      const entry = rail.getByRole("button", { name: label, exact: true });
      await entry.focus();
      await entry.press("Enter");
    }
    await expect(page.locator(".shell-grid")).toHaveAttribute("data-section", section.id);
    await expect.poll(() => focusRegion(page)).toBe("band");
  });
}
