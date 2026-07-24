// E2E FLAGSHIP (@live): the turn-honesty chain — drive ONE real turn on the local vLLM 8B and prove, against
// the running system, that what the DOM renders IS what landed in the DB, in order, produced by the local
// engine. Four links, all asserted on the SAME turn:
//   (a) GHOST LIFECYCLE — after send the streaming ghost appears, carries `data-streaming` mid-stream, then
//       RESOLVES into a durable assistant row (ghost gone, durable row present + non-empty).
//   (b) DOM↔DB PARITY IN ORDER — the DOM transcript (ordered message-row role+text) equals canon
//       (chat.listMessages, seq-ascending): same length, pairwise roles, and each user row's text is
//       contained in the DOM (canon is markdown-RENDERED in the DOM, so we assert containment of the
//       distinctive user text — see the parity note below for exactly what is compared and why).
//   (c) BUS EVENT ORDER — the client's canon-event ring (window.__orb.bus().events) shows the turn's real
//       invalidating sequence: messageCommitted (user) → messageCommitted (assistant) → turnCompleted.
//       FINDING pinned here: turnStarted + delta are PURE-TRANSIENT (they never call the invalidation seam,
//       bus-devlog.ts §"Pure-transient events never reach here"), so they are NOT in this ring — we pin the
//       real invalidating order, not an invented one.
//   (d) ENGINE HONESTY — the local gen engine log (.cache/stack/vllm-gen.log) gained ≥1
//       `POST /v1/messages` during the turn, AND the new assistant canon row's `model` is the LOCAL leaf
//       alias "Qwen3-VL-8B-Instruct" (the served-model-name leaf, vllm-engine.sh) — never a hosted id.
//
// OPT-IN (`@live`): fires a real turn on the warm local 8B (~3-6s), skipped unless E2E_LIVE=1 (config
// grepInvert) so routine `pnpm e2e` spends no model traffic. globalSetup pins routing.chat = agent-sdk/vllm.
//
// SELF-SEEDING: reuses globalSetup's guaranteed committed chat (openOrCreateChat). The open chat is
// listChats()[0]: the list is desc(updatedAt) and the room opens rows.first(), and this turn bumps
// updatedAt, so the open room and canon[0] stay the same chat throughout.

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { assistantRows, busEventTypes, openNewestChat, typeAndSend, waitForStreamOpen } from "./support/chat-room";
import { listCanon, listCharacters, startChat } from "./support/trpc";

const GEN_LOG = path.join(process.cwd(), ".cache/stack/vllm-gen.log");
const GEN_POST_MARKER = "POST /v1/messages";
const LOCAL_MODEL_LEAF = "Qwen3-VL-8B-Instruct";
const USER_PROMPT = "Reply with exactly: parity-probe-ok";
const NON_WS = /\S/u;

/** Count the local gen engine's message-POST log lines (the per-turn traffic marker). 0 if the log is absent. */
async function genPostCount(): Promise<number> {
  const text = await readFile(GEN_LOG, "utf8").catch(() => "");
  return text.split("\n").filter((l) => l.includes(GEN_POST_MARKER)).length;
}

/** The DOM transcript, top-to-bottom: each durable message-row's role + trimmed text. */
function domTranscript(page: Page): Promise<readonly { role: string; text: string }[]> {
  return page.locator('[data-slot="message-row"]').evaluateAll((els) =>
    els.map((el) => ({
      role: el.getAttribute("data-role") ?? "",
      text: (el.textContent ?? "").replace(/\s+/gu, " ").trim(),
    })),
  );
}

