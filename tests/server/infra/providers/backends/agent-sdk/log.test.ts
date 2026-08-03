// log.ts — THE agent-sdk `provider.*` structured-log taxonomy. Every helper is a thin tagged-`getLog()`
// call (the memory-log / securityEvent shape): ONE pino line tagged `provider:true` + `backend:"agent-sdk"`
// + an `event` string that is BOTH a field and the log message. We lock the tag/level/event contract per
// helper by spying the base `logger` method directly (the memory-log.test.ts pattern — `getLog()` returns
// the base logger outside a request scope), NOT `vi.mock`-ing a sibling module.

import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { logger } from "@orb/server/foundation/observability";
import { ProviderError } from "@orb/server/infra/providers";
import {
  logProviderCompaction,
  logProviderDialog,
  logProviderDrift,
  logProviderError,
  logProviderLeak,
  logProviderMcp,
  logProviderRateLimit,
  logProviderRefusal,
  logProviderRetry,
  logProviderSession,
  logProviderSummarize,
  logProviderTurn,
} from "@orb/server/infra/providers/backends/agent-sdk";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../../support/fixtures";

/** Read the (fields, message) a spied pino level was called with. Each arg gets its own single cast (the
 *  pino overloads type the first call arg as a broad union; `no-test-fabrication` bans the `as unknown as`
 *  tuple double-cast). */
function callOf(spy: ReturnType<typeof vi.spyOn>): [Record<string, unknown>, string] {
  const call = spy.mock.calls[0] ?? [];
  return [call[0] as Record<string, unknown>, call[1] as string];
}

