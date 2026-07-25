// E2E (@live): workboard #10's virtualizer-kit proof — `collectVirtualRows`/`assertVirtualListMatchesCanon`
// (tests/e2e/support/virtualizer.ts) on a transcript LONGER than the viewport, so the windowed DOM never
// shows every row at once and the sweep is load-bearing (a short-transcript spec would pass even with a
// broken sweep — everything is always mounted). `live-turn-canon-parity.spec.ts` stays the short-transcript
// exemplar for the ghost/bus/engine checks; this spec's ONLY job is full-length DOM↔canon parity under
// virtualization.
//
// SEEDING: sendTurn drives a REAL model turn per call — there is no cheaper canon-seeding path for a long
// transcript (checked: no bulk-seed/import verb exists on chat). 12 real turns (~24 rows + the greeting)
// comfortably exceeds a typical viewport at the list's ~96px row estimate + overscan 10, so mid-sweep the
// DOM genuinely does not contain every row. @live-gated (E2E_LIVE=1) and cost-bounded accordingly — this is
// NOT the routine-battery default.

import { expect, test } from "@playwright/test";
import { waitForAppReady, waitForStreamOpen } from "./support/chat-room";
import { listCanon, listCharacters, sendTurn, startChat, trpcMutation } from "./support/trpc";
import { assertVirtualListMatchesCanon, collectVirtualRows } from "./support/virtualizer";

const TURN_COUNT = 12;

test("collectVirtualRows sweeps a transcript longer than the viewport and matches canon exactly", {
  tag: "@live",
}, async ({ page }) => {
  test.setTimeout(300_000);

  const characterId = (await listCharacters())[0]?.id ?? "";
  expect(characterId).not.toBe("");
  const chatId = await startChat([characterId]);

  for (let i = 0; i < TURN_COUNT; i += 1) {
    // Sequential by necessity: each turn's context includes the prior ones (a real conversation), and
    // sendTurn awaits the full round-trip — there is nothing to parallelize.
    // biome-ignore lint/performance/noAwaitInLoops: sequential real-turn seeding — each turn depends on the chat's prior state.
    await sendTurn(chatId, `Reply with exactly: sweep-probe-${i}`);
  }

  const canon = await listCanon(chatId);
  expect(canon.length).toBeGreaterThan(TURN_COUNT * 2); // greeting + TURN_COUNT user + TURN_COUNT assistant rows

  // Title THIS chat uniquely and open it BY TITLE — NOT "the newest row". `openNewestChat` (desc updatedAt) is
  // unsafe here: a PRIOR spec's fire-and-forget compaction hook / late summarizer write can bump ITS chat's
  // updatedAt AFTER our seeding finishes, PERSISTENTLY floating a foreign chat to the top of the Chats list —
  // the sweep would then faithfully collect the WRONG chat. An authored unique title makes the target row
  // addressable regardless of updatedAt ordering.
  const chatTitle = `sweep-parity-${Date.now()}`;
  await trpcMutation("chat.updateTitle", { chatId, title: chatTitle });

  await page.goto("/");
  await waitForAppReady(page);
  const targetRow = page.getByRole("list", { name: "Chats" }).getByRole("button", { name: new RegExp(chatTitle, "u") });
  await expect(targetRow).toBeVisible({ timeout: 15_000 });
  await targetRow.click();
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible({ timeout: 15_000 });
  await waitForStreamOpen(page);

  // Prove the windowed DOM genuinely does NOT show every row at rest (the sweep is load-bearing, not a
  // no-op on an already-fully-mounted list).
  const mountedAtRest = await page.locator("[data-message-id]").count();
  expect(mountedAtRest).toBeLessThan(canon.length);

  await assertVirtualListMatchesCanon(page, canon);

  // The sweep itself returns the same identity set independent of assertion — a direct call proves the
  // exported collector, not just the assertion wrapper.
  const swept = await collectVirtualRows(page);
  expect(swept.map((r) => r.id)).toEqual(canon.map((c) => c.id));
});
