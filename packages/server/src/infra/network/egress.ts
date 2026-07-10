import { lookup as dnsLookup } from "node:dns";
import { isIP } from "node:net";
import { Agent, buildConnector, setGlobalDispatcher } from "undici";
import { env } from "#foundation/env";
import { getLog, securityEvent } from "#foundation/observability";
import { DEFAULT_TRUSTED_RANGES, isInRanges } from "./ip-ranges";

// SSRF egress firewall. All outbound HTTP (OpenRouter, model CDNs, OIDC discovery, and any
// user-influenced URL like the X-Authentik-Meta-Jwks host) flows through Node's global fetch/undici.
// Swapping `http.globalAgent` doesn't work — Node's fetch ignores it. The correct seam is
// `undici.setGlobalDispatcher(new Agent({ connect }))`. TWO gates, because undici/Node invokes the connect
// `lookup` ONLY for a host that needs DNS resolution:
//   1. HOSTNAME targets → a custom DNS `lookup` that resolves the name and REJECTS
//      private/loopback/link-local/Tailscale addresses, then passes the RESOLVED address straight to connect
//      — closing the DNS-rebinding TOCTOU (the name can't re-resolve to a different IP between check and
//      connect).
//   2. IP-LITERAL targets (`http://169.254.169.254`, `http://127.0.0.1:port`, an RFC1918 host) → these
//      SKIP `lookup` entirely (Node connects the literal directly), so the connector itself pre-checks the
//      literal host and rejects a private one BEFORE the socket is opened. Without this, a direct-IP SSRF
//      (every scenario in the s7 report) would sail past a lookup-only firewall.
//
// The blocked set = DEFAULT_TRUSTED_RANGES ∪ TRUSTED_PRIVATE_RANGES (the operator's extra private CIDRs).
// Internal hosts an operator legitimately needs (a LAN OIDC issuer / JWKS host) go in EGRESS_ALLOWLIST
// by hostname; the OIDC issuer host is always allowlisted so enabling the firewall never breaks oidc.

const OK_STATUS_MIN = 200;
const REDIRECT_STATUS_MIN = 300;
const REDIRECT_STATUS_MAX = 400;
// ~5 MB response cap (decompression-bomb defense). A single literal keeps it out of noMagicNumbers'
// way (a const initializer is the named home).
const DEFAULT_MAX_BYTES = 5_000_000;
const DEFAULT_MAX_REDIRECTS = 3;

/** Build the blocked private-range set: the built-in trusted ranges plus any operator-declared extras
 *  (TRUSTED_PRIVATE_RANGES). Read DOWN from foundation/env. */
