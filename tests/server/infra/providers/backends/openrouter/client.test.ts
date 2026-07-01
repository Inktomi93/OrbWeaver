// backends/openrouter client — the per-API-key LRU resolver: a warm client is reused per key, distinct
// keys get distinct clients, and the cache is CLOSURE state (each `createClientCache()` is independent).

import {
  createClientCache,
  createOpenRouterClient,
} from "@orb/server/infra/providers/backends/openrouter";
import { describe } from "vitest";
import { expect, test } from "../../../../../support/fixtures";

describe("createOpenRouterClient", () => {
  test("builds a client exposing the role sub-APIs the family calls", () => {
    const client = createOpenRouterClient("sk-or-test");
    expect(typeof client.chat.send).toBe("function");
    expect(typeof client.embeddings.generate).toBe("function");
    expect(typeof client.models.list).toBe("function");
  });
});

describe("createClientCache", () => {
  test("reuses the SAME client instance for one key, distinct instances for distinct keys", () => {
    const getClient = createClientCache();
    const a1 = getClient("key-a");
    const a2 = getClient("key-a");
    const b = getClient("key-b");
    expect(a1).toBe(a2); // warm-reuse per key
    expect(a1).not.toBe(b); // distinct key ⇒ distinct client
  });

  test("each cache is independent closure state (no shared module-scope map)", () => {
    const first = createClientCache();
    const second = createClientCache();
    expect(first("key-a")).not.toBe(second("key-a"));
  });
});
