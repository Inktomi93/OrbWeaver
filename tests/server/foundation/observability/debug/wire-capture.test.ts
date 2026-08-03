// foundation/observability/debug/wire-capture (TASK-24) — the provider-request-body recorder ring. Pins the
// three load-bearing properties: (1) the ring records + reads newest-first with chatId/backend filtering;
// (2) `resetWireCaptures` clears it (the test-isolation guarantee — no cross-row bleed in the harness);
// (3) `isWireCaptureEnabled` reflects the env flag (the prod-safety gate — the sink is wired off this).
// The RING itself is a module singleton, but WRITES only happen when a caller invokes `recordWireCapture`
// (compose wires that fn as the backend sink only when capture is enabled) — so this test drives the ring
// directly, and `reset` in `beforeEach` keeps the singleton clean between cases.

import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { isWireCaptureEnabled, recentWireCaptures, recordWireCapture, resetWireCaptures } from "@orb/server/foundation/observability";
import { beforeEach, describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";

function capture(chatId: ChatId, backend: "vllm" | "agent-sdk", body: Record<string, unknown> = {}): void {
  recordWireCapture({ chatId, api: backend === "vllm" ? "chat-completions" : "agent-sdk", backend, model: "m", at: 0, body });
}

describe("wire-capture recorder", () => {
  beforeEach(() => resetWireCaptures());

  test("records and reads newest-first", () => {
    capture(castId<ChatId>("chat_a"), "vllm", { n: 1 });
    capture(castId<ChatId>("chat_a"), "vllm", { n: 2 });
    const got = recentWireCaptures({ chatId: castId<ChatId>("chat_a") });
    expect(got.map((c) => c.body["n"])).toEqual([2, 1]);
  });

  test("filters by chatId — a foreign chat's capture is excluded", () => {
    capture(castId<ChatId>("chat_a"), "vllm");
    capture(castId<ChatId>("chat_b"), "vllm");
    expect(recentWireCaptures({ chatId: castId<ChatId>("chat_a") })).toHaveLength(1);
    expect(recentWireCaptures({ chatId: castId<ChatId>("chat_a") })[0]?.chatId).toBe("chat_a");
  });

  test("filters by backend", () => {
    capture(castId<ChatId>("chat_a"), "vllm");
    capture(castId<ChatId>("chat_a"), "agent-sdk");
    expect(recentWireCaptures({ chatId: castId<ChatId>("chat_a"), backend: "agent-sdk" })).toHaveLength(1);
    expect(recentWireCaptures({ chatId: castId<ChatId>("chat_a"), backend: "agent-sdk" })[0]?.backend).toBe("agent-sdk");
  });

  test("respects the read limit", () => {
    for (let i = 0; i < 5; i += 1) {
      capture(castId<ChatId>("chat_a"), "vllm", { n: i });
    }
    expect(recentWireCaptures({ chatId: castId<ChatId>("chat_a"), limit: 2 })).toHaveLength(2);
  });

  test("resetWireCaptures clears the ring (test isolation — no cross-row bleed)", () => {
    capture(castId<ChatId>("chat_a"), "vllm");
    resetWireCaptures();
    expect(recentWireCaptures({ chatId: castId<ChatId>("chat_a") })).toHaveLength(0);
  });

  test("isWireCaptureEnabled reflects the env flag (default off — the prod-safety gate)", () => {
    // Env default is "off" under the test env, so the sink is never wired in prod/test-default.
    expect(isWireCaptureEnabled()).toBe(false);
  });
});
