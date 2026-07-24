import { lookup as dnsLookup } from "node:dns";
import { isIP } from "node:net";
import { Agent, buildConnector, setGlobalDispatcher } from "undici";
import { env } from "#foundation/env";
import { getLog, securityEvent } from "#foundation/observability";
import { DEFAULT_TRUSTED_RANGES, isInRanges } from "./ip-ranges";

// SSRF egress firewall via undici.setGlobalDispatcher (swapping http.globalAgent doesn't work — Node's
// fetch ignores it). Two gates: a DNS lookup override for hostname targets (closes the DNS-rebinding
// TOCTOU) and a connector pre-check for IP-literal targets (which skip lookup entirely).
//
// safeFetch (below) is SELF-ENFORCING (D61 B5a / hub-browse H1): it runs its OWN
// resolve→validate→pin per request INDEPENDENT of the EGRESS_FIREWALL toggle, so a user-influenced
// fetch refuses a private-range target, a redirect-to-private, and a scheme downgrade even with the
// global firewall disabled. The global dispatcher stays the defense-in-depth backstop for
// non-safeFetch egress (provider calls, OIDC).
//
// INTERNAL-BACKEND AUTO-ALLOW (installEgressFirewall), PORT-SCOPED least-privilege: the box's OWN inference
// backends live on loopback (vLLM engines at http://127.0.0.1:<VLLM_*_PORT>). Their server-initiated calls are
// plain fetch()/ownerConfiguredEndpoint safeFetch → the global dispatcher, so a bare allowlist SSRF-blocks
// the server's own inference and the vLLM supervisor never leaves stack-pending. A connect to a
// private-range address is ALLOWED iff its ORIGINAL destination host:port is one of these exact configured
// backends, OR its ORIGINAL host is in the host-keyed allowlist (OIDC issuer + operator EGRESS_ALLOWLIST,
// any-port — unchanged, backward compat). The internal-backend set is host:PORT-scoped: only the exact
// declared ports (e.g. 127.0.0.1:22 stays BLOCKED), analogous to the OIDC-issuer auto-add — declared
// internal INTENT, not attacker input.
//   SECURITY INVARIANT — this does NOT weaken SSRF protection on any attacker-influenceable path.
//   User-influenced URLs go through safeFetch, whose resolveValidatePin enforces an UNCONDITIONAL
//   private-range denial that NEVER consults this allowlist. The global firewall + allowlist is only the
//   defense-in-depth backstop for NON-safeFetch, server-initiated egress to configured backends; the
//   allowlist is only reachable there. DNS-rebinding stays closed: the decision keys on the ORIGINAL
//   caller-supplied host(:port), so a hostname that RESOLVES private but whose original host:port isn't
//   a configured backend still hits the guarded lookup gate and is blocked. This change NARROWS the global
//   backstop for server-initiated calls from "any loopback port" to "exactly the configured backend ports."

const OK_STATUS_MIN = 200;
const REDIRECT_STATUS_MIN = 300;
const REDIRECT_STATUS_MAX = 400;
const DEFAULT_MAX_BYTES = 5_000_000;
const DEFAULT_MAX_REDIRECTS = 3;
// S5: a total request deadline ALWAYS exists (a forgotten caller signal is no longer an unbounded hang).
// Bounds connect + headers + the redirect chain; the streamed body read is bounded by maxBytes.
const DEFAULT_DEADLINE_MS = 15_000;

const TRAILING_DOT_RE = /\.$/;

