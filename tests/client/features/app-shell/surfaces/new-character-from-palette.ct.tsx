// @subject packages/client/src/features/character/components/new-character-host.tsx
// The command palette's New character opens the create form from another section at the desktop and the phone layouts. The form
// opens on its first field, and closing it returns focus to the section's New door, or to the topbar's lead control where the layout
// mounts no door, which draws a focus ring a keyboard reader can see.
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
const LEAD_CONTROL = ".shell-topbar-lead button";
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

  test("with the list collapsed only the content mounts its host: the form opens for each run, and Cancel returns focus to the landing's New", async ({
    mount,
    page,
  }) => {
    await seedShellState(page, { activeSection: "home", panelOverrides: { characters: { list: "collapsed" } } });
    await mount<typeof AppShellStory>(STORY, {});
    await expect(page.getByRole("heading", { level: 1, name: SECTION_LABELS.home, exact: true })).toBeAttached();
    const dialog = page.getByRole("dialog", { name: CHARACTER_NEW_NAME, exact: true });
    for (const _run of [1, 2]) {
      await runFromPalette(page);
      await expect(dialog.getByRole("textbox", { name: CHARACTER_NAME_FIELD_NAME, exact: true })).toBeFocused();
      await dialog.getByRole("button", { name: DIALOG_VERBS.cancel, exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole("button", { name: CHARACTER_NEW_NAME, exact: true })).toBeFocused();
    }
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

  test("from an open character's screen, which mounts no New door, closing the form returns focus to the topbar's lead control, with a focus ring drawn", async ({
    mount,
    page,
  }) => {
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
    // Closed from the keyboard: the browser draws the ring only for focus a keyboard reader moved.
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    const lead = page.locator(LEAD_CONTROL).first();
    await expect(lead).toBeFocused();
    // The visually hidden heading takes focus without drawing anything; the control must paint the ring.
    const ring = await lead.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        focusVisible: element.matches(":focus-visible"),
        outline: style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0,
        shadow: style.boxShadow !== "none",
      };
    });
    expect(ring.focusVisible).toBe(true);
    expect([ring.outline, ring.shadow]).toContain(true);
  });

  test("a second palette run from the list it landed on opens the form again, and nothing opens it later unasked", async ({ mount, page }) => {
    const [first] = (await (await root.internalCallerFor(root.ownerId)).character.list({})).items;
    if (first === undefined) {
      throw new Error("The committed corpus holds no character");
    }
    await mount<typeof AppShellStory>(STORY, {});
    await expect(page.getByRole("heading", { level: 1, name: SECTION_LABELS.home, exact: true })).toBeAttached();
    const dialog = page.getByRole("dialog", { name: CHARACTER_NEW_NAME, exact: true });
    for (const _run of [1, 2]) {
      await runFromPalette(page);
      await expect(dialog.getByRole("textbox", { name: CHARACTER_NAME_FIELD_NAME, exact: true })).toBeFocused();
      await dialog.getByRole("button", { name: DIALOG_VERBS.cancel, exact: true }).click();
      await expect(dialog).toHaveCount(0);
    }
    await page.getByText(first.name, { exact: true }).first().click();
    await expect(page.getByRole("heading", { level: 1 })).toBeAttached();
    await expect(dialog).toHaveCount(0);
  });
});
