// E2E (model-free for the draft leg): the #8 GREY-OUT REDESIGN. The owner "really truly hates" the
// separate-draft-mode-options trap where a fresh chat DRAFT rendered a DIVERGENT, REDUCED room surface
// instead of the committed room's surface with the not-yet-available affordances DISABLED (greyed out).
// This spec PINS the redesigned behavior: the draft renders the ONE room surface — the same ⋯ "Chat
// options" menu is PRESENT (not vanished) with its canon-requiring actions DISABLED, the founding greeting
// renders as a durable message-row (character-first, never a reduced void), and the composer is the same
// stable element. (This flips the pre-redesign "the ⋯ menu is ABSENT / no rows render" pins on purpose.)
//
// THE REDESIGN, as pinned here (owner ruling 2026-07-24: "i fucking hate things hiding and when it's
// disabled on hover tell why" — nothing HIDES; every disabled item explains its unlock on hover):
//   • COMMITTED room: the ⋯ "Chat options" menu is PRESENT with Rename/Regenerate/Delete chat ENABLED;
//     durable `[data-slot="message-row"]`s render.
//   • FRESH draft:    the SAME ⋯ menu renders the IDENTICAL item set — the canon-requiring actions
//     (Continue / Regenerate / Rename / Select messages… / Delete chat / Download transcript) are all
//     DISABLED (nothing removed), each with a hover `title` NAMING the unlock ("…after you send the first
//     message"). The canon-less config actions (Chat overrides… / Injections…) stay ENABLED. The founding
//     greeting renders as a durable row. The composer (Message textbox, Send) is present in BOTH — one
//     surface, disabled affordances.
//
// MODEL-FREE: the draft leg drives no turn (the ⋯ menu + greeting render pre-send). Runs under routine
// `pnpm e2e`. FULLY self-seeding: the draft leg mints its OWN spec-owned character (chatless by
// construction) instead of assuming a seeded card stays virgin — earlier sweep specs commit chats onto
// the seeded characters, and a character WITH chats resumes its latest room instead of opening a draft
// (the rotating-sweep-failure class, 2026-07-24).

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { openChatOptions, openOrCreateChat, waitForAppReady } from "./support/chat-room";
import { mintFreshCharacter, removeCharacter } from "./support/trpc";

// The spec-owned draft character — minted per-test via the API, removed in a finally. Its Chat CTA opens
// a genuinely FRESH draft; the "New chat draft" status band disambiguates draft from a resumed room.
const DRAFT_HANDLE = "e2e-draft-probe";
const DRAFT_CHARACTER = "Draft Probe";
const DRAFT_GREETING = "A fresh page, waiting for the first word.";

// The draft disabled-item hover reason names the unlock condition (owner ruling: not just "unavailable").
const FIRST_SEND_UNLOCK = /send the first message/u;

/** Open a FRESH draft on the spec-owned character: load the app, navigate to the character library, and
 *  click its resume-or-new Chat CTA. Gates on the draft status band so a resumed committed room can't
 *  pass as a draft. Caller has already minted the character (chatless ⇒ the CTA is always a draft). */
async function openFreshDraft(page: Page): Promise<void> {
  await page.goto("/");
  await waitForAppReady(page);
  await page.getByRole("button", { name: "Characters", exact: true }).click();
  await page.getByRole("button", { name: `Chat with ${DRAFT_CHARACTER}` }).click();
  await expect(page.locator('[role="status"]', { hasText: "New chat draft" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible({ timeout: 15_000 });
}

test("committed room: the ⋯ options menu is present with its actions enabled", async ({ page }) => {
  await openOrCreateChat(page);
  await expect(page.locator('[data-slot="message-row"]').first()).toBeVisible({ timeout: 15_000 });

  // The ⋯ menu is present; its canon actions are enabled on a committed chat.
  await openChatOptions(page);
  await expect(page.getByRole("menuitem", { name: "Rename" })).toBeEnabled();
  await expect(page.getByRole("menuitem", { name: "Delete chat" })).toBeVisible();
  // Regenerate needs a tail assistant row (the bootstrap turn produces one).
  await expect(page.getByRole("menuitem", { name: "Regenerate" })).toBeVisible();
  await page.keyboard.press("Escape");
});

test("draft: the SAME ⋯ menu renders with canon-requiring actions DISABLED (nothing hidden) + hover reasons", async ({ page }) => {
  // Spec-owned character, chatless by construction (see header) — removed in the finally even on failure.
  const characterId = await mintFreshCharacter(DRAFT_HANDLE, DRAFT_CHARACTER, DRAFT_GREETING);
  try {
    await openFreshDraft(page);

    // The ⋯ "Chat options" menu is PRESENT on the draft (the redesign — it no longer vanishes).
    const options = page.getByRole("button", { name: "Chat options", exact: true });
    await expect(options).toBeVisible({ timeout: 15_000 });
    await openChatOptions(page);

    // Canon-requiring actions render but are DISABLED (no committed turn / no server row yet), each carrying
    // a hover reason naming the unlock (owner ruling: "when it's disabled on hover tell why").
    const continueItem = page.getByRole("menuitem", { name: "Continue" });
    await expect(continueItem).toBeDisabled();
    await expect(continueItem).toHaveAttribute("title", FIRST_SEND_UNLOCK);
    await expect(page.getByRole("menuitem", { name: "Regenerate" })).toBeDisabled();
    const renameItem = page.getByRole("menuitem", { name: "Rename" });
    await expect(renameItem).toBeDisabled();
    await expect(renameItem).toHaveAttribute("title", FIRST_SEND_UNLOCK);
    await expect(page.getByRole("menuitem", { name: "Select messages…" })).toBeDisabled();

    // Canon-less draft-config actions stay ENABLED (the context tabs are the unified draft twin).
    await expect(page.getByRole("menuitem", { name: "Chat overrides…" })).toBeEnabled();
    await expect(page.getByRole("menuitem", { name: "Injections…" })).toBeEnabled();

    // Owner ruling: nothing HIDES — Delete/Download now RENDER on a draft, DISABLED with a reason (they were
    // omitted before this ruling; that pin is flipped ON PURPOSE).
    const deleteItem = page.getByRole("menuitem", { name: "Delete chat" });
    await expect(deleteItem).toBeVisible();
    await expect(deleteItem).toBeDisabled();
    await expect(deleteItem).toHaveAttribute("title", FIRST_SEND_UNLOCK);
    const downloadItem = page.getByRole("menuitem", { name: "Download transcript" });
    await expect(downloadItem).toBeVisible();
    await expect(downloadItem).toBeDisabled();
    await page.keyboard.press("Escape");

    // The founding greeting renders as a durable message-row (character-first, never a reduced void), and
    // the composer is the same stable element — one surface, greyed affordances.
    await expect(page.locator('[data-slot="message-row"]').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
    await expect(page.locator('[data-testid="composer-send"]')).toBeVisible();
    await waitForAppReady(page);
  } finally {
    await removeCharacter(characterId);
  }
});