export function privateEgressRanges(): readonly string[] {
  const extra = (env.TRUSTED_PRIVATE_RANGES ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
  return extra.length > 0 ? [...DEFAULT_TRUSTED_RANGES, ...extra] : DEFAULT_TRUSTED_RANGES;
}

// A literal target skips undici's DNS lookup, so the connector must recognize and gate it directly.
function literalHost(hostname: string): string | null {
  const bare = hostname.length > 1 && hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
  return isIP(bare) === 0 ? null : bare;
}

export function shouldBlockEgress(address: string, hostname: string, allowlist: ReadonlySet<string>, ranges: readonly string[]): boolean {
  if (!isInRanges(address, ranges)) {
    return false;
  }
  return !allowlist.has(hostname.toLowerCase());
}

const DEFAULT_PORT_BY_SCHEME: Record<string, string> = { "http:": "80", "https:": "443" };

/** Normalized "host:port" key for the internal-backend allowlist. Undici's connector gives `port` as a
 *  string that is EMPTY when the URL used the scheme default, so an explicit default is filled from the
 *  scheme (http→80 / https→443) to keep the connect-side key and the env-derived key comparable. */
function hostPortKey(hostname: string, port: string, protocol: string): string {
  const p = port !== "" ? port : (DEFAULT_PORT_BY_SCHEME[protocol.toLowerCase()] ?? "");
  return `${hostname.toLowerCase()}:${p}`;
}

/** The box's OWN configured inference backends, host:PORT-scoped (least-privilege). vLLM engines are
 *  structurally loopback (engineBaseUrl hardcodes 127.0.0.1). Membership here bypasses the private-range
 *  block for that EXACT host:port only. */
function internalBackendHostPorts(): ReadonlySet<string> {
  return new Set<string>([`127.0.0.1:${env.VLLM_EMBED_PORT}`, `127.0.0.1:${env.VLLM_RERANK_PORT}`, `127.0.0.1:${env.VLLM_GEN_PORT}`]);
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
  if (env.OIDC_ISSUER !== undefined) {
    try {
      allowlist.add(new URL(env.OIDC_ISSUER).hostname.toLowerCase());
    } catch {
      // malformed issuer — env refinement would have caught it in oidc mode
    }
  }

  // The box's OWN configured backends, host:PORT-scoped (least-privilege — see the header). A connect whose
  // ORIGINAL host:port is one of these bypasses the private-range block for that EXACT pair only; everything
  // else falls to the guarded connector below (host-keyed allowlist + DNS-rebind lookup gate).
  const backends = internalBackendHostPorts();

  const baseConnect = buildConnector({
    lookup(hostname, options, callback): void {
      dnsLookup(hostname, options, (err, address, family): void => {
        if (err) {
          callback(err, address as string, family as number);
          return;
        }
        // node:dns: {all:true} yields LookupAddress[]; the default yields a single address string.
        const addrs: string[] = Array.isArray(address) ? address.map((a) => String((a as { address?: unknown }).address ?? a)) : [String(address)];
        const blocked = addrs.find((a) => shouldBlockEgress(a, hostname, allowlist, ranges));
        if (blocked !== undefined) {
          securityEvent("egress_blocked", { hostname, address: blocked }, "security: egress SSRF blocked (private address)");
          callback(new Error(`SSRF_BLOCKED: ${hostname} → ${blocked}`), address as string, family);
          return;
        }
        callback(null, address as string, family);
      });
    },
  });

  // A plain connector for the exact configured backend host:ports — no lookup gate, no literal block (the
  // private-range address IS the declared intent). undici only reaches this when the connect wrapper has
  // matched the ORIGINAL host:port against `backends`, so no attacker-influenced target lands here.
  const passthroughConnect = buildConnector({});

  const connect: buildConnector.connector = (options, callback): void => {
    // Port is available HERE (undici passes options.port to the connector) but NOT reliably in the lookup
    // override — so the port-scoped backend bypass decision must live in the connect wrapper.
    if (backends.has(hostPortKey(options.hostname, options.port, options.protocol))) {
      passthroughConnect(options, callback);
      return;
    }
    const literal = literalHost(options.hostname);
    if (literal !== null && shouldBlockEgress(literal, options.hostname, allowlist, ranges)) {
      securityEvent("egress_blocked", { hostname: options.hostname, address: literal }, "security: egress SSRF blocked (private literal address)");
      callback(new Error(`SSRF_BLOCKED: ${options.hostname} → ${literal}`), null);
      return;
    }
    baseConnect(options, callback);
  };

  setGlobalDispatcher(new Agent({ connect }));
  getLog().info({ allowlist: [...allowlist], backends: [...backends] }, "security: egress firewall installed (private egress blocked)");
}

// ── safeFetch: the self-enforcing SSRF guard for any user-influenced outbound URL ──────────────────
//
// Per request AND per redirect hop: scheme pin (https-only, unless the owner-configured-endpoint policy
// permits the operator's own backend scheme) → host allowlist (or the explicit ANY_HOST escape) →
// resolve→validate→pin (DNS resolve; every address must clear privateEgressRanges(); the validated set
// is pinned into a single-use per-request dispatcher so the name cannot re-resolve between check and
// connect). Response-side: manual redirects with cross-origin credential-header + body stripping, a
// streamed byte cap, and an optional content-type allowlist.

/** The explicit, named escape from host-pinning (D61 B5a §2 "an explicit named policy, never a silent
 *  exemption") for the classes whose target host is genuinely unknowable in advance: the
 *  provider-returned-URL class (imagery generated-image download) and the arbitrary-URL class (databank
 *  scrapeWeb). No host is pinned, but the resolve→validate→pin private-range denial STILL runs on every
 *  hop — this can NEVER be spelled by passing `[]`, it must be named. Compose-bound into the ANY-host
 *  op wirings; never wire/caller-suppliable. */
export const ANY_HOST: unique symbol = Symbol("safeFetch.ANY_HOST");

const EGRESS_BLOCK_REASONS = [
  "scheme",
  "host-not-allowed",
  "ip-literal",
  "private-address",
  "unresolvable",
  "too-many-redirects",
  "deadline",
  "content-type", // step 6: the terminal response's content-type is not in the allowlist
  "too-large", // the streamed body exceeded maxBytes (the decompression-bomb bound)
  "consumed", // the single-use bytes() reader was invoked twice
] as const;
type EgressBlockReason = (typeof EGRESS_BLOCK_REASONS)[number];

/** Thrown by {@link safeFetch} on any block; carries a typed reason for branching. The message NEVER
 *  echoes internal addressing (the resolved private IP) — only the caller-supplied host and the reason;
 *  the address goes to the securityEvent log, not the throw. */
export class EgressBlockedError extends Error {
  readonly reason: EgressBlockReason;
  constructor(reason: EgressBlockReason, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "EgressBlockedError";
    this.reason = reason;
  }
}

export interface SafeFetchOptions {
  /** REQUIRED. A host allowlist (exact "api.chub.ai" or a leading-dot suffix ".chub.ai" that matches
   *  any subdomain but NEVER the bare apex), checked case-insensitively at the start URL and on EVERY
   *  redirect hop; OR the {@link ANY_HOST} sentinel (the named no-allowlist escape for the
   *  provider-returned-URL / arbitrary-URL classes — IP denial still runs). */
  readonly allowedHosts: readonly string[] | typeof ANY_HOST;
  readonly method?: "GET" | "POST";
  /** Forwarded on same-origin hops; credential-class headers + the body are STRIPPED on any cross-origin
   *  redirect. */
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string | Uint8Array;
  /** Hard cap on response bytes read (post-decode — the cap IS the decompression-bomb bound). Default 5 MB. */
  readonly maxBytes?: number;
  /** Max redirect hops. Default 3. 0 = a redirect is an error. */
  readonly maxRedirects?: number;
  /** If set, the response content-type (major/minor, params ignored) must match one entry. */
  readonly allowedContentTypes?: readonly string[];
  /** Total request deadline (connect + headers + redirects). Default 15_000 ms — S5. */
  readonly deadlineMs?: number;
  /** Caller cancellation, composed with the deadline. */
  readonly signal?: AbortSignal;
  /** Configured-endpoint class ONLY (§0 "configured endpoint" — the user's OWN backend, e.g. the
   *  credentials `/models` probe against a BYO vLLM). The connection's `baseUrl` is the declared intent,
   *  legitimately LAN and often plain http/IP-literal. Setting this pins the fetch to its derived host
   *  yet OPTS OUT of the https-scheme pin, the IP-literal reject, and safeFetch's own private-range
   *  denial — deferring SSRF to the global egress firewall + operator EGRESS_ALLOWLIST (today's posture,
   *  preserved). NEVER wire/caller-suppliable — compose binds it only for the models probe. */
  readonly ownerConfiguredEndpoint?: boolean;
}

export interface SafeFetchResult {
  readonly status: number;
  readonly headers: Headers;
  readonly contentType: string | null;
  /** Single-use capped reader (throws on reuse; throws the moment maxBytes is exceeded). Reading fully
   *  releases the socket + closes the pinned Agent — a caller that reads never needs {@link dispose}. */
  readonly bytes: () => Promise<Uint8Array>;
  /** Release the response WITHOUT reading it — cancels the body (socket back to the pool) and destroys the
   *  pinned per-request Agent. Idempotent + no-op once `bytes()` has run. Every early-return/abandon path
   *  (a non-2xx status the caller drops, a throw before reading) calls this (`res.dispose?.()`) so an
   *  upstream failure storm can't leak Agents until the deadline timer fires. OPTIONAL because only the real
   *  network-backed result carries an Agent/socket to release; a test stub has nothing to dispose, so a
   *  `dispose?.()` call is a correct no-op there rather than forcing every fake to stub it. */
  readonly dispose?: () => void;
}

/** The address resolver — real dns.lookup in prod. A test injects a deterministic map via
 *  {@link __setEgressResolverForTest} so the firewall-OFF SSRF suite needs no live DNS. */
type EgressResolver = (host: string) => Promise<readonly string[]>;

function defaultResolver(host: string): Promise<readonly string[]> {
  return new Promise((resolve, reject) => {
    dnsLookup(host, { all: true, verbatim: true }, (err, addresses): void => {
      if (err) {
        reject(err);
        return;
      }
      resolve(addresses.map((a) => a.address));
    });
  });
}

let egressResolver: EgressResolver = defaultResolver;

/** Guards the test-only seams: they are prod-reachable through the package front door, so refuse to run
 *  outside the test runner (env.NODE_ENV — the sanctioned reader; VITEST/CI pin it to "test"). */
function assertTestOnly(name: string): void {
  if (env.NODE_ENV !== "test") {
    throw new Error(`${name}: test-only seam invoked outside the test runner (NODE_ENV=${env.NODE_ENV})`);
  }
}

/** TEST-ONLY seam (the export map forces it through the front door; there is no deeper import path).
 *  Inject a deterministic resolver for the offline SSRF suites; pass `null` to restore real dns.lookup.
 *  Throws outside NODE_ENV=test — NEVER usable in production. */
export function __setEgressResolverForTest(resolver: EgressResolver | null): void {
  assertTestOnly("__setEgressResolverForTest");
  egressResolver = resolver ?? defaultResolver;
}

/** TEST-ONLY seam: build the SAME single-use pinned dispatcher safeFetch pins per request, so an
 *  integration test can drive the connector directly (addresses-only lookup + single-use reuse error).
 *  Throws outside NODE_ENV=test. */
export function __pinnedAgentForTest(addresses: readonly string[]): Agent {
  assertTestOnly("__pinnedAgentForTest");
  return pinnedAgent(addresses);
}

export async function safeFetch(url: string | URL, options: SafeFetchOptions): Promise<SafeFetchResult> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const deadlineMs = options.deadlineMs ?? DEFAULT_DEADLINE_MS;
  const start = new URL(url);

  // The deadline is the TOTAL request bound (S5 — "a deadline ALWAYS exists"): it spans connect + headers
  // + the redirect chain AND the streamed body read, so a slow-loris body drip on an attacker-influenceable
  // URL cannot hang unboundedly (the byte cap bounds SIZE, this bounds TIME). Cleared once the body is
  // consumed; unref'd so an unread response never keeps the event loop alive. Composed with any caller signal.
  const deadlineCtrl = new AbortController();
  const timer = setTimeout(() => deadlineCtrl.abort(), deadlineMs);
  timer.unref();
  const signal = options.signal ? AbortSignal.any([options.signal, deadlineCtrl.signal]) : deadlineCtrl.signal;
  const deadlineHit = (): boolean => deadlineCtrl.signal.aborted && options.signal?.aborted !== true;

  let response: Response;
  let agent: Agent | undefined;
  try {
    ({ response, agent } = await followRedirects(start, maxRedirects, options, signal));
  } catch (err) {
    clearTimeout(timer);
    if (deadlineHit()) {
      securityEvent("egress_blocked", { reason: "deadline", hostname: start.hostname }, "security: safeFetch egress blocked (deadline)");
      // biome-ignore lint/style/useErrorCause: the cause IS forwarded — EgressBlockedError passes options to super(); biome can't see through the custom class.
      throw new EgressBlockedError("deadline", `egress deadline of ${deadlineMs}ms exceeded`, { cause: err });
    }
    throw err;
  }

  let contentType: string | null;
  try {
    contentType = enforceContentType(response, options.allowedContentTypes);
  } catch (err) {
    clearTimeout(timer);
    void response.body?.cancel().catch(() => undefined);
    closeAgent(agent);
    throw err;
  }

  // ONE settle guard shared by bytes() + dispose(): the response is single-use, so whichever runs first
  // claims it (a second bytes() is the reuse error; a dispose() after a read is a no-op).
  let settled = false;
  const releaseAgent = (): void => {
    clearTimeout(timer);
    closeAgent(agent);
  };
  return {
    status: response.status,
    headers: response.headers,
    contentType,
    bytes: async (): Promise<Uint8Array> => {
      if (settled) {
        throw new EgressBlockedError("consumed", "safeFetch: response already consumed");
      }
      settled = true;
      try {
        const reader = response.body?.getReader();
        return reader ? await readCapped(reader, maxBytes) : new Uint8Array();
      } catch (err) {
        if (deadlineHit()) {
          // biome-ignore lint/style/useErrorCause: cause forwarded via EgressBlockedError super().
          throw new EgressBlockedError("deadline", `egress deadline of ${deadlineMs}ms exceeded`, { cause: err });
        }
        throw err;
      } finally {
        releaseAgent();
      }
    },
    dispose: (): void => {
      if (settled) {
        return;
      }
      settled = true;
      void response.body?.cancel().catch(() => undefined);
      releaseAgent();
    },
  };
}

