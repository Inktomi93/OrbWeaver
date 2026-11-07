// E2E SPEND-GUARD (@live): the config-is-what's-USED proof — the regression test that goes RED before
// credits burn if someone breaks the local-model pin. Two halves, one turn:
//   1. STORED — the `chat` Model-roles row (connection.listBindings) is bound to the local-engine connection
//      globalSetup authored, and RESOLVES to it: provider `vllm` on the `chat-completions` api. Guards
//      against the seed silently drifting. This read is strictly stronger than the settings blob it
//      replaces: `resolved` is the PERSISTED-read resolve the pane renders (§5.3a), so a stored pin the
//      resolver would refuse shows up here as `unavailableCause` rather than as a green leaf.
//   2. USED — drive one real turn and prove it rode the LOCAL engine, not a hosted one: `expectLocalEngineServed`
//      reads the chat's recorded provider request and the row it committed. Stored-config alone is not proof (a broken
//      resolver could ignore it).
//
// OPT-IN (`@live`): one warm-8B turn (~3-6s), skipped unless E2E_LIVE=1. Self-seeding via globalSetup's chat.

import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/test";
import { openNewestChat, sendHeldTurn, waitForStreamOpen } from "./support/chat-room.ts";
import { expectLocalEngineServed } from "./support/engine-witness.ts";
import { frameCursor, tapStream } from "./support/stream-tap.ts";
import { CASE_LIVE_FOLLOW_UP_MS, WAIT_LIVE_TURN_MS, WAIT_SETTLE_MS } from "./support/timeouts.ts";
import { getChatBindingRow, listCharacters, localEngineConnection, startChat } from "./support/trpc.ts";

test("the chat Model role is what's stored AND what the turn actually rides (local vLLM)", {
  tag: "@live",
}, async ({ page }) => {
  test.setTimeout(CASE_LIVE_FOLLOW_UP_MS);

  // ── 1. STORED — the pin globalSetup wrote is present (the seed hasn't drifted). The binding names the
  // row; the persisted resolve says the row still answers as the local openai-compat wire. ──
  const engine = await localEngineConnection();
  const chatRole = await getChatBindingRow();
  expect(chatRole.binding?.connectionId ?? null).toBe(engine.id);
  expect(chatRole.unavailableCause).toBeNull();
  expect(chatRole.resolved?.providerId).toBe("vllm");
  expect(chatRole.resolved?.api).toBe("chat-completions");

  // ── 2. USED — a real turn rides the local engine. ── Self-seed a fresh chat so the canon read below is
  // unambiguous (its generated assistant row is the one we just drove).
  const characterId = (await listCharacters())[0]?.id ?? castId<CharacterId>("");
  expect(characterId).not.toBe("");
  const chatId = await startChat([characterId]);
  await tapStream(page);
  const since = frameCursor(page);
  await openNewestChat(page);
  await waitForStreamOpen(page, chatId, since);

  const held = await sendHeldTurn({ page, chatId }, "Reply with exactly: routing-probe-ok");

  // The ghost RESOLVES into a durable reply.
  await expect(page.locator('[data-slot="ghost-message-row"]')).toBeVisible({ timeout: WAIT_SETTLE_MS });
  await expect(page.locator('[data-slot="ghost-message-row"]')).toHaveCount(0, { timeout: WAIT_LIVE_TURN_MS });
  const { assistantId } = await held.awaitReply();

  await expectLocalEngineServed(chatId, assistantId);
});
