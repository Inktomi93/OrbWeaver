// backends/kit/error-classify — the HTTP-status → typed kind table, the transport-name fallback, the
// diagnostic peel, and the sanitized ProviderError builder (an HTML/secret-bearing body never leaks).

import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { ProviderScrubSet } from "@orb/server/infra/providers";
import { ProviderError } from "@orb/server/infra/providers";
import {
  classifyHttpStatus,
  classifyTransportName,
  extractHttpErrorDiagnostic,
  NO_PROVIDER_SECRETS,
  providerCredentialSecretValues,
  providerErrorFromHttp,
} from "@orb/server/infra/providers/backends/kit";
import { describe } from "vitest";
import { expect, test } from "../../../../../support/fixtures.ts";

/** A credential-derived `ProviderScrubSet` (#1599) — the ONLY way a keyed boundary gets one. A test cannot
 *  hand-cast `[secret]` into the brand any more than a runner can, which is the point of the brand. */
function scrubSetFor(apiKey: string): ProviderScrubSet {
  // ResolvedCredential is brand-sealed (contracts/credentials) — only domain credentials/substrate/mint
  // constructs one, and infra tests must not import a domain.
  // FABRICATION-OK: server-can't-mint — see above.
  return providerCredentialSecretValues({ source: "openrouter", apiKey, credentialId: null } as unknown as ResolvedCredential);
}

/** A credential-bearing boundary whose scrub set is EMPTY at runtime — a no-auth custom_openai endpoint.
 *  Distinct from {@link NO_PROVIDER_SECRETS}: a credential WAS handled, so the raw-cause licence is off. */
function emptyKeyedScrubSet(): ProviderScrubSet {
  // FABRICATION-OK: server-can't-mint — see scrubSetFor.
  return providerCredentialSecretValues({ source: "custom_openai", apiKey: null, headers: null } as unknown as ResolvedCredential);
}

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

  test("ABORT WINS over the transient MESSAGE patterns (a cancellation is never re-run)", () => {
    // STRUCTURED-ABORT-REASON-LEAK's second belt: the transient regex reads the message too, so an abort
    // whose message carries "connection"/"timeout" (a caller's abort reason, an SDK's wrapped socket text)
    // must not classify as a retryable server fault — retrying it re-runs, and re-bills, a cancelled call.
    for (const message of ["connection timeout waiting for the user", "network closed", "overloaded"]) {
      expect(classifyTransportName("AbortError", message)).toEqual({ kind: "aborted", retryable: false });
    }
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
    const diag = extractHttpErrorDiagnostic(err, NO_PROVIDER_SECRETS);
    expect(diag.body).toBe("bad request: token sk-leak");
    expect(diag.body).not.toContain("<");
    expect(diag.cause).toBe("Response validation failed");
  });

  test("a non-object error → empty diagnostic", () => {
    expect(extractHttpErrorDiagnostic("just a string", NO_PROVIDER_SECRETS)).toEqual({});
  });

  test("scrubs configured credential literals from both the upstream body and cause", () => {
    const secret = "team-secret-reflected-by-provider";
    const err = {
      body: `upstream echoed ${secret}`,
      cause: new Error(`validation failed near ${secret}`),
    };
    const diag = extractHttpErrorDiagnostic(err, scrubSetFor(secret));
    expect(JSON.stringify(diag)).not.toContain(secret);
    expect(diag.body).toContain("█");
    expect(diag.cause).toContain("█");
  });
});