/** Force-close a per-request pinned dispatcher (spec D — "close the hop's Agent"). No-op for the
 *  owner-configured-endpoint class (no per-request agent; the global dispatcher is shared). */
function closeAgent(agent: Agent | undefined): void {
  if (agent !== undefined) {
    void agent.destroy().catch(() => undefined);
  }
}

// Provider-returned generated-image URLs are third-party-authored and attacker-influenceable — the
// arbitrary-URL/provider-returned class (ANY_HOST: no host pin, full https + private-denial). The body
// read is bounded by the safeFetch total deadline; an optional caller/workload `signal` composes on top
// (cancels the in-flight download when the initiating turn/workload aborts). Returns null on any
// block/non-2xx/cap/timeout/network failure; the caller drops that one image.
export async function fetchImageBytes(url: string, maxBytes?: number, signal?: AbortSignal): Promise<Uint8Array | null> {
  try {
    const res = await safeFetch(url, {
      allowedHosts: ANY_HOST,
      ...(maxBytes !== undefined ? { maxBytes } : {}),
      ...(signal !== undefined ? { signal } : {}),
    });
    if (res.status < OK_STATUS_MIN || res.status >= REDIRECT_STATUS_MIN) {
      res.dispose?.(); // drop the non-2xx body + close the pinned Agent (don't wait for the deadline timer)
      return null;
    }
    return await res.bytes();
  } catch {
    return null;
  }
}