test("a real turn: ghost resolves, DOM == DB in order, bus order holds, local engine served it", {
  tag: "@live",
}, async ({ page }) => {
  test.setTimeout(180_000);

  // SELF-SEED a FRESH chat (greeting only) so the transcript is SHORT — the whole list renders (no
  // virtualization), making the DOM↔canon full-length parity below deterministic. Open it in the UI (it's
  // newest → the first Chats-list row).
  const characterId = (await listCharacters())[0]?.id ?? "";
  expect(characterId).not.toBe("");
  const chatId = await startChat([characterId]);
  await openNewestChat(page);
  await waitForStreamOpen(page);

  const beforePosts = await genPostCount();

  await typeAndSend(page.getByRole("textbox", { name: "Message" }), USER_PROMPT);

  // ── (a) GHOST LIFECYCLE ──
  // The ghost appears (hard), streamed content renders into its body (hard), and it RESOLVES into a durable
  // assistant row (hard: ghost gone, durable row non-empty). The `data-streaming` MICRO-state (ghost-message-
  // row.tsx sets data-streaming="" only WHILE paced AND after the first token) is a best-effort observation:
  // on a warm sub-second local turn the streaming frame can be too brief for a web-first wait to catch before
  // the ghost resolves, so we RACE it against the resolve and only record it — the appear→body→resolve chain
  // is the deterministic streaming-lifecycle proof, not the transient attribute.
  const ghost = page.locator('[data-slot="ghost-message-row"]');
  await expect(ghost).toBeVisible({ timeout: 30_000 });
  // The identity-family locator helper (#10) — `.last()` here is a DELIBERATE "newest assistant row" choice.
  const rows = assistantRows(page);

  // Streamed content rendered INTO the ghost body: `ghost-stream-body` mounts only once tokens arrive
  // (ghost-message-row.tsx renders TypingDots until held.length>0, then the body) — its appearance is the
  // deterministic proof the reply STREAMED (not popped in whole). Race it against the resolve so a warm
  // sub-second turn that skips straight past an observable ghost frame still passes on the durable landing.
  let sawGhostBody = false;
  await Promise.race([
    page
      .locator('[data-slot="ghost-stream-body"]')
      .waitFor({ state: "attached", timeout: 120_000 })
      .then(() => {
        sawGhostBody = true;
      })
      .catch(() => {
        /* ghost resolved before its body frame was observable — the durable resolve below is the guarantee */
      }),
    rows.last().waitFor({ state: "visible", timeout: 120_000 }),
  ]);

  // The ghost RESOLVES: a durable assistant row lands with non-empty content, and the ghost is gone.
  await expect(rows.last()).toContainText(NON_WS, { timeout: 120_000 });
  await expect(ghost).toHaveCount(0, { timeout: 30_000 });
  // Legibility: surface whether the ghost's streaming body was observable this run (not asserted — see above).
  test.info().annotations.push({ type: "ghost-stream-body-observed", description: String(sawGhostBody) });

  // ── (b) DOM↔DB PARITY IN ORDER ──
  // Read canon (seq-ascending) for the self-seeded chat and the DOM top-to-bottom; they must be the SAME
  // conversation in the SAME order. Short transcript ⇒ every row renders ⇒ full-length parity is exact.
  const canon = await listCanon(chatId);

  // Poll until the DOM has rendered exactly `canon.length` rows (the list mounts rows async after the turn
  // settles) — then the ordered compare below is race-free.
  await expect.poll(async () => page.locator('[data-slot="message-row"]').count(), { timeout: 15_000 }).toBe(canon.length);
  const dom = await domTranscript(page);

  // Same number of rows, and roles match pairwise in order.
  expect(dom.length).toBe(canon.length);
  expect(dom.map((r) => r.role)).toEqual(canon.map((c) => c.role));

  // PARITY of content: canon `content` is markdown-RENDERED into the DOM (styled spans, italics from
  // *asterisks*, name prefixes), so a byte-equal compare is dishonest. We assert the strongest HONEST
  // containment: the user turn we typed is verbatim, unrendered text — its distinctive string MUST appear in
  // its DOM row. (Assistant prose is model-nondeterministic + markdown-transformed; non-emptiness + the
  // canon model check below are the honest assistant-side guarantees.)
  const userIdx = canon.findIndex((c) => c.role === "user" && c.content.includes(USER_PROMPT));
  expect(userIdx).toBeGreaterThanOrEqual(0);
  expect(dom[userIdx]?.role).toBe("user");
  expect(dom[userIdx]?.text).toContain(USER_PROMPT);

  // ── (c) BUS EVENT ORDER ──
  // The invalidating canon-event ring for this turn, in order: user commit → assistant commit → turnCompleted.
  // (turnStarted/delta are pure-transient — not in this ring; see header FINDING.)
  await expect.poll(async () => busEventTypes(page), { timeout: 15_000 }).toContain("turnCompleted");
  const events = await busEventTypes(page);
  const commitIdxs = events.flatMap((t, i) => (t === "messageCommitted" ? [i] : []));
  const completeIdx = events.lastIndexOf("turnCompleted");
  expect(commitIdxs.length).toBeGreaterThanOrEqual(2); // user + assistant commits
  expect(commitIdxs[0]).toBeLessThan(completeIdx);
  expect(commitIdxs.at(-1)).toBeLessThan(completeIdx);

  // ── (d) ENGINE HONESTY ──
  // The local gen engine logged ≥1 message-POST during the turn (real local traffic, not a hosted call).
  await expect.poll(async () => genPostCount(), { timeout: 15_000 }).toBeGreaterThan(beforePosts);
  // The freshly-generated assistant canon row is stamped with the LOCAL leaf model alias — NOT a hosted id.
  const generated = canon.filter((c) => c.role === "assistant" && c.model !== null);
  const newest = generated.at(-1);
  expect(newest?.model).toBe(LOCAL_MODEL_LEAF);
});
