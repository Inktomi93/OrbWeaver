// Keyboard arrival into a list surface lands on the LIST band's first control, so a forward Tab runs New, then the search
// field, then the rows. Each case arrives through the rail the way a keyboard user does, on the production section registry.
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
const MAX_BAND_STOPS = 6;
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

for (const section of SECTIONS) {
  test(`arriving in ${section.id} from the rail lands focus on the band's control, and the next Tab leaves the band into the pane body`, async ({
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
    // The band may hold several controls; the walk leaves it straight into the pane's own body, never past the pane.
    let region = await focusRegion(page);
    for (let step = 0; step < MAX_BAND_STOPS && region === "band"; step += 1) {
      await page.keyboard.press("Tab");
      region = await focusRegion(page);
    }
    expect(region).toBe("body");
  });
}

for (const section of SECTIONS) {
  test(`returning to ${section.id} from Home by the rail lands focus on the band's control again`, async ({ mount, page }) => {
    await seedShellState(page, { activeSection: "home" });
    await mount<typeof AppShellStory>(STORY, {});
    const rail = page.locator(".shell-rail");
    for (const label of [section.label, "Home", section.label]) {
      const entry = rail.getByRole("button", { name: label, exact: true });
      await entry.focus();
      await entry.press("Enter");
    }
    await expect(page.locator(".shell-grid")).toHaveAttribute("data-section", section.id);
    await expect.poll(() => focusRegion(page)).toBe("band");
  });
}