// The web-document fetch for databank's scrapeWeb — the SAME arbitrary-URL/ANY_HOST class (no host pin; https +
// private-range denial STILL run per hop), the compose-bound `SafeFetchOp` impl. Unlike fetchImageBytes it does
// NOT null-drop: it THROWS on any refusal (safeFetch's EgressBlockedError), a non-2xx, the byte cap, or a network
// error, so the databank verb can collapse every failure into a leak-free typed ScrapeFailedError (the domain
// never imports infra to branch — the extraction-error-in-contracts precedent). The byte cap is bound HERE, not
// caller-suppliable.
export async function fetchWebDocument(url: string): Promise<Uint8Array> {
  const res = await safeFetch(url, { allowedHosts: ANY_HOST, method: "GET", maxBytes: DEFAULT_MAX_BYTES });
  if (res.status < OK_STATUS_MIN || res.status >= REDIRECT_STATUS_MIN) {
    res.dispose?.(); // drop the non-2xx body + close the pinned Agent before throwing
    throw new Error(`fetchWebDocument: non-2xx response (HTTP ${res.status})`);
  }
  return await res.bytes();
}

// Must not ride a cross-origin redirect hop — a user-supplied baseUrl that 302s to an attacker host would otherwise exfil the key.
const CREDENTIAL_HEADERS: readonly string[] = ["authorization", "cookie", "x-api-key", "api-key", "proxy-authorization"];

function stripCredentialHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).filter(([k]) => !CREDENTIAL_HEADERS.includes(k.toLowerCase())));
}

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(TRAILING_DOT_RE, "");
}

function isIpLiteralHost(hostname: string): boolean {
  const bare = hostname.length > 1 && hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
  return isIP(bare) !== 0;
}

function hostAllowed(host: string, allowedHosts: readonly string[]): boolean {
  for (const entry of allowedHosts) {
    const e = entry.toLowerCase();
    if (e.startsWith(".")) {
      if (host.endsWith(e)) {
        return true;
      }
    } else if (host === e) {
      return true;
    }
  }
  return false;
}

function blockEgress(reason: EgressBlockReason, host: string, detail: string, logExtra: Record<string, unknown> = {}): never {
  securityEvent("egress_blocked", { reason, hostname: host, ...logExtra }, `security: safeFetch egress blocked (${reason})`);
  throw new EgressBlockedError(reason, detail);
}

/** Scheme + host-allowlist + IP-literal gate — runs on the start URL and re-runs on every redirect hop. */
function validateUrl(url: URL, options: SafeFetchOptions): void {
  const ownerConfigured = options.ownerConfiguredEndpoint === true;
  const host = normalizeHost(url.hostname);
  if (ownerConfigured) {
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      blockEgress("scheme", host, `scheme ${url.protocol} is not allowed`);
    }
  } else if (url.protocol !== "https:") {
    blockEgress("scheme", host, `scheme ${url.protocol} is not allowed (https only)`);
  }
  // The user's own configured backend may legitimately be an IP literal (BYO vLLM at 192.168.x.y).
  if (!ownerConfigured && isIpLiteralHost(url.hostname)) {
    blockEgress("ip-literal", host, "IP-literal hosts are not allowed (a hostname is required)");
  }
  if (options.allowedHosts !== ANY_HOST && !hostAllowed(host, options.allowedHosts)) {
    blockEgress("host-not-allowed", host, `host ${host} is not in the allowlist`);
  }
}

