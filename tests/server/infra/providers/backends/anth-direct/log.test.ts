// backends/anth-direct log — the `provider.*` taxonomy wrappers: ONE pino line tagged provider+backend +
// event, carrying transport:"direct" + the credentialSource VOCAB (part 05 §3e), NEVER the secret. Spies the
// base `logger` (getLog() returns it outside a request scope — the memory-log.test.ts pattern).

import { logger } from "@orb/server/foundation/observability";
import { ProviderError } from "@orb/server/infra/providers";
import {
  logAnthDirectError,
  logAnthDirectTurn,
} from "@orb/server/infra/providers/backends/anth-direct";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../../support/fixtures";

describe("logAnthDirectTurn — the provider.turn contract", () => {
  test("emits ONE info line tagged provider+backend, event provider.turn, transport:direct + source vocab", () => {
    const spy = vi.spyOn(logger, "info");
    logAnthDirectTurn({
      chatId: "chat-1",
      transport: "direct",
      credentialSource: "openrouter",
      requestedModel: "anthropic/claude-opus-4-5",
      finishReason: "stop",
      durationMs: 42,
      ttftMs: 10,
      ok: true,
      usage: { tokensIn: 50, tokensOut: 5, cacheReadTokens: 30, cacheWriteTokens: 10 },
    });
    const fields = spy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(fields["provider"]).toBe(true);
    expect(fields["backend"]).toBe("anth-direct");
    expect(fields["event"]).toBe("provider.turn");
    expect(fields["transport"]).toBe("direct");
    expect(fields["credentialSource"]).toBe("openrouter");
    // NEVER a token/key field on the line (§5) — only the SOURCE vocab.
    expect(JSON.stringify(fields)).not.toContain("authToken");
    expect(JSON.stringify(fields)).not.toContain("apiKey");
    spy.mockRestore();
  });
});

describe("logAnthDirectError — the provider.error contract", () => {
  test("emits an error line via the ProviderError provenance (toLog), no raw secret", () => {
    const spy = vi.spyOn(logger, "error");
    const err = new ProviderError({
      kind: "auth_failed",
      retryable: false,
      message: "anth-direct chat (m): invalid key",
      model: "anthropic/claude-opus-4-5",
      apiErrorStatus: 401,
    });
    logAnthDirectError(err);
    const fields = spy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(fields["provider"]).toBe(true);
    expect(fields["backend"]).toBe("anth-direct");
    expect(fields["event"]).toBe("provider.error");
    expect(fields["kind"]).toBe("auth_failed");
    expect(fields["apiErrorStatus"]).toBe(401);
    spy.mockRestore();
  });
});
