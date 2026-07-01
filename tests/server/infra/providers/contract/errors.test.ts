// errors.ts — the provider-agnostic failure surface (ProviderError) every role/backend maps onto, plus
// the PROVIDER_ERROR_KINDS vocab. We lock: the class is a real Error subclass carrying kind/retryable +
// the optional rate-limit/status fields, the cause chains for diagnostics, the message passes through
// verbatim (no appended noise — the "safe-for-log, no secrets" contract is the caller's), and the kinds
// vocab enumerates the normalized failure set.

import { PROVIDER_ERROR_KINDS, ProviderError } from "@orb/server/infra/providers";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures";

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