/** Resolve→validate→pin: DNS-resolve the host, reject if ANY address is private/reserved, and pin the
 *  validated set into a single-use per-request dispatcher (the name cannot re-resolve between check and
 *  connect — DNS-rebind closed). Returns `undefined` for the owner-configured-endpoint class, which
 *  defers address gating to the global firewall (its LAN endpoint is the declared intent). */
async function resolveValidatePin(url: URL, options: SafeFetchOptions): Promise<Agent | undefined> {
  if (options.ownerConfiguredEndpoint === true) {
    return;
  }
  const host = normalizeHost(url.hostname);
  const addresses = await egressResolver(host);
  if (addresses.length === 0) {
    blockEgress("unresolvable", host, `host ${host} did not resolve to any address`);
  }
  const ranges = privateEgressRanges();
  for (const address of addresses) {
    if (isInRanges(address, ranges)) {
      // The address is LOGGED (observability) but never surfaced in the thrown error.
      blockEgress("private-address", host, `host ${host} resolves to a private/reserved address`, { address });
    }
  }
  return pinnedAgent(addresses);
}

/** A per-request undici Agent whose connector lookup hands back ONLY the pre-validated addresses and
 *  errors on reuse — undici invokes the lookup with `{all:true}` (verified). */
function pinnedAgent(addresses: readonly string[]): Agent {
  let used = false;
  const connect = buildConnector({
    lookup(_hostname, lookupOptions, callback): void {
      if (used) {
        callback(new Error("safeFetch: pinned lookup reused"), [], 0);
        return;
      }
      used = true;
      if (lookupOptions.all === true) {
        callback(
          null,
          addresses.map((address) => ({ address, family: isIP(address) })),
          0,
        );
        return;
      }
      const first = addresses[0] ?? "";
      callback(null, first, isIP(first));
    },
  });
  return new Agent({ connect });
}

