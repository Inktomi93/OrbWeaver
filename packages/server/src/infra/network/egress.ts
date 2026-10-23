import { lookup as dnsLookup } from "node:dns";
import type { LookupFunction } from "node:net";
import { effectiveHttpPort, parseTcpPort } from "@orb/kit/http-endpoint";
import { parseIp } from "@orb/kit/ip";
import { Agent, buildConnector, getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { env, parseTrustedPrivateRanges } from "#foundation/env";
import { getLog, securityEvent } from "#src/foundation/observability/logger.ts";
import { superviseSettled } from "#src/foundation/observability/tracing.ts";
import { systemTimers } from "../timers/index.ts";
import type {
  EgressBlockReason,
  EgressResolver,
  PinnedDownloadLimits,
  SafeFetchOptions,
  SafeFetchResult,
  ScopedEgress,
  ScopedEgressOptions,
} from "./contract/egress.ts";
import { ANY_HOST as ANY_HOST_POLICY, ENDPOINT_ADMISSIONS as ENDPOINT_ADMISSION_VALUES } from "./contract/egress.ts";
import { DEFAULT_TRUSTED_RANGES, isInRanges } from "./ip-ranges.ts";
import { createOwnedResponseBody } from "./response-body.ts";

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
// DECLARED-INTENT AUTO-ALLOW, in TWO classes, both operator intent and neither ever attacker input:
//   (1) the env belt — `EGRESS_ALLOWLIST` plus the OIDC issuer host, read once at install
//       (`shouldBlockEgress`). HOST-keyed, ANY PORT. Unchanged.
//   (2) the deployment's private-endpoint allowlist (`publishPrivateEndpointAllowlist`, the second block
//       further down — inference program F12). Hosts, CIDRs, and OPTIONALLY host:PORT.
// Without one of them a bare private-range block SSRF-refuses the box's own loopback inference backend,
// whose server-initiated calls use configuredEndpointFetch → the deployment's endpoint admission.
//   SECURITY INVARIANT — this does NOT weaken SSRF protection on any attacker-influenceable path.
//   User-influenced URLs go through safeFetch, whose resolveValidatePin enforces an UNCONDITIONAL
//   private-range denial that NEVER consults either allowlist. The global firewall + allowlists are only
//   the defense-in-depth backstop for NON-safeFetch, server-initiated egress to declared endpoints; the
//   allowlists are only reachable there. DNS-rebinding stays closed: the decision keys on the ORIGINAL
//   caller-supplied host AND PORT (`options.hostname` / `options.port` at the connect wrapper, which is
//   why the port-scoped decision lives there and not in the lookup override — node's `dns.lookup` never
//   sees a port), so a hostname that RESOLVES private but whose original host(:port) is not declared still
//   hits the guarded lookup gate and is blocked. A resolved address can only ever SUBTRACT admission
//   (`NEVER_ADMISSIBLE_RANGES` is re-checked on it); it can never add one the original host did not have.
//
// SANCTIONED EGRESS OUTSIDE BOTH GATES — the IP certificate's ACME client (`infra/acme/issuer.ts`, D275). acme-client
// dials through its own axios instance, which neither this dispatcher nor safeFetch sees, and axios honors
// HTTP(S)_PROXY. It is admitted because no user input reaches any URL it dials: the first is the constant
// `LETS_ENCRYPT_DIRECTORY`, and every later one is a resource URL that directory's own TLS-authenticated answers name.
// The owner's address is only an order payload field and the CSR's SAN, never a host this server connects to.

const OK_STATUS_MIN = 200;
const REDIRECT_STATUS_MIN = 300;
const REDIRECT_STATUS_MAX = 400;
const DEFAULT_MAX_BYTES = 5_000_000;
const DEFAULT_MAX_REDIRECTS = 3;
// S5: a total request deadline ALWAYS exists (a forgotten caller signal is no longer an unbounded hang).
// Bounds connect + headers + the redirect chain; the streamed body read is bounded by maxBytes.
const DEFAULT_DEADLINE_MS = 15_000;

function superviseEgressCleanup(context: EgressContext, reason: string, operation: () => Promise<unknown>): void {
  context.cleanupSequence += 1;
  const completion = superviseSettled(`egress-cleanup:${String(context.cleanupSequence)}`, "egress.cleanup", { reason }, async () => {
    try {
      return await operation();
    } catch (error) {
      context.failures.push(error instanceof Error ? error : new Error("egress cleanup failed", { cause: error }));
      throw error;
    }
  }).then(() => {
    context.pending.delete(completion);
  });
  context.pending.add(completion);
}

const TRAILING_DOT_RE = /\.$/;
/** The IPv6 zone separator (`fe80::1%eth0`); percent-encoded it is still a `%`. */
const ZONE_MARK = "%";
/** The socket family a connector lookup reports for an IPv4 and an IPv6 literal. */
const SOCKET_FAMILY_V4 = 4;
const SOCKET_FAMILY_V6 = 6;

/** Strip the `[...]` an IPv6 authority is spelled with. `new URL("http://[::1]:8080").hostname` KEEPS the
 *  brackets while undici's connector hands the connect wrapper the bare form, so both sides of a host:port
 *  key must be unbracketed or an IPv6 endpoint could never match its own key. */
function unbracket(hostname: string): string {
  return hostname.length > 1 && hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

function privateEgressRanges(): readonly string[] {
  const extra = parseTrustedPrivateRanges(env.TRUSTED_PRIVATE_RANGES);
  return extra.length > 0 ? [...DEFAULT_TRUSTED_RANGES, ...extra] : DEFAULT_TRUSTED_RANGES;
}

// A literal target skips undici's DNS lookup, so the connector must recognize and gate it directly.
function literalHost(hostname: string): string | null {
  const bare = unbracket(hostname);
  return parseIp(bare) === null ? null : bare;
}

function shouldBlockEgress(address: string, hostname: string, allowlist: ReadonlySet<string>, ranges: readonly string[]): boolean {
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
// ENTRIES are exact hostnames (`ollama.lan`, lower-cased), IP literals, or CIDRs (`192.168.1.0/24`), each
// optionally carrying a PORT (`127.0.0.1:8703`, `[::1]:8703`, `ollama.lan:11434` — not on a CIDR, see
// below). A hostname entry admits that name; an IP/CIDR entry admits any target whose LITERAL or RESOLVED
// address is inside it — the DNS-rebind gate still runs, so a declared name that resolves outside the
// admitted set is refused at connect. Published whole-set by the settings domain (boot + every Governance
// write): a removed entry closes by its ABSENCE from the next publish, never persisted into env, and a
// replica that has not published yet fails CLOSED (empty admits nothing).
//
// THE PORT ARM — least privilege, strictly additive (2026-09-20). A BARE entry admits its subject at EVERY
// port, exactly as before: no deployment that never writes a port changes behaviour. An entry that DOES
// name a port admits that host at those ports and no other, which is what an operator needs on a shared
// box — admitting `127.0.0.1` so a member can reach Ollama also admits `:22` and `:5432` to anyone who can
// author an endpoint connection, and `127.0.0.1:11434` does not.
//   PRECEDENCE is decided here, not left emergent: THE NARROWER SPELLING IS THE HOST'S LAST WORD. If any
//   port-scoped entry exists for an exact host, that host is admitted at those ports ONLY — a bare entry
//   or a containing CIDR listed beside it does not re-widen it. An operator who wrote the port said it out
//   loud, and the safe reading of a contradictory pair is the smaller grant.
//   TWO enforcers, covering DIFFERENT inputs (measured with a planted control, not assumed): `publish`
//   drops the IDENTICAL bare spelling, so the read never sees it and the drop is COUNTED; a CONTAINING
//   CIDR survives that drop untouched, and only `admittedByAllowlist`'s EARLY RETURN keeps it from
//   re-widening the port-scoped host. Neither alone is the whole rule.
//   A PORT ON A CIDR IS REFUSED. The only gate that consults ranges for a hostname target is the DNS
//   lookup override, and node's `dns.lookup` never sees a port — so `192.168.1.0/24:8080` would be a
//   promise this belt could keep for IP literals and silently break for names. Refused outright instead.
//   THE NO-TELL RULE: an entry that cannot match is REFUSED at publish and counted, never stored as an
//   unmatchable key. Before the port arm, `127.0.0.1:8703` parsed as a hostname no host could equal — it
//   admitted nothing and said nothing, which is exactly how an operator migrating a runbook from the
//   retired host:PORT-scoped internal-backend rule got a silently dead deployment.
//   CONTAINERS DO NOT FORCE HOST-SCOPING — checked, not assumed, so do not "simplify" the port arm away
//   believing it breaks Docker. The container accommodation is ONE hostname and THREE ports
//   (an engine compose overlay: engine host `vllm-gen`, with
//   embed/rerank joining gen's network namespace — "the container shape of loopback-with-three-ports"),
//   and the retired port-scoped mechanism covered it through that same env. Docker is where the widening
//   is LEAST harmful (a private network publishing no engine port); loopback is where it bites.
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
  /** Exact host keys (hostname or IP literal) admitted at EVERY port. */
  readonly hosts: ReadonlySet<string>;
  /** Exact host keys admitted ONLY at the listed ports — the narrowing arm, and the host's last word. */
  readonly hostPorts: ReadonlyMap<string, ReadonlySet<number>>;
  /** CIDRs (and the /32 or /128 a bare IP literal becomes). ANY port, always: the DNS gate is port-blind. */
  readonly ranges: readonly string[];
}

interface EgressContext {
  privateEndpointAllowlist: PrivateEndpointAllowlist;
  firewallAgent: Agent | undefined;
  readonly firewallLookup: LookupFunction;
  resolver: EgressResolver;
  readonly fetch: typeof fetch;
  readonly timers: NonNullable<ScopedEgressOptions["timers"]>;
  readonly pending: Set<Promise<void>>;
  readonly requests: Map<AbortController, Request | undefined>;
  readonly discards: Set<() => void>;
  readonly agents: Set<Agent>;
  readonly failures: Error[];
  readonly global: boolean;
  cleanupSequence: number;
  closed: boolean;
}

function createEgressContext(options: ScopedEgressOptions, global: boolean): EgressContext {
  return {
    privateEndpointAllowlist: { hosts: new Set(), hostPorts: new Map(), ranges: [] },
    firewallAgent: undefined,
    firewallLookup: options.resolver === undefined ? dnsLookup : resolverLookup(options.resolver),
    resolver: options.resolver ?? defaultResolver,
    fetch: options.fetch ?? ((input, init): Promise<Response> => globalThis.fetch(input, init)),
    timers: options.timers ?? systemTimers,
    pending: new Set(),
    requests: new Map(),
    discards: new Set(),
    agents: new Set(),
    failures: [],
    global,
    cleanupSequence: 0,
    closed: false,
  };
}

function resolverLookup(resolver: EgressResolver): LookupFunction {
  return (hostname, options, callback): void => {
    void resolver(hostname).then(
      (addresses) => {
        if (addresses.length === 0) {
          callback(new Error("egress hostname did not resolve"), [], 0);
        } else if (options.all === true) {
          callback(
            null,
            addresses.map((address) => ({ address, family: socketFamily(address) })),
            0,
          );
        } else {
          const first = addresses[0] ?? "";
          callback(null, first, socketFamily(first));
        }
      },
      (error: unknown) => callback(error instanceof Error ? error : new Error("egress DNS resolution failed", { cause: error }), [], 0),
    );
  };
}

const defaultContext = createEgressContext({}, true);

function samePrivateEndpointAllowlistFor(context: EgressContext, next: PrivateEndpointAllowlist): boolean {
  const previous = context.privateEndpointAllowlist;
  return (
    previous.hosts.size === next.hosts.size &&
    [...previous.hosts].every((host) => next.hosts.has(host)) &&
    previous.ranges.length === next.ranges.length &&
    previous.ranges.every((range) => next.ranges.includes(range)) &&
    previous.hostPorts.size === next.hostPorts.size &&
    [...previous.hostPorts].every(([host, ports]) => {
      const nextPorts = next.hostPorts.get(host);
      return nextPorts !== undefined && ports.size === nextPorts.size && [...ports].every((port) => nextPorts.has(port));
    })
  );
}

const HOSTNAME_MAX_LENGTH = 253;
const HOSTNAME_LABEL_MAX_LENGTH = 63;
/** A CIDR prefix: 1–3 digits, nothing else (an empty one is `Number("") === 0`, i.e. a silent /0). */
const PREFIX_RE = /^\d{1,3}$/;
/** `[<v6>]` with an OPTIONAL `:<port>` — the authority spelling of an IPv6 endpoint. */
const BRACKETED_V6_RE = /^\[([^\]]+)\](?::(\d+))?$/;
/** One DNS label's charset. `_` is admitted because internal names use it; `-` may not lead or trail. */
const HOSTNAME_LABEL_RE = /^[a-z0-9_-]+$/;
/** A label WHATWG URL reads as a number (decimal, or `0x` hex). A host ending in one parses as IPv4, never as a name. */
const NUMERIC_LABEL_RE = /^(?:\d+|0x[0-9a-f]*)$/;
/** A syntactically admissible hostname ENTRY. Without this a typo (`http://127.0.0.1:8703`, a trailing dot,
 *  a stray path) became an unmatchable host key that admitted nothing and said nothing — the no-tell rule. */
function isHostnameEntry(host: string): boolean {
  if (host.length === 0 || host.length > HOSTNAME_MAX_LENGTH) {
    return false;
  }
  const labels = host.split(".");
  // No URL carries a name whose last label is a number, so `127.0.0.01` (no address to `@orb/kit/ip`) is refused
  // here rather than kept as a host key nothing can match.
  if (NUMERIC_LABEL_RE.test(labels.at(-1) ?? "")) {
    return false;
  }
  return labels.every(
    (label) => label.length > 0 && label.length <= HOSTNAME_LABEL_MAX_LENGTH && HOSTNAME_LABEL_RE.test(label) && !label.startsWith("-") && !label.endsWith("-"),
  );
}

/** Split an OPTIONAL `:port` suffix off an entry. Order matters: the bracketed IPv6 form first (its address
 *  is full of colons), then a CIDR (whose port could only follow the prefix — `fc00::/7` must not have its
 *  `/7` read as a port), then a BARE IP literal (`::1`, `fe80::1` — an unbracketed v6 with a port is
 *  indistinguishable from a longer v6 address, so it is read as the address, the fail-closed way), and only
 *  then a `host:port`. `null` = the port is present but unreadable, i.e. the whole entry is refused. */
function splitEntryPort(raw: string): { readonly subject: string; readonly port: number | null } | null {
  const bracketed = BRACKETED_V6_RE.exec(raw);
  if (bracketed !== null) {
    const subject = bracketed[1] ?? "";
    const portText = bracketed[2];
    if (portText === undefined) {
      return { subject, port: null };
    }
    const port = parseTcpPort(portText);
    return port === null ? null : { subject, port };
  }
  const slash = raw.indexOf("/");
  if (slash !== -1) {
    const colon = raw.indexOf(":", slash);
    if (colon === -1) {
      return { subject: raw, port: null };
    }
    const port = parseTcpPort(raw.slice(colon + 1));
    return port === null ? null : { subject: raw.slice(0, colon), port };
  }
  if (parseIp(raw) !== null) {
    return { subject: raw, port: null };
  }
  const lastColon = raw.lastIndexOf(":");
  if (lastColon === -1) {
    return { subject: raw, port: null };
  }
  const port = parseTcpPort(raw.slice(lastColon + 1));
  return port === null ? null : { subject: raw.slice(0, lastColon), port };
}

/** ONE classified allowlist entry. A port-scoped subject is always an exact HOST key (never a range): the
 *  port decision has to be made where the port exists, which is the connect wrapper, never the port-blind
 *  DNS lookup override that is the only reader of `ranges` for a hostname target. */
type ClassifiedEntry =
  | { readonly kind: "host"; readonly host: string; readonly port: number | null }
  | {
      readonly kind: "range";
      readonly range: string;
      /** The exact host key this range IS, when the entry was a bare IP literal (a /32 or /128) — the
       *  subject a port-scoped entry NARROWS. `null` for a real CIDR, which nothing narrows. */
      readonly literal: string | null;
    };

/** Classify ONE allowlist entry: a CIDR / IP literal becomes a range (an IP is a /32 or /128), a hostname an
 *  exact host key, and either host form may carry a port. `null` = REFUSED (and counted by the caller): an
 *  empty entry, an address inside {@link NEVER_ADMISSIBLE_RANGES}, a port on a CIDR, a bad CIDR prefix, an
 *  out-of-range port, or a string that is not a hostname at all. */
function classifyAllowlistEntry(entry: string): ClassifiedEntry | null {
  const raw = entry.trim().toLowerCase();
  if (raw === "") {
    return null;
  }
  const split = splitEntryPort(raw);
  if (split === null) {
    return null;
  }
  const { subject, port } = split;
  const slash = subject.indexOf("/");
  const address = slash === -1 ? subject : subject.slice(0, slash);
  const parsed = parseIp(address);
  if (parsed === null) {
    return isHostnameEntry(subject) ? { kind: "host", host: subject, port } : null;
  }
  if (isInRanges(address, NEVER_ADMISSIBLE_RANGES)) {
    return null;
  }
  // The parser's width, never the spelling's: a mapped `::ffff:a.b.c.d` is an IPv4 address to `isInRanges`,
  // so its bare range is a /32 and a v6-width prefix on it could never match.
  const maxBits = parsed.bits;
  if (slash === -1) {
    return port === null ? { kind: "range", range: `${address}/${String(maxBits)}`, literal: address } : { kind: "host", host: address, port };
  }
  // A strict digit read, never `Number()`: `Number("")` is 0 (a /0 that would admit the whole family) and
  // `Number("0x18")` is 24. Either would be an entry meaning something other than what the operator wrote.
  const prefix = subject.slice(slash + 1);
  if (port !== null || !PREFIX_RE.test(prefix) || Number.parseInt(prefix, 10) > maxBits) {
    return null;
  }
  return { kind: "range", range: subject, literal: null };
}

/** PASS 1 of a publish — the port-scoped subjects, gathered first because they NARROW their own bare
 *  spelling and pass 2 needs to know which subjects those are. */
function collectHostPorts(classified: readonly ClassifiedEntry[]): Map<string, Set<number>> {
  const hostPorts = new Map<string, Set<number>>();
  for (const one of classified) {
    if (one.kind === "host" && one.port !== null) {
      const ports = hostPorts.get(one.host) ?? new Set<number>();
      ports.add(one.port);
      hostPorts.set(one.host, ports);
    }
  }
  return hostPorts;
}

/** PASS 2 of a publish — the any-port entries, minus every exact subject a port-scoped entry has narrowed.
 *  `narrowed` is the count of bare spellings a port entry overrode (reported, never named). */
function collectAnyPortEntries(
  classified: readonly ClassifiedEntry[],
  hostPorts: ReadonlyMap<string, ReadonlySet<number>>,
): { readonly hosts: Set<string>; readonly ranges: string[]; readonly narrowed: number } {
  const hosts = new Set<string>();
  const ranges: string[] = [];
  let narrowed = 0;
  for (const one of classified) {
    const subject = one.kind === "host" ? one.host : one.literal;
    if (one.kind === "host" && one.port !== null) {
      continue;
    }
    if (subject !== null && hostPorts.has(subject)) {
      narrowed += 1;
    } else if (one.kind === "host") {
      hosts.add(one.host);
    } else {
      ranges.push(one.range);
    }
  }
  return { hosts, ranges, narrowed };
}

/** Replace the deployment's private-endpoint admission set (the whole set every time — a removed entry is
 *  closed by its ABSENCE from the next publish). Called on boot and after every Governance write.
 *
 *  The log states COUNTS only; an entry list would put the operator's LAN topology in every boot log. It
 *  goes out at WARN when anything was refused, because a refused entry admits NOTHING and the operator has
 *  no other tell that the line they wrote is dead. */
function publishPrivateEndpointAllowlistFor(context: EgressContext, entries: readonly string[]): void {
  const classified: ClassifiedEntry[] = [];
  let refused = 0;
  for (const entry of entries) {
    const one = classifyAllowlistEntry(entry);
    if (one === null) {
      refused += 1;
    } else {
      classified.push(one);
    }
  }
  const hostPorts = collectHostPorts(classified);
  const { hosts, ranges, narrowed } = collectAnyPortEntries(classified, hostPorts);
  const next = { hosts, hostPorts, ranges };
  const changed = !samePrivateEndpointAllowlistFor(context, next);
  context.privateEndpointAllowlist = next;
  if (changed && context.firewallAgent !== undefined && getGlobalDispatcher() === context.firewallAgent) {
    replaceFirewallAgentFor(context);
  }
  const counts = { hosts: hosts.size, hostPorts: hostPorts.size, ranges: ranges.length, narrowed, refused };
  if (refused > 0) {
    getLog().warn(
      counts,
      "security: egress belt admits the deployment's private-endpoint allowlist — REFUSED entries admit nothing (unparseable, a port on a CIDR, or a never-admissible range)",
    );
  } else {
    getLog().info(counts, "security: egress belt admits the deployment's private-endpoint allowlist");
  }
}

/** THE ADMISSION AXIS, homed at its producer (§7.5 — one `as const` tuple, every reader derives). The
 *  connection domain's `EndpointAdmission` is `(typeof ENDPOINT_ADMISSIONS)[number]`; nothing re-spells the
 *  four members. The verdicts themselves are documented on {@link endpointAdmissionFor} below. */

/** The WRITE-TIME admission read the connection domain runs before it saves an endpoint row (the guard above
 *  re-judges every connect): `public` = not a private/loopback literal (a hostname resolves at connect, where
 *  the DNS gate judges it); `admitted` = private and on the allowlist; `refused` = private and not; `invalid`
 *  = not an http(s) URL. `localhost` is folded to loopback so the pane's inline "Admit" affordance fires for
 *  the spelling people actually type. */
function endpointAdmissionFor(context: EgressContext, baseUrl: string): (typeof ENDPOINT_ADMISSIONS)[number] {
  const url = URL.parse(baseUrl);
  if (url === null || (url.protocol !== "http:" && url.protocol !== "https:")) {
    return "invalid";
  }
  // The port the browser/server would actually dial — an explicit one, else the scheme's default, so an
  // entry written `ollama.lan:80` matches the `http://ollama.lan` a user types.
  const port = effectiveHttpPort(url.protocol, url.port);
  const host = unbracket(url.hostname).toLowerCase();
  const literal = host === "localhost" ? "127.0.0.1" : host;
  if (parseIp(literal) === null) {
    return admittedByAllowlistFor(context, host, port) ? "admitted" : "public";
  }
  if (isInRanges(literal, NEVER_ADMISSIBLE_RANGES)) {
    return "refused";
  }
  if (!isInRanges(literal, privateEgressRanges())) {
    return "public";
  }
  return admittedByAllowlistFor(context, host, port) || (host === "localhost" && admittedByAllowlistFor(context, literal, port)) ? "admitted" : "refused";
}

/** The write-time admission the connection domain runs: {@link endpointAdmissionFor}, plus a HOSTNAME resolved
 *  now. A name that lands on a private address this deployment does not admit (`host.docker.internal`,
 *  `ollama.lan`) is `refused` here, so the dialog names the authority and offers the owner's Admit, instead of
 *  saving a row whose every dial fails at the connect gate. The judgement is the connect gate's own: the env
 *  belt and the published ranges admit, `NEVER_ADMISSIBLE_RANGES` subtracts. A name that does not resolve now
 *  stays `public`; the connect gate judges it when it does. */
async function resolvedEndpointAdmissionFor(context: EgressContext, baseUrl: string): Promise<(typeof ENDPOINT_ADMISSIONS)[number]> {
  const verdict = endpointAdmissionFor(context, baseUrl);
  const url = URL.parse(baseUrl);
  const host = url === null ? "" : unbracket(url.hostname).toLowerCase();
  if (verdict !== "public" || parseIp(host) !== null) {
    return verdict;
  }
  const addresses = await lookupAllFor(context, host);
  if (addresses.length === 0) {
    return verdict;
  }
  const allowlist = envEgressAllowlist();
  const ranges = privateEgressRanges();
  const refused = firstRefusedAddress(
    addresses,
    (address) =>
      isInRanges(address, NEVER_ADMISSIBLE_RANGES) ||
      refusedResolvedEndpoint(context, address, {
        hostname: host,
        port: effectiveHttpPort(url?.protocol ?? "", url?.port ?? ""),
        declared: admittedByAllowlistFor(context, host, effectiveHttpPort(url?.protocol ?? "", url?.port ?? "")),
        allowlist,
        ranges,
      }),
  );
  return refused === undefined ? verdict : "refused";
}

/** Every address a hostname resolves to through the firewall's own lookup; none when it does not resolve. */
function lookupAllFor(context: EgressContext, hostname: string): Promise<readonly string[]> {
  if (!context.global) {
    return context.resolver(hostname).catch(() => []);
  }
  return new Promise((resolve) => {
    context.firewallLookup(hostname, { all: true }, (err, address): void => {
      if (err) {
        // An unresolvable name is no verdict at write time: the connect gate judges it once it resolves.
        resolve([]);
        return;
      }
      resolve(Array.isArray(address) ? address.map((a) => a.address) : [address]);
    });
  });
}

/** Is this RESOLVED or literal address inside an admitted range? `NEVER_ADMISSIBLE_RANGES` is subtracted
 *  HERE, not only at publish: the publish-time check sees the ENTRY, so a broad operator CIDR
 *  (`0.0.0.0/0`, `128.0.0.0/1`) would otherwise swallow the link-local metadata class it can never state
 *  directly. One home for "inside the admitted ranges", used by both gates. */
function addressInAdmittedRangesFor(context: EgressContext, address: string): boolean {
  return isInRanges(address, context.privateEndpointAllowlist.ranges) && !isInRanges(address, NEVER_ADMISSIBLE_RANGES);
}

// The first resolved address a gate refuses, or undefined to admit them all: the ONE resolved-address judgement for
// both connector lookups and safeFetch's pin. SECURITY: an address `@orb/kit/ip` cannot read is refused before
// `refused` is asked. It is in no range, so a range test alone passes it, and node dials a zone-scoped
// `fe80::1%eth0` that the parser returns null for. Fail closed; never let `refused` see such an address first.
function firstRefusedAddress(addresses: readonly string[], refused: (address: string) => boolean): string | undefined {
  return addresses.find((address) => parseIp(address) === null || refused(address));
}

/** Is this connect target admitted by the deployment allowlist — by exact host(:port), or by a literal
 *  address inside an admitted range? A hostname that is NOT listed but resolves inside an admitted range is
 *  judged at the DNS gate (`allowlistedConnect`), where the resolved address is in hand.
 *
 *  The port-scoped arm returns EARLY — it is the half of the precedence rule (block comment above) that
 *  `publish` cannot enforce: a CONTAINING CIDR survives the publish untouched, and this early return is
 *  what keeps it from re-widening a port-scoped host. `port` is `null` when this belt cannot read the
 *  target's port, which a port-scoped entry can never admit. */
function admittedByAllowlistFor(context: EgressContext, hostname: string, port: number | null): boolean {
  const host = unbracket(hostname).toLowerCase();
  const ports = context.privateEndpointAllowlist.hostPorts.get(host);
  if (ports !== undefined) {
    return port !== null && ports.has(port);
  }
  if (context.privateEndpointAllowlist.hosts.has(host)) {
    return true;
  }
  return parseIp(host) !== null && addressInAdmittedRangesFor(context, host);
}

export function installEgressFirewall(): void {
  if (!env.EGRESS_FIREWALL) {
    return;
  }
  const allowlist = replaceFirewallAgentFor(defaultContext);
  getLog().info({ allowlist: [...allowlist] }, "security: egress firewall installed (private egress blocked)");
}

// Replacing before teardown prevents the next request from bypassing the guard on an already-admitted socket.
function replaceFirewallAgentFor(context: EgressContext): ReadonlySet<string> {
  const previous = context.firewallAgent;
  const { connect, allowlist } = createFirewallConnectFor(context);
  context.firewallAgent = new Agent({ connect });
  context.agents.add(context.firewallAgent);
  setGlobalDispatcher(context.firewallAgent);
  if (previous !== undefined) {
    closeAgentFor(context, previous);
  }
  return allowlist;
}

/** The env belt's host set: `EGRESS_ALLOWLIST` plus the OIDC issuer host. One read for the connect gate and
 *  the write-time admission, so the two cannot disagree about a declared host. */
function envEgressAllowlist(): Set<string> {
  const allowlist = new Set(
    (env.EGRESS_ALLOWLIST ?? "")
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter((h) => h.length > 0),
  );
  // Always allow the OIDC issuer host (LAN/private IP) — otherwise enabling the firewall breaks oidc mode.
  if (env.OIDC_ISSUER !== undefined) {
    // a malformed OIDC_ISSUER URL is simply NOT added to the egress allowlist — the restrictive direction that never widens egress; env refinement already rejects a malformed issuer in oidc mode, so this only fires harmlessly in non-oidc mode. Ends if the allowlist ever becomes a denylist.
    try {
      allowlist.add(new URL(env.OIDC_ISSUER).hostname.toLowerCase());
    } catch {
      // malformed issuer — env refinement would have caught it in oidc mode
    }
  }
  return allowlist;
}

function createFirewallLookupFor(context: EgressContext, judgment: ConnectJudgment): LookupFunction {
  return (hostname, options, resolved): void => {
    context.firewallLookup(hostname, options, (err, address, family): void => {
      if (err) {
        resolved(err, address as string, family as number);
        return;
      }
      const addresses = Array.isArray(address) ? address.map((one) => one.address) : [address];
      const blocked = firstRefusedAddress(addresses, (one) =>
        refusedResolvedEndpoint(context, one, {
          ...judgment,
        }),
      );
      if (blocked !== undefined) {
        securityEvent(
          "egress_blocked",
          { hostname, address: blocked },
          judgment.declared
            ? "security: egress SSRF blocked (allowlisted host resolved link-local/never-admissible or unreadable)"
            : "security: egress SSRF blocked (private or unreadable address)",
        );
        resolved(new Error(`SSRF_BLOCKED: ${hostname} → ${blocked}`), address as string, family);
        return;
      }
      resolved(null, address as string, family);
    });
  };
}

/** The global firewall's connect function, over the env belt read now and the published allowlist read live. */
function createFirewallConnectFor(context: EgressContext): { readonly connect: buildConnector.connector; readonly allowlist: ReadonlySet<string> } {
  const ranges = privateEgressRanges();
  const allowlist = envEgressAllowlist();

  const connectTarget = (target: buildConnector.Options, callback: buildConnector.Callback, declared: boolean): void => {
    const port = effectiveHttpPort(target.protocol, target.port);
    const connector = buildConnector({
      lookup: createFirewallLookupFor(context, { hostname: target.hostname, port, declared, allowlist, ranges }),
    });
    connector(target, callback);
  };

  const connect: buildConnector.connector = (options, callback): void => {
    // SECURITY: a zone-scoped literal (`::1%lo`) is an IP to node, which dials it with no DNS lookup, and no address
    // to `@orb/kit/ip`, so neither gate below would judge it. WHATWG URL refuses a zone, so no URL carries one today;
    // refusing any zone mark here keeps a future input path from reaching loopback or link-local through one.
    if (options.hostname.includes(ZONE_MARK)) {
      securityEvent("egress_blocked", { hostname: options.hostname }, "security: egress SSRF blocked (zone-scoped host)");
      callback(new Error(`SSRF_BLOCKED: ${options.hostname} (zone-scoped host)`), null);
      return;
    }
    // Port is available HERE (undici passes options.port to the connector) but NOT in the lookup override
    // (node's `dns.lookup` never sees one) — so the port-scoped decision MUST live in the connect wrapper,
    // and a port-scoped entry is therefore keyed on an exact host, never on a range.
    // The deployment's admitted private endpoints (F12) — read LIVE so a Governance edit is honoured on the
    // very next connect.
    if (admittedByAllowlistFor(context, options.hostname, effectiveHttpPort(options.protocol, options.port))) {
      connectTarget(options, callback, true);
      return;
    }
    const literal = literalHost(options.hostname);
    if (literal !== null && shouldBlockEgress(literal, options.hostname, allowlist, ranges)) {
      securityEvent("egress_blocked", { hostname: options.hostname, address: literal }, "security: egress SSRF blocked (private literal address)");
      callback(new Error(`SSRF_BLOCKED: ${options.hostname} → ${literal}`), null);
      return;
    }
    connectTarget(options, callback, false);
  };
  return { connect, allowlist };
}

interface ConnectJudgment {
  readonly hostname: string;
  readonly declared: boolean;
  readonly port: number | null;
  readonly allowlist: ReadonlySet<string>;
  readonly ranges: readonly string[];
}

function refusedResolvedEndpoint(context: EgressContext, address: string, judgment: ConnectJudgment): boolean {
  if (judgment.declared) {
    return isInRanges(address, NEVER_ADMISSIBLE_RANGES);
  }
  if (!shouldBlockEgress(address, judgment.hostname, judgment.allowlist, judgment.ranges)) {
    return false;
  }
  const ports = context.privateEndpointAllowlist.hostPorts.get(unbracket(judgment.hostname).toLowerCase());
  if (ports !== undefined && (judgment.port === null || !ports.has(judgment.port))) {
    return true;
  }
  return !addressInAdmittedRangesFor(context, address);
}

// Raw execution receives the same connector verdict and the validated pin, never an admission callback.
async function configuredEndpointPin(context: EgressContext, url: URL): Promise<Agent | undefined> {
  if (!env.EGRESS_FIREWALL) {
    return;
  }
  const host = unbracket(url.hostname).toLowerCase();
  const literal = literalHost(host);
  const port = effectiveHttpPort(url.protocol, url.port);
  const allowlist = envEgressAllowlist();
  const ranges = privateEgressRanges();
  const declared = admittedByAllowlistFor(context, host, port);
  if (!declared && literal !== null && shouldBlockEgress(literal, host, allowlist, ranges)) {
    blockEgress("private-address", host, `host ${host} is a private endpoint this deployment does not admit`);
  }
  const addresses = literal === null ? await context.resolver(host) : [literal];
  if (addresses.length === 0) {
    blockEgress("unresolvable", host, `host ${host} did not resolve to any address`);
  }
  const blocked = firstRefusedAddress(addresses, (address) => refusedResolvedEndpoint(context, address, { hostname: host, port, declared, allowlist, ranges }));
  if (blocked !== undefined) {
    blockEgress("private-address", host, `host ${host} resolves to a private, reserved or unreadable address`, { address: blocked });
  }
  const agent = pinnedAgent(addresses);
  context.agents.add(agent);
  return agent;
}

// ── safeFetch: the self-enforcing SSRF guard for any user-influenced outbound URL ──────────────────
//
// Per request AND per redirect hop: scheme pin (https-only) → host allowlist (or the explicit ANY_HOST escape) →
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

// Real DNS is the default; scoped execution can inject its resolver.

function defaultResolver(host: string): Promise<readonly string[]> {
  return new Promise((resolve, reject) => {
    dnsLookup(host, { all: true, order: "verbatim" }, (err, addresses): void => {
      if (err) {
        reject(err);
        return;
      }
      resolve(addresses.map((a) => a.address));
    });
  });
}

/** A validated, pinned safeFetch answer before its body is read, and what releases it. */
interface OpenedFetch {
  readonly response: Response;
  readonly contentType: string | null;
  readonly maxBytes: number;
  /** Clear the deadline timer and close the pinned agent. */
  readonly release: () => void;
  /** Drop the answer unread: cancel the body (socket back to the pool) and release. */
  readonly discard: () => void;
  /** A body-read failure as the caller sees it: the deadline's own abort is the deadline refusal. */
  readonly bodyError: (err: unknown) => unknown;
  readonly holdReader: (reader: ReadableStreamDefaultReader<Uint8Array> | undefined) => void;
  readonly assertActive: () => void;
}

async function safeFetchFor(context: EgressContext, url: string | URL, options: SafeFetchOptions): Promise<SafeFetchResult> {
  const opened = await openSafeFetchFor(context, url, options);
  // ONE settle guard shared by bytes() + dispose(): the response is single-use, so whichever runs first
  // claims it (a second bytes() is the reuse error; a dispose() after a read is a no-op).
  let settled = false;
  return {
    url: opened.response.url,
    status: opened.response.status,
    headers: opened.response.headers,
    contentType: opened.contentType,
    bytes: async (): Promise<Uint8Array> => {
      if (settled) {
        throw new EgressBlockedError("consumed", "safeFetch: response already consumed");
      }
      settled = true;
      return await collectChunks(cappedChunks(opened));
    },
    dispose: (): void => {
      if (settled) {
        return;
      }
      settled = true;
      opened.discard();
    },
  };
}

/** Resolve, validate, pin and send; answer the response with its content type checked and its body unread. */
async function openSafeFetchFor(context: EgressContext, url: string | URL, options: SafeFetchOptions): Promise<OpenedFetch> {
  if (context.closed) {
    throw new Error("egress lifetime is closed");
  }
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const deadlineMs = options.deadlineMs ?? DEFAULT_DEADLINE_MS;
  const start = new URL(url);

  // The deadline is the TOTAL request bound (S5 — "a deadline ALWAYS exists"): it spans connect + headers
  // + the redirect chain AND the streamed body read, so a slow-loris body drip on an attacker-influenceable
  // URL cannot hang unboundedly (the byte cap bounds SIZE, this bounds TIME). Cleared once the body is
  // consumed; unref'd so an unread response never keeps the event loop alive. Composed with any caller signal.
  const deadlineCtrl = new AbortController();
  const lifetimeCtrl = new AbortController();
  context.requests.set(lifetimeCtrl, undefined);
  const completion = Promise.withResolvers<void>();
  context.pending.add(completion.promise);
  const cancelTimer = context.timers.timeoutUnref(() => deadlineCtrl.abort(), deadlineMs);
  const signal = AbortSignal.any([lifetimeCtrl.signal, deadlineCtrl.signal, ...(options.signal === undefined ? [] : [options.signal])]);
  const deadlineHit = (): boolean => deadlineCtrl.signal.aborted && options.signal?.aborted !== true;

  let response: Response;
  let agent: Agent | undefined;
  try {
    ({ response, agent } = await followRedirectsFor(context, { start, maxRedirects, options, signal }));
  } catch (err) {
    cancelTimer();
    context.requests.delete(lifetimeCtrl);
    context.pending.delete(completion.promise);
    completion.resolve();
    if (deadlineHit()) {
      securityEvent("egress_blocked", { reason: "deadline", hostname: start.hostname }, "security: safeFetch egress blocked (deadline)");
      // biome-ignore lint/style/useErrorCause: the cause IS forwarded — EgressBlockedError passes options to super(); biome can't see through the custom class.
      throw new EgressBlockedError("deadline", `egress deadline of ${deadlineMs}ms exceeded`, { cause: err });
    }
    throw err;
  }

  let released = false;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const release = (): void => {
    if (released) {
      return;
    }
    released = true;
    cancelTimer();
    context.requests.delete(lifetimeCtrl);
    context.discards.delete(discard);
    signal.removeEventListener("abort", discard);
    context.pending.delete(completion.promise);
    completion.resolve();
    closeAgentFor(context, agent);
  };
  const discard = (): void => {
    if (released) {
      return;
    }
    const body = response.body;
    if (reader !== undefined) {
      const held = reader;
      superviseEgressCleanup(context, "reader-discarded", async () => {
        try {
          await held.cancel();
        } finally {
          held.releaseLock();
        }
      });
    } else if (body !== null) {
      superviseEgressCleanup(context, "body-discarded", () => body.cancel());
    }
    release();
  };
  context.discards.add(discard);
  signal.addEventListener("abort", discard, { once: true });
  let contentType: string | null;
  try {
    signal.throwIfAborted();
    contentType = enforceContentType(response, options.allowedContentTypes);
  } catch (err) {
    discard();
    throw err;
  }
  return {
    response,
    contentType,
    maxBytes,
    release,
    discard,
    holdReader: (held): void => {
      reader = held;
    },
    assertActive: () => signal.throwIfAborted(),
    bodyError: (err: unknown): unknown =>
      deadlineHit() ? new EgressBlockedError("deadline", `egress deadline of ${deadlineMs}ms exceeded`, { cause: err }) : err,
  };
}

/** Force-close an owned dispatcher when the request allocated one. */
function closeAgentFor(context: EgressContext, agent: Agent | undefined): void {
  if (agent !== undefined) {
    context.agents.delete(agent);
    superviseEgressCleanup(context, "agent-close", () => agent.destroy());
  }
}

// Provider-returned generated-image URLs are third-party-authored and attacker-influenceable — the
// arbitrary-URL/provider-returned class (ANY_HOST: no host pin, full https + private-denial). The body
// read is bounded by the safeFetch total deadline; an optional caller/workload `signal` composes on top
// (cancels the in-flight download when the initiating turn/workload aborts). Returns null on any
// block/non-2xx/cap/timeout/network failure; the caller drops that one image.
async function fetchImageBytesFor(context: EgressContext, url: string, maxBytes?: number, signal?: AbortSignal): Promise<Uint8Array | null> {
  // fetchImageBytes returns null as data: generate-core's materialize drops that image, and when no image decodes it throws GenerationFailedError ("zero decodable images") to the caller; an SSRF block is securityEvent'd at the connector before this catch. Ends if materialize stops treating null as a dropped image or the zero-decodable throw is removed.
  try {
    const res = await safeFetchFor(context, url, {
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
async function fetchWebDocumentFor(context: EgressContext, url: string): Promise<Uint8Array> {
  const res = await safeFetchFor(context, url, { allowedHosts: ANY_HOST, method: "GET", maxBytes: DEFAULT_MAX_BYTES });
  if (res.status < OK_STATUS_MIN || res.status >= REDIRECT_STATUS_MIN) {
    res.dispose?.(); // drop the non-2xx body + close the pinned Agent before throwing
    throw new Error(`fetchWebDocument: non-2xx response (HTTP ${res.status})`);
  }
  return await res.bytes();
}

/** The plugin-bundle fetch cap (U8, seam 15) — the "ship one file, ≤ 1 MiB" rule the
 *  `domain/plugin` unzip funnel ALSO enforces (its own `MAX_BUNDLE_BYTES`). Bounding the DOWNLOAD here refuses an
 *  over-cap bundle at the WIRE, before `parseBundle` allocates — defense in depth on the same number (a lower
 *  cap than `fetchWebDocument`'s 5 MB: a plugin bundle is one small pre-bundled script + a tiny manifest). */
const PLUGIN_BUNDLE_FETCH_MAX_BYTES = 1_048_576;

// The URL-INSTALL bundle fetch (U8, seam 15 — the security-review subject). The SAME
// arbitrary-URL/ANY_HOST class as fetchWebDocument (no host pin, because the installer names an arbitrary URL;
// https-only + per-hop private-range/IP-literal denial + the redirect budget STILL run — the SSRF wall), the
// compose-bound op the domain's `ctx.fetchBundle` is wired to. It is the ONLY egress a URL install performs, and
// it is NEVER a bare `fetch` of an attacker-named URL. THROWS on any refusal (safeFetch's EgressBlockedError), a
// non-2xx, the byte cap, or a network error, so the URL verbs collapse every failure into a leak-free
// `PluginBundleFetchError` (the domain never imports infra to branch — the fetchWebDocument→ScrapeFailedError
// precedent). The byte cap is bound HERE, not caller-suppliable.
async function fetchPluginBundleFor(context: EgressContext, url: string): Promise<Uint8Array> {
  const res = await safeFetchFor(context, url, { allowedHosts: ANY_HOST, method: "GET", maxBytes: PLUGIN_BUNDLE_FETCH_MAX_BYTES });
  if (res.status < OK_STATUS_MIN || res.status >= REDIRECT_STATUS_MIN) {
    res.dispose?.(); // drop the non-2xx body + close the pinned Agent before throwing
    throw new Error(`fetchPluginBundle: non-2xx response (HTTP ${res.status})`);
  }
  return await res.bytes();
}

/** The limits a pinned-release download runs under: the exact hosts the release and its redirect hops may name,
 *  the asset's pinned size as the byte cap, and the whole-download deadline. */

/** A pinned-release download (the share relay's cloudflared): safeFetch with an exact host allowlist, so the
 *  https pin, the per-hop private-range denial, the byte cap and the deadline all run. The caller hashes the bytes
 *  against its pin; this door only bounds the fetch. The answer keeps its status, so a non-2xx reaches the caller
 *  as a status with no body.
 *
 *  The body streams through the cap and the deadline to the caller, which writes it to the partial file as it
 *  hashes it, so the door holds one chunk and never the asset. It reads the first chunk before answering, so a
 *  refusal the first read shows (an answer over the pinned size, a reset) rejects the download itself. */
async function fetchPinnedDownloadFor(context: EgressContext, url: string, limits: PinnedDownloadLimits): Promise<Response> {
  const opened = await openSafeFetchFor(context, url, {
    allowedHosts: limits.allowedHosts,
    method: "GET",
    maxBytes: limits.maxBytes,
    deadlineMs: limits.deadlineMs,
  });
  const { status } = opened.response;
  if (status < OK_STATUS_MIN || status >= REDIRECT_STATUS_MIN) {
    opened.discard();
    return new Response(null, { status });
  }
  const chunks = cappedChunks(opened);
  const first = await chunks.next();
  return new Response(pullStream(first, chunks), { status });
}

/**
 * A byte stream of `first`, then the rest of `chunks`, read only as its reader asks, so nothing queues ahead of the
 * caller. A failure of `chunks` errors the stream.
 *
 * SECURITY: a cancel ends `chunks` itself, whose cleanup cancels the upstream body and closes the pinned agent. Do not
 * wrap `chunks` in another generator: ending a wrapper that has not started never reaches the one inside, which would
 * hold the connection open until the deadline.
 */
function pullStream(first: IteratorResult<Uint8Array, void>, chunks: AsyncGenerator<Uint8Array, void>): ReadableStream<Uint8Array> {
  let held: IteratorResult<Uint8Array, void> | null = first;
  return new ReadableStream<Uint8Array>(
    {
      async pull(controller): Promise<void> {
        const next = held ?? (await chunks.next());
        held = null;
        if (next.done === true) {
          controller.close();
          return;
        }
        controller.enqueue(next.value);
      },
      async cancel(): Promise<void> {
        held = null;
        await chunks.return();
      },
    },
    { highWaterMark: 0 },
  );
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
  return parseIp(bare) !== null;
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
function validateUrl(url: URL, options: SafeFetchOptions, configuredEndpoint = false): void {
  const host = normalizeHost(url.hostname);
  if (configuredEndpoint) {
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      blockEgress("scheme", host, `scheme ${url.protocol} is not allowed`);
    }
  } else if (url.protocol !== "https:") {
    blockEgress("scheme", host, `scheme ${url.protocol} is not allowed (https only)`);
  }
  // The user's own configured backend may legitimately be an IP literal (BYO vLLM at 192.168.x.y).
  if (!configuredEndpoint && isIpLiteralHost(url.hostname)) {
    blockEgress("ip-literal", host, "IP-literal hosts are not allowed (a hostname is required)");
  }
  if (options.allowedHosts !== ANY_HOST && !hostAllowed(host, options.allowedHosts)) {
    blockEgress("host-not-allowed", host, `host ${host} is not in the allowlist`);
  }
  // URL userinfo is implicit Authorization state owned by the URL parser/fetch implementation rather than
  // by our redirect header policy. Refuse it outright so credentials can neither reach hop zero nor survive
  // into a cross-origin redirect through implementation-specific fetch behavior. Checked LAST, after the host
  // allowlist: userinfo (`user@host`) sits before the real authority the URL parser resolves into `url.hostname`,
  // so a security pin proving that resolution is correct (`https://api.chub.ai@evil.com` must fail as
  // `host-not-allowed`, not merely "refused") would silently stop proving anything the moment ANY userinfo
  // short-circuited the reason first.
  if (url.username !== "" || url.password !== "") {
    blockEgress("credentials", host, "URL-embedded credentials are not allowed");
  }
}

/** Resolve→validate→pin for public URLs is unconditional, independent of deployment endpoint admission. */
async function resolveValidatePinFor(context: EgressContext, url: URL): Promise<Agent> {
  const host = normalizeHost(url.hostname);
  const addresses = await context.resolver(host);
  if (addresses.length === 0) {
    blockEgress("unresolvable", host, `host ${host} did not resolve to any address`);
  }
  const ranges = privateEgressRanges();
  const blocked = firstRefusedAddress(addresses, (address) => isInRanges(address, ranges));
  if (blocked !== undefined) {
    // The address is LOGGED (observability) but never surfaced in the thrown error.
    blockEgress("private-address", host, `host ${host} resolves to a private, reserved or unreadable address`, { address: blocked });
  }
  const agent = pinnedAgent(addresses);
  context.agents.add(agent);
  return agent;
}

/** The family of the address's SPELLING, which is what the socket dials. Not `parseIp`'s width: that reduces a
 *  mapped `::ffff:a.b.c.d` to IPv4, and a v6 spelling handed to the socket as family 4 fails to connect. */
function socketFamily(address: string): typeof SOCKET_FAMILY_V4 | typeof SOCKET_FAMILY_V6 {
  return address.includes(":") ? SOCKET_FAMILY_V6 : SOCKET_FAMILY_V4;
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
          addresses.map((address) => ({ address, family: socketFamily(address) })),
          0,
        );
        return;
      }
      const first = addresses[0] ?? "";
      callback(null, first, socketFamily(first));
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
async function fetchHopFor(context: EgressContext, url: URL, init: RequestInit, agent: Agent | undefined): Promise<Response> {
  try {
    return await context.fetch(url, init);
  } catch (err) {
    closeAgentFor(context, agent);
    throw err;
  }
}

interface HopResult {
  readonly response: Response;
  /** The caller closes the terminal hop's agent after its body; intermediate agents close as the chain advances. */
  readonly agent: Agent;
}

interface RedirectInput {
  readonly start: URL;
  readonly maxRedirects: number;
  readonly options: SafeFetchOptions;
  readonly signal: AbortSignal;
}

async function followRedirectsFor(context: EgressContext, { start, maxRedirects, options, signal }: RedirectInput): Promise<HopResult> {
  let current = start;
  let hopHeaders: Record<string, string> | undefined = options.headers ? { ...options.headers } : undefined;
  for (let hop = 0; ; hop++) {
    validateUrl(current, options);
    const agent = await resolveValidatePinFor(context, current);
    const res = await fetchHopFor(context, current, buildHopInit({ options, dispatcher: agent, signal, headers: hopHeaders, hop }), agent);
    const isRedirect = res.status >= REDIRECT_STATUS_MIN && res.status < REDIRECT_STATUS_MAX;
    const loc = isRedirect ? res.headers.get("location") : null;
    if (loc === null) {
      return { response: res, agent };
    }
    // A redirect hop is done — drain its body back to the pool and CLOSE its pinned agent (spec D).
    const body = res.body;
    if (body !== null) {
      superviseEgressCleanup(context, "redirect-hop", () => body.cancel());
    }
    closeAgentFor(context, agent);
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

/**
 * The body as chunks, refused once past `maxBytes` (post-decode, so the cap is the decompression-bomb bound). The one
 * body reader for every consumer: it releases the fetch when the body ends, fails or is abandoned, cancels a body
 * it did not finish, and reports the deadline's abort as the deadline refusal.
 */
async function* cappedChunks(opened: OpenedFetch): AsyncGenerator<Uint8Array, void> {
  opened.assertActive();
  const reader = opened.response.body?.getReader();
  opened.holdReader(reader);
  let finished = reader === undefined;
  try {
    let total = 0;
    for (let chunk = await reader?.read(); chunk !== undefined && !chunk.done; chunk = await reader?.read()) {
      opened.assertActive();
      total += chunk.value.byteLength;
      if (total > opened.maxBytes) {
        throw new EgressBlockedError("too-large", `safeFetch: response exceeded maxBytes=${opened.maxBytes}`);
      }
      yield chunk.value;
    }
    opened.assertActive();
    finished = true;
  } catch (err) {
    throw opened.bodyError(err);
  } finally {
    if (!finished && reader !== undefined) {
      opened.discard();
    } else {
      reader?.releaseLock();
    }
    opened.release();
  }
}

async function collectChunks(chunks: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of chunks) {
    parts.push(chunk);
    total += chunk.byteLength;
  }
  return concatChunks(parts, total);
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

export type { SafeFetchOptions, SafeFetchResult } from "./contract/egress.ts";
export const ANY_HOST: typeof ANY_HOST_POLICY = ANY_HOST_POLICY;
export const ENDPOINT_ADMISSIONS = ENDPOINT_ADMISSION_VALUES;

export function safeFetch(url: string | URL, options: SafeFetchOptions): Promise<SafeFetchResult> {
  return safeFetchFor(defaultContext, url, options);
}

export function fetchImageBytes(url: string, maxBytes?: number, signal?: AbortSignal): Promise<Uint8Array | null> {
  return fetchImageBytesFor(defaultContext, url, maxBytes, signal);
}

export function fetchWebDocument(url: string): Promise<Uint8Array> {
  return fetchWebDocumentFor(defaultContext, url);
}

export function fetchPluginBundle(url: string): Promise<Uint8Array> {
  return fetchPluginBundleFor(defaultContext, url);
}

async function configuredEndpointFetchFor(context: EgressContext, input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> {
  if (context.closed) {
    throw new Error("egress lifetime is closed");
  }
  const request = new Request(input, init);
  const url = new URL(request.url);
  validateUrl(url, { allowedHosts: ANY_HOST }, true);
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, request.signal]);
  const completion = Promise.withResolvers<void>();
  // Request GC can detach its dependent signal; retain it until the existing body owner releases the request.
  context.requests.set(controller, request);
  context.pending.add(completion.promise);
  let connector: Agent | undefined;
  const release = (): void => {
    context.requests.delete(controller);
    context.pending.delete(completion.promise);
    completion.resolve();
    closeAgentFor(context, connector);
  };
  let bodyOwned = false;
  try {
    const pin = await configuredEndpointPin(context, url);
    closeAgentFor(context, pin);
    signal.throwIfAborted();
    const fetchInit: RequestInit = { signal };
    if (env.EGRESS_FIREWALL) {
      connector = new Agent({ connect: createFirewallConnectFor(context).connect });
      context.agents.add(connector);
      Reflect.set(fetchInit, "dispatcher", connector);
    }
    const response = await context.fetch(request, fetchInit);
    const body = createOwnedResponseBody(response, signal);
    superviseEgressCleanup(context, "provider-body", () => body.settled.finally(release));
    bodyOwned = true;
    return body.response;
  } finally {
    if (!bodyOwned) {
      release();
    }
  }
}

async function settleEgress(context: EgressContext): Promise<void> {
  while (context.pending.size > 0) {
    await Promise.all(context.pending);
  }
  for (const agent of context.agents) {
    closeAgentFor(context, agent);
  }
  while (context.pending.size > 0) {
    await Promise.all(context.pending);
  }
  if (context.failures.length > 0) {
    throw new AggregateError(context.failures, "egress physical cleanup failed");
  }
}

/** Own one graph's publication, guarded execution, cancellation and physical network settlement. */
export function createScopedEgress(options: ScopedEgressOptions = {}): ScopedEgress {
  const context = createEgressContext(options, false);
  let disposal: Promise<void> | undefined;
  const cancel = (): void => {
    context.closed = true;
    for (const controller of context.requests.keys()) {
      controller.abort();
    }
    for (const discard of context.discards) {
      discard();
    }
  };
  return {
    cancel,
    publishPrivateEndpointAllowlist: (entries) => publishPrivateEndpointAllowlistFor(context, entries),
    endpointAdmission: (baseUrl) => endpointAdmissionFor(context, baseUrl),
    resolvedEndpointAdmission: (baseUrl) => resolvedEndpointAdmissionFor(context, baseUrl),
    safeFetch: (url, fetchOptions) => safeFetchFor(context, url, fetchOptions),
    fetchImageBytes: (url, maxBytes, signal) => fetchImageBytesFor(context, url, maxBytes, signal),
    fetchWebDocument: (url) => fetchWebDocumentFor(context, url),
    fetchPluginBundle: (url) => fetchPluginBundleFor(context, url),
    fetchPinnedDownload: (url, limits) => fetchPinnedDownloadFor(context, url, limits),
    configuredEndpointFetch: (input, init) => configuredEndpointFetchFor(context, input, init),
    [Symbol.asyncDispose]: (): Promise<void> => {
      cancel();
      disposal ??= settleEgress(context);
      return disposal;
    },
  };
}
