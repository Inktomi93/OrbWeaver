// Home on the committed corpus: the first-run gate stays shut, and rooms launch from Characters and the temp-chat tile.
import {
  BLANK_CHAT_NAME,
  chatWithActionName,
  NO_CHAT_SELECTED_TITLE,
  START_NEW_CHAT_NAME,
  START_TEMP_CHAT_NAME,
  TEMPORARY_CHAT_BADGE,
  testId,
} from "@orb/client/lib";
import type { CharacterHandle } from "@orb/kit/ids";
import { castId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import type { Page, Response } from "@playwright/test";
import { z } from "zod";
import { ownerActor } from "./support/actors.ts";
import { charactersRailButton, waitForAppReady } from "./support/chat-room.ts";
import { expect, test } from "./support/corpus-test.ts";
import { SELECTED_CORPUS_FIXTURE } from "./support/modes.ts";
import { batchResultData, mintFreshCharacter, removeCharacter } from "./support/trpc.ts";

const startedChat = z.object({ chat: z.object({ id: typeIdSchema(ID_PREFIX.chat) }) });
const UNSENT_LINE = "a line I have not sent yet";
const PROBE_HANDLE = castId<CharacterHandle>("e2e-home-launch");
const PROBE_NAME = "Home Launch Probe";
const PROBE_GREETING = "The night market hums.";

// The phone's bottom bar carries only the curated sections, so it reaches Home and Chats through the command palette.
async function goToSection(page: Page, isMobile: boolean, name: "Home" | "Chats"): Promise<void> {
  if (!isMobile) {
    await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name, exact: true }).click();
    return;
  }
  // The shortcut ignores text-entry targets, so leave the composer first.
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog", { name: "Jump to…", exact: true });
  await palette.getByRole("combobox", { name: "Command palette", exact: true }).fill(name);
  await palette.getByRole("option", { name, exact: true }).click();
  await expect(palette).toBeHidden();
}

async function startedChatId(response: Response): Promise<z.output<typeof startedChat>["chat"]["id"]> {
  expect(response.ok()).toBe(true);
  return startedChat.parse(batchResultData(await response.json())?.data).chat.id;
}

async function openHome(page: Page): Promise<void> {
  await page.goto("/");
  await waitForAppReady(page);
}

test.describe("committed corpus room launches", () => {
  test.skip(SELECTED_CORPUS_FIXTURE === undefined, "Requires the committed corpus");

  test("a user who owns a persona never sees the first-run gate", { tag: "@smoke" }, async ({ page, isMobile }) => {
    await openHome(page);
    await expect(page.locator('[data-home-tile="chat.recents"]')).toBeVisible();
    // The gate renders only once persona.list and the settings seeds settle, and the desktop rail-foot name resolves from
    // those same reads, so it is the barrier that makes the absence below mean something. Which persona it names depends on
    // what earlier specs left (the default outranks the last played), so the barrier is the resolved form, not a name.
    // A phone has only the You tab.
    await expect(page.getByRole("button", isMobile ? { name: "You", exact: true } : { name: /^Playing as .+$/u })).toBeVisible();
    await expect(page.getByTestId(testId("firstRunPersonaDialog"))).toHaveCount(0);
  });

  test("the chats section's own no-selection state offers one new-chat door and no composer", { tag: "@smoke" }, async ({ page, isMobile }) => {
    // A phone opens Chats on its list screen; the content pane that carries this state is not a screen there.
    test.skip(isMobile, "The phone's Chats section opens on its list screen");
    await openHome(page);
    await goToSection(page, isMobile, "Chats");
    await expect(page.getByText(NO_CHAT_SELECTED_TITLE, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: START_NEW_CHAT_NAME, exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Message" })).toHaveCount(0);
  });

  test("picking a character in the library creates the chat and lands in it", { tag: "@smoke" }, async ({ page, baseURL }) => {
    const host = ownerActor(baseURL ?? "");
    // The Chat door resumes an existing room, so the launch needs a character with none; the greeting is known.
    const characterId = await mintFreshCharacter(PROBE_HANDLE, PROBE_NAME, PROBE_GREETING);
    let startRequests = 0;
    page.on("request", (request) => {
      startRequests += request.url().includes("/api/trpc/chat.startChat") ? 1 : 0;
    });
    try {
      await openHome(page);
      await charactersRailButton(page).click();
      await page.getByRole("textbox", { name: "Search characters", exact: true }).fill(PROBE_NAME);
      const cta = page.getByRole("button", { name: chatWithActionName(PROBE_NAME), exact: true });
      await expect(cta).toBeVisible();
      await expect(page.getByRole("textbox", { name: "Message" })).toHaveCount(0);
      // A floated action cluster is inert at rest; the row must be hovered before its door can be clicked.
      await page.locator('[data-slot="list-row-root"]').filter({ has: cta }).hover();
      const started = page.waitForResponse((response) => response.url().includes("/api/trpc/chat.startChat"));
      await cta.click();
      const chatId = await startedChatId(await started);
      try {
        await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
        await expect(page.locator('[data-slot="message-row"][data-role="assistant"]').first()).toContainText(PROBE_GREETING);
        expect(startRequests).toBe(1);
      } finally {
        await host.trpc.chat.delete.mutate({ chatId });
      }
    } finally {
      await removeCharacter(characterId);
    }
  });

  test("the temp tile starts its room through the shared picker and the unsent line survives a section round-trip", { tag: "@smoke" }, async ({
    page,
    baseURL,
    isMobile,
  }) => {
    const host = ownerActor(baseURL ?? "");
    await openHome(page);
    await page.getByRole("button", { name: START_TEMP_CHAT_NAME, exact: true }).click();
    const picker = page.getByRole("dialog");
    await expect(picker.getByText(TEMPORARY_CHAT_BADGE, { exact: true })).toBeVisible();
    const started = page.waitForResponse((response) => response.url().includes("/api/trpc/chat.startChat"));
    await picker.getByRole("button", { name: BLANK_CHAT_NAME, exact: true }).click();
    const chatId = await startedChatId(await started);
    try {
      expect((await host.trpc.chat.getChat.query({ chatId })).temporary).toBe(true);
      const composer = page.getByRole("textbox", { name: "Message" });
      await expect(composer).toBeVisible();
      await expect(page.locator(".shell-topbar").getByText(TEMPORARY_CHAT_BADGE, { exact: true })).toBeVisible();
      await composer.click();
      await composer.pressSequentially(UNSENT_LINE);
      await expect(composer).toHaveValue(UNSENT_LINE);

      await goToSection(page, isMobile, "Home");
      await expect(page.locator('[data-home-tile="chat.tempChat"]')).toBeVisible();
      await goToSection(page, isMobile, "Chats");

      await expect(page.getByText(NO_CHAT_SELECTED_TITLE, { exact: true })).toHaveCount(0);
      await expect(composer).toHaveValue(UNSENT_LINE);
      await expect(page.locator(".shell-topbar").getByText(TEMPORARY_CHAT_BADGE, { exact: true })).toBeVisible();
    } finally {
      await host.trpc.chat.delete.mutate({ chatId });
    }
  });
});
