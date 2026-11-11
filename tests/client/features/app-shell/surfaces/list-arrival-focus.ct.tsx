// Keyboard arrival from the rail lands focus inside the section it opened, for every section the production registry holds.
// A LIST surface under a band lands on the band's first control, so a forward Tab runs the band's New (inline in every pane
// width: a band folds its other actions first), then the search field, then the rows. Each case arrives through the rail the
// way a keyboard user does, on the production section registry.
import type { SectionId } from "@orb/client/state";
import { SECTION_IDS } from "@orb/client/state";
import { seedShellState } from "@orb/testkit/browser/spec";
import { SECTION_LABELS, SECTION_PROCEDURES } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import type { AppShellStory } from "./_app-shell-stories.tsx";
import { routeShell, SHELL_STORIES } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellStory`;
const RAIL = ".shell-rail";
const LIST = '.shell-panel[data-panel-side="list"]';
const BAND = `${LIST} .shell-panel-header`;
const CONTENT = ".shell-content";
// The most forward Tabs from arrival to a row: the Chats band, its filter chips and the search sit ahead of its rows.
const MAX_TAB_STOPS = 14;

const REGIONS = ["body", "rail", "band", "list", "content", "elsewhere"] as const;
type Region = (typeof REGIONS)[number];
type Landing = Extract<Region, "band" | "list" | "content">;

interface Arrival {
  readonly label: string;
  /** Where focus rests once the rail press has opened the section: the LIST band's first control, another control in the LIST pane, or the content landmark and what it holds. */
  readonly lands: Landing;
}

// One row per production section id: a section added to the registry fails `tsc` here until this says where its focus lands.
const ARRIVALS = {
  home: { label: SECTION_LABELS.home, lands: "content" },
  chats: { label: SECTION_LABELS.chats, lands: "band" },
  characters: { label: SECTION_LABELS.characters, lands: "band" },
  corpus: { label: SECTION_LABELS.corpus, lands: "list" },
  config: { label: SECTION_LABELS.settings, lands: "list" },
  extensions: { label: SECTION_LABELS.extensions, lands: "list" },
  databank: { label: SECTION_LABELS.databank, lands: "band" },
  presets: { label: SECTION_LABELS.presets, lands: "band" },
  refinery: { label: SECTION_LABELS.refinery, lands: "content" },
} as const satisfies Record<SectionId, Arrival>;

// The sections whose LIST band carries New, a search field and rows.
const ROW_LISTS = ["chats", "characters", "presets"] as const satisfies readonly SectionId[];

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

/** The section a case starts from: Home, or Chats when Home is the subject. */
function startFor(section: SectionId): SectionId {
  return section === "home" ? "chats" : "home";
}

/** Presses a rail entry the way a keyboard user does: focus it, then Enter. */
async function pressRail(page: Page, label: string): Promise<void> {
  const entry = page.locator(RAIL).getByRole("button", { name: label, exact: true });
  await entry.focus();
  await entry.press("Enter");
}

/** Where focus sits: the page body, the rail, the LIST band, the rest of the LIST pane, the content landmark and what it holds, or elsewhere. */
function focusRegion(page: Page): Promise<Region> {
  return page.evaluate(
    ({ bandSelector, contentSelector, listSelector, railSelector }) => {
      const active = document.activeElement;
      if (active === null || active === document.body) {
        return "body";
      }
      const holds = (selector: string): boolean => document.querySelector(selector)?.contains(active) === true;
      if (holds(railSelector)) {
        return "rail";
      }
      if (holds(bandSelector)) {
        return "band";
      }
      if (holds(listSelector)) {
        return "list";
      }
      return holds(contentSelector) ? "content" : "elsewhere";
    },
    { bandSelector: BAND, contentSelector: CONTENT, listSelector: LIST, railSelector: RAIL },
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

for (const section of SECTION_IDS) {
  const { label, lands } = ARRIVALS[section];
  test(`arriving in ${section} from the rail by keyboard lands focus in its ${lands}, not on the body or the rail`, async ({ mount, page }) => {
    await seedShellState(page, { activeSection: startFor(section) });
    await mount<typeof AppShellStory>(STORY, {});
    await pressRail(page, label);
    await expect(page.locator(".shell-grid")).toHaveAttribute("data-section", section);
    await expect.poll(() => focusRegion(page)).toBe(lands);
  });
}

for (const section of ROW_LISTS) {
  test(`arriving in ${section} from the rail lands focus on the band's action, and a forward Tab runs New, then the search field, then the rows`, async ({
    mount,
    page,
  }) => {
    await seedShellState(page, { activeSection: "home" });
    await mount<typeof AppShellStory>(STORY, {});
    await pressRail(page, ARRIVALS[section].label);
    await expect(page.locator(".shell-grid")).toHaveAttribute("data-section", section);
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

for (const section of ROW_LISTS) {
  test(`returning to ${section} from Home by the rail lands focus on the band's control again`, async ({ mount, page }) => {
    await seedShellState(page, { activeSection: "home" });
    await mount<typeof AppShellStory>(STORY, {});
    for (const name of [ARRIVALS[section].label, ARRIVALS.home.label, ARRIVALS[section].label]) {
      await pressRail(page, name);
    }
    await expect(page.locator(".shell-grid")).toHaveAttribute("data-section", section);
    await expect.poll(() => focusRegion(page)).toBe("band");
  });
}
