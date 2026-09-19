// E2E — instant-create's committed-only room surface. R0/R1 deleted the parallel client draft runtime:
// an explicit Start click now mints a REAL list-hidden husk, and the first explicit activity claims it.
// This remains model-free: a fresh character supplies one durable greeting, Rename is the claiming write,
// and the library row proves the hidden→visible transition without driving a turn.

import { chatWithActionName } from "@orb/client/lib";
import type { CharacterHandle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import {
  charactersRailButton,
  gotoChatsList,
  openChatOptions,
  openOrCreateChat,
  openUtilityMenu,
  renameOpenChat,
  waitForAppReady,
} from "./support/chat-room.ts";
import { mintFreshCharacter, removeCharacter } from "./support/trpc.ts";

// The spec-owned character is re-minted chatless for every run, so its Chat CTA must create a fresh husk
// rather than resume an existing room.
const DRAFT_HANDLE = castId<CharacterHandle>("e2e-draft-probe");
const DRAFT_CHARACTER = "Draft Probe";
const DRAFT_GREETING = "A fresh page, waiting for the first word.";

/** Create and open a fresh husk through the real character-library CTA. */
async function openFreshHusk(page: Page): Promise<void> {
  await page.goto("/");
  await waitForAppReady(page);
  await charactersRailButton(page).click();
  // The CTA rests hidden AND inert (an invisible control is not hit-testable) — hover its row first.
  const chatRow = page.locator('[data-slot="list-row-root"]').filter({ has: page.getByRole("button", { name: chatWithActionName(DRAFT_CHARACTER) }) });
  await chatRow.hover();
  await chatRow.getByRole("button", { name: chatWithActionName(DRAFT_CHARACTER) }).click();
  await expect(page.locator('[role="status"]', { hasText: "Loaded chat" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible({ timeout: 15_000 });
}

test("committed room: the ⋯ options menu is present with its actions enabled", async ({ page }) => {
  await openOrCreateChat(page);
  await expect(page.locator('[data-slot="message-row"]').first()).toBeVisible({ timeout: 15_000 });

  // The ⋯ menu is present; its canon actions are enabled on a committed chat.
  await openChatOptions(page);
  await expect(page.getByRole("menuitem", { name: "Rename" })).toBeEnabled();
  await expect(page.getByRole("menuitem", { name: "Select messages…" })).toBeEnabled();
  await expect(page.getByRole("menuitem", { name: "Delete chat" })).toBeVisible();
  await page.keyboard.press("Escape");

  // Regenerate's home is the ✨ utility menu (#41/D111) — present on a committed room. Enabled-ness depends
  // on the tail row's role (a reused chat can end on a user row), so the pin is PRESENCE: the omit-doctrine
  // says it renders either way, disabled-with-a-reason at worst.
  await openUtilityMenu(page);
  await expect(page.getByRole("menuitem", { name: "Regenerate" })).toBeVisible();
  await page.keyboard.press("Escape");
});

test("start click mounts the real room surface and the first row write claims the husk into the library", async ({ page }) => {
  const characterId = await mintFreshCharacter(DRAFT_HANDLE, DRAFT_CHARACTER, DRAFT_GREETING);
  const claimedTitle = `e2e-husk-claimed-${Date.now()}`;
  try {
    await openFreshHusk(page);

    // There is no draft-specific twin: the real greeting row, composer, and committed-room menu all mount.
    await expect(page.locator('[data-slot="message-row"]').first()).toContainText(DRAFT_GREETING, { timeout: 15_000 });
    await expect(page.locator('[data-testid="composer-send"]')).toBeVisible();
    await openChatOptions(page);
    await expect(page.getByRole("menuitem", { name: "Rename" })).toBeEnabled();
    await expect(page.getByRole("menuitem", { name: "Select messages…" })).toBeEnabled();
    await expect(page.getByRole("menuitem", { name: "Delete chat" })).toBeEnabled();
    await page.keyboard.press("Escape");

    // Rename is explicit activity: it claims the husk, after which ordinary library navigation must reveal it.
    await renameOpenChat(page, claimedTitle);
    await gotoChatsList(page);
    await expect(page.getByRole("list", { name: "Chats list" }).getByRole("button", { name: claimedTitle }).first()).toBeVisible({ timeout: 15_000 });
  } finally {
    await removeCharacter(characterId);
  }
});