export function privateEgressRanges(): readonly string[] {
  const extra = (env.TRUSTED_PRIVATE_RANGES ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
  return extra.length > 0 ? [...DEFAULT_TRUSTED_RANGES, ...extra] : DEFAULT_TRUSTED_RANGES;
}

/** If `hostname` is an IP LITERAL (v4/v6, tolerating URL brackets), return the bare address; else null.
 *  A literal target skips undici's DNS `lookup`, so the connector must recognize and gate it directly. */
function literalHost(hostname: string): string | null {
  const bare =
    hostname.length > 1 && hostname.startsWith("[") && hostname.endsWith("]")
      ? hostname.slice(1, -1)
      : hostname;
  return isIP(bare) === 0 ? null : bare;
}

/** The pure block decision: a resolved address in `ranges` (private/loopback/operator-declared) is
 *  blocked UNLESS its hostname is on the allowlist (case-insensitive). Public addresses are always
 *  allowed. The test seam; `installEgressFirewall` is the wired surface. */
export function shouldBlockEgress(
  address: string,
  hostname: string,
  allowlist: ReadonlySet<string>,
  ranges: readonly string[],
): boolean {
  if (!isInRanges(address, ranges)) {
    return false;
  }
  return !allowlist.has(hostname.toLowerCase());
}

/** Install the global undici dispatcher that rejects private/loopback/link-local egress at BOTH gates: a
 *  DNS `lookup` for hostname targets (rebind-safe) and a connector pre-check for IP-literal targets (which
 *  skip lookup). Called from `entry/lifecycle` boot. No-op when EGRESS_FIREWALL=false. */
export function installEgressFirewall(): void {
  if (!env.EGRESS_FIREWALL) {
    return;
  }
  const ranges = privateEgressRanges();
  const allowlist = new Set(
    (env.EGRESS_ALLOWLIST ?? "")
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter((h) => h.length > 0),
  );
  // Always allow the OIDC issuer host (discovery + token + JWKS) even on a LAN/private IP — otherwise
  // enabling the firewall would break oidc mode against a privately-hosted IdP.
  if (env.OIDC_ISSUER) {
    try {
      allowlist.add(new URL(env.OIDC_ISSUER).hostname.toLowerCase());
    } catch {
      // malformed issuer — env refinement would have caught it in oidc mode
    }
  }

  // Gate 1 — HOSTNAME targets: resolve once, block a private resolved address, hand the resolved address
  // straight to connect (rebinding-safe). `buildConnector` uses this lookup for names that need resolution.
  const baseConnect = buildConnector({
    lookup(hostname, options, callback): void {
      dnsLookup(hostname, options, (err, address, family): void => {
        if (err) {
          callback(err, address as string, family as number);
          return;
        }
        // Two callback shapes (node:dns): `{all:true}` yields LookupAddress[]; the default yields a
        // single address string. Block if ANY resolved address is private and the host isn't
        // allowlisted — the connector may try any of them.
        const addrs: string[] = Array.isArray(address)
          ? address.map((a) => String((a as { address?: unknown }).address ?? a))
          : [String(address)];
        const blocked = addrs.find((a) => shouldBlockEgress(a, hostname, allowlist, ranges));
        if (blocked !== undefined) {
          securityEvent(
            "egress_blocked",
            { hostname, address: blocked },
            "security: egress SSRF blocked (private address)",
          );
          callback(new Error(`SSRF_BLOCKED: ${hostname} → ${blocked}`), address as string, family);
          return;
        }
        // Hand the resolved address(es) straight through — no second resolution (rebinding-safe).
        callback(null, address as string, family);
      });
    },
  });

  // Gate 2 — IP-LITERAL targets: undici/Node SKIP the lookup above for a literal host, so the connector
  // pre-checks the literal itself and rejects a private/loopback/link-local one before the socket opens.
  const connect: buildConnector.connector = (options, callback): void => {
    const literal = literalHost(options.hostname);
    if (literal !== null && shouldBlockEgress(literal, options.hostname, allowlist, ranges)) {
      securityEvent(
        "egress_blocked",
        { hostname: options.hostname, address: literal },
        "security: egress SSRF blocked (private literal address)",
      );
      callback(new Error(`SSRF_BLOCKED: ${options.hostname} → ${literal}`), null);
      return;
    }
    baseConnect(options, callback);
  };

  setGlobalDispatcher(new Agent({ connect }));
  getLog().info(
    { allowlist: [...allowlist] },
    "security: egress firewall installed (private egress blocked)",
  );
}

// ── safeFetch — defense-in-depth wrapper for ANY user-supplied URL fetch ──────────────────────────────
//
// Extras for any avatar-by-URL / webhook / agent-fetch surface, on top of the global dispatcher's SSRF
// block: a response-size cap (decompression-bomb defense), a content-type allowlist, a max-redirects cap
// with per-hop re-validation, and a single-use body guard. First consumer: fetchImageBytes (below) —
// the imagery generated-image download (provider-returned URLs are third-party-authored, D61 B5a).
// Reach for it for ANY new surface accepting a user/provider-supplied outbound URL.

export interface SafeFetchOptions {
  /** Hard cap on response bytes read. Default 5 MB. */
  maxBytes?: number;
  /** If set, the response's `content-type` (major/minor, ignoring params) must match one entry. */
  allowedContentTypes?: readonly string[];
  /** Max redirect hops the client will follow. Default 3. */
  maxRedirects?: number;
  /** AbortSignal forwarded to fetch (caller's timeout, cancel, etc.). */
  signal?: AbortSignal;
  /** Request headers forwarded on the initial request AND every redirect hop (e.g. a Bearer key for a
   *  user-supplied `/models` probe). The caller owns the leak surface: these ride to the redirect target,
   *  which the per-hop SSRF re-validation still address-gates. */
  headers?: Record<string, string>;
}

/** Headers + a byte reader that respects the size cap. */
export interface SafeFetchResult {
  status: number;
  headers: Headers;
  contentType: string | null;
  bytes: () => Promise<Uint8Array>;
}

/**
 * SSRF-safe fetch wrapper. The egress firewall has already blocked private addresses at the connect
 * lookup; this wrapper enforces the *response*-side controls a user-supplied URL still needs. Returns
 * the response (headers + a `bytes()` reader that respects the byte cap), throws on any block / cap /
 * disallowed type.
 */
export async function safeFetch(
  url: string | URL,
  options: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const response = await followRedirects(
    new URL(url),
    maxRedirects,
    options.signal,
    options.headers,
  );
  const contentType = enforceContentType(response, options.allowedContentTypes);
  let consumed = false;
  return {
    status: response.status,
    headers: response.headers,
    contentType,
    bytes: async (): Promise<Uint8Array> => {
      if (consumed) {
        throw new Error("safeFetch: response already consumed");
      }
      consumed = true;
      const reader = response.body?.getReader();
      if (!reader) {
        return new Uint8Array();
      }
      return await readCapped(reader, maxBytes);
    },
  };
}

/**
 * Fetch a remote image URL to bytes through {@link safeFetch} — the first safeFetch consumer (D61 B5a).
 * The imagery domain uses this to download a provider-returned generated-image URL: that URL is populated
 * by the CHOSEN (OpenRouter-marketplace) model provider's response body, NOT first-party code, so it is
 * attacker-influenceable and MUST NOT be fetched raw — a malicious/compromised image provider could point
 * it at a loopback / link-local / RFC1918 target (SSRF read-and-exfil). Rides the global SSRF dispatcher
 * (private-address block + per-redirect re-validation) plus the response byte cap. `maxBytes` overrides
 * safeFetch's own 5 MB default — the imagery compose binding threads the `AppSettings.maxImageBytes`
 * deployment knob here (read live via the effective-config sync getter); omitted → safeFetch's default
 * cap. Returns the bytes on a 2xx, or `null` on any block / non-2xx / cap / network failure — the caller
 * drops that one image, so a poisoned (or over-cap) URL is never stored.
 */
export async function fetchImageBytes(url: string, maxBytes?: number): Promise<Uint8Array | null> {
  try {
    const res = await safeFetch(url, maxBytes === undefined ? {} : { maxBytes });
    if (res.status < OK_STATUS_MIN || res.status >= REDIRECT_STATUS_MIN) {
      return null;
    }
    return await res.bytes();
  } catch {
    return null;
  }
}

// Caller headers that carry a secret (a user's provider Bearer key, a session cookie) and MUST NOT ride a
// CROSS-ORIGIN redirect hop — a user-supplied baseUrl that 302s to an attacker host would otherwise exfil
// the user's API key. Matches the browser/curl rule: strip credentials when the redirect changes origin.
const CREDENTIAL_HEADERS: readonly string[] = ["authorization", "cookie", "proxy-authorization"];

/** Drop credential-bearing headers (case-insensitive) — applied when a redirect crosses origin. */
function stripCredentialHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([k]) => !CREDENTIAL_HEADERS.includes(k.toLowerCase())),
  );
}

