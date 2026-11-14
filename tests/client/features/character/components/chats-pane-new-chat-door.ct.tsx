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

// Docked, the pane sits beside the content and the hero's door is the screen's one. Floating, the pane covers the content and its door is.
const REGIMES = [
  { name: "desktop 1440px", viewport: { width: 1440, height: 900 }, coarse: false, mode: "docked", covered: false },
  { name: "narrow desktop overlay 1000px", viewport: { width: 1000, height: 800 }, coarse: false, mode: "overlay", covered: true },
  { name: "phone 390px", viewport: { width: 390, height: 844 }, coarse: true, mode: "overlay", covered: true },
] as const;

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

      await openLibraryRow(page);
      const context = await openChatsTab(page);
      await expect(context.getByText(CHAT_LIST_EMPTY_TITLE, { exact: true })).toBeVisible();

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
