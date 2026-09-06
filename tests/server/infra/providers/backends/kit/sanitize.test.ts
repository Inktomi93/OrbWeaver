// sanitize.ts — wire-level error hygiene. An upstream error body (an HTML 502 page, a control-char blob)
// must never reach a log line or a ProviderError.message verbatim. We lock: C0/DEL control chars are
// stripped, HTML/XML tags become spaces (adjacent tokens don't fuse), whitespace collapses, the length
// cap appends a truncation marker, and the passes are idempotent on clean text.

import { providerCredentialSecretValues, sanitizeApiError } from "@orb/server/infra/providers/backends/kit";
import { describe } from "vitest";
import { makeCustomOpenAiCredential } from "../../../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../../../support/fixtures.ts";

// Assemble control chars at runtime (NUL, BS, DEL) rather than embedding raw bytes in the source.
const CONTROL_CHARS = String.fromCharCode(0, 8, 127);
const TRUNCATION_MARKER = "… [truncated]";

describe("sanitizeApiError", () => {
  test("strips C0 control chars + DEL from the body", () => {
    expect(sanitizeApiError(`bad${CONTROL_CHARS}request`)).toBe("badrequest");
  });

  test("strips HTML/XML tags, inserting a space so adjacent tokens don't fuse", () => {
    expect(sanitizeApiError("<h1>Foo</h1><p>Bar</p>")).toBe("Foo Bar");
  });

  test("an upstream HTML error page leaves NO markup behind (the security belt)", () => {
    // Assembled from parts so the contiguous markup blob isn't flagged as a high-entropy literal.
    const html = ["<html>", "<body>", "upstream is down", "</body>", "</html>"].join("");
    const out = sanitizeApiError(html);
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
    expect(out).toBe("upstream is down");
  });

  test("collapses runs of whitespace (incl. tabs/newlines) into a single space and trims", () => {
    expect(sanitizeApiError("  a\t\t b\n\n c  ")).toBe("a b c");
  });

  test("caps length and appends a truncation marker past the cap", () => {
    const out = sanitizeApiError("a".repeat(50), 10);
    expect(out).toBe(`${"a".repeat(10)}${TRUNCATION_MARKER}`);
    expect(out.length).toBe(10 + TRUNCATION_MARKER.length);
  });

  test("text at or under the cap is NOT truncated", () => {
    expect(sanitizeApiError("short", 10)).toBe("short");
  });

  test("is idempotent on already-clean text (the passes are no-ops)", () => {
    const clean = "already clean message";
    expect(sanitizeApiError(sanitizeApiError(clean))).toBe(clean);
  });

  test("an empty string sanitizes to an empty string", () => {
    expect(sanitizeApiError("")).toBe("");
  });
});

// ── The scrub-set MINT (#1760): which `includeBody` values are credential material ────────────────────
// A `custom_openai` endpoint's `includeBody` is user-authored and can carry key-in-body auth
// (`{"api_key": "…"}` — the nonstandard-endpoint pattern), and the mint feeds BOTH durable sinks:
// `providerErrorFromHttp`'s message (→ the #1373 securityEvent + the credential audit row) and the
// runner's captured wire body. The arm under test is a NAMED ALLOWLIST of credential key names matched
// at any depth — NOT "every string value" (which would scrub routing/sampling strings out of every
// capture) and NOT the header-name regex (which matches `max_tokens`). Both directions are pinned: the
// credentials are IN the set, the ordinary body fields stay OUT.
//
// Body keys are built from string DATA (`endpointBody`) rather than object literals: the key SPELLING is
// what is under test, and a literal `{ api_key: … }` would need a snake_case naming-convention allowance
// on this file for no gain.
function endpointBody(...entries: readonly (readonly [string, unknown])[]): Record<string, unknown> {
  return Object.fromEntries(entries);
}

describe("providerCredentialSecretValues — the includeBody arm", () => {
  const bodyKey = "sk-test-includebody-0123456789";

  test("a top-level key-in-body credential is in the scrub set", () => {
    const cred = makeCustomOpenAiCredential({ apiKey: null, includeBody: endpointBody(["api_key", bodyKey]) });
    expect(providerCredentialSecretValues(cred)).toContain(bodyKey);
  });

  test("the key-name spellings normalize (apiKey / X-Api-Key / access_token / password)", () => {
    for (const [key, value] of [
      ["apiKey", "sk-test-camel-0123456789"],
      ["X-Api-Key", "sk-test-dashed-0123456789"],
      ["access_token", "sk-test-access-0123456789"],
      ["password", "sk-test-password-0123456789"],
    ] as const) {
      const cred = makeCustomOpenAiCredential({ apiKey: null, includeBody: endpointBody([key, value]) });
      expect(providerCredentialSecretValues(cred)).toContain(value);
    }
  });

  test("a credential nested under an ordinary key is collected (the walk is depth-agnostic)", () => {
    const nested = endpointBody(["vendor", endpointBody(["api_key", bodyKey])]);
    const cred = makeCustomOpenAiCredential({ apiKey: null, includeBody: endpointBody(["extra", nested]) });
    expect(providerCredentialSecretValues(cred)).toContain(bodyKey);
  });

  test("every string under a credential-NAMED subtree is collected (a whole auth object)", () => {
    const auth = endpointBody(["scheme", "basic"], ["value", bodyKey]);
    const cred = makeCustomOpenAiCredential({ apiKey: null, includeBody: endpointBody(["auth", auth]) });
    const secrets = providerCredentialSecretValues(cred);
    expect(secrets).toContain(bodyKey);
    expect(secrets).toContain("basic");
  });

  test("ORDINARY body fields stay OUT of the set — the instruments must still read the wire", () => {
    // `provider`/`stop`/`max_tokens` are the routing + sampling knobs a BYO user really puts in
    // includeBody. Scrubbing them by value would blank them out of every wire capture and provider error
    // that mentions them. `max_tokens`/`stop_token_ids` also prove the arm is NOT the header-name regex
    // (`/…|token|secret/i` matches both).
    const cred = makeCustomOpenAiCredential({
      apiKey: null,
      includeBody: endpointBody(["provider", endpointBody(["order", ["cerebras"]])], ["stop", ["</s>"]], ["max_tokens", 4096], ["stop_token_ids", ["128009"]]),
    });
    expect(providerCredentialSecretValues(cred)).toEqual([]);
  });

  test("a non-STRING value under a credential key is not scrubbable by value and is skipped", () => {
    const cred = makeCustomOpenAiCredential({ apiKey: null, includeBody: endpointBody(["api_key", 12_345], ["token", true]) });
    expect(providerCredentialSecretValues(cred)).toEqual([]);
  });

  test("the apiKey + header literals still ride (the includeBody arm WIDENS the set, never replaces it)", () => {
    const cred = makeCustomOpenAiCredential({
      apiKey: "sk-test-apikey-0123456789",
      headers: { "x-team": "alpha" },
      includeBody: endpointBody(["api_key", bodyKey]),
    });
    const secrets = providerCredentialSecretValues(cred);
    expect(secrets).toContain("sk-test-apikey-0123456789");
    expect(secrets).toContain("alpha");
    expect(secrets).toContain(bodyKey);
  });
});