describe("providerErrorFromHttp", () => {
  test("classifies by statusCode, prefixes + sanitizes the message, attaches the status", () => {
    const err = Object.assign(new Error("rate limited"), { statusCode: 429 });
    const pe = providerErrorFromHttp(err, "openrouter.chat", NO_PROVIDER_SECRETS);
    expect(pe).toBeInstanceOf(ProviderError);
    expect(pe.kind).toBe("rate_limit");
    expect(pe.retryable).toBe(true);
    expect(pe.apiErrorStatus).toBe(429);
    expect(pe.message).toBe("openrouter.chat: rate limited");
    expect(pe.cause).toBe(err);
  });

  test("an HTML error body is stripped from the surfaced message (no markup leak)", () => {
    const err = Object.assign(new Error("<h1>502</h1><p>upstream down</p>"), { statusCode: 502 });
    const pe = providerErrorFromHttp(err, "custom", NO_PROVIDER_SECRETS);
    expect(pe.kind).toBe("server");
    expect(pe.message).not.toContain("<");
    expect(pe.message).toBe("custom: 502 upstream down");
  });

  test("no status → unknown via the transport floor (no apiErrorStatus)", () => {
    const pe = providerErrorFromHttp(new Error("totally weird"), "x", NO_PROVIDER_SECRETS);
    expect(pe.kind).toBe("unknown");
    expect(pe.apiErrorStatus).toBeUndefined();
  });

  test("a 403 content-moderation block classifies as `moderation`, NOT auth_failed", () => {
    // OpenRouter's real prompt-moderation shape: 403 + error.metadata.reasons[].
    const body = JSON.stringify({ error: { code: 403, message: "flagged", metadata: { reasons: ["harassment"] } } });
    const err = Object.assign(new Error("moderated"), { statusCode: 403, body });
    const pe = providerErrorFromHttp(err, "openrouter.chat", NO_PROVIDER_SECRETS);
    expect(pe.kind).toBe("moderation");
    expect(pe.retryable).toBe(false);
    expect(pe.apiErrorStatus).toBe(403);
  });

  test("moderation is detected when the SDK hands back an ALREADY-PARSED object body (belt)", () => {
    const err = Object.assign(new Error("moderated"), { statusCode: 403, body: { error: { code: 403, metadata: { reasons: ["violence"] } } } });
    expect(providerErrorFromHttp(err, "openrouter.chat", NO_PROVIDER_SECRETS).kind).toBe("moderation");
  });

  test("a plain 403 (bad key permissions, no reasons) stays auth_failed", () => {
    const err = Object.assign(new Error("forbidden"), { statusCode: 403, body: JSON.stringify({ error: { code: 403, message: "no access" } }) });
    const pe = providerErrorFromHttp(err, "openrouter.chat", NO_PROVIDER_SECRETS);
    expect(pe.kind).toBe("auth_failed");
  });

  test("scrubs reflected credentials before ProviderError construction and replaces the raw cause", () => {
    const secret = "sk-or-reflected-secret-123456";
    const raw = Object.assign(new Error(`provider rejected ${secret}`), {
      statusCode: 401,
      body: `{"error":"${secret}"}`,
      cause: new Error(`wire parser saw ${secret}`),
    });

    const pe = providerErrorFromHttp(raw, "openrouter.chat", scrubSetFor(secret));

    expect(pe.message).not.toContain(secret);
    expect(JSON.stringify(pe.toLog())).not.toContain(secret);
    expect(pe.cause).not.toBe(raw);
    expect(pe.cause).toBeInstanceOf(Error);
    expect((pe.cause as Error).message).not.toContain(secret);
  });

  test("a KEYED boundary whose scrub set is empty at runtime still loses the raw cause (#1599)", () => {
    // The raw-cause licence is the caller's DECLARED nature, not `secrets.length`. A no-auth custom_openai
    // endpoint mints an EMPTY set, and the old length test read that as "keyless" — so the SDK error graph
    // (reflected body, headers, nested causes: everything a later logger serializes) was retained on a
    // boundary that had, and could reflect, user-controlled `includeBody` auth.
    const raw = Object.assign(new Error("upstream rejected"), { statusCode: 401, body: '{"error":"Authorization: Bearer sk-test-in-body-auth-123456"}' });

    const keyed = providerErrorFromHttp(raw, "custom", emptyKeyedScrubSet());
    expect(keyed.cause).not.toBe(raw);
    expect(keyed.cause).toBeInstanceOf(Error);

    // The keyless spelling is the ONLY thing that retains it — the contrast is what makes the arm a pin
    // rather than a restatement of "always reconstruct".
    const keyless = providerErrorFromHttp(raw, "openrouter catalog", NO_PROVIDER_SECRETS);
    expect(keyless.cause).toBe(raw);
  });
});
