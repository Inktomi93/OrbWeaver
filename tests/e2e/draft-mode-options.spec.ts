// E2E (model-free): DOCUMENTS THE DRAFT-MODE TRAP as-built. The owner flagged that the app "fell into the
// separate-draft-mode-options-instead-of-greying-out trap": a fresh chat DRAFT renders a DIVERGENT, REDUCED
// room surface instead of the committed room's surface with the not-yet-available affordances disabled
// (greyed out). This spec PINS that divergence precisely so the eventual greyed-out redesign flips this pin
// DELIBERATELY. It does NOT assert the trap is good — it asserts what currently IS, for regression legibility.
//
// THE TRAP, as verified live (pnpm snap --aria + a probe drive, 2026-07-24):
//   • COMMITTED room (status "Loaded chat."): the topbar ⋯ "Chat options" menu is PRESENT (13 items:
//     Continue, Regenerate, Impersonate, Rename, Chat overrides…, Injections…, Download transcript, …), and
//     the transcript renders durable `[data-slot="message-row"]`s.
//   • FRESH draft   (status "New chat draft."): the ⋯ "Chat options" menu is ABSENT ENTIRELY (not disabled),
//     and NO `[data-slot="message-row"]` renders (the greeting is not shown as a durable row). The composer
//     (Message textbox, Send, Guided generations, Generate image) is present in BOTH.
// The divergence = a whole affordance (Chat options) VANISHES in the draft rather than greying out. That is
// the trap. When the redesign lands (draft shows the full room chrome with unavailable actions disabled),
// the two `expect(...).toBe(0)` lines below become wrong ON PURPOSE — update them then.
//
// MODEL-FREE: no turn. Runs under routine `pnpm e2e`. Self-seeding: globalSetup guarantees ≥1 committed chat
// + ≥1 character (Mara is a seeded default with no committed chat of its own → its "Chat with Mara" CTA
// opens a genuinely FRESH draft, not a resume).

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { openOrCreateChat, waitForAppReady } from "./support/chat-room";

const DRAFT_CHARACTER = "Mara"; // a seeded default card with no committed chat → its CTA opens a fresh draft

/** Presence (0/1) of each pinned room affordance on the CURRENT surface. */
async function affordances(page: Page): Promise<{
  readonly chatOptions: number;
  readonly composer: number;
  readonly send: number;
  readonly messageRows: number;
}> {
  return {
    chatOptions: await page.getByRole("button", { name: "Chat options", exact: true }).count(),
    composer: await page.locator('[aria-label="Message"]').count(),
    send: await page.locator('[data-testid="composer-send"]').count(),
    messageRows: await page.locator('[data-slot="message-row"]').count(),
  };
}

test("draft mode renders a DIVERGENT reduced surface (the trap), not the committed room greyed out", async ({ page }) => {
  // ── COMMITTED room: the full-chrome baseline. ──
  await openOrCreateChat(page);
  await expect(page.locator('[data-slot="message-row"]').first()).toBeVisible({ timeout: 15_000 });
  const committed = await affordances(page);

  // Committed has the ⋯ options menu, the composer, and durable rows.
  expect(committed.chatOptions).toBe(1);
  expect(committed.composer).toBe(1);
  expect(committed.send).toBe(1);
  expect(committed.messageRows).toBeGreaterThan(0);

  // The ⋯ menu's item inventory (opened via keyboard — the topbar ⋯ can be pointer-intercepted). Pinned so
  // the redesign can compare the draft's (currently zero) menu against this exact committed inventory.
  await page.getByRole("button", { name: "Chat options", exact: true }).focus();
  await page.getByRole("button", { name: "Chat options", exact: true }).press("Enter");
  const committedMenuItems = await page.getByRole("menuitem").allInnerTexts();
  expect(committedMenuItems).toContain("Rename");
  expect(committedMenuItems).toContain("Regenerate");
  expect(committedMenuItems).toContain("Delete chat");
  await page.keyboard.press("Escape");

  // ── FRESH draft: open via the character CTA (resume-or-new; Mara has no committed chat → new). ──
  await page.getByRole("button", { name: "Characters", exact: true }).click();
  await page.getByRole("button", { name: `Chat with ${DRAFT_CHARACTER}` }).click();
  await expect(page.locator('[role="status"]', { hasText: "New chat draft" })).toBeVisible({ timeout: 15_000 });
  await waitForAppReady(page);
  const draft = await affordances(page);

  // THE TRAP (pinned as-built): the ⋯ "Chat options" menu is ABSENT, and NO durable message-rows render —
  // a divergent reduced surface. The composer IS present (shared). Flip the two zeros when the greyed-out
  // redesign lands (draft should then carry Chat options — disabled — and the committed chrome).
  expect(draft.chatOptions).toBe(0); // TRAP: vanishes instead of greying out — flip to 1 (disabled) on redesign
  expect(draft.messageRows).toBe(0); // TRAP: greeting not shown as a durable row in the draft
  expect(draft.composer).toBe(1);
  expect(draft.send).toBe(1);
});
