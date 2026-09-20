import { lookup as dnsLookup } from "node:dns";
import { isIP } from "node:net";
import { Agent, buildConnector, setGlobalDispatcher } from "undici";
import { env } from "#foundation/env";
import { getLog, securityEvent, superviseDetached } from "#foundation/observability";
import { DEFAULT_TRUSTED_RANGES, isInRanges } from "./ip-ranges.ts";

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
// DECLARED-INTENT AUTO-ALLOW, PORT-SCOPED least-privilege, in TWO classes: the box's own env-declared
// deployment's private-endpoint allowlist (`publishPrivateEndpointAllowlist`, the
// second block further down). Both are operator intent, never attacker input, and both are admitted only at
// an EXACT host:port.
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
let cleanupSequence = 0;

/** Teardown is intentionally unordered with the failing/disposed caller, but it is still owned: start the
 * cleanup inside a detached trace and report rejection instead of throwing it away. */
function superviseEgressCleanup(reason: string, operation: () => Promise<unknown>): void {
  cleanupSequence += 1;
  superviseDetached(`egress-cleanup:${String(cleanupSequence)}`, "egress.cleanup", { reason }, operation);
}

const TRAILING_DOT_RE = /\.$/;

/** Strip the `[...]` an IPv6 authority is spelled with. `new URL("http://[::1]:8080").hostname` KEEPS the
 *  brackets while undici's connector hands the connect wrapper the bare form, so both sides of a host:port
 *  key must be unbracketed or an IPv6 endpoint could never match its own key. */
