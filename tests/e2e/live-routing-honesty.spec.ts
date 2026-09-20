// E2E SPEND-GUARD (@live): the config-is-what's-USED proof — the regression test that goes RED before
// credits burn if someone breaks the local-model pin. Two halves, one turn:
//   1. STORED — the `chat` Model-roles row (connection.listBindings) is bound to the local-engine connection
//      globalSetup authored, and RESOLVES to it: provider `vllm` on the `chat-completions` api. Guards
//      against the seed silently drifting. This read is strictly stronger than the settings blob it
//      replaces: `resolved` is the PERSISTED-read resolve the pane renders (§5.3a), so a stored pin the
//      resolver would refuse shows up here as `unavailableCause` rather than as a green leaf.
//   2. USED — drive one real turn and prove it rode the LOCAL engine, not a hosted one: the gen engine log
//      (.cache/stack/vllm-gen.log) gains a message-POST during the turn, AND the new assistant canon row's
//      `model` is the local leaf alias "Qwen3-VL-8B-Instruct". Stored-config alone is not proof (a broken
//      resolver could ignore it) — the engine-traffic delta + the stamped local model are the "actually
//      used" evidence.
//
// Pinned honesty note: on a local vLLM turn the canon `provider` field is NULL (verified live 2026-07-24) —
// only `model` carries the local-engine tell, so this spec asserts on `model`, never on a non-null provider.
//
// OPT-IN (`@live`): one warm-8B turn (~3-6s), skipped unless E2E_LIVE=1. Self-seeding via globalSetup's chat.

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/test";
import { openNewestChat, typeAndSend, waitForStreamOpen } from "./support/chat-room.ts";
import { getChatBindingRow, listCanon, listCharacters, localEngineConnection, startChat } from "./support/trpc.ts";

const GEN_LOG = path.join(process.cwd(), ".cache/stack/vllm-gen.log");
const GEN_POST_MARKER = "POST /v1/chat/completions";
const LOCAL_MODEL_LEAF = "Qwen3-VL-8B-Instruct";

async function genPostCount(): Promise<number> {
  const text = await readFile(GEN_LOG, "utf8").catch(() => "");
  return text.split("\n").filter((l) => l.includes(GEN_POST_MARKER)).length;
}

test("the chat Model role is what's stored AND what the turn actually rides (local vLLM)", {
  tag: "@live",
}, async ({ page }) => {
  test.setTimeout(180_000);

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
  await openNewestChat(page);
  await waitForStreamOpen(page);

  const beforePosts = await genPostCount();
  await typeAndSend(page.getByRole("textbox", { name: "Message" }), "Reply with exactly: routing-probe-ok");

  // Wait for the ghost to RESOLVE into a durable reply (the greeting also matches a plain assistant-row
  // wait, so gate on the ghost being GONE — that means the generated row committed).
  await expect(page.locator('[data-slot="ghost-message-row"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-slot="ghost-message-row"]')).toHaveCount(0, { timeout: 120_000 });

  // The local gen engine logged a message-POST for this turn (real local traffic).
  await expect.poll(async () => genPostCount(), { timeout: 15_000 }).toBeGreaterThan(beforePosts);

  // The new assistant canon row is stamped with the LOCAL model leaf — the "was actually used" proof. Poll
  // canon: the durable commit can lag the ghost-gone frame by a tick.
  await expect
    .poll(async () => (await listCanon(chatId)).filter((c) => c.role === "assistant" && c.model !== null).at(-1)?.model ?? null, {
      timeout: 15_000,
    })
    .toBe(LOCAL_MODEL_LEAF);
});