/** Follow up to `maxRedirects` manual hops, re-validating each via the global firewall's connect lookup.
 *  Returns the terminal (non-3xx, or chain-exhausted 3xx) response for the caller to inspect. Credential
 *  headers (Authorization/Cookie) are stripped the moment a hop crosses origin (key-exfil defense). */
async function followRedirects(
  start: URL,
  maxRedirects: number,
  signal: AbortSignal | undefined,
  headers: Record<string, string> | undefined,
): Promise<Response> {
  let current = start;
  let hopHeaders = headers;
  let lastResponse: Response | null = null;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const init: RequestInit = { redirect: "manual" };
    if (signal) {
      init.signal = signal;
    }
    if (hopHeaders) {
      init.headers = hopHeaders;
    }
    // biome-ignore lint/performance/noAwaitInLoops: redirect hops are inherently sequential — each Location depends on the prior response.
    lastResponse = await fetch(current, init);
    const isRedirect =
      lastResponse.status >= REDIRECT_STATUS_MIN && lastResponse.status < REDIRECT_STATUS_MAX;
    const loc = isRedirect ? lastResponse.headers.get("location") : null;
    // Non-3xx, a 3xx with no Location, or the chain exhausted → RETURN this response (don't drain it;
    // the caller owns the terminal body).
    if (!loc || hop === maxRedirects) {
      break;
    }
    // Drain the intermediate 3xx body (fire-and-forget) so the socket returns to the pool, then follow.
    void lastResponse.body?.cancel().catch(() => undefined);
    const next = new URL(loc, current);
    // Cross-origin hop → strip the caller's credential headers so a user's Bearer key never rides to a
    // redirect-chosen host (the SSRF connector still address-gates the target regardless).
    if (hopHeaders && next.origin !== current.origin) {
      hopHeaders = stripCredentialHeaders(hopHeaders);
    }
    current = next;
  }
  if (!lastResponse) {
    throw new Error("safeFetch: no response (max redirects exceeded with no terminal status)");
  }
  return lastResponse;
}

/** Resolve + validate the response content-type against an optional allowlist (throws on a mismatch). */
function enforceContentType(
  response: Response,
  allowed: readonly string[] | undefined,
): string | null {
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? null;
  if (allowed && allowed.length > 0 && !(contentType && allowed.includes(contentType))) {
    throw new Error(`safeFetch: disallowed content-type ${contentType ?? "(none)"}`);
  }
  return contentType;
}

/** Read a stream to completion, aborting (cancel + throw) the moment it exceeds `maxBytes`. */
async function readCapped(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  maxBytes: number,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  let chunk = await reader.read();
  while (!chunk.done) {
    total += chunk.value.byteLength;
    if (total > maxBytes) {
      void reader.cancel().catch(() => undefined);
      throw new Error(`safeFetch: response exceeded maxBytes=${maxBytes}`);
    }
    chunks.push(chunk.value);
    // biome-ignore lint/performance/noAwaitInLoops: stream chunks are inherently sequential — each read awaits the prior chunk resolving.
    chunk = await reader.read();
  }
  return concatChunks(chunks, total);
}

/** Flatten read chunks into one `Uint8Array` of the known total length. */
function concatChunks(chunks: readonly Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}
