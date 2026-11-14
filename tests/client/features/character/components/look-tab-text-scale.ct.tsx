// The character Look tab on a phone at enlarged text: its three theme and background buttons keep their whole label inside the pane.
// Production entry: the AppShell's Characters section, its context panel's Look tab.
import { contextToggleLabel } from "@orb/client/lib";
import { createCharacterSchema } from "@orb/contracts/character";
import { DEFAULT_APPEARANCE_SETTINGS, DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { actionGroupGeometry, seedShellState, setRootFontScale } from "@orb/testkit/browser/spec";
import {
  ALERTS_REGION_NAME,
  channelName,
  createShellAmbientReads,
  routeAuthConfig,
  routeTrpc,
  SECTION_LABELS,
  SECTION_PROCEDURES,
  serveCorpusProcedures,
} from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { BACKGROUND_ADD_IN_SETTINGS_NAME, CHARACTER_SEARCH_NAME } from "#client/components/shared-control-names.ts";
import {
  CHARACTER_EDITOR_NAME,
  CHARACTER_HERO_NAME_FIELD_NAME,
  CHARACTER_LIBRARY_NAME,
  CHARACTER_LOOK_TAB_LABEL,
  CHARACTER_RESET_LOOK_NAME,
  CHARACTER_START_FROM_THEME_NAME,
} from "#client/features/character/lib/character-names.ts";
import { sectionBackName } from "#client/lib/context-pane-names.ts";
import { TOAST_CLOSE_NAME } from "#ui/primitives/toast/toast-names.ts";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const CARD_NAME = "The look text-scale archivist";
const CHARACTERS = SECTION_LABELS.characters;
const SHOW_LIST = new RegExp(`^Show (?:list panel|${RegExp.escape(CHARACTERS)}(?: · .+)? list)$`, "u");
const READ_PROCEDURES = [...SECTION_PROCEDURES, "tag.listTagFilterVocabulary"] as const;
const ENLARGED_TEXT = [
  { name: "200% text", factor: 2 },
  { name: "300% text", factor: 3 },
] as const;
const CONTEXT = '.shell-panel[data-panel-side="context"]';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

for (const scale of ENLARGED_TEXT) {
  test(`the Look tab's theme and background buttons stay inside the pane at ${scale.name}`, async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness(undefined, { startJobs: false });
    const caller = await root.internalCallerFor(root.ownerId);
    await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
    await caller.settings.updateUserSettingsSection({ section: "theme", patch: DEFAULT_USER_SETTINGS.theme });
    await caller.character.create({
      input: createCharacterSchema.parse({
        handle: "look-text-scale-archivist",
        name: CARD_NAME,
        description: "An archivist whose look is read at enlarged text.",
      }),
    });
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
    await routeAuthConfig(page, corpus.auth.signedInConfig);
    await seedShellState(page, { activeSection: "characters", panelOverrides: { characters: { list: "docked", context: "collapsed" } } });
    await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, READ_PROCEDURES) });
    await mount<typeof ShellAmbientStory>(STORY, {});

    const notification = page.getByRole("region", { name: ALERTS_REGION_NAME, exact: true }).getByRole("button", { name: TOAST_CLOSE_NAME, exact: true });
    if (await notification.isVisible()) {
      await notification.click();
      await notification.waitFor({ state: "hidden" });
    }
    const back = page.getByRole("button", { name: sectionBackName(CHARACTERS), exact: true });
    if (await back.isVisible()) {
      await back.click();
    }
    const showList = page.getByRole("button", { name: SHOW_LIST });
    if ((await page.locator('.shell-panel[data-panel-side="list"]').getAttribute("data-panel-mode")) === "collapsed") {
      await showList.click();
    }
    const search = page.getByRole("textbox", { name: CHARACTER_SEARCH_NAME, exact: true });
    await expect(search).toBeVisible();
    await search.fill(CARD_NAME);
    await page.getByRole("list", { name: CHARACTER_LIBRARY_NAME, exact: true }).getByRole("button", { name: CARD_NAME, exact: true }).click();
    await expect(
      page.getByRole("form", { name: CHARACTER_EDITOR_NAME, exact: true }).getByRole("textbox", { name: CHARACTER_HERO_NAME_FIELD_NAME, exact: true }),
    ).toHaveValue(CARD_NAME);

    const context = page.locator(CONTEXT);
    if ((await context.getAttribute("data-panel-mode")) === "collapsed") {
      await page.getByRole("button", { name: contextToggleLabel(true), exact: true }).click();
    }
    const tab = context.getByRole("tab", { name: CHARACTER_LOOK_TAB_LABEL, exact: true });
    await tab.focus();
    await page.keyboard.press("Enter");
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await setRootFontScale(page, channelName("fontScale"), scale.factor);

    const pane = context.getByRole("region", { name: CHARACTER_LOOK_TAB_LABEL, exact: true });
    const buttons = [CHARACTER_START_FROM_THEME_NAME, CHARACTER_RESET_LOOK_NAME, BACKGROUND_ADD_IN_SETTINGS_NAME].map((name) =>
      pane.getByRole("button", { name, exact: true }),
    );
    for (const button of buttons) {
      await button.scrollIntoViewIfNeeded();
      await expect(button).toBeVisible();
    }
    await expect.poll(async () => (await actionGroupGeometry(pane, buttons)).inlineOverflow).toBeLessThanOrEqual(1);
  });
}
