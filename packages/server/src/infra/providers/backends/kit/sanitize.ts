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
//
// THE `includeBody` ARM (#1760) — which user-authored BODY values count as credential material. A BYO
// endpoint may authenticate by a BODY FIELD rather than a header (`includeBody: {"api_key": "…"}`), and
// that literal reaches the same sinks the apiKey does: `providerErrorFromHttp`'s message (durable since
// #1373 — a `securityEvent` plus the credential audit row), the runner's captured wire body, and the
// "Test endpoint" inspector's displayed request + echoed response. The chosen rule is a NAMED ALLOWLIST of
// credential KEY NAMES ({@link SECRET_BODY_KEYS}), matched on the normalized key at any depth, collecting
// STRING leaves only. The three arms this beat, and why:
//   • "every string value" — `includeBody` is also where routing/sampling strings live (`provider`,
//     `stop`, a served model name). Scrubbing those BY VALUE deletes them from every wire capture and
//     provider error that mentions them, blinding the fidelity harness the captures exist for.
//   • `SECRET_HEADER_RE` (the header-NAME signal, `…|token|secret`) — it matches `max_tokens`,
//     `min_tokens` and `stop_token_ids`, all ordinary body fields. Header names are unpredictable so a
//     regex is right there; body key names collide with the sampling vocabulary, so a regex is wrong here.
//   • a per-credential "this field is secret" marking at authoring time — the precise answer, but it needs
//     a contract field + form control the authoring surface does not have, and a user who forgets to tick
//     it leaks silently. Fail-safe beats precise on a credential boundary.
// LIMITS, stated rather than hidden: a wholly novel key spelling is outside the allowlist (the `Bearer …`
// / `sk-…` shape sweep in `redactSecretsFromText` is the defense-in-depth behind it, and a new spelling is
// a one-line edit here), and a NON-string value is skipped — scrubbing a number by value would blank every
// unrelated occurrence of those digits. Over-redaction inside a credential-named subtree is deliberate:
// the key name declares the semantics, exactly as it does for a custom auth header.

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
    return customOpenAiSecretLiterals(credential);
  }
  return [];
}

/**
 * Every plaintext secret a user-defined OpenAI-compatible endpoint holds: the apiKey, EVERY user-authored
 * header value (an arbitrary endpoint's auth header name is unpredictable, so the name is the signal), and
 * the credential-named string leaves of `includeBody` (the file header states that arm and its limits).
 *
 * UNBRANDED on purpose. {@link providerCredentialSecretValues} stays the ONE mint of a `ProviderScrubSet`;
 * this is the ONE home of the RULE, so the "Test endpoint" inspector — which holds the endpoint fields
 * before any credential is minted, and used to hand-roll its own `[apiKey, ...headerValues]` list — cannot
 * drift away from what the runner and the error classifier scrub.
 */
export function customOpenAiSecretLiterals(endpoint: {
  readonly apiKey: string | null;
  readonly headers: Readonly<Record<string, string>> | null;
  readonly includeBody: Readonly<Record<string, unknown>> | null;
}): string[] {
  return [...(endpoint.apiKey === null ? [] : [endpoint.apiKey]), ...Object.values(endpoint.headers ?? {}), ...includeBodySecretLiterals(endpoint.includeBody)];
}

/** Body keys whose VALUE is credential material, normalized (lowercased, separators dropped) so `api_key`,
 *  `apiKey` and `X-Api-Key` are one entry. A CLOSED set — see the file header for why this is a named
 *  allowlist and not the header-name regex. */
const SECRET_BODY_KEYS: ReadonlySet<string> = new Set([
  "accesskey",
  "accesstoken",
  "apikey",
  "apisecret",
  "auth",
  "authorization",
  "authtoken",
  "bearer",
  "clientsecret",
  "idtoken",
  "key",
  "passphrase",
  "passwd",
  "password",
  "pwd",
  "refreshtoken",
  "secret",
  "secretkey",
  "sessionkey",
  "token",
  "xapikey",
]);

const KEY_SEPARATOR_RE = /[-_. ]/g;

function isSecretBodyKey(key: string): boolean {
  return SECRET_BODY_KEYS.has(key.toLowerCase().replace(KEY_SEPARATOR_RE, ""));
}

// File-local: narrow an unknown to a string-keyed record (arrays are handled before this is reached).
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

/** One node of the `includeBody` walk. `secret` = "this node sits inside a credential-named subtree". */
interface BodyWalkFrame {
  readonly value: unknown;
  readonly secret: boolean;
}

/** The children of one frame. An array's items inherit the flag (a list under `api_key` is all secret); an
 *  object's entries gain it from their OWN key, so a credential nested under an ordinary key is still found. */
function bodyWalkChildren(frame: BodyWalkFrame): BodyWalkFrame[] {
  if (Array.isArray(frame.value)) {
    return frame.value.map((item: unknown): BodyWalkFrame => ({ value: item, secret: frame.secret }));
  }
  if (isRecord(frame.value)) {
    return Object.entries(frame.value).map(([key, value]): BodyWalkFrame => ({ value, secret: frame.secret || isSecretBodyKey(key) }));
  }
  return [];
}

/** The string leaves living under a credential-named key anywhere in a user-authored `includeBody`. The
 *  walk is ITERATIVE: the tree is arbitrary user JSON, and a recursive one would be bounded by the call
 *  stack rather than by us. */
function includeBodySecretLiterals(includeBody: Readonly<Record<string, unknown>> | null): string[] {
  if (includeBody === null) {
    return [];
  }
  const out: string[] = [];
  const pending: BodyWalkFrame[] = [{ value: includeBody, secret: false }];
  for (let frame = pending.pop(); frame !== undefined; frame = pending.pop()) {
    if (typeof frame.value === "string") {
      if (frame.secret && frame.value.length > 0) {
        out.push(frame.value);
      }
      continue;
    }
    pending.push(...bodyWalkChildren(frame));
  }
  return out;
}
