// Passive two-tab smoke: a known room renamed in A must update B without reload.
import type { CharacterHandle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/test";
import { gotoChatsList, renameFirstChatViaRowKebab } from "./support/chat-room.ts";
import { WAIT_SHORT_MS, WAIT_SURFACE_MS, WAIT_UI_MS } from "./support/timeouts.ts";
import { deleteChat, mintFreshCharacter, removeCharacter, startGroupChat, trpcQuery } from "./support/trpc.ts";

test("rename in tab A propagates live to tab B's list via the user-bus", { tag: "@smoke" }, async ({ browser }) => {
  const characterId = await mintFreshCharacter(castId<CharacterHandle>("e2e-passive-sync"), "Passive Sync", "A known sync greeting.");
  const title = "Smoke passive sync original";
  const { id: chatId } = await startGroupChat({ characterIds: [characterId], title });
  const ctx = await browser.newContext();
  try {
    // Both tabs sit on the Chats-section LIST — no room opened, no URL deep-link. (The list moved off `/`
    // in the variant-C home rework; `gotoChatsList` lands the Chats section where the `aria-label="Chats list"`
    // list lives, which is exactly the surface SHAPE A's live-sync proof needs.)
    const tabA = await ctx.newPage();
    const tabB = await ctx.newPage();
    await gotoChatsList(tabA);
    await gotoChatsList(tabB);
    // Both list the same first chat.
    const listRowB = tabB.getByRole("list", { name: "Chats list" }).getByRole("button").first();
    await expect(listRowB).toBeVisible({ timeout: WAIT_SURFACE_MS });
    await expect(listRowB).toContainText(title);
    await expect(tabA.getByRole("list", { name: "Chats list" }).getByRole("button").first()).toContainText(title);

    const newTitle = "e2e-multitab-smoke-renamed";
    await renameFirstChatViaRowKebab(tabA, newTitle);
    // Tab A reflects its own rename in its list row.
    await expect(tabA.getByText(newTitle).first()).toBeVisible({ timeout: WAIT_SHORT_MS });

    // THE load-bearing assertion: tab B's LIST updates via the user-bus with NO manual reload.
    await expect(listRowB).toContainText(newTitle, { timeout: WAIT_UI_MS });
    expect((await trpcQuery("chat.getChat", { chatId })).title).toBe(newTitle);
  } finally {
    await ctx.close();
    await deleteChat(chatId);
    await removeCharacter(characterId);
  }
});
