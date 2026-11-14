// @subject packages/client/src/features/chat/components/chats-with-character-pane.tsx
// One door to New chat per screen: the Characters chats pane's empty state offers it only while the character hero's own is covered.
import { contextToggleLabel } from "@orb/client/lib";
import { createCharacterSchema } from "@orb/contracts/character";
import { DEFAULT_APPEARANCE_SETTINGS, DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, routeAuthConfig, routeTrpc, SECTION_LABELS, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { LENGTH_BASE_PX, MEDIA_QUERIES } from "@orb/ui/tokens";
import type { Locator, Page } from "@playwright/test";
import { CHARACTER_SEARCH_NAME } from "#client/components/shared-control-names.ts";
import { CHARACTER_CHATS_TAB_LABEL, CHARACTER_EDITOR_NAME, CHARACTER_LIBRARY_NAME } from "#client/features/character/lib/character-names.ts";
import { CHAT_LIST_EMPTY_TITLE } from "#client/features/chat/lib/chat-surface-names.ts";
import { CHARACTER_NEW_CHAT_NAME } from "#client/lib/chat-launch-names.ts";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const CARD_NAME = "The quiet lamplighter";
const CHARACTERS = SECTION_LABELS.characters;
const SHOW_LIST = new RegExp(`^Show (?:list panel|${RegExp.escape(CHARACTERS)}(?: · .+)? list)$`, "u");
const READ_PROCEDURES = [...SECTION_PROCEDURES, "tag.listTagFilterVocabulary"] as const;
const LIST = '.shell-panel[data-panel-side="list"]';
const CONTEXT = '.shell-panel[data-panel-side="context"]';

const WIDE_PX = 1440;

// Docked, the pane sits beside the content and the hero's door is the screen's one. Floating, the pane covers the content and its door is.
const REGIMES = [
  { name: "desktop 1440px", viewport: { width: WIDE_PX, height: 900 }, coarse: false, narrow: false, mode: "docked", covered: false, atFloor: false },
  {
    name: "narrow desktop overlay 1000px",
    viewport: { width: 1000, height: 800 },
    coarse: false,
    narrow: true,
    mode: "overlay",
    covered: true,
    atFloor: false,
  },
  // Resized after mount to the widest width the shell still reports a content deficit at. Past the shell-narrow breakpoint, so only the content floor floats the pane; asserted below, not assumed.
  {
    name: "wide desktop at the content floor",
    viewport: { width: WIDE_PX, height: 800 },
    coarse: false,
    narrow: false,
    mode: "overlay",
    covered: true,
    atFloor: true,
  },
  { name: "phone 390px", viewport: { width: 390, height: 844 }, coarse: true, narrow: true, mode: "overlay", covered: true, atFloor: false },
] as const;

const SENTINEL = ".shell-content-primacy-sentinel";

/** The width of the shell's content-primacy sentinel: the deficit by which the docked panes leave the content under its floor. */
function primacyDeficit(page: Page): Promise<number> {
  return page.locator(SENTINEL).evaluate((element) => element.getBoundingClientRect().width);
}

/** Resize to the widest width past the shell-narrow breakpoint that still shows a primacy deficit, found on the rendered sentinel. */
async function fitToContentFloor(page: Page, enabled: boolean): Promise<void> {
  if (!enabled) {
    return;
  }
  const deficitAt = async (width: number): Promise<number> => {
    await page.setViewportSize({ width, height: 800 });
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    return primacyDeficit(page);
  };
  let [low, high] = [LENGTH_BASE_PX["breakpoint.shell-dock"] + 1, WIDE_PX];
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if ((await deficitAt(middle)) > 0) {
      low = middle;
    } else {
      high = middle;
    }
  }
  await deficitAt(low);
}

async function openLibraryRow(page: Page): Promise<void> {
  const showList = page.getByRole("button", { name: SHOW_LIST });
  if ((await page.locator(LIST).getAttribute("data-panel-mode")) === "collapsed" && (await showList.isVisible())) {
    await showList.click();
  }
  const search = page.getByRole("textbox", { name: CHARACTER_SEARCH_NAME, exact: true });
  await expect(search).toBeVisible();
  await search.fill(CARD_NAME);
  await page.getByRole("list", { name: CHARACTER_LIBRARY_NAME, exact: true }).getByRole("button", { name: CARD_NAME, exact: true }).click();
  await expect(page.getByRole("form", { name: CHARACTER_EDITOR_NAME, exact: true })).toBeVisible();
}

async function openChatsTab(page: Page): Promise<Locator> {
  const context = page.locator(CONTEXT);
  if ((await context.getAttribute("data-panel-mode")) === "collapsed") {
    await page.getByRole("button", { name: contextToggleLabel(true), exact: true }).click();
  }
  const tab = context.getByRole("tab", { name: CHARACTER_CHATS_TAB_LABEL, exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
  return context;
}

for (const regime of REGIMES) {
  test.describe(regime.name, () => {
    test.use({ viewport: regime.viewport, isMobile: regime.coarse, hasTouch: regime.coarse });

    test("a character with no chats has one New chat door on screen", async ({ corpus, mount, page }) => {
      await using root = await createCorpusHarness(undefined, { startJobs: false });
      const caller = await root.internalCallerFor(root.ownerId);
      await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
      await caller.settings.updateUserSettingsSection({ section: "theme", patch: DEFAULT_USER_SETTINGS.theme });
      await caller.character.create({
        input: createCharacterSchema.parse({ handle: "quiet-lamplighter", name: CARD_NAME, description: "Lights the lamps nobody asked about." }),
      });
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
      await routeAuthConfig(page, corpus.auth.signedInConfig);
      await seedShellState(page, { activeSection: "characters", panelOverrides: { characters: { list: "docked", context: "docked" } } });
      await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, READ_PROCEDURES) });
      await mount<typeof ShellAmbientStory>(STORY, {});
      await fitToContentFloor(page, regime.atFloor);

      await openLibraryRow(page);
      const context = await openChatsTab(page);
      await expect(context.getByText(CHAT_LIST_EMPTY_TITLE, { exact: true })).toBeVisible();

      // The control: an `overlay` on a viewport the narrow breakpoint does not claim can only come from the content floor.
      expect(await page.evaluate((query) => matchMedia(query).matches, MEDIA_QUERIES["shell-narrow"])).toBe(regime.narrow);
      await expect(context).toHaveAttribute("data-panel-mode", regime.mode);
      await expect(page.locator(".shell-content")).toHaveJSProperty("inert", regime.covered);
      // The doors a reader can press: not under an inert region, and painted.
      const operableDoors = await page
        .getByRole("button", { name: CHARACTER_NEW_CHAT_NAME, exact: true })
        .evaluateAll((doors) => doors.filter((door) => door.closest("[inert]") === null && door.checkVisibility()).length);
      expect(operableDoors).toBe(1);
      await expect(context.getByRole("button", { name: CHARACTER_NEW_CHAT_NAME, exact: true })).toHaveCount(regime.covered ? 1 : 0);
    });
  });
}
