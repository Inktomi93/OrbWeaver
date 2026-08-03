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
//   • COMMITTED room: the ⋯ "Chat options" menu is PRESENT with Rename/Select messages…/Delete chat
//     ENABLED; durable `[data-slot="message-row"]`s render.
//   • FRESH draft:    the SAME ⋯ menu renders the IDENTICAL item set — its canon-requiring actions
//     (Rename / Select messages… / Delete chat / Download transcript) are all DISABLED (nothing removed),
//     each with a hover `title` NAMING the unlock ("…after you send the first message"). The canon-less
//     actions (New chat with same cast / Close chat) stay ENABLED. The founding greeting renders as a
//     durable row. The composer (Message textbox, Send) is present in BOTH — one surface, disabled
//     affordances.
//
// THE TURN ACTIONS ARE NOT IN THIS MENU ANY MORE (#41 consolidation + D111 §3, the ST-style wand): the
// composer WAND is the guided-actions home, so the same show-everything law is asserted THERE — the four
// always-visible dual-mode icons (Impersonate·Swipe·Generate opening·Continue) render on a draft too, the
// phase-unavailable ones aria-disabled with a legible "<label> — <reason>" title, and Regenerate lives in
// the ✨ utility menu (D111's Swipe/Regenerate dual-home is composer ⟳ + the message swipe-strip arrow —
// never the ⋯ menu). Chat overrides…/Injections… left the ⋯ menu for their CONTEXT-panel tabs (the IA
// de-dup rule: an option with a context-panel home does not belong in the three dots). The pre-#41 pins on
// those six items are flipped here ON PURPOSE — they encoded the old IA, not a defect.
//
// MODEL-FREE: the draft leg drives no turn (the ⋯ menu + greeting render pre-send). Runs under routine
// `pnpm e2e`. FULLY self-seeding: the draft leg mints its OWN spec-owned character (chatless by
// construction) instead of assuming a seeded card stays virgin — earlier sweep specs commit chats onto
// the seeded characters, and a character WITH chats resumes its latest room instead of opening a draft
// (the rotating-sweep-failure class, 2026-07-24).

import type { CharacterHandle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { charactersRailButton, openChatOptions, openOrCreateChat, openUtilityMenu, waitForAppReady } from "./support/chat-room.ts";
import { mintFreshCharacter, removeCharacter } from "./support/trpc.ts";

// The spec-owned draft character — minted per-test via the API, removed in a finally. Its Chat CTA opens
// a genuinely FRESH draft; the "New chat draft" status band disambiguates draft from a resumed room.
const DRAFT_HANDLE = castId<CharacterHandle>("e2e-draft-probe");
const DRAFT_CHARACTER = "Draft Probe";
const DRAFT_GREETING = "A fresh page, waiting for the first word.";

// The draft disabled-item hover reason names the unlock condition (owner ruling: not just "unavailable").
const FIRST_SEND_UNLOCK = /send the first message/u;
// The wand's phase reason for the tail-assistant-requiring actions (Swipe/Regenerate/Continue) — the
// draft has no reply to act on yet. Matched on the shared fragment, not the whole copy string.
const NEEDS_A_REPLY = /needs a reply/u;

/** Open a FRESH draft on the spec-owned character: load the app, navigate to the character library, and
 *  click its resume-or-new Chat CTA. Gates on the draft status band so a resumed committed room can't
 *  pass as a draft. Caller has already minted the character (chatless ⇒ the CTA is always a draft). */
async function openFreshDraft(page: Page): Promise<void> {
  await page.goto("/");
  await waitForAppReady(page);
  await charactersRailButton(page).click();
  // The CTA rests hidden AND inert (an invisible control is not hit-testable) — hover its row first.
  const chatRow = page.locator('[data-slot="list-row-root"]').filter({ has: page.getByRole("button", { name: `Chat with ${DRAFT_CHARACTER}` }) });
  await chatRow.hover();
  await chatRow.getByRole("button", { name: `Chat with ${DRAFT_CHARACTER}` }).click();
  await expect(page.locator('[role="status"]', { hasText: "New chat draft" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible({ timeout: 15_000 });
}

/** One phase-disabled guided icon: aria-disabled AND a title that keeps the LABEL legible in front of the
 *  reason ("Continue — needs a reply to continue…"), per the wand's disabled-affordance law. The reason tail
 *  is `.+` on purpose — the #54 honest-refusal cause legitimately wins over the phase cause. */
async function expectDisabledWithLegibleReason(page: Page, label: string): Promise<void> {
  const icon = page.getByRole("button", { name: label, exact: true });
  await expect(icon).toBeDisabled();
  await expect(icon).toHaveAttribute("title", new RegExp(`^${label} — .+`, "u"));
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
    const selectItem = page.getByRole("menuitem", { name: "Select messages…" });
    await expect(selectItem).toBeDisabled();
    await expect(selectItem).toHaveAttribute("title", FIRST_SEND_UNLOCK);
    const renameItem = page.getByRole("menuitem", { name: "Rename" });
    await expect(renameItem).toBeDisabled();
    await expect(renameItem).toHaveAttribute("title", FIRST_SEND_UNLOCK);

    // Canon-less actions stay ENABLED — a draft can start a sibling chat or close itself with no server row.
    await expect(page.getByRole("menuitem", { name: "New chat with same cast" })).toBeEnabled();
    await expect(page.getByRole("menuitem", { name: "Close chat" })).toBeEnabled();

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

    // The RELOCATED turn actions (#41/D111 §3): the four guided icons render on the draft too — never hidden,
    // never swapped. Swipe/Continue are phase-disabled here (no assistant tail yet) and their title keeps the
    // LABEL legible alongside the reason ("Continue — needs a reply to continue…"). The reason itself is
    // matched loosely on purpose: the #54 honest-refusal cause WINS over the phase cause when the chat's
    // connection can't serve, and either is a correct legible reason for this pin.
    await expectDisabledWithLegibleReason(page, "Swipe");
    await expectDisabledWithLegibleReason(page, "Continue");
    // Response is NEVER phase-disabled — on a draft it reads "Generate opening" (it hosts empty-send-generate).
    await expect(page.getByRole("button", { name: "Generate opening", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Impersonate", exact: true })).toBeVisible();

    // Regenerate's home is the ✨ utility menu — rendered on a draft, DISABLED with its reason (nothing hides).
    await openUtilityMenu(page);
    const regenerate = page.getByRole("menuitem", { name: "Regenerate" });
    await expect(regenerate).toBeVisible();
    await expect(regenerate).toBeDisabled();
    await expect(regenerate).toHaveAttribute("title", NEEDS_A_REPLY);
    await page.keyboard.press("Escape");

    await waitForAppReady(page);
  } finally {
    await removeCharacter(characterId);
  }
});