function unbracket(hostname: string): string {
  return hostname.length > 1 && hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

export function privateEgressRanges(): readonly string[] {
  const extra = (env.TRUSTED_PRIVATE_RANGES ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
  return extra.length > 0 ? [...DEFAULT_TRUSTED_RANGES, ...extra] : DEFAULT_TRUSTED_RANGES;
}

// A literal target skips undici's DNS lookup, so the connector must recognize and gate it directly.
function literalHost(hostname: string): string | null {
  const bare = unbracket(hostname);
  return isIP(bare) === 0 ? null : bare;
}

export function shouldBlockEgress(address: string, hostname: string, allowlist: ReadonlySet<string>, ranges: readonly string[]): boolean {
  if (!isInRanges(address, ranges)) {
    return false;
  }
  return !allowlist.has(hostname.toLowerCase());
}

// ── THE PRIVATE-ENDPOINT ALLOWLIST — deployment-declared intent (inference program F12) ─────────────────
//
// WHY IT EXISTS: a user who adds Ollama / LM Studio / vLLM / a LAN box at a private address in Settings →
// Connections had every request refused by this belt ("blocked … private address") until an operator
// hand-edited `EGRESS_ALLOWLIST`. Under connections-as-the-unit EVERY endpoint row is a user's own (there is
// no owner box, no owner engine, no owner-saved set), so the admission is a DEPLOYMENT setting —
// `AppSettings.privateEndpointAllowlist` (env floor `PRIVATE_ENDPOINT_ALLOWLIST`, born loopback under
// `AUTH_MODE=single-user`, empty on a multi-user install) — judged the same for every principal, owner or
// not. A member who wants their LAN box admitted needs the admin to add it: the honest multi-tenant posture.
// The guard still sees only host/port/address and never a principal; the allowlist is a second INPUT to the
// same guard, not a new door.
//
// ENTRIES are exact hostnames (`ollama.lan`, lower-cased), IP literals, or CIDRs (`192.168.1.0/24`). A
// hostname entry admits that name; an IP/CIDR entry admits any target whose LITERAL or RESOLVED address is
// inside it — the DNS-rebind gate still runs, so a declared name that resolves outside the admitted set is
// refused at connect. Published whole-set by the settings domain (boot + every Governance write): a removed
// entry closes by its ABSENCE from the next publish, never persisted into env, and a replica that has not
// published yet fails CLOSED (empty admits nothing).
//
// WHAT IS NEVER ADMISSIBLE, however the operator spells it ({@link NEVER_ADMISSIBLE_RANGES}): link-local (the
// 169.254.169.254 cloud-metadata class this belt exists for), multicast, the RFC2544 benchmark block, and
// the 6to4/Teredo tunnel blocks that embed an arbitrary inner address. Nothing legitimate serves inference
// there. It is enforced TWICE: on the literal at publish, and on the RESOLVED address at the DNS gate.
const NEVER_ADMISSIBLE_RANGES: readonly string[] = [
  "169.254.0.0/16", // IPv4 link-local — cloud metadata (169.254.169.254)
  "fe80::/10", // IPv6 link-local
  "224.0.0.0/4", // IPv4 multicast — never a unicast backend
  "198.18.0.0/15", // RFC2544 benchmarking
  "2002::/16", // 6to4 — embeds an arbitrary IPv4
  "2001::/32", // Teredo — IPv6-over-UDP tunnel to an arbitrary inner address
];

interface PrivateEndpointAllowlist {
  readonly hosts: ReadonlySet<string>;
  readonly ranges: readonly string[];
}

/** LIVE module state, EMPTY until the settings domain publishes. ASSUMES(single-replica) — per-process BY
 *  CONSTRUCTION: it gates THIS process's undici dispatcher; a second replica publishes its own copy from the
 *  same AppSettings row at its own boot, and one that has not yet fails CLOSED. */
let privateEndpointAllowlist: PrivateEndpointAllowlist = { hosts: new Set<string>(), ranges: [] };

/** Classify ONE allowlist entry: a CIDR / IP literal becomes a range (an IP is a /32 or /128), a hostname an
 *  exact host key; `null` when it is not admissible (empty, or an address inside {@link NEVER_ADMISSIBLE_RANGES}). */
function classifyAllowlistEntry(entry: string): { readonly kind: "host"; readonly host: string } | { readonly kind: "range"; readonly range: string } | null {
  const raw = unbracket(entry.trim()).toLowerCase();
  if (raw === "") {
    return null;
  }
  const [address, prefix] = raw.split("/");
  if (address !== undefined && isIP(address) !== 0) {
    if (isInRanges(address, NEVER_ADMISSIBLE_RANGES)) {
      return null;
    }
    const bits = prefix ?? (isIP(address) === 4 ? "32" : "128");
    return { kind: "range", range: `${address}/${bits}` };
  }
  return { kind: "host", host: raw };
}

/** Replace the deployment's private-endpoint admission set (the whole set every time — a removed entry is
 *  closed by its ABSENCE from the next publish). Called on boot and after every Governance write. The log
 *  states COUNTS only; an entry list would put the operator's LAN topology in every boot log. */
export function publishPrivateEndpointAllowlist(entries: readonly string[]): void {
  const hosts = new Set<string>();
  const ranges: string[] = [];
  let refused = 0;
  for (const entry of entries) {
    const classified = classifyAllowlistEntry(entry);
    if (classified === null) {
      refused += 1;
      continue;
    }
    if (classified.kind === "host") {
      hosts.add(classified.host);
    } else {
      ranges.push(classified.range);
    }
  }
  privateEndpointAllowlist = { hosts, ranges };
  getLog().info({ hosts: hosts.size, ranges: ranges.length, refused }, "security: egress belt admits the deployment's private-endpoint allowlist");
}

/** The WRITE-TIME admission read the connection domain runs before it saves an endpoint row (the guard above
 *  re-judges every connect): `public` = not a private/loopback literal (a hostname resolves at connect, where
 *  the DNS gate judges it); `admitted` = private and on the allowlist; `refused` = private and not; `invalid`
 *  = not an http(s) URL. `localhost` is folded to loopback so the pane's inline "Admit" affordance fires for
 *  the spelling people actually type. */
export function endpointAdmission(baseUrl: string): "public" | "admitted" | "refused" | "invalid" {
  const url = URL.parse(baseUrl);
  if (url === null || (url.protocol !== "http:" && url.protocol !== "https:")) {
    return "invalid";
  }
  const host = unbracket(url.hostname).toLowerCase();
  const literal = host === "localhost" ? "127.0.0.1" : host;
  if (isIP(literal) === 0) {
    return privateEndpointAllowlist.hosts.has(host) ? "admitted" : "public";
  }
  if (isInRanges(literal, NEVER_ADMISSIBLE_RANGES)) {
    return "refused";
  }
  if (!isInRanges(literal, privateEgressRanges())) {
    return "public";
  }
  return admittedByAllowlist(host) || (host === "localhost" && admittedByAllowlist(literal)) ? "admitted" : "refused";
}

/** Is this connect target admitted by the deployment allowlist — by exact hostname, or by a literal address
 *  inside an admitted range? A hostname that is NOT listed but resolves inside an admitted range is judged at
 *  the DNS gate (`allowlistedConnect`), where the resolved address is in hand. */
function admittedByAllowlist(hostname: string): boolean {
  const host = unbracket(hostname).toLowerCase();
  if (privateEndpointAllowlist.hosts.has(host)) {
    return true;
  }
  return isIP(host) !== 0 && isInRanges(host, privateEndpointAllowlist.ranges);
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
    // @orb-waive caught-failure-ownership(catch): a malformed OIDC_ISSUER URL is simply NOT added to the egress allowlist — the restrictive direction that never widens egress; env refinement already rejects a malformed issuer in oidc mode, so this only fires harmlessly in non-oidc mode. Ends if the allowlist ever becomes a denylist.
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
        const addrs: string[] = Array.isArray(address) ? address.map((a) => String((a as { address?: unknown }).address ?? a)) : [String(address)];
        const blocked = addrs.find((a) => shouldBlockEgress(a, hostname, allowlist, ranges) && !isInRanges(a, privateEndpointAllowlist.ranges));
        if (blocked !== undefined) {
          securityEvent("egress_blocked", { hostname, address: blocked }, "security: egress SSRF blocked (private address)");
          callback(new Error(`SSRF_BLOCKED: ${hostname} → ${blocked}`), address as string, family);
          return;
        }
        callback(null, address as string, family);
      });
    },
  });

  // The allowlisted-endpoint connector. An admitted host's private-range block does not apply — but a
  // declared HOSTNAME still resolves at connect time, and `NEVER_ADMISSIBLE_RANGES` is exactly the set no
  // declared name may reach (a `metadata.google.internal` admitted by name would otherwise launder
  // 169.254.169.254 past the publish-side literal check). An IP-literal target never reaches this lookup
  // (undici skips it) and was already judged at `admittedByAllowlist`.
  const allowlistedConnect = buildConnector({
    lookup(hostname, options, callback): void {
      dnsLookup(hostname, options, (err, address, family): void => {
        if (err) {
          callback(err, address as string, family as number);
          return;
        }
        const addrs: string[] = Array.isArray(address) ? address.map((a) => String((a as { address?: unknown }).address ?? a)) : [String(address)];
        const blocked = addrs.find((a) => isInRanges(a, NEVER_ADMISSIBLE_RANGES));
        if (blocked !== undefined) {
          securityEvent(
            "egress_blocked",
            { hostname, address: blocked },
            "security: egress SSRF blocked (allowlisted host resolved link-local/never-admissible)",
          );
          callback(new Error(`SSRF_BLOCKED: ${hostname} → ${blocked}`), address as string, family);
          return;
        }
        callback(null, address as string, family);
      });
    },
  });

  const connect: buildConnector.connector = (options, callback): void => {
    // Port is available HERE (undici passes options.port to the connector) but NOT reliably in the lookup
    // override — so the port-scoped backend bypass decision must live in the connect wrapper.
    // The deployment's admitted private endpoints (F12) — read LIVE so a Governance edit is honoured on the
    // very next connect.
    if (admittedByAllowlist(options.hostname)) {
      allowlistedConnect(options, callback);
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
  getLog().info({ allowlist: [...allowlist] }, "security: egress firewall installed (private egress blocked)");
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
    const body = response.body;
    if (body !== null) {
      superviseEgressCleanup("content-type-refusal", () => body.cancel());
    }
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
      const body = response.body;
      if (body !== null) {
        superviseEgressCleanup("caller-dispose", () => body.cancel());
      }
      releaseAgent();
    },
  };
}

