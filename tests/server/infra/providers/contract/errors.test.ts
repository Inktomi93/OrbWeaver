// errors.ts — the provider-agnostic failure surface (ProviderError) every role/backend maps onto, plus
// the PROVIDER_ERROR_KINDS vocab. We lock: the class is a real Error subclass carrying kind/retryable +
// the optional rate-limit/status fields, the cause chains for diagnostics, the message passes through
// verbatim (no appended noise — the "safe-for-log, no secrets" contract is the caller's), and the kinds
// vocab enumerates the normalized failure set.

import { PROVIDER_ERROR_KINDS, ProviderError } from "@orb/server/infra/providers";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";

describe("ProviderError", () => {
  test("is an Error subclass tagged ProviderError, carrying kind + retryable", () => {
    const err = new ProviderError({ kind: "rate_limit", retryable: true, message: "slow down" });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.name).toBe("ProviderError");
    expect(err.kind).toBe("rate_limit");
    expect(err.retryable).toBe(true);
  });

  test("the message passes through verbatim (no appended noise)", () => {
    const err = new ProviderError({ kind: "invalid", retryable: false, message: "bad pairing" });
    expect(err.message).toBe("bad pairing");
  });

  test("carries the optional rate-limit reset + upstream status when provided", () => {
    const err = new ProviderError({
      kind: "rate_limit",
      retryable: true,
      message: "429",
      resetsAt: 1000,
      apiErrorStatus: 429,
    });
    expect(err.resetsAt).toBe(1000);
    expect(err.apiErrorStatus).toBe(429);
  });

  test("the optional fields are undefined when omitted", () => {
    const err = new ProviderError({ kind: "server", retryable: true, message: "boom" });
    expect(err.resetsAt).toBeUndefined();
    expect(err.apiErrorStatus).toBeUndefined();
    expect(err.model).toBeUndefined();
    expect(err.terminalReason).toBeUndefined();
    expect(err.detail).toBeUndefined();
    expect(err.sessionId).toBeUndefined();
    expect(err.requestId).toBeUndefined();
  });

  test("carries the session + request correlation provenance when provided", () => {
    const err = new ProviderError({
      kind: "server",
      retryable: true,
      message: "boom",
      sessionId: "sess-42",
      requestId: "req-9",
    });
    expect(err.sessionId).toBe("sess-42");
    expect(err.requestId).toBe("req-9");
  });

  test("toLog() flattens EVERY provenance field structured (never buried in the message)", () => {
    // Every optional set on the init MUST surface as its own key — a field added to ProviderError but
    // missed in toLog() fails here (the taxonomy's provider.error line would silently drop it).
    const err = new ProviderError({
      kind: "rate_limit",
      retryable: true,
      message: "429 slow down",
      model: "claude-sonnet-4.5",
      terminalReason: "blocking_limit",
      detail: "rate_limit",
      resetsAt: 5000,
      apiErrorStatus: 429,
      sessionId: "sess-42",
      requestId: "req-9",
    });
    expect(err.toLog()).toStrictEqual({
      kind: "rate_limit",
      retryable: true,
      message: "429 slow down",
      model: "claude-sonnet-4.5",
      terminalReason: "blocking_limit",
      detail: "rate_limit",
      resetsAt: 5000,
      apiErrorStatus: 429,
      sessionId: "sess-42",
      requestId: "req-9",
    });
  });

  test("toLog() omits absent optionals — only kind/retryable/message on a bare error (no undefined noise)", () => {
    const err = new ProviderError({ kind: "server", retryable: true, message: "boom" });
    expect(err.toLog()).toStrictEqual({ kind: "server", retryable: true, message: "boom" });
  });

  test("toLog() does NOT flatten the cause (it rides the standard err serializer's stack, not a key)", () => {
    const err = new ProviderError({
      kind: "server",
      retryable: true,
      message: "x",
      cause: new Error("root"),
    });
    expect(err.toLog()).not.toHaveProperty("cause");
  });

  test("carries the debuggability provenance (model + terminal reason + specific detail code)", () => {
    // The generic `kind` is "invalid" but `detail` preserves the specific SDK cause ("prompt_too_long")
    // and `terminalReason` the raw loop-level provenance — enough to debug WITHOUT the backend-internal
    // session id (deliberately never surfaced).
    const err = new ProviderError({
      kind: "invalid",
      retryable: false,
      message: "agent-sdk: turn failed",
      model: "claude-sonnet-4.5",
      terminalReason: "prompt_too_long",
      detail: "prompt_too_long",
    });
    expect(err.model).toBe("claude-sonnet-4.5");
    expect(err.terminalReason).toBe("prompt_too_long");
    expect(err.detail).toBe("prompt_too_long");
  });

  test("chains a cause for diagnostics (and leaves it unset when omitted)", () => {
    const root = new Error("socket hung up");
    const withCause = new ProviderError({
      kind: "server",
      retryable: true,
      message: "upstream failed",
      cause: root,
    });
    expect(withCause.cause).toBe(root);
    const noCause = new ProviderError({ kind: "server", retryable: true, message: "x" });
    expect(noCause.cause).toBeUndefined();
  });
});

describe("PROVIDER_ERROR_KINDS", () => {
  test("enumerates the normalized failure vocab every backend collapses onto", () => {
    expect([...PROVIDER_ERROR_KINDS]).toStrictEqual([
      "rate_limit",
      "auth_failed",
      "billing",
      "moderation",
      // The MODEL declined (a 200 carrying the vendor's `refusal` field) — distinct from `moderation`, which
      // is the provider's own layer blocking the PROMPT with a 403.
      "refused",
      "forbidden",
      "invalid",
      "model_unavailable",
      "server",
      "max_output",
      "aborted",
      "unknown",
    ]);
  });
});
