// E2E: the real "start a chat with a character" flow, end-to-end against the full running stack — the
// proof that this seam makes the app actually generate. single-user AUTH_MODE auto-resolves the owner
// (no login form); the server boots with a seeded default-character pack (entry/boot/seed-default-
// characters.ts), so the library has a card to pick. roleDefaults.chat = agent-sdk/max-pro-sub + consent
// are live, so with a character in the room the turn WILL generate + stream.
//
// The flow: `/` → Characters section → "Start chat with X" (the library→chat store seam) → the route
// flips CONTENT to a fresh draft seeded with that character → type (pressSequentially — `fill` bypasses
// React's onChange so the composer's controlled value never updates) → Enter → the first send calls
// `chat.startChat` with the seeded roster, then commits the text as its first turn → the assistant (now
// a real speaker in the room) streams a reply back.

import { expect, test } from "@playwright/test";

const START_CHAT = /^Start chat with /;
const NON_WHITESPACE = /\S/;

test("pick a character, send a message, and the assistant streams a reply", async ({ page }) => {
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

  // The seeded default-character pack gives us at least one card to start a chat with.
  const startChat = page.getByRole("button", { name: START_CHAT }).first();
  await expect(startChat).toBeVisible({ timeout: 30_000 });
  await startChat.click();

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
