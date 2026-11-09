// Pinned and floating chrome at the enlarged text a phone can reach (200% and 300%): a control under a sticky bar, a toast or a pill stays
// pressable, and a notice keeps room for its words. Each case presses the control the way a user does, so a covered one fails the press.

import { createCharacterSchema } from "@orb/contracts/character";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { dropOn, seedShellState, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import { CHARACTER_ACTIONS } from "#client/features/character/lib/character-actions.ts";
import { CHARACTER_ADD_TAG_NAME } from "#client/features/character/lib/character-names.ts";
import type { AppShellCharacterStory, AppShellRoomStory } from "./_app-shell-stories.tsx";
import { namedGroupRoom, routeRoom, SHELL_STORIES } from "./app-shell-ct.ts";

const PHONE = { width: 390, height: 844 } as const;
const SCALES = [2, 3] as const;
// The share of the phone's width a notice's words need to read as a line of text rather than a column of letters.
const TOAST_COPY_SHARE = 0.4;
const FONT_SCALE_PROPERTY = channelName("fontScale");
const SHELL_AMBIENT = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";

let root: Awaited<ReturnType<typeof createCorpusHarness>>;

test.beforeAll(async () => {
  root = await createCorpusHarness();
});

const ownerCaller = (): ReturnType<typeof root.internalCallerFor> => root.internalCallerFor(root.ownerId);

test.beforeEach(async ({ corpus, page }) => {
  await routeRoom(page, corpus, await ownerCaller());
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

async function scaleRoot(page: Page, factor: number): Promise<void> {
  await setRootFontScale(page, FONT_SCALE_PROPERTY, factor);
  await expect.poll(() => page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize))).toBeGreaterThanOrEqual(16 * factor);
}

/** A trial press: Playwright scrolls the control into view and refuses when something else would take the press. */
async function expectPressable(control: Locator): Promise<void> {
  await control.scrollIntoViewIfNeeded();
  await control.click({ trial: true });
}

test.describe("on a phone", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: PHONE });

  for (const factor of SCALES) {
    test(`a notice leaves its words a readable measure at ${String(factor * 100)}% text`, async ({ mount, page }) => {
      await seedShellState(page, { activeSection: "chats" });
      const room = namedGroupRoom((await (await ownerCaller()).chat.listChats({ limit: 100 })).items);
      await mount<typeof AppShellRoomStory>(`${SHELL_STORIES}/AppShellRoomStory`, { chatId: room.id });
      await expect(page.locator('[data-slot="composer"]')).toBeVisible();
      await scaleRoot(page, factor);
      expect(await dropOn(page.locator("main.shell-content"), { file: "card.png", type: "image/png" })).toBe(true);
      const title = page.locator('[data-slot="toast-title"]');
      await expect(title).toBeVisible();
      await expect.poll(async () => ((await title.boundingBox())?.width ?? 0) / PHONE.width).toBeGreaterThanOrEqual(TOAST_COPY_SHARE);
    });

    test(`the character editor's Add tag stays pressable under its save bar at ${String(factor * 100)}% text`, async ({ mount, page }) => {
      await seedShellState(page, { activeSection: "characters" });
      const [character] = (await (await ownerCaller()).character.list({})).items;
      if (character === undefined) {
        throw new Error("The corpus has no character");
      }
      await mount<typeof AppShellCharacterStory>(`${SHELL_STORIES}/AppShellCharacterStory`, { characterId: character.id });
      await expect(page.locator('[data-slot="save-bar-root"]')).toBeVisible();
      await scaleRoot(page, factor);
      await expectPressable(page.locator('[data-slot="character-tags"]').getByRole("button", { name: CHARACTER_ADD_TAG_NAME, exact: true }));
    });
  }

  test("the Characters selection bar leaves the next row and its own Delete pressable at 300% text", async ({ mount, page }) => {
    const caller = await ownerCaller();
    for (const name of ["Bulk archivist one", "Bulk archivist two", "Bulk archivist three"]) {
      await caller.character.create({
        input: createCharacterSchema.parse({ handle: name.toLowerCase().replaceAll(" ", "-"), name, description: "A character for the bulk bar." }),
      });
    }
    await routeTrpc(page, serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES]));
    await seedShellState(page, { activeSection: "characters", panelOverrides: { characters: { list: "docked", context: "collapsed" } } });
    await mount<typeof ShellAmbientStory>(SHELL_AMBIENT, {});
    await page.getByRole("button", { name: /^Select( multiple)?$/u }).click();
    const rows = page.getByRole("checkbox");
    await expect(rows.first()).toBeVisible();
    await scaleRoot(page, 3);
    for (const index of [0, 1]) {
      await rows.nth(index).click();
    }
    const bar = page.locator('[data-slot="selection-bar-root"]');
    await expect(bar).toBeVisible();
    await expectPressable(bar.getByRole("button", { name: CHARACTER_ACTIONS.delete.label, exact: true }));
    await expectPressable(rows.nth(2));
  });
});
