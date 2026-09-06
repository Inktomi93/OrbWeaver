// infra/providers/backends/kit/sanitize — wire-level error hygiene. An upstream error body (an HTML 502
// page, a control-char-laced binary blob, an arbitrary provider message) must never reach a log line, a
// debug span, or the UI verbatim. `sanitizeApiError` strips control chars + markup and length-caps.
//
// SECURITY: this is the wire-level secret/markup hygiene seam the providers contract names
// (contract/errors.ts) — the error CORE never holds plaintext key material, so this is the belt that
// scrubs an upstream-derived string before it crosses into observability or a `ProviderError.message`.
//
// NOTE (orbweaver vs neo): neo branded the RESULT `SanitizedErrorMessage` because its `ChatError.message`
// was typed to that brand. Orbweaver's `ProviderError.message` is a plain `string` (contract/errors.ts),
// so that brand carried no compile-time obligation here and is dropped — `sanitizeApiError` returns `string`.
// The brand this file DOES carry is on the INPUT side: `ProviderScrubSet` (#1599), which does carry an
// obligation — a credential-bearing boundary cannot omit or fake its scrub set.

import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { ProviderScrubSet } from "../../contract/index.ts";

const DEFAULT_SANITIZE_MAX_LEN = 500;

/**
 * Strip C0 control chars + DEL (preserving `\n`/`\t`) and HTML/XML tags from an upstream error string,
 * collapse whitespace, and cap the length (a truncation marker is appended past the cap). Idempotent on
 * already-clean text (the passes are no-ops), so a classifier may call it on every message — including
 * known-safe literals — without measurable cost.
 */
export function sanitizeApiError(raw: string, maxLen: number = DEFAULT_SANITIZE_MAX_LEN): string {
  // Strip C0 control chars (0x00–0x1F) + DEL (0x7F), preserving newline (0x0A) + tab (0x09).
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional — this strips them.
  let cleaned = raw.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, "");
  // Replace each HTML/XML tag with a single space so adjacent tag-wrapped tokens don't fuse
  // ("<h1>Foo</h1><p>Bar</p>" → "Foo Bar", not "FooBar"); an upstream HTML error page would otherwise
  // leak a wall of markup into our logs.
  cleaned = cleaned.replace(/<[^>]*>/g, " ");
  // Collapse runs of whitespace (from tag stripping or the raw body) into a single space.
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  if (cleaned.length > maxLen) {
    cleaned = `${cleaned.slice(0, maxLen)}… [truncated]`;
  }
  return cleaned;
}

const NO_SECRET_LITERALS: readonly string[] = Object.freeze([]);

/**
 * The ONE spelling for an HTTP boundary that carries NO credential — today the public OpenRouter `/models`
 * catalog and the diagnostic peel whose result is regex-tested and discarded.
 *
 * It is not "an empty scrub set": it is the claim that there is nothing to scrub, and
 * `providerErrorFromHttp` reads it as the licence to retain the RAW error as `cause` for diagnosability.
 * Never reach for it to satisfy `tsc` on a keyed path — that is the exact hole the brand closes.
 */
export const NO_PROVIDER_SECRETS: ProviderScrubSet = NO_SECRET_LITERALS as ProviderScrubSet;

/**
 * Known plaintext values an upstream can reflect into an error. Every user-authored custom header value is
 * secret at this trust boundary: arbitrary endpoints commonly use auth header names we cannot predict.
 * The ONE legal mint of a credential-derived {@link ProviderScrubSet} — an encapsulated cast, the same
 * shape the `ResolvedCredential` brand's own factory home uses.
 *
 * A keyless SOURCE (vllm / local-light / max-pro-sub) yields an EMPTY set here, and that is NOT the same
 * fact as {@link NO_PROVIDER_SECRETS}: a credential was still handled, so the classifier keeps its
 * reconstructed cause. Never "optimise" an empty result into the keyless constant.
 */
export function providerCredentialSecretValues(credential: ResolvedCredential): ProviderScrubSet {
  return credentialSecretLiterals(credential) as ProviderScrubSet;
}

/** The unbranded half of {@link providerCredentialSecretValues} — split out only so the mint has exactly
 *  one `as ProviderScrubSet` cast to audit. */
function credentialSecretLiterals(credential: ResolvedCredential): readonly string[] {
  if (credential.source === "openrouter") {
    return [credential.apiKey];
  }
  if (credential.source === "custom_openai") {
    return [...(credential.apiKey === null ? [] : [credential.apiKey]), ...Object.values(credential.headers ?? {})];
  }
  return [];
}
