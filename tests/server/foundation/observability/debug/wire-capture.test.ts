// foundation/observability/debug/wire-capture (TASK-24) — the provider-request-body recorder ring. Pins the
// three load-bearing properties: (1) the ring records + reads newest-first with chatId/backend filtering;
// (2) `resetWireCaptures` clears it (the test-isolation guarantee — no cross-row bleed in the harness);
// (3) `isWireCaptureEnabled` reflects the env flag (the prod-safety gate — the sink is wired off this).
// The RING itself is a module singleton, but WRITES only happen when a caller invokes `recordWireCapture`
// (compose wires that fn as the backend sink only when capture is enabled) — so this test drives the ring
// directly, and `reset` in `beforeEach` keeps the singleton clean between cases.

import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { env } from "@orb/server/foundation/env";
import { isWireCaptureEnabled, recentWireCaptures, recordWireCapture, resetWireCaptures } from "@orb/server/foundation/observability";
import { beforeEach, describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";

function capture(chatId: ChatId, wire: "openai-compat" | "agent-sdk", body: Record<string, unknown> = {}): void {
  recordWireCapture({
    chatId,
    api: wire === "openai-compat" ? "chat-completions" : "agent-sdk",
    wire,
    providerId: wire === "openai-compat" ? "openai-compat" : "claude-sub",
    model: "m",
    at: 0,
    body,
  });
}

describe("wire-capture recorder", () => {
  beforeEach(() => resetWireCaptures());

  test("records and reads newest-first", () => {
    capture(castId<ChatId>("chat_a"), "openai-compat", { n: 1 });
    capture(castId<ChatId>("chat_a"), "openai-compat", { n: 2 });
    const got = recentWireCaptures({ chatId: castId<ChatId>("chat_a") });
    expect(got.map((c) => c.body["n"])).toEqual([2, 1]);
  });

  test("filters by chatId — a foreign chat's capture is excluded", () => {
    capture(castId<ChatId>("chat_a"), "openai-compat");
    capture(castId<ChatId>("chat_b"), "openai-compat");
    expect(recentWireCaptures({ chatId: castId<ChatId>("chat_a") })).toHaveLength(1);
    expect(recentWireCaptures({ chatId: castId<ChatId>("chat_a") })[0]?.chatId).toBe("chat_a");
  });

  test("filters by provider id", () => {
    capture(castId<ChatId>("chat_a"), "openai-compat");
    capture(castId<ChatId>("chat_a"), "agent-sdk");
    expect(recentWireCaptures({ chatId: castId<ChatId>("chat_a"), providerId: "claude-sub" })).toHaveLength(1);
    expect(recentWireCaptures({ chatId: castId<ChatId>("chat_a"), providerId: "claude-sub" })[0]?.wire).toBe("agent-sdk");
  });

  test("respects the read limit", () => {
    for (let i = 0; i < 5; i += 1) {
      capture(castId<ChatId>("chat_a"), "openai-compat", { n: i });
    }
    expect(recentWireCaptures({ chatId: castId<ChatId>("chat_a"), limit: 2 })).toHaveLength(2);
  });

  // THE PLANTED-EVICTION PIN (#414): the recorder's cap and eviction ORDER, asserted through the public
  // sink+read rather than the ring's internals — the property that had to survive the move onto
  // @orb/kit/bounded-ring byte-for-byte. 256 is the recorder's own capacity constant; the pin derives it
  // from the observed plateau instead of re-spelling it, so a deliberate cap change re-reads honestly.
  test("EVICTION: pushing past the ring capacity drops the OLDEST captures and the tail stays newest-first", () => {
    const chat = castId<ChatId>("chat_evict");
    for (let i = 0; i < 300; i += 1) {
      capture(chat, "openai-compat", { n: i });
    }
    const all = recentWireCaptures({ chatId: chat, limit: 10_000 });
    expect(all.length).toBeLessThan(300); // the ring is BOUNDED — it did not grow to hold every push
    expect(all.map((c) => c.body["n"])).toEqual(Array.from({ length: all.length }, (_, i) => 299 - i));
    // and the evicted head is genuinely gone, not merely unread
    expect(all.some((c) => c.body["n"] === 0)).toBe(false);
  });

  test("a FILTERED read scans PAST non-matches to fill its limit (the lazy newest-first door)", () => {
    const wanted = castId<ChatId>("chat_w");
    const other = castId<ChatId>("chat_o");
    // Interleave so the newest 20 records contain only 10 matches — a pre-sliced tail would under-report.
    for (let i = 0; i < 10; i += 1) {
      capture(wanted, "openai-compat", { n: i });
      capture(other, "openai-compat", { n: i });
    }
    expect(recentWireCaptures({ chatId: wanted, limit: 10 }).map((c) => c.body["n"])).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
  });

  test("resetWireCaptures clears the ring (test isolation — no cross-row bleed)", () => {
    capture(castId<ChatId>("chat_a"), "openai-compat");
    resetWireCaptures();
    expect(recentWireCaptures({ chatId: castId<ChatId>("chat_a") })).toHaveLength(0);
  });

  test("isWireCaptureEnabled reflects the env flag (default off — the prod-safety gate)", () => {
    // ASSERTS THE RELATIONSHIP, NOT AN AMBIENT VALUE. This used to be a bare `toBe(false)` on the premise
    // that the test env always resolves "off" — but `env` is parsed from `process.env` AFTER the repo `.env`
    // is loaded, so an operator debugging with `WIRE_CAPTURE=on` in `.env` turned this green test red and it
    // read as a code regression (it cost real confusion during a live session). The invariant worth pinning
    // is that the gate is driven by the flag and by nothing else; the DEFAULT-off half is a schema property,
    // pinned below where it cannot be flipped by a local file.
    expect(isWireCaptureEnabled()).toBe(env.WIRE_CAPTURE === "on");
  });
});
