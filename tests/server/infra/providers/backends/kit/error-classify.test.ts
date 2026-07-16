// backends/kit/error-classify — the HTTP-status → typed kind table, the transport-name fallback, the
// diagnostic peel, and the sanitized ProviderError builder (an HTML/secret-bearing body never leaks).

import { ProviderError } from "@orb/server/infra/providers";
import { classifyHttpStatus, classifyTransportName, extractHttpErrorDiagnostic, providerErrorFromHttp } from "@orb/server/infra/providers/backends/kit";
import { describe } from "vitest";
import { expect, test } from "../../../../../support/fixtures";

describe("classifyHttpStatus", () => {
  test("maps each documented status to its kind + retryability", () => {
    expect(classifyHttpStatus(401)).toEqual({ kind: "auth_failed", retryable: false });
    expect(classifyHttpStatus(403)).toEqual({ kind: "auth_failed", retryable: false });
    expect(classifyHttpStatus(402)).toEqual({ kind: "billing", retryable: false });
    expect(classifyHttpStatus(404)).toEqual({ kind: "model_unavailable", retryable: false });
    expect(classifyHttpStatus(429)).toEqual({ kind: "rate_limit", retryable: true });
    expect(classifyHttpStatus(400)).toEqual({ kind: "invalid", retryable: false });
    expect(classifyHttpStatus(413)).toEqual({ kind: "invalid", retryable: false });
    expect(classifyHttpStatus(422)).toEqual({ kind: "invalid", retryable: false });
    expect(classifyHttpStatus(451)).toEqual({ kind: "invalid", retryable: false });
    expect(classifyHttpStatus(408)).toEqual({ kind: "server", retryable: true });
    expect(classifyHttpStatus(500)).toEqual({ kind: "server", retryable: true });
    expect(classifyHttpStatus(503)).toEqual({ kind: "server", retryable: true });
  });

  test("an unmapped status / undefined → unknown, non-retryable (never silently transient)", () => {
    expect(classifyHttpStatus(418)).toEqual({ kind: "unknown", retryable: false });
    expect(classifyHttpStatus(undefined)).toEqual({ kind: "unknown", retryable: false });
  });
});

describe("classifyTransportName — the no-status fallback", () => {
  test("transient transport patterns → retryable server", () => {
    expect(classifyTransportName("FetchError", "connect timeout")).toEqual({
      kind: "server",
      retryable: true,
    });
    expect(classifyTransportName("TypeError", "network failure")).toEqual({
      kind: "server",
      retryable: true,
    });
  });

  test("an abort name → aborted, non-retryable", () => {
    expect(classifyTransportName("AbortError", "the user stopped")).toEqual({
      kind: "aborted",
      retryable: false,
    });
  });

  test("nothing matched → null (caller decides the unknown floor)", () => {
    expect(classifyTransportName("WeirdError", "no idea")).toBeNull();
  });
});

describe("extractHttpErrorDiagnostic", () => {
  test("peels body + cause off an SDK-shaped error and SANITIZES them (HTML stripped)", () => {
    const err = {
      statusCode: 400,
      body: "<html><body>bad request: token sk-leak</body></html>",
      cause: new Error("Response validation failed"),
    };
    const diag = extractHttpErrorDiagnostic(err);
    expect(diag.body).toBe("bad request: token sk-leak");
    expect(diag.body).not.toContain("<");
    expect(diag.cause).toBe("Response validation failed");
  });

  test("a non-object error → empty diagnostic", () => {
    expect(extractHttpErrorDiagnostic("just a string")).toEqual({});
  });
});

describe("providerErrorFromHttp", () => {
  test("classifies by statusCode, prefixes + sanitizes the message, attaches the status", () => {
    const err = Object.assign(new Error("rate limited"), { statusCode: 429 });
    const pe = providerErrorFromHttp(err, "openrouter.chat");
    expect(pe).toBeInstanceOf(ProviderError);
    expect(pe.kind).toBe("rate_limit");
    expect(pe.retryable).toBe(true);
    expect(pe.apiErrorStatus).toBe(429);
    expect(pe.message).toBe("openrouter.chat: rate limited");
    expect(pe.cause).toBe(err);
  });

  test("an HTML error body is stripped from the surfaced message (no markup leak)", () => {
    const err = Object.assign(new Error("<h1>502</h1><p>upstream down</p>"), { statusCode: 502 });
    const pe = providerErrorFromHttp(err, "custom");
    expect(pe.kind).toBe("server");
    expect(pe.message).not.toContain("<");
    expect(pe.message).toBe("custom: 502 upstream down");
  });

  test("no status → unknown via the transport floor (no apiErrorStatus)", () => {
    const pe = providerErrorFromHttp(new Error("totally weird"), "x");
    expect(pe.kind).toBe("unknown");
    expect(pe.apiErrorStatus).toBeUndefined();
  });
});
