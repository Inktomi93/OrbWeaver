// E2E: the real "start a chat with a character" flow, end-to-end against the full running stack — the
// proof that this seam makes the app actually generate. single-user AUTH_MODE auto-resolves the owner
// (no login form). The `chat` Model role is bound to the harness's local-engine connection (globalSetup's
// `pinChatConnection` — `vllm` on chat-completions) + consent are live, so with a character in the room the turn
// WILL generate + stream.
//
// OPT-IN (`@live`): this spec fires a real local vLLM chat turn (up to ~120s of live generation), so it is SKIPPED
// by default and only runs under `E2E_LIVE=1` — routine `pnpm e2e` (and the CI smoke gate, which excludes `@live`)
// never hits live model credits. Run it explicitly with:
//   E2E_LIVE=1 pnpm e2e start-chat-with-character.spec.ts
//
// The flow: `/` → Characters section → the spec-owned character's "Chat with X" CTA → `chat.startChat` creates the
// room at the click (D166) and seeds its greeting → type → Send → the assistant streams a reply. The character is
// minted chatless, so the CTA starts a new room and the greeting is retained canon no reply assertion can accept.

import type { CharacterHandle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/test";
import { CHAT_MESSAGE_INPUT_NAME, CHAT_STOP_NAME } from "#client/features/chat/lib/chat-surface-names.ts";
import { messageRow, openCharacterRoom, sendAndAwaitReply } from "./support/chat-room.ts";
import { CASE_LIVE_FOLLOW_UP_MS, CASE_TWO_LIVE_TURNS_MS, WAIT_SETTLE_MS } from "./support/timeouts.ts";
import { deleteChat, mintFreshCharacter, removeCharacter } from "./support/trpc.ts";

const CHARACTER = "Start Chat Probe";
const HANDLE = castId<CharacterHandle>("e2e-start-chat-probe");
const GREETING = "The start-chat probe waits by the door.";
const NON_WHITESPACE = /\S/u;

// The `@live` tag is the opt-in gate: playwright.config.ts sets `grepInvert: /@live/` UNLESS `E2E_LIVE=1`,
// so routine `pnpm e2e` (and the CI smoke gate) skip this real-model-turn spec — no credits spent (header).
test("pick a character, send a message, and the assistant streams a reply", {
  tag: "@live",
}, async ({ page }) => {
  // Real generation goes through the Agent SDK subprocess — give the whole flow room (cold model spin-up
  // + the streamed turn) well beyond Playwright's 30s default.
  test.setTimeout(CASE_LIVE_FOLLOW_UP_MS);

  const characterId = await mintFreshCharacter(HANDLE, CHARACTER, GREETING);
  const chatId = await openCharacterRoom(page, CHARACTER);
  try {
    const message = "Hello there! Please introduce yourself briefly.";
    const { userId, assistantId } = await sendAndAwaitReply({ page, chatId }, message);
    await expect(messageRow(page, userId)).toContainText(message, { timeout: WAIT_SETTLE_MS });

    // With a character in the room there IS a speaker, so the assistant generates and its reply lands as a new
    // canonical row with non-empty content. (The Stop affordance is a ~ttft-length flash, so the landed row is the
    // deterministic proof the turn generated.)
    await expect(messageRow(page, assistantId)).toContainText(NON_WHITESPACE, { timeout: WAIT_SETTLE_MS });
  } finally {
    await deleteChat(chatId);
    await removeCharacter(characterId);
  }
});

// A new room's first completed turn must hand the composer back. Composer Stop is driven purely by the turn slot's
// phase, so a slot stranded live leaves the room unusable until a reload. This pins the journey: after the first turn
// completes, the composer RETURNS TO SEND, the input RE-ENABLES, and a SECOND message sends and gets its own reply.
test("a new room's first turn returns the composer to Send and a second message sends", {
  tag: "@live",
}, async ({ page }) => {
  test.setTimeout(CASE_TWO_LIVE_TURNS_MS);

  const characterId = await mintFreshCharacter(HANDLE, CHARACTER, GREETING);
  const chatId = await openCharacterRoom(page, CHARACTER);
  const room = { page, chatId };
  try {
    const first = await sendAndAwaitReply(room, "Hello there! Please introduce yourself in one short sentence.");
    await expect(messageRow(page, first.assistantId)).toContainText(NON_WHITESPACE, { timeout: WAIT_SETTLE_MS });

    // The turn is done, so the composer MUST return to Send: Stop gone, the primary Send present, the input re-enabled.
    await expect(page.getByTestId("composer-send")).toBeVisible({ timeout: WAIT_SETTLE_MS });
    await expect(page.getByRole("button", { name: CHAT_STOP_NAME })).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME })).toBeEnabled();

    // The room is genuinely usable again: a SECOND message commits its own durable row and its own reply.
    const message = "Great — now name one hobby you enjoy.";
    const second = await sendAndAwaitReply(room, message);
    await expect(messageRow(page, second.userId)).toContainText(message, { timeout: WAIT_SETTLE_MS });
    await expect(messageRow(page, second.assistantId)).toContainText(NON_WHITESPACE, { timeout: WAIT_SETTLE_MS });
  } finally {
    await deleteChat(chatId);
    await removeCharacter(characterId);
  }
});
