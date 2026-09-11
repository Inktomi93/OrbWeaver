import type { CredentialHealth } from "@orb/contracts/credentials";
import { errorMessage } from "@orb/kit/error-message";
import { z } from "zod";
import { getLog } from "#foundation/observability";
import { redactKnownSecrets } from "#kit/secret-redaction";
import { safeFetch } from "./egress.ts";

// `/models` probe against a USER-CONFIGURED OpenAI-compatible endpoint (configured-endpoint consumer
// class, D61 §2). The owner's own `baseUrl` IS the declared intent — legitimately LAN/private and often
// plain http (BYO vLLM etc.), so this rides `safeFetch` with `ownerConfiguredEndpoint: true`: the fetch
// is host-PINNED to the configured host (a redirect off that host is refused) yet defers address gating
// to the global egress firewall + operator EGRESS_ALLOWLIST (preserving today's LAN posture) rather than
// safeFetch's own private-range denial. Best-effort: any failure returns [] (never throws, never surfaces
// endpoint/key in a throw).
//
// TWO consumers of that ONE request, so the host pin + the caps are written once: `fetchOpenAiModels` (the
// model LIST for the picker) and `probeOpenAiEndpoint` (the credential-HEALTH classification behind
// `credentials.testHealth`'s custom_openai arm — SID-01). The probe differs only in what it returns: a
// best-effort `[]` cannot say "the endpoint rejected your key" vs "the endpoint is down", and the health
// verb's revoke/strike side-effects hang off exactly that distinction.

const modelsResponseSchema = z.object({
  data: z.array(z.object({ id: z.string() }).loose()).optional(),
});

const TRAILING_SLASH_RE = /\/$/;

/** The exact host this probe pins to, from the owner's configured `baseUrl`.
 *
 *  SEALED BY CONSTRUCTION (2026-08-02 security review of the `netHosts` hardening): `hostAllowed`
 *  (./egress) reads a LEADING-DOT allowlist entry as a SUFFIX WILDCARD — `.com` matches every `.com` host.
 *  WHATWG `URL` PRESERVES a leading dot (`new URL("https://.com/").hostname === ".com"`, probed), so this
 *  call site — the only wildcard-arm producer left once plugin manifests are `z.hostname()`-validated — could
 *  otherwise turn a user-supplied baseUrl into a wildcard pin. Not reachable as a privilege escalation today
 *  (a leading-dot host is unresolvable, so the first hop dies at DNS, and the allowlist only ever widens the
 *  OWNER'S own probe), but a "pinned to the configured host" contract must not depend on that.
 *
 *  REFUSE, not strip: stripping the dot would pin to a DIFFERENT host than the one being fetched (coherent
 *  only by accident — the fetch then fails the allowlist anyway). A leading-dot hostname is not a real host,
 *  so the honest answer is that there is nothing here to probe. The caller's best-effort `catch` turns this
 *  into the documented empty-list return plus a log line. */
function exactPinnedHost(base: string): string {
  const { hostname } = new URL(base);
  if (hostname.startsWith(".")) {
    throw new Error("baseUrl hostname starts with '.' — not an exact host, refusing to build a wildcard host pin");
  }
  return hostname;
}

const OK_STATUS_MIN = 200;
const OK_STATUS_MAX = 300;
// A `/models` list is small; keep a tight cap so an internal service coaxed into responding can't stream a
// large body back through the probe (the global firewall already blocks the private connect).
const MODELS_MAX_BYTES = 2_000_000;

/** The endpoint coordinates both user-endpoint ops take — the args for `fetchOpenAiModels` (injected into
 *  `domain/credentials/verbs/fetch-models`) and for `probeOpenAiEndpoint` (injected into `test-health`). */
export interface FetchOpenAiModelsArgs {
  baseUrl: string;
  apiKey: string | null;
  headers: Record<string, string> | null;
}

/** Build the pinned `{baseUrl}/models` URL + its exact host pin. Throws on a baseUrl that is not a real,
 *  exactly-pinnable host — the caller must treat that as "never dialled", not as a probe result. */
function modelsTarget(baseUrl: string): { readonly url: string; readonly host: string } {
  const base = baseUrl.replace(TRAILING_SLASH_RE, "");
  // exactPinnedHost FIRST: it refuses the leading-dot wildcard-pin shape before any URL is built.
  return { host: exactPinnedHost(base), url: `${base}/models` };
}

function endpointHeaders(args: FetchOpenAiModelsArgs): Record<string, string> {
  return {
    ...(args.apiKey !== null && args.apiKey !== "" ? { authorization: `Bearer ${args.apiKey}` } : {}),
    ...(args.headers ?? {}),
  };
}

