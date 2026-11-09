// Pinned and floating chrome at the enlarged text a phone can reach (200% and 300%): a control under a sticky bar, a toast or a pill stays
// pressable, and a notice keeps room for its words. Each case presses the control the way a user does, so a covered one fails the press.

import { createCharacterSchema } from "@orb/contracts/character";
import { THEME_CHAT_STYLES } from "@orb/contracts/theme";
import type { ChatId, MessageId } from "@orb/kit/ids";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { dropOn, seedShellState, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import { CHARACTER_ACTIONS } from "#client/features/character/lib/character-actions.ts";
import { CHARACTER_ADD_TAG_NAME } from "#client/features/character/lib/character-names.ts";
import { CHAT_CANCEL_EDIT_NAME, CHAT_SAVE_EDIT_NAME } from "#client/features/chat/lib/chat-surface-names.ts";
import { MESSAGE_ACTIONS_MENU_NAME, MESSAGE_EDIT_NAME } from "#client/features/chat/lib/message-action-names.ts";
import { CORPUS_DISTILLED_CATALOG_NAME } from "#client/features/discovery/lib/corpus-control-names.ts";
import type { SectionShellStory } from "../_surface-stories.tsx";
import type { AppShellCharacterStory, AppShellRoomStory } from "./_app-shell-stories.tsx";
import { namedGroupRoom, routeRoom, SHELL_STORIES } from "./app-shell-ct.ts";

const PHONE = { width: 390, height: 844 } as const;
const NARROW_PHONE = { width: 320 } as const;
const SCALES = [2, 3] as const;
// The share of the phone's width a notice's words need to read as a line of text rather than a column of letters.
const TOAST_COPY_SHARE = 0.4;
const FONT_SCALE_PROPERTY = channelName("fontScale");
const SECTION_SHELL = "tests/client/features/app-shell/_surface-stories/SectionShellStory";
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

const MESSAGE_ROW = '[data-slot="message-row"]';
const ROLES = ["user", "assistant"] as const;

/** A room whose user and assistant messages both carry a picture, in `chatStyle`, so the style's art draws beside every message. */
async function pictureRoom(
  chatStyle: (typeof THEME_CHAT_STYLES)[number],
): Promise<{ readonly chatId: ChatId; readonly messageIds: Map<(typeof ROLES)[number], MessageId> }> {
  const caller = await ownerCaller();
  const pictured = (await caller.character.list({ limit: 100 })).items.find((character) => character.avatarHash !== null && character.avatarAssetId !== null);
  if (pictured === undefined) {
    throw new Error("The corpus has no pictured character");
  }
  for (const room of (await caller.chat.listChats({ limit: 100 })).items) {
    const { messages } = await caller.chat.listMessages({ chatId: room.id, limit: 6 });
    const user = messages.find((message) => message.role === "user" && message.personaId !== null);
    const assistant = messages.find((message) => message.role === "assistant" && message.characterId !== null && message.kind === "standard");
    if (user === undefined || user.personaId === null || assistant === undefined || assistant.characterId === null) {
      continue;
    }
    await caller.persona.update({ personaId: user.personaId, input: { avatarAssetId: pictured.avatarAssetId } });
    await caller.character.update({ characterId: assistant.characterId, input: { avatarAssetId: pictured.avatarAssetId } });
    await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
    await caller.settings.updateUserSettingsSection({ section: "appearance", patch: { showInChatAvatars: true, backgroundImageKind: "none", chatStyle } });
    return { chatId: room.id, messageIds: new Map<(typeof ROLES)[number], MessageId>().set("user", user.id).set("assistant", assistant.id) };
  }
  throw new Error("The corpus has no room with a pictured persona and character message");
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

    test(`the Corpus catalog keeps its rows when the pane chrome grows at ${String(factor * 100)}% text`, async ({ mount, page }) => {
      await seedShellState(page, { activeSection: "corpus" });
      await mount<typeof SectionShellStory>(SECTION_SHELL, { section: "corpus" });
      await scaleRoot(page, factor);
      const catalog = page.getByRole("list", { name: CORPUS_DISTILLED_CATALOG_NAME, exact: true });
      await expect(catalog).toBeVisible();
      await expect(catalog.getByRole("listitem").first()).toBeVisible();
      await expectPressable(catalog.getByRole("button").first());
    });

    for (const chatStyle of THEME_CHAT_STYLES) {
      // The ripple portrait is a share of the card, so its two phone widths are both measured.
      const widths = chatStyle === "ripple" ? [NARROW_PHONE.width, PHONE.width] : [PHONE.width];
      for (const width of widths) {
        test(`the ${chatStyle} style leaves a message's actions and Save edit pressable at ${String(factor * 100)}% text on a ${String(width)} wide phone`, async ({
          mount,
          page,
        }) => {
          await page.setViewportSize({ width, height: PHONE.height });
          const { chatId, messageIds } = await pictureRoom(chatStyle);
          await seedShellState(page, { activeSection: "chats" });
          await mount<typeof AppShellRoomStory>(`${SHELL_STORIES}/AppShellRoomStory`, { chatId });
          await expect(page.locator('[data-slot="composer"]')).toBeVisible();
          await scaleRoot(page, factor);
          for (const role of ROLES) {
            const row = page.locator(`${MESSAGE_ROW}[data-message-id="${messageIds.get(role) ?? ""}"]`);
            await row.evaluate((node) => node.scrollIntoView({ block: "center" }));
            // A row's actions reveal on focus into the row at a touch pointer, so the press is judged once they show.
            const actions = row.getByRole("button", { name: MESSAGE_ACTIONS_MENU_NAME, exact: true });
            await actions.focus();
            await expectPressable(actions);
            await row.getByRole("button", { name: MESSAGE_EDIT_NAME, exact: true }).click();
            await expectPressable(row.getByRole("button", { name: CHAT_SAVE_EDIT_NAME, exact: true }));
            await row.getByRole("button", { name: CHAT_CANCEL_EDIT_NAME, exact: true }).click();
          }
        });
      }
    }
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
