// @subject packages/client/src/features/character/components/new-character-host.tsx
// The command palette's New character opens the create form from another section at the desktop and the phone layouts. The form
// opens on its first field, and closing it returns focus to the section's New door, or to the screen heading where the layout
// mounts no door.
import { seedShellState } from "@orb/testkit/browser/spec";
import { SECTION_LABELS, SECTION_PROCEDURES } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { CHARACTER_NAME_FIELD_NAME, CHARACTER_NEW_NAME, CHARACTER_NEW_SHORT_LABEL } from "#client/features/character/lib/character-names.ts";
import { COMMAND_MODAL_TITLE } from "#client/features/chat/lib/command-palette-names.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import type { AppShellStory } from "./_app-shell-stories.tsx";
import { routeShell, SHELL_STORIES } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellStory`;
const TRAIL = ".shell-topbar-trail";
// The band shows New as the word while it fits and as its icon otherwise; either names the same door.
const BAND_NEW = new RegExp(`^(?:${CHARACTER_NEW_SHORT_LABEL}|${CHARACTER_NEW_NAME})$`, "u");

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

/** Run New character from the palette, from whichever section the shell opened on. */
async function runFromPalette(page: Page): Promise<void> {
  await page.keyboard.press("Control+KeyK");
  const palette = page.getByRole("dialog", { name: COMMAND_MODAL_TITLE, exact: true });
  await palette.getByRole("combobox").fill(CHARACTER_NEW_NAME);
  await page.keyboard.press("Enter");
  await expect(palette).toHaveCount(0);
}

test.describe("desktop", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("opens the form from Home on its first field, and Cancel returns focus to the band's New", async ({ mount, page }) => {
    await mount<typeof AppShellStory>(STORY, {});
    await expect(page.getByRole("heading", { level: 1, name: SECTION_LABELS.home, exact: true })).toBeAttached();
    await runFromPalette(page);
    const dialog = page.getByRole("dialog", { name: CHARACTER_NEW_NAME, exact: true });
    await expect(dialog.getByRole("textbox", { name: CHARACTER_NAME_FIELD_NAME, exact: true })).toBeFocused();
    await dialog.getByRole("button", { name: DIALOG_VERBS.cancel, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: BAND_NEW })).toBeFocused();
  });
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("opens the form from Home on its first field, and Cancel returns focus to the trail's New", async ({ mount, page }) => {
    await mount<typeof AppShellStory>(STORY, {});
    await expect(page.getByRole("heading", { level: 1, name: SECTION_LABELS.home, exact: true })).toBeAttached();
    await runFromPalette(page);
    const dialog = page.getByRole("dialog", { name: CHARACTER_NEW_NAME, exact: true });
    await expect(dialog.getByRole("textbox", { name: CHARACTER_NAME_FIELD_NAME, exact: true })).toBeFocused();
    await dialog.getByRole("button", { name: DIALOG_VERBS.cancel, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator(TRAIL).getByRole("button", { name: CHARACTER_NEW_NAME, exact: true })).toBeFocused();
  });

  test("from an open character's screen, which mounts no New door, Cancel returns focus to the screen heading", async ({ mount, page }) => {
    const [first] = (await (await root.internalCallerFor(root.ownerId)).character.list({})).items;
    if (first === undefined) {
      throw new Error("The committed corpus holds no character");
    }
    await seedShellState(page, { activeSection: "characters" });
    await mount<typeof AppShellStory>(STORY, {});
    await page.getByText(first.name, { exact: true }).first().click();
    await expect(page.locator(TRAIL).getByRole("button", { name: CHARACTER_NEW_NAME, exact: true })).toHaveCount(0);
    await runFromPalette(page);
    const dialog = page.getByRole("dialog", { name: CHARACTER_NEW_NAME, exact: true });
    await expect(dialog.getByRole("textbox", { name: CHARACTER_NAME_FIELD_NAME, exact: true })).toBeFocused();
    await dialog.getByRole("button", { name: DIALOG_VERBS.cancel, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  });
});