/** Force-close a per-request pinned dispatcher (spec D — "close the hop's Agent"). No-op for the
 *  owner-configured-endpoint class (no per-request agent; the global dispatcher is shared). */
function closeAgent(agent: Agent | undefined): void {
  if (agent !== undefined) {
    superviseEgressCleanup("agent-close", () => agent.destroy());
  }
}

// Provider-returned generated-image URLs are third-party-authored and attacker-influenceable — the
// arbitrary-URL/provider-returned class (ANY_HOST: no host pin, full https + private-denial). The body
// read is bounded by the safeFetch total deadline; an optional caller/workload `signal` composes on top
// (cancels the in-flight download when the initiating turn/workload aborts). Returns null on any
// block/non-2xx/cap/timeout/network failure; the caller drops that one image.
export async function fetchImageBytes(url: string, maxBytes?: number, signal?: AbortSignal): Promise<Uint8Array | null> {
  // @orb-waive caught-failure-ownership(catch): an attacker-influenceable provider image URL where every failure (SSRF egress-block, non-2xx, byte-cap, network) collapses to null and the caller drops the image; the SSRF block is already securityEvent'd at the connector before this catch, so returning null never opens egress or loses the event. Ends if a block reaches here un-logged.
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

/** The plugin-bundle fetch cap (plugin-ui-plane #679 U8, seam 15) — the "ship one file, ≤ 1 MiB" rule the
 *  `domain/plugin` unzip funnel ALSO enforces (its own `MAX_BUNDLE_BYTES`). Bounding the DOWNLOAD here refuses an
 *  over-cap bundle at the WIRE, before `parseBundle` allocates — defense in depth on the same number (a lower
 *  cap than `fetchWebDocument`'s 5 MB: a plugin bundle is one small pre-bundled script + a tiny manifest). */
const PLUGIN_BUNDLE_FETCH_MAX_BYTES = 1_048_576;

// The URL-INSTALL bundle fetch (plugin-ui-plane #679 U8, seam 15 — the security-review subject). The SAME
// arbitrary-URL/ANY_HOST class as fetchWebDocument (no host pin, because the installer names an arbitrary URL;
// https-only + per-hop private-range/IP-literal denial + the redirect budget STILL run — the SSRF wall), the
// compose-bound op the domain's `ctx.fetchBundle` is wired to. It is the ONLY egress a URL install performs, and
// it is NEVER a bare `fetch` of an attacker-named URL. THROWS on any refusal (safeFetch's EgressBlockedError), a
// non-2xx, the byte cap, or a network error, so the URL verbs collapse every failure into a leak-free
// `PluginBundleFetchError` (the domain never imports infra to branch — the fetchWebDocument→ScrapeFailedError
// precedent). The byte cap is bound HERE, not caller-suppliable.
export async function fetchPluginBundle(url: string): Promise<Uint8Array> {
  const res = await safeFetch(url, { allowedHosts: ANY_HOST, method: "GET", maxBytes: PLUGIN_BUNDLE_FETCH_MAX_BYTES });
  if (res.status < OK_STATUS_MIN || res.status >= REDIRECT_STATUS_MIN) {
    res.dispose?.(); // drop the non-2xx body + close the pinned Agent before throwing
    throw new Error(`fetchPluginBundle: non-2xx response (HTTP ${res.status})`);
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

/** Membership of `host` (already `normalizeHost`ed by the caller) in an allowlist. Two entry shapes: an EXACT
 *  host, and a LEADING-DOT SUFFIX WILDCARD (`.example.com` matches every subdomain).
 *
 *  COUPLED SITE — `netHostSchema` in `@orb/contracts/plugin` (manifest `netHosts`): (a) plugin manifests are
 *  validated with `z.hostname()`, which REFUSES the leading-dot form, so the wildcard arm below is reachable
 *  only from OUR OWN call sites, never from a plugin bundle (before 2026-08-02 a charset regex let a manifest
 *  declare `.com` and reach every `.com` host); (b) the `entry.toLowerCase()` here is what makes that schema's
 *  case-insensitivity safe — an uppercase manifest entry resolves to the same host as its lowercase spelling.
 *  Dropping either normalization means re-pinning the schema. */
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
    const agent = await resolveValidatePin(current, options);
    const res = await fetchHop(current, buildHopInit({ options, dispatcher: agent, signal, headers: hopHeaders, hop }), agent);
    const isRedirect = res.status >= REDIRECT_STATUS_MIN && res.status < REDIRECT_STATUS_MAX;
    const loc = isRedirect ? res.headers.get("location") : null;
    if (loc === null) {
      return { response: res, agent };
    }
    // A redirect hop is done — drain its body back to the pool and CLOSE its pinned agent (spec D).
    const body = res.body;
    if (body !== null) {
      superviseEgressCleanup("redirect-hop", () => body.cancel());
    }
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
      superviseEgressCleanup("body-over-cap", () => reader.cancel());
      throw new EgressBlockedError("too-large", `safeFetch: response exceeded maxBytes=${maxBytes}`);
    }
    chunks.push(chunk.value);
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