interface HopInitArgs {
  readonly options: SafeFetchOptions;
  readonly dispatcher: Agent | undefined;
  readonly signal: AbortSignal;
  readonly headers: Record<string, string> | undefined;
  readonly hop: number;
}

/** Assemble the per-hop fetch init from the (already validated) pin + hop headers. Incremental assignment
 *  (undici augments `RequestInit.dispatcher`) so optional undici fields stay ABSENT, not `undefined`
 *  (exactOptionalPropertyTypes). The body rides ONLY the first hop — a redirect never re-sends it. */
function buildHopInit(args: HopInitArgs): RequestInit {
  const init: RequestInit = { redirect: "manual", signal: args.signal };
  if (args.dispatcher !== undefined) {
    // undici augments RequestInit.dispatcher, but its typing fights exactOptionalPropertyTypes on assign.
    Reflect.set(init, "dispatcher", args.dispatcher);
  }
  if (args.options.method !== undefined) {
    init.method = args.options.method;
  }
  if (args.headers) {
    init.headers = args.headers;
  }
  if (args.hop === 0 && args.options.body !== undefined) {
    // A Uint8Array<ArrayBufferLike> (the public body type) is not structurally BodyInit — copy the bytes
    // into a fresh ArrayBuffer-backed view (byte-identical) so the assignment is typesafe without a cast.
    init.body = typeof args.options.body === "string" ? args.options.body : new Uint8Array(args.options.body);
  }
  return init;
}

/** Run one hop's fetch; on any transport error close this hop's pinned agent before rethrowing. */
async function fetchHop(url: URL, init: RequestInit, agent: Agent | undefined): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    closeAgent(agent);
    throw err;
  }
}

interface HopResult {
  readonly response: Response;
  /** The TERMINAL hop's pinned agent — the caller closes it after the body is read (undefined for the
   *  owner-configured-endpoint class). Every INTERMEDIATE hop's agent is closed here as the chain advances. */
  readonly agent: Agent | undefined;
}

async function followRedirects(start: URL, maxRedirects: number, options: SafeFetchOptions, signal: AbortSignal): Promise<HopResult> {
  let current = start;
  let hopHeaders: Record<string, string> | undefined = options.headers ? { ...options.headers } : undefined;
  for (let hop = 0; ; hop++) {
    validateUrl(current, options);
    // biome-ignore lint/performance/noAwaitInLoops: redirect hops are inherently sequential — each hop's resolve→validate→pin must complete before its fetch, and each Location depends on the prior response.
    const agent = await resolveValidatePin(current, options);
    const res = await fetchHop(current, buildHopInit({ options, dispatcher: agent, signal, headers: hopHeaders, hop }), agent);
    const isRedirect = res.status >= REDIRECT_STATUS_MIN && res.status < REDIRECT_STATUS_MAX;
    const loc = isRedirect ? res.headers.get("location") : null;
    if (loc === null) {
      return { response: res, agent };
    }
    // A redirect hop is done — drain its body back to the pool and CLOSE its pinned agent (spec D).
    void res.body?.cancel().catch(() => undefined);
    closeAgent(agent);
    if (hop >= maxRedirects) {
      blockEgress("too-many-redirects", normalizeHost(current.hostname), `redirect budget (${maxRedirects}) exceeded`);
    }
    const next = new URL(loc, current);
    if (next.origin !== current.origin && hopHeaders) {
      hopHeaders = stripCredentialHeaders(hopHeaders);
    }
    current = next;
  }
}

function enforceContentType(response: Response, allowed: readonly string[] | undefined): string | null {
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? null;
  if (allowed !== undefined && allowed.length > 0 && !(contentType !== null && allowed.includes(contentType))) {
    throw new EgressBlockedError("content-type", `safeFetch: disallowed content-type ${contentType ?? "(none)"}`);
  }
  return contentType;
}

async function readCapped(reader: ReadableStreamDefaultReader<Uint8Array>, maxBytes: number): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  let chunk = await reader.read();
  while (!chunk.done) {
    total += chunk.value.byteLength;
    if (total > maxBytes) {
      void reader.cancel().catch(() => undefined);
      throw new EgressBlockedError("too-large", `safeFetch: response exceeded maxBytes=${maxBytes}`);
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