describe("provider.* taxonomy — the tag/level/event contract", () => {
  test("logProviderTurn: ONE info line tagged provider+backend, event provider.turn, fields ride through", () => {
    const spy = vi.spyOn(logger, "info");
    logProviderTurn({
      chatId: castId<ChatId>("chat-1"),
      sessionId: "sess-1",
      apiKeySource: "oauth",
      requestedModel: "claude-x",
      servedModel: "claude-x",
      disposition: "resumed",
      terminalReason: null,
      durationMs: 42,
      ttftMs: 20,
      ok: true,
      usage: { tokensIn: 10, tokensOut: 5, costUsd: 0.001, warmSpareClaimed: true },
    });
    expect(spy).toHaveBeenCalledOnce();
    const [fields, msg] = callOf(spy);
    expect(fields["provider"]).toBe(true);
    expect(fields["backend"]).toBe("agent-sdk");
    expect(fields["event"]).toBe("provider.turn");
    expect(msg).toBe("provider.turn");
    expect(fields["chatId"]).toBe("chat-1");
    expect(fields["disposition"]).toBe("resumed");
    expect(fields["ok"]).toBe(true);
    expect(fields["usage"]).toMatchObject({ tokensIn: 10, warmSpareClaimed: true });
  });

  test("logProviderTurn: carries the optional contextUsage (the post-turn context-fill signal)", () => {
    const spy = vi.spyOn(logger, "info");
    logProviderTurn({
      requestedModel: "claude-x",
      terminalReason: null,
      ok: true,
      contextUsage: { totalTokens: 12_000, maxTokens: 200_000, percentage: 6, model: "claude-x" },
    });
    const [fields] = callOf(spy);
    expect(fields["contextUsage"]).toEqual({
      totalTokens: 12_000,
      maxTokens: 200_000,
      percentage: 6,
      model: "claude-x",
    });
  });

  test("logProviderSession: debug level, event provider.session, carries the disposition + ids", () => {
    const spy = vi.spyOn(logger, "debug");
    logProviderSession({ chatId: castId<ChatId>("chat-1"), sessionId: "sess-1", disposition: "reseeded" });
    const [fields, msg] = callOf(spy);
    expect(msg).toBe("provider.session");
    expect(fields["provider"]).toBe(true);
    expect(fields["backend"]).toBe("agent-sdk");
    expect(fields["disposition"]).toBe("reseeded");
    expect(fields["sessionId"]).toBe("sess-1");
  });

  test("logProviderError: error level via toLog() — full provenance flattened + tagged", () => {
    const spy = vi.spyOn(logger, "error");
    const err = new ProviderError({
      kind: "server",
      retryable: true,
      message: "spawn died",
      model: "claude-x",
      sessionId: "sess-1",
    });
    logProviderError(err, { stderrTail: "cli: ENOENT" });
    const [fields, msg] = callOf(spy);
    expect(msg).toBe("provider.error");
    expect(fields["provider"]).toBe(true);
    expect(fields["kind"]).toBe("server");
    expect(fields["sessionId"]).toBe("sess-1");
    expect(fields["stderrTail"]).toBe("cli: ENOENT");
  });

  test("logProviderRateLimit: warn on ban-risk, debug when healthy", () => {
    const warn = vi.spyOn(logger, "warn");
    const debug = vi.spyOn(logger, "debug");
    logProviderRateLimit(true, { status: "rejected", isUsingOverage: true });
    logProviderRateLimit(false, { status: "allowed", utilization: 0.1 });
    expect(callOf(warn)[1]).toBe("provider.rate_limit");
    expect(warn.mock.calls[0]?.[0]).toMatchObject({ provider: true, isUsingOverage: true });
    expect(callOf(debug)[1]).toBe("provider.rate_limit");
  });

  test("logProviderRetry / drift / refusal: all warn, correctly tagged + evented", () => {
    const spy = vi.spyOn(logger, "warn");
    logProviderRetry({ attempt: 1, kind: "rate_limit", authFailure: false });
    logProviderDrift({ requested: "claude-x", billed: ["claude-y"] });
    logProviderRefusal({ category: "cyber", retried: false });
    const events = spy.mock.calls.map((c) => (c[0] as { event: string }).event);
    expect(events).toStrictEqual(["provider.retry", "provider.drift", "provider.refusal"]);
    for (const call of spy.mock.calls) {
      expect(call[0]).toMatchObject({ provider: true, backend: "agent-sdk" });
    }
  });

  test("logProviderLeak: error level, event provider.leak, tool NAMES only (never inputs)", () => {
    const spy = vi.spyOn(logger, "error");
    logProviderLeak({ model: "claude-x", toolNames: ["Bash"] });
    const [fields, msg] = callOf(spy);
    expect(msg).toBe("provider.leak");
    expect(fields["toolNames"]).toStrictEqual(["Bash"]);
    expect(fields).not.toHaveProperty("toolInput");
  });

  test("logProviderCompaction: warn level, event provider.compaction", () => {
    const spy = vi.spyOn(logger, "warn");
    logProviderCompaction({ compactError: "boom" });
    expect(callOf(spy)[1]).toBe("provider.compaction");
    expect(callOf(spy)[0]["compactError"]).toBe("boom");
  });

  test("logProviderDialog: warn level, event provider.dialog, source+kind classifier only", () => {
    const spy = vi.spyOn(logger, "warn");
    logProviderDialog({ source: "elicitation", kind: "url" });
    const [fields, msg] = callOf(spy);
    expect(msg).toBe("provider.dialog");
    expect(fields).toMatchObject({
      provider: true,
      backend: "agent-sdk",
      source: "elicitation",
      kind: "url",
    });
    // No content field carried — only the metadata classifier axes.
    expect(fields).not.toHaveProperty("message");
    expect(fields).not.toHaveProperty("payload");
  });

  test("logProviderSummarize: ONE info line, event provider.summarize, metadata counts only (no content)", () => {
    const spy = vi.spyOn(logger, "info");
    logProviderSummarize({ items: 3, ok: 2, fail: 1, durationMs: 420 });
    const [fields, msg] = callOf(spy);
    expect(msg).toBe("provider.summarize");
    expect(fields).toMatchObject({
      provider: true,
      backend: "agent-sdk",
      event: "provider.summarize",
      items: 3,
      ok: 2,
      fail: 1,
      durationMs: 420,
    });
    // Never the prompt/summary text (RP-adjacent content stays off logs).
    expect(fields).not.toHaveProperty("text");
    expect(fields).not.toHaveProperty("prompt");
  });

  test("logProviderMcp: warn when any server is unhealthy, debug when all connected", () => {
    const warn = vi.spyOn(logger, "warn");
    const debug = vi.spyOn(logger, "debug");
    logProviderMcp({
      unhealthy: true,
      servers: [{ name: "remote", status: "failed", error: "ECONNREFUSED" }],
    });
    logProviderMcp({ unhealthy: false, servers: [{ name: "orbweaver", status: "connected" }] });
    expect(callOf(warn)[1]).toBe("provider.mcp");
    expect(warn.mock.calls[0]?.[0]).toMatchObject({ provider: true, unhealthy: true });
    expect(callOf(debug)[1]).toBe("provider.mcp");
    expect(debug.mock.calls[0]?.[0]).toMatchObject({ unhealthy: false });
  });
});
