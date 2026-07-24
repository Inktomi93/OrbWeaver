// E2E (@live): the context-cutoff DIVIDER is SANE — it renders at exactly the row the SERVER's fit computed,
// never a client estimate. The server's history-budget fit-pass (chat/assembly/history-budget.ts
// fitHistoryToWindow) computes ceiling = min(model window, intent.maxContextTokens), reserves system +
// output + a 64 margin, drops the OLDEST turns, and stamps the earliest-kept message id onto the assistant
// variant as `contextBoundaryMessageId` (MessageView, contracts/chat). The client renders the divider on the
// row whose id == the NEWEST assistant variant's boundary (context-boundary.ts resolveContextBoundaryMessageId
// + message-list-surface.tsx `contextBoundary={item.view.id === contextBoundaryMessageId}`), as a sibling
// `[data-slot="context-boundary-divider"]` rendered IMMEDIATELY BEFORE that row (message-row.tsx line ~197).
//
// FORCING A MID-TRANSCRIPT CUT WITHOUT SHARED-STATE MUTATION: this spec seeds its OWN throwaway chat and
// drives the final turn via chat.send with a per-send `intent.maxContextTokens` of 200. The per-send intent
// OVERRIDES the preset params in the fold, so NO preset is mutated and there is NOTHING TO RESTORE (the
// coordinator's "restore the preset" concern is avoided by not touching a shared preset at all). Verified
// live (2026-07-24): with a 200-token ceiling and a few prior turns, the fit keeps only the newest turn and
// stamps the boundary on the trailing user row — a real cut strictly after seq 1.
//
// @live: seeds via three real API turns (~10-18s warm). Skipped unless E2E_LIVE=1. FULLY self-seeding — it
// creates and drives its own chat; it does not depend on globalSetup's chat and leaves the tiny ceiling
// nowhere (it was a per-send intent, not persisted config).

import { expect, test } from "@playwright/test";
import { waitForAppReady } from "./support/chat-room";
import { listCanon, listCharacters, sendTurn, startChat } from "./support/trpc";

// The e2e tsconfig is the DOM-less node aggregator (no lib.dom); type the evaluate callback element members
// we read locally (same bridge posture as chat-room.ts's OrbBusHandle). The runtime value is a real element.
interface DomEl {
  readonly getAttribute: (name: string) => string | null;
  readonly nextElementSibling: DomEl | null;
}

const TINY_CEILING = 200; // maxContextTokens small enough that only the newest turn survives the fit

test("the context-boundary divider renders on the server-computed row, not a client guess", {
  tag: "@live",
}, async ({ page }) => {
  test.setTimeout(180_000);

  // ── Seed a throwaway chat with enough history that a tiny ceiling forces a mid-transcript cut. ──
  const characterId = (await listCharacters())[0]?.id ?? "";
  expect(characterId).not.toBe("");
  const chatId = await startChat([characterId]);

  // Two normal turns build history; the final turn imposes the tiny ceiling → older turns drop.
  await sendTurn(chatId, "Count to three.");
  await sendTurn(chatId, "Name a color.");
  await sendTurn(chatId, "Say ok.", TINY_CEILING);

  // ── (a) The new assistant canon row carries a non-null boundary strictly AFTER the first message. ──
  const canon = await listCanon(chatId);
  const boundaryId = canon.filter((c) => c.role === "assistant" && c.contextBoundaryMessageId !== null).at(-1)?.contextBoundaryMessageId;
  expect(boundaryId).toBeTruthy();
  const boundaryIdx = canon.findIndex((c) => c.id === boundaryId);
  expect(boundaryIdx).toBeGreaterThan(0); // a REAL mid-transcript cut, not "everything kept"

  // ── Open the chat in the UI and read the DOM. The active chat is store-only; navigate + open the row. ──
  await page.goto("/");
  await waitForAppReady(page);
  await page.getByRole("list", { name: "Chats" }).getByRole("button").first().click();
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-slot="message-row"]').first()).toBeVisible({ timeout: 15_000 });

  // ── (b) The divider renders on EXACTLY the row whose data-message-id == the canon boundary id. ──
  // The divider is the immediately-preceding sibling of the boundary row; assert both: the boundary row
  // carries the divider as its previous element sibling, and NO OTHER row does.
  const dividerRowId = await page
    .locator('[data-slot="context-boundary-divider"]')
    // FABRICATION-OK: bridge the real DOM element to a local shape — the DOM-less e2e tsconfig can't type an evaluate element param.
    .evaluate((el) => (el as unknown as DomEl).nextElementSibling?.getAttribute("data-message-id") ?? null);
  expect(dividerRowId).toBe(boundaryId);
  await expect(page.locator('[data-slot="context-boundary-divider"]')).toHaveCount(1);

  // ── (c) Rows ABOVE the divider are the dropped-from-context ones (older seq than the boundary). ──
  // In DOM order, every message-row before the divider has a canon seq < the boundary row's seq.
  const boundarySeq = canon[boundaryIdx]?.seq ?? -1;
  const domIdsInOrder = await page
    .locator('[data-slot="message-row"]')
    // FABRICATION-OK: bridge the real DOM elements to a local shape — the DOM-less e2e tsconfig can't type an evaluateAll element param.
    .evaluateAll((els) => (els as unknown as readonly DomEl[]).map((e) => e.getAttribute("data-message-id")));
  const seqOf = (id: string | null): number => canon.find((c) => c.id === id)?.seq ?? Number.NaN;
  const dividerDomIndex = domIdsInOrder.findIndex((id) => id === boundaryId);
  expect(dividerDomIndex).toBeGreaterThan(0);
  for (let i = 0; i < dividerDomIndex; i++) {
    expect(seqOf(domIdsInOrder[i] ?? null)).toBeLessThan(boundarySeq);
  }
});