/** GET `{baseUrl}/models` on an OpenAI-compatible endpoint → the model id list. Best-effort; never throws. */
export async function fetchOpenAiModels(args: FetchOpenAiModelsArgs): Promise<string[]> {
  // @orb-waive caught-failure-ownership(err): a best-effort /models fetch collapses any failure to an empty catalog; the logged error is credential-scrubbed by value (redactKnownSecrets over apiKey + every header value), so no key leaks and no auth verdict rides on it. Ends if an unscrubbed error is logged or the list gates auth.
  try {
    const target = modelsTarget(args.baseUrl);
    const res = await safeFetch(target.url, {
      // Pinned to the owner's configured host; ownerConfiguredEndpoint defers SSRF to the global firewall.
      // `exactPinnedHost` guarantees the entry can never be read as `hostAllowed`'s suffix wildcard.
      allowedHosts: [target.host],
      ownerConfiguredEndpoint: true,
      maxBytes: MODELS_MAX_BYTES,
      headers: endpointHeaders(args),
    });
    if (res.status < OK_STATUS_MIN || res.status >= OK_STATUS_MAX) {
      res.dispose?.(); // drop the non-2xx body + close any pinned Agent before returning (F9)
      return [];
    }
    const text = new TextDecoder().decode(await res.bytes());
    const parsed = modelsResponseSchema.safeParse(JSON.parse(text));
    return parsed.success ? (parsed.data.data ?? []).map((m) => m.id) : [];
  } catch (err) {
    getLog().info({ err: scrubCredentials(String(err), args) }, "network: custom_openai /models fetch failed");
    return [];
  }
}

// An auth-class answer (the endpoint rejected the key) vs any other non-2xx. Only these two statuses may
// drive a REVOCATION — a 404/405/500 says the endpoint is reachable and did not reject the credential, and
// auto-revoking a working BYO endpoint that simply doesn't serve `/models` would be a self-inflicted outage.
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const AUTH_FAILURE_STATUSES: readonly number[] = [HTTP_UNAUTHORIZED, HTTP_FORBIDDEN];

/** Strip the credential literals we hold out of a transport error before it becomes a user-visible reason
 *  (the credential-echo class: a proxy/undici error can quote what it was handed). This file carries no
 *  header-name heuristic, so EVERY non-empty custom header value is treated as secret, regardless of length. */
function scrubCredentials(text: string, args: FetchOpenAiModelsArgs): string {
  return redactKnownSecrets(text, [args.apiKey ?? "", ...Object.values(args.headers ?? {})]);
}

/** undici collapses every transport failure into the bare message "fetch failed" and hangs the actual
 *  diagnosis off `cause` (ECONNREFUSED / ENOTFOUND / a TLS error). A health reason without it is useless to
 *  the person wiring the endpoint, so unwrap ONE level: the cause names the USER'S OWN host/port (which they
 *  typed and which the UI already shows), never the key — and the result is scrubbed by value regardless. */
function transportReason(err: unknown): string {
  const message = errorMessage(err);
  const detail = Error.isError(err) && err.cause !== undefined ? errorMessage(err.cause) : "";
  return detail === "" || message.includes(detail) ? message : `${message}: ${detail}`;
}

/**
 * Credential-health probe for a user-configured OpenAI-compatible endpoint: the SAME host-pinned
 * `GET {baseUrl}/models` as {@link fetchOpenAiModels}, classified instead of listed. Never throws.
 *
 * The classification is what the caller's side-effects hang off, so it is deliberately narrow:
 * 2xx → `ok` · 401/403 → `revoked` (the endpoint rejected this key) · a transport failure (refused/DNS/
 * deadline/egress block) → `unreachable` (the only strike-worthy arm) · anything else, including a baseUrl
 * that cannot be exactly pinned → `unchecked` (nothing was learned about the key; NEVER a green).
 *
 * The STATUS is the whole answer: the body is disposed unread, so a hostile endpoint's bytes never reach a
 * health result, and any reason text is scrubbed of the key + header values by value.
 */
export async function probeOpenAiEndpoint(args: FetchOpenAiModelsArgs, now: () => number): Promise<CredentialHealth> {
  const checkedAt = now();
  let target: { readonly url: string; readonly host: string };
  // @orb-waive caught-failure-ownership(err): an unpinnable/malformed baseUrl yields "unchecked" — never a green and never the strike-worthy "unreachable", so a config typo can neither pass a bad key as healthy nor auto-revoke a working one; the reason is credential-scrubbed by value. Ends if the catch ever returns "ok" or "unreachable".
  try {
    target = modelsTarget(args.baseUrl);
  } catch (err) {
    // Never dialled — a malformed/unpinnable baseUrl is a configuration answer, not a reachability verdict
    // (classifying it `unreachable` would feed the caller's strike breaker and revoke on a typo). Scrubbed
    // too: the message can quote the baseUrl, and some users paste the key into the URL's query.
    return { status: "unchecked", checkedAt, reason: scrubCredentials(`endpoint URL is not usable: ${errorMessage(err)}`, args) };
  }
  try {
    const res = await safeFetch(target.url, {
      allowedHosts: [target.host],
      ownerConfiguredEndpoint: true,
      maxBytes: MODELS_MAX_BYTES,
      headers: endpointHeaders(args),
    });
    res.dispose?.(); // status-only probe: drop the body unread + close any pinned Agent
    if (res.status >= OK_STATUS_MIN && res.status < OK_STATUS_MAX) {
      return { status: "ok", checkedAt };
    }
    if (AUTH_FAILURE_STATUSES.includes(res.status)) {
      return { status: "revoked", checkedAt, reason: `endpoint rejected the credential (HTTP ${res.status})` };
    }
    return { status: "unchecked", checkedAt, reason: `endpoint answered HTTP ${res.status} — the credential could not be verified` };
  } catch (err) {
    const reason = scrubCredentials(transportReason(err), args);
    getLog().info({ err: reason }, "network: custom_openai health probe failed");
    return { status: "unreachable", checkedAt, reason };
  }
}
