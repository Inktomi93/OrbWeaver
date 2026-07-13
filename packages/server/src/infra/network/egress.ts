import { lookup as dnsLookup } from "node:dns";
import { isIP } from "node:net";
import { Agent, buildConnector, setGlobalDispatcher } from "undici";
import { env } from "#foundation/env";
import { getLog, securityEvent } from "#foundation/observability";
import { DEFAULT_TRUSTED_RANGES, isInRanges } from "./ip-ranges";

// SSRF egress firewall via undici.setGlobalDispatcher (swapping http.globalAgent doesn't work — Node's
// fetch ignores it). Two gates: a DNS lookup override for hostname targets (closes the DNS-rebinding
// TOCTOU) and a connector pre-check for IP-literal targets (which skip lookup entirely).

const OK_STATUS_MIN = 200;
const REDIRECT_STATUS_MIN = 300;
const REDIRECT_STATUS_MAX = 400;
const DEFAULT_MAX_BYTES = 5_000_000;
const DEFAULT_MAX_REDIRECTS = 3;

export function privateEgressRanges(): readonly string[] {
  const extra = (env.TRUSTED_PRIVATE_RANGES ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
  return extra.length > 0 ? [...DEFAULT_TRUSTED_RANGES, ...extra] : DEFAULT_TRUSTED_RANGES;
}

// A literal target skips undici's DNS lookup, so the connector must recognize and gate it directly.
function literalHost(hostname: string): string | null {
  const bare =
    hostname.length > 1 && hostname.startsWith("[") && hostname.endsWith("]")
      ? hostname.slice(1, -1)
      : hostname;
  return isIP(bare) === 0 ? null : bare;
}

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
  // Always allow the OIDC issuer host (LAN/private IP) — otherwise enabling the firewall breaks oidc mode.
  if (env.OIDC_ISSUER) {
    try {
      allowlist.add(new URL(env.OIDC_ISSUER).hostname.toLowerCase());
    } catch {
      // malformed issuer — env refinement would have caught it in oidc mode
    }
  }

  const baseConnect = buildConnector({
    lookup(hostname, options, callback): void {
      dnsLookup(hostname, options, (err, address, family): void => {
        if (err) {
          callback(err, address as string, family as number);
          return;
        }
        // node:dns: {all:true} yields LookupAddress[]; the default yields a single address string.
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
        callback(null, address as string, family);
      });
    },
  });

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

// Defense-in-depth wrapper for any user-supplied URL fetch: response-size cap, content-type allowlist,
// max-redirects with per-hop re-validation, single-use body guard. Reach for it for any new surface
// accepting a user/provider-supplied outbound URL.

export interface SafeFetchOptions {
  maxBytes?: number;
  allowedContentTypes?: readonly string[];
  maxRedirects?: number;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export interface SafeFetchResult {
  status: number;
  headers: Headers;
  contentType: string | null;
  bytes: () => Promise<Uint8Array>;
}

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

// Provider-returned generated-image URLs are third-party-authored and attacker-influenceable — never
// fetch raw. Returns null on any block/non-2xx/cap/network failure; the caller drops that one image.
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

// Must not ride a cross-origin redirect hop — a user-supplied baseUrl that 302s to an attacker host would otherwise exfil the key.
const CREDENTIAL_HEADERS: readonly string[] = ["authorization", "cookie", "proxy-authorization"];

function stripCredentialHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([k]) => !CREDENTIAL_HEADERS.includes(k.toLowerCase())),
  );
}

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
    if (!loc || hop === maxRedirects) {
      break;
    }
    void lastResponse.body?.cancel().catch(() => undefined);
    const next = new URL(loc, current);
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

function concatChunks(chunks: readonly Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}
