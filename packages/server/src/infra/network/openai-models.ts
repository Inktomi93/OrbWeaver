import { redactKnownSecrets } from "@orb/kit/secret-redaction";
import { z } from "zod";
import { getLog } from "#foundation/observability";
import { safeFetch } from "./egress.ts";

// `/models` probe against a USER-CONFIGURED OpenAI-compatible endpoint (configured-endpoint consumer
// class, D61 §2). The owner's own `baseUrl` IS the declared intent — legitimately LAN/private and often
// plain http (BYO vLLM etc.), so this rides `safeFetch` with `ownerConfiguredEndpoint: true`: the fetch
// is host-PINNED to the configured host (a redirect off that host is refused) yet defers address gating
// to the global egress firewall + operator EGRESS_ALLOWLIST (preserving today's LAN posture) rather than
// safeFetch's own private-range denial. Best-effort: any failure returns [] (never throws, never surfaces
// endpoint/key in a throw).
//
// This is the model LIST for the picker. Credential health runs through the inference provider's live
// diagnostics path, which probes the authenticated read admitted by that provider's dialect.

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

/** The endpoint coordinates for `fetchOpenAiModels`, injected into
 *  `domain/credentials/verbs/fetch-models`. */
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

/** Strip the credential literals we hold out of a transport error before it reaches the log
 *  (the credential-echo class: a proxy/undici error can quote what it was handed). This file carries no
 *  header-name heuristic, so EVERY non-empty custom header value is treated as secret, regardless of length. */
function scrubCredentials(text: string, args: FetchOpenAiModelsArgs): string {
  return redactKnownSecrets(text, [args.apiKey ?? "", ...Object.values(args.headers ?? {})]);
}
