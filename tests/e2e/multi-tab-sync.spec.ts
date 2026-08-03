// E2E: the dual-device / bus-driven live-sync proof (neo 11-multi-tab-sync port) — the browser-level
// verification of orb's "stateless → DB-is-truth → multi-device by design" claim the redesign leans on,
// currently verified nowhere end-to-end. If this regresses, multi-device divergence is silent (no error
// surfaces), so it is the load-bearing assertion.
//
// SHAPE A (the truest orb dual-device proof, list-only, zero room navigation): both browser contexts sit on
// the landing/LIST. Tab A renames chat X via its LIST-ROW kebab; tab B's LIST row for X must update LIVE —
// no reload — via the USER-BUS `chatsChanged` event → `listChats` query invalidation → refetch. This is
// exactly the multi-device mechanism, and needs no `/chat/$id` URL (orb has none — the active chat is
// store-only, so a room can't be deep-linked across tabs; SHAPE A sidesteps that entirely).
//
// Bootstrap: openOrCreateChat on a throwaway page guarantees ≥1 committed chat exists (one real turn the
// first time), then both tabs read the list fresh. The unique minted title makes `getByText` unambiguous.

import { expect, test } from "@playwright/test";
import { openOrCreateChat, renameFirstChatViaRowKebab, waitForAppReady } from "./support/chat-room.ts";

test("rename in tab A propagates live to tab B's list via the user-bus", async ({ browser }) => {
  const ctx = await browser.newContext();
  try {
    // Ensure a committed chat exists (bootstrap once on a scratch page if the DB is empty).
    const boot = await ctx.newPage();
    await openOrCreateChat(boot);
    await boot.close();

    // Both tabs sit on the LANDING/LIST — no room opened, no URL deep-link.
    const tabA = await ctx.newPage();
    const tabB = await ctx.newPage();
    await tabA.goto("/");
    await waitForAppReady(tabA);
    await tabB.goto("/");
    await waitForAppReady(tabB);
    // Both list the same first chat.
    const listRowB = tabB.getByRole("list", { name: "Chats" }).getByRole("button").first();
    await expect(listRowB).toBeVisible({ timeout: 15_000 });

    const newTitle = `e2e-multitab-${Date.now()}`;
    await renameFirstChatViaRowKebab(tabA, newTitle);
    // Tab A reflects its own rename in its list row.
    await expect(tabA.getByText(newTitle).first()).toBeVisible({ timeout: 5000 });

    // THE load-bearing assertion: tab B's LIST updates via the user-bus with NO manual reload.
    await expect(tabB.getByText(newTitle).first()).toBeVisible({ timeout: 10_000 });
  } finally {
    await ctx.close();
  }
});
