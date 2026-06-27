import { lookup as dnsLookup } from "node:dns";
import { Agent, setGlobalDispatcher } from "undici";
import { env } from "#foundation/env";
import { getLog, securityEvent } from "#foundation/observability";
import { DEFAULT_TRUSTED_RANGES, isInRanges } from "./ip-ranges";

// SSRF egress firewall. All outbound HTTP (OpenRouter, model CDNs, OIDC discovery, and any
// user-influenced URL like the X-Authentik-Meta-Jwks host) flows through Node's global fetch/undici.
// Swapping `http.globalAgent` doesn't work — Node's fetch ignores it. The correct seam is
// `undici.setGlobalDispatcher(new Agent({ connect: { lookup } }))`: a custom DNS lookup that resolves
// the name and REJECTS private/loopback/link-local/Tailscale addresses, then passes the RESOLVED address
// straight to connect — closing the DNS-rebinding TOCTOU (the name can't re-resolve to a different IP
// between check and connect).
//
// The blocked set = DEFAULT_TRUSTED_RANGES ∪ TRUSTED_PRIVATE_RANGES (the operator's extra private CIDRs).
// Internal hosts an operator legitimately needs (a LAN OIDC issuer / JWKS host) go in EGRESS_ALLOWLIST
// by hostname; the OIDC issuer host is always allowlisted so enabling the firewall never breaks oidc.

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

/** Install the global undici dispatcher with a private-IP-rejecting DNS lookup. No-op when disabled. */
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

  setGlobalDispatcher(
    new Agent({
      connect: {
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
              callback(
                new Error(`SSRF_BLOCKED: ${hostname} → ${blocked}`),
                address as string,
                family,
              );
              return;
            }
            // Hand the resolved address(es) straight through — no second resolution (rebinding-safe).
            callback(null, address as string, family);
          });
        },
      },
    }),
  );
  getLog().info(
    { allowlist: [...allowlist] },
    "security: egress firewall installed (private egress blocked)",
  );
}

// ── safeFetch — defense-in-depth wrapper for ANY user-supplied URL fetch ──────────────────────────────
//
// Extras for any avatar-by-URL / webhook / agent-fetch surface, on top of the global dispatcher's SSRF
// block: a response-size cap (decompression-bomb defense), a content-type allowlist, a max-redirects cap
// with per-hop re-validation, and a single-use body guard. Staged seam — zero callers today; reach for
// it the moment a feature accepts a user-supplied outbound URL (unwired ≠ worthless).

/** @public — `safeFetch`'s options shape; staged for the first user-supplied URL feature. */
export interface SafeFetchOptions {
  /** Hard cap on response bytes read. Default 5 MB. */
  maxBytes?: number;
  /** If set, the response's `content-type` (major/minor, ignoring params) must match one entry. */
  allowedContentTypes?: readonly string[];
  /** Max redirect hops the client will follow. Default 3. */
  maxRedirects?: number;
  /** AbortSignal forwarded to fetch (caller's timeout, cancel, etc.). */
  signal?: AbortSignal;
}

/** @public — the result of a safeFetch: headers + a byte reader that respects the size cap. */
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
 *
 * @public — staged seam (zero current callers).
 */
export async function safeFetch(
  url: string | URL,
  options: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const response = await followRedirects(new URL(url), maxRedirects, options.signal);
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

/** Follow up to `maxRedirects` manual hops, re-validating each via the global firewall's connect lookup.
 *  Returns the terminal (non-3xx, or chain-exhausted 3xx) response for the caller to inspect. */
async function followRedirects(
  start: URL,
  maxRedirects: number,
  signal: AbortSignal | undefined,
): Promise<Response> {
  let current = start;
  let lastResponse: Response | null = null;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const init: RequestInit = { redirect: "manual" };
    if (signal) {
      init.signal = signal;
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
    current = new URL(loc, current);
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
