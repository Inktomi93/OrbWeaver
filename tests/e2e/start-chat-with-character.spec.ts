// E2E: the real "start a chat with a character" flow, end-to-end against the full running stack — the
// proof that this seam makes the app actually generate. single-user AUTH_MODE auto-resolves the owner
// (no login form); globalSetup (support/global-setup.ts) guarantees ≥1 character card. roleDefaults.chat =
// chat-completions/vllm (the D109 local wire globalSetup pins) + consent are live, so with a character in
// the room the turn WILL generate + stream.
//
// OPT-IN (`@live`): this is the ONE spec that fires a real local vLLM chat turn (up to ~120s of live
// generation), so it is SKIPPED by default and only runs under `E2E_LIVE=1` — routine `pnpm e2e` (and the
// CI smoke gate, which excludes `@live`) never hits live model credits. Run it explicitly with:
//   E2E_LIVE=1 pnpm e2e start-chat-with-character.spec.ts
//
// The flow: `/` → Characters section → the first row's kebab ("Actions for X") → "Chat" (the library→chat
// store seam; in the docked library width the inline "Chat with X" CTA folds into this kebab) → the route
// flips CONTENT to a fresh draft seeded with that character → type (pressSequentially — `fill` bypasses
// React's onChange so the composer's controlled value never updates) → Enter → the first send calls
// `chat.startChat` with the seeded roster, then commits the text as its first turn → the assistant (now
// a real speaker in the room) streams a reply back.

import { expect, test } from "@playwright/test";
import { charactersRailButton, typeAndSend } from "./support/chat-room";

const CHARACTER_ROW_CHAT_CTA = /^Chat with /u;
const NON_WHITESPACE = /\S/u;

// The `@live` tag is the opt-in gate: playwright.config.ts sets `grepInvert: /@live/` UNLESS `E2E_LIVE=1`,
// so routine `pnpm e2e` (and the CI smoke gate) skip this real-model-turn spec — no credits spent (header).
test("pick a character, send a message, and the assistant streams a reply", {
  tag: "@live",
}, async ({ page }) => {
  // Real generation goes through the Agent SDK subprocess — give the whole flow room (cold model spin-up
  // + the streamed turn) well beyond Playwright's 30s default.
  test.setTimeout(180_000);

  await page.goto("/");

  // Single-user mode: `/` resolves the owner with no login. Wait for the client to mount the shell —
  // the rail's Characters nav is the entry to the library (exact — "Characters" is a substring of
  // "Collapse Characters panel").
  const charactersNav = charactersRailButton(page);
  await expect(charactersNav).toBeVisible({ timeout: 30_000 });
  await charactersNav.click();

  // The first character row's "Chat with <name>" CTA (§4.4 — the 1-click core loop). The row kebab carries
  // only Archive/Duplicate/Delete in this client — chat is the dedicated CTA, not a menu item. The revealed
  // cluster is now INERT while hidden (an invisible control must not be hit-testable), so hover the ROW
  // first — a bare `.click()` would wait forever on the "receives pointer events" actionability check.
  const chatRow = page
    .locator('[data-slot="list-row-root"]')
    .filter({ has: page.getByRole("button", { name: CHARACTER_ROW_CHAT_CTA }) })
    .first();
  await expect(chatRow).toBeVisible({ timeout: 30_000 });
  await chatRow.hover();
  await chatRow.getByRole("button", { name: CHARACTER_ROW_CHAT_CTA }).click();

  // The store seam flipped CONTENT back to the Chats section with a fresh, character-seeded draft: the
  // composer is live.
  const composer = page.getByRole("textbox", { name: "Message" });
  await expect(composer).toBeVisible();

  // Type + send via the shared helper (it drives React's onChange — `fill` does not — and RETRIES past the
  // composer re-mount that otherwise drops all but the first keystroke; see support/chat-room.ts typeAndSend).
  await typeAndSend(composer, "Hello there! Please introduce yourself briefly.");

  // The user's message committed. The "Chat with X" CTA is resume-or-new: if a committed chat already exists
  // for this character (e.g. other @live specs seeded one), it RESUMES into a populated room, so there can be
  // MORE THAN ONE user row — assert on the LAST (the message we just sent), not the strict-mode-violating
  // multi-match locator.
  const userRow = page.locator('[data-slot="message-row"][data-role="user"]').last();
  await expect(userRow).toContainText("Hello there!", { timeout: 30_000 });

  // The money shot: with a character in the room there IS a speaker, so the assistant generates and its
  // reply streams back as a real canonical row with non-empty content. (We assert on the landed reply,
  // not the transient Stop-button/ghost window — the Stop affordance is a ~ttft-length flash that races
  // the SSE-subscribe-vs-turnStarted timing; the reply appearing is the robust, deterministic proof the
  // turn actually generated, corroborated by the local vLLM gen engine's message-POST log.)
  const assistantRow = page.locator('[data-slot="message-row"][data-role="assistant"]');
  await expect(assistantRow.first()).toBeVisible({ timeout: 120_000 });
  await expect(assistantRow.first()).toContainText(NON_WHITESPACE, { timeout: 120_000 });
});

