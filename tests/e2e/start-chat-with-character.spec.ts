// E2E: the real "start a chat with a character" flow, end-to-end against the full running stack — the
// proof that this seam makes the app actually generate. single-user AUTH_MODE auto-resolves the owner
// (no login form); globalSetup (support/global-setup.ts) guarantees ≥1 character card. roleDefaults.chat =
// agent-sdk/max-pro-sub + consent are live, so with a character in the room the turn WILL generate + stream.
//
// OPT-IN (`@live`): this is the ONE spec that fires a real Agent-SDK subprocess turn (up to ~120s of live
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
  const charactersNav = page.getByRole("button", { name: "Characters", exact: true });
  await expect(charactersNav).toBeVisible({ timeout: 30_000 });
  await charactersNav.click();

  // The first character row's "Chat with <name>" CTA (§4.4 — the 1-click core loop; hover-revealed on
  // fine pointers, and Playwright's click hovers first, so the reveal fires). The row kebab carries only
  // Archive/Duplicate/Delete in this client — chat is the dedicated CTA, not a menu item.
  const chatCta = page.getByRole("button", { name: CHARACTER_ROW_CHAT_CTA }).first();
  await expect(chatCta).toBeAttached({ timeout: 30_000 });
  await chatCta.click();

  // The store seam flipped CONTENT back to the Chats section with a fresh, character-seeded draft: the
  // composer is live.
  const composer = page.getByRole("textbox", { name: "Message" });
  await expect(composer).toBeVisible();

  // Type via pressSequentially (drives React's onChange — `fill` does NOT here) then send with Enter.
  await composer.pressSequentially("Hello there! Please introduce yourself briefly.");
  await expect(composer).toHaveValue("Hello there! Please introduce yourself briefly.");
  await composer.press("Enter");

  // The user's message committed as the new chat's first turn.
  const userRow = page.locator('[data-slot="message-row"][data-role="user"]');
  await expect(userRow).toContainText("Hello there!", { timeout: 30_000 });

  // The money shot: with a character in the room there IS a speaker, so the assistant generates and its
  // reply streams back as a real canonical row with non-empty content. (We assert on the landed reply,
  // not the transient Stop-button/ghost window — the Stop affordance is a ~ttft-length flash that races
  // the SSE-subscribe-vs-turnStarted timing; the reply appearing is the robust, deterministic proof the
  // turn actually generated, corroborated by the server's `agent-sdk: turn complete` log.)
  const assistantRow = page.locator('[data-slot="message-row"][data-role="assistant"]');
  await expect(assistantRow.first()).toBeVisible({ timeout: 120_000 });
  await expect(assistantRow.first()).toContainText(NON_WHITESPACE, { timeout: 120_000 });
});
