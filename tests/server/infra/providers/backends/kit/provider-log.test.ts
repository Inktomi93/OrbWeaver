// backends/kit/provider-log — THE shared `provider.*` sink hoisted from agent-sdk (part 05 §2). `backend`
// is now a per-CALL arg so every backend emits the same taxonomy with its own tag.
// We spy the base `logger` method directly (the memory-log.test.ts pattern — `getLog()` returns the base
// logger outside a request scope). `logProviderCache` is the W3 cache-rot receipt.

import { logger } from "@orb/server/foundation/observability";
import { logProviderCache, logProviderCapability, logProviderSampling, providerLog } from "@orb/server/infra/providers/backends/kit";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../../support/fixtures";

function callOf(spy: ReturnType<typeof vi.spyOn>): [Record<string, unknown>, string] {
  const call = spy.mock.calls[0] ?? [];
  return [call[0] as Record<string, unknown>, call[1] as string];
}

describe("providerLog — the shared sink tags the per-call backend", () => {
  test("emits ONE line tagged provider:true + the passed backend + the event", () => {
    const spy = vi.spyOn(logger, "info");
    providerLog("openrouter", "info", "provider.cache", { hitRatio: 0.9 });
    const [fields, msg] = callOf(spy);
    expect(msg).toBe("provider.cache");
    expect(fields).toMatchObject({
      provider: true,
      backend: "openrouter",
      event: "provider.cache",
      hitRatio: 0.9,
    });
  });

  test("a different backend tag rides the same taxonomy", () => {
    const spy = vi.spyOn(logger, "debug");
    providerLog("vllm", "debug", "provider.channel", {});
    expect(callOf(spy)[0]["backend"]).toBe("vllm");
  });
});

describe("logProviderCache — the cache-rot receipt (part 05 §3a)", () => {
  test("info line carrying read/write tokens, breakpoint count/offsets, hitRatio, minCacheTokens", () => {
    const spy = vi.spyOn(logger, "info");
    logProviderCache("openrouter", {
      turnId: "turn_1",
      cacheReadTokens: 9000,
      cacheWriteTokens: 1000,
      breakpointsPlaced: 3,
      breakpointOffsets: [1, 3],
      hitRatio: 0.9,
      minCacheTokens: 1024,
    });
    const [fields, msg] = callOf(spy);
    expect(msg).toBe("provider.cache");
    expect(fields).toMatchObject({
      provider: true,
      backend: "openrouter",
      event: "provider.cache",
      turnId: "turn_1",
      cacheReadTokens: 9000,
      cacheWriteTokens: 1000,
      breakpointsPlaced: 3,
      breakpointOffsets: [1, 3],
      hitRatio: 0.9,
      minCacheTokens: 1024,
    });
    // Metadata only — never prompt/RP content or the credential.
    expect(fields).not.toHaveProperty("prompt");
    expect(fields).not.toHaveProperty("authToken");
  });
});

describe("logProviderCapability — the resolution line (part 05 §3c)", () => {
  test("debug line carrying api/credentialSource/requestedModel/turns/droppedWarnings + the turnId", () => {
    const spy = vi.spyOn(logger, "debug");
    logProviderCapability("agent-sdk", {
      turnId: "turn_7",
      api: "agent-sdk",
      credentialSource: "max-pro-sub",
      requestedModel: "claude-opus-4-6",
      turns: { midConversationSystem: true, explicitPromptCache: true },
      droppedWarnings: [{ code: "verbosity_dropped", message: "verbosity ignored: no vocab" }],
    });
    const [fields, msg] = callOf(spy);
    expect(msg).toBe("provider.capability");
    expect(fields).toMatchObject({
      provider: true,
      backend: "agent-sdk",
      event: "provider.capability",
      turnId: "turn_7",
      api: "agent-sdk",
      credentialSource: "max-pro-sub",
      requestedModel: "claude-opus-4-6",
      turns: { midConversationSystem: true, explicitPromptCache: true },
      droppedWarnings: [{ code: "verbosity_dropped", message: "verbosity ignored: no vocab" }],
    });
    // NO wireShape string on the line (the anti-ST bar — api+credentialSource are report-only, not a
    // materialized wire-shape) and metadata only — no prompt/RP content or credential material.
    expect(fields).not.toHaveProperty("wireShape");
    expect(fields).not.toHaveProperty("prompt");
    expect(fields).not.toHaveProperty("authToken");
  });

  test("rides the debug level (opt-in), not info", () => {
    const infoSpy = vi.spyOn(logger, "info");
    logProviderCapability("openrouter", {
      turnId: "turn_8",
      api: "chat-completions",
      credentialSource: "openrouter",
      requestedModel: "x",
      turns: {},
      droppedWarnings: [],
    });
    expect(infoSpy.mock.calls.some((c) => (c[0] as { event?: string }).event === "provider.capability")).toBe(false);
  });
});

describe("logProviderSampling — which knobs survived (part 05 §3d)", () => {
  test("debug line carrying requested vs applied vs dropped-with-reason + the turnId", () => {
    const spy = vi.spyOn(logger, "debug");
    logProviderSampling("openrouter", {
      turnId: "turn_2",
      requested: { temperature: 1.5, seed: 5 },
      applied: { temperature: 1 },
      dropped: [{ knob: "seed", reason: "model does not support seed" }],
    });
    const [fields, msg] = callOf(spy);
    expect(msg).toBe("provider.sampling");
    expect(fields).toMatchObject({
      provider: true,
      backend: "openrouter",
      event: "provider.sampling",
      turnId: "turn_2",
      requested: { temperature: 1.5, seed: 5 },
      applied: { temperature: 1 },
      dropped: [{ knob: "seed", reason: "model does not support seed" }],
    });
  });

  test("rides the debug level (opt-in), not info", () => {
    const infoSpy = vi.spyOn(logger, "info");
    logProviderSampling("vllm", {
      turnId: "turn_3",
      requested: {},
      applied: {},
      dropped: [],
    });
    expect(infoSpy.mock.calls.some((c) => (c[0] as { event?: string }).event === "provider.sampling")).toBe(false);
  });
});