// The draft-promotion P1 (found by a live UX review): on a NEW-CHAT DRAFT, the first send promotes the
// draft to a committed chat MID-FLOW (fireOpening → chat.startChat mints the real chatId, then chat.send
// runs the turn). The reply streamed + rendered FULLY, but the composer STUCK on "Stop generating" forever
// — a re-attach of the seeded (`lastEventId:"0"`) SSE subscription re-REPLAYED the durable log from zero,
// and the re-replayed `turnStarted` re-OPENED the already-completed turn slot with no matching terminal
// re-arriving, stranding the slot live (composer Stop is driven purely by the slot phase). Fixed by the
// monotonic per-chat seq guard in the bus adapter (chat-event-seq-guard.ts). This pins the EXACT broken
// journey: after the first draft send completes, the composer RETURNS TO SEND, the input RE-ENABLES, and a
// SECOND message sends successfully — the recovery the reload-only bug denied.
test("draft promotion: after the first send completes, the composer returns to Send and a second message sends", {
  tag: "@live",
}, async ({ page }) => {
  test.setTimeout(240_000);

  await page.goto("/");
  const charactersNav = charactersRailButton(page);
  await expect(charactersNav).toBeVisible({ timeout: 30_000 });
  await charactersNav.click();

  const chatCta = page.getByRole("button", { name: CHARACTER_ROW_CHAT_CTA }).first();
  await expect(chatCta).toBeAttached({ timeout: 30_000 });
  await chatCta.click();

  const composer = page.getByRole("textbox", { name: "Message" });
  await expect(composer).toBeVisible();

  // First send — the draft→committed promotion + a real streamed turn.
  await typeAndSend(composer, "Hello there! Please introduce yourself in one short sentence.");

  const assistantRow = page.locator('[data-slot="message-row"][data-role="assistant"]');
  await expect(assistantRow.first()).toBeVisible({ timeout: 120_000 });
  await expect(assistantRow.first()).toContainText(NON_WHITESPACE, { timeout: 120_000 });

  // THE RECOVERY (the bug): the turn is done, so the composer MUST return to Send — the Stop button gone,
  // the primary Send present, and the input re-enabled. Before the fix this stuck on "Stop generating"
  // indefinitely (input + Send disabled), recoverable only by a page reload.
  const sendButton = page.locator('[data-testid="composer-send"]');
  await expect(sendButton).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Stop generating" })).toHaveCount(0);
  await expect(composer).toBeEnabled();

  // The proof the room is genuinely usable again (not just visually recovered): a SECOND message types and
  // sends, committing its own durable user row — the journey the reviewer could not complete without a reload.
  const userRowsBefore = await page.locator('[data-slot="message-row"][data-role="user"]').count();
  await typeAndSend(composer, "Great — now name one hobby you enjoy.");
  await expect.poll(async () => page.locator('[data-slot="message-row"][data-role="user"]').count(), { timeout: 30_000 }).toBeGreaterThan(userRowsBefore);
  await expect(page.locator('[data-slot="message-row"][data-role="user"]').last()).toContainText("one hobby", { timeout: 30_000 });
});
