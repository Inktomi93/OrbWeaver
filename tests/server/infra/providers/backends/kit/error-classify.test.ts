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
import { makeCustomOpenAiCredential } from "../../../../../support/factories/resolved-connection.ts";
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

  // SHAPE-BELT CONTROL (#1760/#1785/#1809): this fixture matches the `sk-…` shape, so the defense-in-depth
  // sweep inside `redactSecretsFromText` removes it whatever the BY-VALUE belt does. Kept deliberately — it
  // pins the sweep — but it can never serve as the by-value pin; those arms are at the foot of this file.
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

// #1760: the ERROR-PATH half of the includeBody scrub. `providerErrorFromHttp`'s message is not a log
// line — since #1373 it flows into a DURABLE `securityEvent("credential_revoked", { reason })` plus the
// credential audit row, so a key-in-body credential reflected by the endpoint would be written to disk in
// plaintext. The scrub set is the credential's, minted once; this pins that the includeBody literal is in
// it at the boundary that actually builds the error.
describe("providerErrorFromHttp — a key-in-body credential (#1760)", () => {
  const inBodyKey = "inbody-cred-7f3a9c2e5b1d";

  test("an endpoint reflecting the key-in-body credential cannot reach the message, the log record or the cause", () => {
    // A no-auth-header BYO endpoint whose auth is a body field — `apiKey`/`headers` are null, so the ONLY
    // secret this credential holds is the includeBody literal.
    const cred = makeCustomOpenAiCredential({ apiKey: null, headers: null, includeBody: Object.fromEntries([["api_key", inBodyKey]]) });
    const raw = Object.assign(new Error(`endpoint rejected api_key=${inBodyKey}`), {
      statusCode: 401,
      body: `{"error":{"message":"invalid api_key ${inBodyKey}"}}`,
      cause: new Error(`upstream echoed ${inBodyKey}`),
    });

    const pe = providerErrorFromHttp(raw, "custom-byo (https://byo.test/v1)", providerCredentialSecretValues(cred));

    expect(pe.kind).toBe("auth_failed");
    expect(pe.message).not.toContain(inBodyKey);
    expect(pe.message).toContain("█");
    expect(JSON.stringify(pe.toLog())).not.toContain(inBodyKey);
    expect((pe.cause as Error).message).not.toContain(inBodyKey);
  });

  test("the peeled diagnostic body/cause are scrubbed of the same literal", () => {
    const cred = makeCustomOpenAiCredential({ apiKey: null, headers: null, includeBody: Object.fromEntries([["api_key", inBodyKey]]) });
    const diag = extractHttpErrorDiagnostic({ body: `echo ${inBodyKey}`, cause: new Error(`parse near ${inBodyKey}`) }, providerCredentialSecretValues(cred));
    expect(JSON.stringify(diag)).not.toContain(inBodyKey);
    expect(diag.body).toContain("█");
  });
});

// #1809 (SECURITY): these sites were spelled `redactSecretsFromText(sanitizeApiError(x), secrets)` —
// SANITIZE, then scrub. `sanitizeApiError` MUTATES the text first: it replaces every `<…>` span with a
// space and hard-caps the result at 500 chars. Either edit can bite a known credential in half, and once
// the literal is fragmented NEITHER of its spellings matches, so the by-value belt never reaches the
// remainder — which then rides `ProviderError.message` into the #1373 `securityEvent("credential_revoked")`
// and the credential audit row, a DURABLE sink. The order is now scrub-then-sanitize: the by-value belt
// reads intact text, and the length cap applies to already-scrubbed bytes.
//
// SHAPE-BLIND FIXTURES (the #1760/#1785 instrument-lie): an `sk-…`/`Bearer …` credential is removed by
// `redactSecretsFromText`'s defense-in-depth shape sweep whatever the by-value belt does, so a pin written
// with one goes green against the BROKEN source. These match neither shape and are assembled from parts.
// The `sk-or-reflected-secret-123456` arm above is kept as the labelled shape-belt control.
//
// Every arm also asserts surviving non-secret content: `redactKnownSecrets` FAIL-CLOSES to `""` when a
// literal survives, and a blank string satisfies every `not.toContain` vacuously.
describe("the by-value scrub runs BEFORE sanitize mangles the text (#1809)", () => {
  const lt = "<";
  const gt = ">";
  /** A BYO credential carrying markup characters — a user-authored header/body auth value is arbitrary text,
   *  and `sanitizeApiError` turns `<tag>` into a space, leaving {@link angleTail} standing. */
  const angleKey = `byo${lt}tag${gt}cred4d8e1b6a2c90`;
  const angleTail = "cred4d8e1b6a2c90";

  // The cap is 500. With 484 chars of padding plus one space the credential starts at index 485, so the cut
  // lands 15 chars into it — and those 15 are the key's entropy prefix, not a guessable label.
  const straddlePadLength = 484;
  const straddlePadding = "y".repeat(straddlePadLength);
  const straddleKey = "9f2b7e4a1c6d8305-straddle-cred";
  const straddleSurvivingPrefix = "9f2b7e4a1c6d830";

  test("a markup-bearing credential reflected in the upstream BODY is scrubbed whole (error-classify:190)", () => {
    const diag = extractHttpErrorDiagnostic({ body: `upstream echoed ${angleKey}` }, scrubSetFor(angleKey));
    expect(diag.body).not.toContain(angleKey);
    expect(diag.body).not.toContain(angleTail);
    expect(diag.body).toContain("█");
    expect(diag.body).toContain("upstream echoed");
  });

  test("a markup-bearing credential reflected in the CAUSE is scrubbed whole (error-classify:196)", () => {
    const diag = extractHttpErrorDiagnostic({ cause: new Error(`wire parser saw ${angleKey}`) }, scrubSetFor(angleKey));
    expect(diag.cause).not.toContain(angleKey);
    expect(diag.cause).not.toContain(angleTail);
    expect(diag.cause).toContain("█");
    expect(diag.cause).toContain("wire parser saw");
  });

  test("a credential straddling the 500-char cap never reaches the durable message (error-classify:216)", () => {
    const raw = new Error(`${straddlePadding} ${straddleKey}`);
    const pe = providerErrorFromHttp(raw, "custom-byo (https://byo.test/v1)", scrubSetFor(straddleKey));

    // The truncation used to cut the key in half and the by-value belt, running after it, saw neither
    // spelling — so this prefix was written to the audit row.
    expect(pe.message).not.toContain(straddleSurvivingPrefix);
    expect(pe.message).toContain("█");
    expect(pe.message).toContain(straddlePadding);
    expect(JSON.stringify(pe.toLog())).not.toContain(straddleSurvivingPrefix);
    expect((pe.cause as Error).message).not.toContain(straddleSurvivingPrefix);
  });
});
