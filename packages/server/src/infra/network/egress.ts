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
// DECLARED-INTENT AUTO-ALLOW, in TWO classes, both operator intent and neither ever attacker input:
//   (1) the env belt — `EGRESS_ALLOWLIST` plus the OIDC issuer host, read once at install
//       (`shouldBlockEgress`). HOST-keyed, ANY PORT. Unchanged.
//   (2) the deployment's private-endpoint allowlist (`publishPrivateEndpointAllowlist`, the second block
//       further down — inference program F12). Hosts, CIDRs, and OPTIONALLY host:PORT.
// Without one of them a bare private-range block SSRF-refuses the box's own loopback inference backend,
// whose server-initiated calls are plain fetch()/ownerConfiguredEndpoint safeFetch → the global dispatcher.
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
/** `node:net`'s `isIP` return value for an IPv4 literal (0 = not an IP, 6 = IPv6). */
const NODE_IP_FAMILY_V4 = 4;

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
//   (`tooling/src/stack/lib/engines-compose.ts` §"THE THREE DEPARTURES" 2: engine host `vllm-gen`, with
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

/** LIVE module state, EMPTY until the settings domain publishes. ASSUMES(single-replica) — per-process BY
 *  CONSTRUCTION: it gates THIS process's undici dispatcher; a second replica publishes its own copy from the
 *  same AppSettings row at its own boot, and one that has not yet fails CLOSED. */
let privateEndpointAllowlist: PrivateEndpointAllowlist = { hosts: new Set<string>(), hostPorts: new Map<string, ReadonlySet<number>>(), ranges: [] };

const MIN_PORT = 1;
const MAX_PORT = 65_535;
const V4_PREFIX_BITS = 32;
const V6_PREFIX_BITS = 128;
const HOSTNAME_MAX_LENGTH = 253;
const HOSTNAME_LABEL_MAX_LENGTH = 63;
/** An allowlist/URL port: 1–5 digits, nothing else (no sign, no whitespace, no empty string). */
const PORT_RE = /^\d{1,5}$/;
/** A CIDR prefix: 1–3 digits, nothing else (an empty one is `Number("") === 0`, i.e. a silent /0). */
const PREFIX_RE = /^\d{1,3}$/;
/** `[<v6>]` with an OPTIONAL `:<port>` — the authority spelling of an IPv6 endpoint. */
const BRACKETED_V6_RE = /^\[([^\]]+)\](?::(\d+))?$/;
/** One DNS label's charset. `_` is admitted because internal names use it; `-` may not lead or trail. */
const HOSTNAME_LABEL_RE = /^[a-z0-9_-]+$/;
/** The port a URL that states none actually dials, by scheme. */
const DEFAULT_PORT_BY_PROTOCOL: Readonly<Record<string, number>> = { "http:": 80, "https:": 443 };

/** `1`–`65535` as a number, or `null` for anything else — the fail-closed direction for both an operator's
 *  typo in an entry and a URL/connector port this belt cannot read. */
function parsePort(text: string): number | null {
  if (!PORT_RE.test(text)) {
    return null;
  }
  const port = Number.parseInt(text, 10);
  return port >= MIN_PORT && port <= MAX_PORT ? port : null;
}

/** The port a connect target will actually dial: the explicit one, else the scheme's default. `null` means
 *  "unreadable" — a port-scoped entry can never admit that, by construction. */
function effectivePort(protocol: string, port: string): number | null {
  return port === "" ? (DEFAULT_PORT_BY_PROTOCOL[protocol] ?? null) : parsePort(port);
}

/** A syntactically admissible hostname ENTRY. Without this a typo (`http://127.0.0.1:8703`, a trailing dot,
 *  a stray path) became an unmatchable host key that admitted nothing and said nothing — the no-tell rule. */
function isHostnameEntry(host: string): boolean {
  if (host.length === 0 || host.length > HOSTNAME_MAX_LENGTH) {
    return false;
  }
  return host
    .split(".")
    .every(
      (label) =>
        label.length > 0 && label.length <= HOSTNAME_LABEL_MAX_LENGTH && HOSTNAME_LABEL_RE.test(label) && !label.startsWith("-") && !label.endsWith("-"),
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
    const port = parsePort(portText);
    return port === null ? null : { subject, port };
  }
  const slash = raw.indexOf("/");
  if (slash !== -1) {
    const colon = raw.indexOf(":", slash);
    if (colon === -1) {
      return { subject: raw, port: null };
    }
    const port = parsePort(raw.slice(colon + 1));
    return port === null ? null : { subject: raw.slice(0, colon), port };
  }
  if (isIP(raw) !== 0) {
    return { subject: raw, port: null };
  }
  const lastColon = raw.lastIndexOf(":");
  if (lastColon === -1) {
    return { subject: raw, port: null };
  }
  const port = parsePort(raw.slice(lastColon + 1));
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
  if (isIP(address) === 0) {
    return isHostnameEntry(subject) ? { kind: "host", host: subject, port } : null;
  }
  if (isInRanges(address, NEVER_ADMISSIBLE_RANGES)) {
    return null;
  }
  const maxBits = isIP(address) === NODE_IP_FAMILY_V4 ? V4_PREFIX_BITS : V6_PREFIX_BITS;
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
export function publishPrivateEndpointAllowlist(entries: readonly string[]): void {
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
  privateEndpointAllowlist = { hosts, hostPorts, ranges };
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
 *  four members. The verdicts themselves are documented on {@link endpointAdmission} below. */
export const ENDPOINT_ADMISSIONS = ["public", "admitted", "refused", "invalid"] as const;

/** The WRITE-TIME admission read the connection domain runs before it saves an endpoint row (the guard above
 *  re-judges every connect): `public` = not a private/loopback literal (a hostname resolves at connect, where
 *  the DNS gate judges it); `admitted` = private and on the allowlist; `refused` = private and not; `invalid`
 *  = not an http(s) URL. `localhost` is folded to loopback so the pane's inline "Admit" affordance fires for
 *  the spelling people actually type. */
export function endpointAdmission(baseUrl: string): (typeof ENDPOINT_ADMISSIONS)[number] {
  const url = URL.parse(baseUrl);
  if (url === null || (url.protocol !== "http:" && url.protocol !== "https:")) {
    return "invalid";
  }
  // The port the browser/server would actually dial — an explicit one, else the scheme's default, so an
  // entry written `ollama.lan:80` matches the `http://ollama.lan` a user types.
  const port = effectivePort(url.protocol, url.port);
  const host = unbracket(url.hostname).toLowerCase();
  const literal = host === "localhost" ? "127.0.0.1" : host;
  if (isIP(literal) === 0) {
    return admittedByAllowlist(host, port) ? "admitted" : "public";
  }
  if (isInRanges(literal, NEVER_ADMISSIBLE_RANGES)) {
    return "refused";
  }
  if (!isInRanges(literal, privateEgressRanges())) {
    return "public";
  }
  return admittedByAllowlist(host, port) || (host === "localhost" && admittedByAllowlist(literal, port)) ? "admitted" : "refused";
}

/** Is this RESOLVED or literal address inside an admitted range? `NEVER_ADMISSIBLE_RANGES` is subtracted
 *  HERE, not only at publish: the publish-time check sees the ENTRY, so a broad operator CIDR
 *  (`0.0.0.0/0`, `128.0.0.0/1`) would otherwise swallow the link-local metadata class it can never state
 *  directly. One home for "inside the admitted ranges", used by both gates. */
function addressInAdmittedRanges(address: string): boolean {
  return isInRanges(address, privateEndpointAllowlist.ranges) && !isInRanges(address, NEVER_ADMISSIBLE_RANGES);
}

/** Is this connect target admitted by the deployment allowlist — by exact host(:port), or by a literal
 *  address inside an admitted range? A hostname that is NOT listed but resolves inside an admitted range is
 *  judged at the DNS gate (`allowlistedConnect`), where the resolved address is in hand.
 *
 *  The port-scoped arm returns EARLY — it is the half of the precedence rule (block comment above) that
 *  `publish` cannot enforce: a CONTAINING CIDR survives the publish untouched, and this early return is
 *  what keeps it from re-widening a port-scoped host. `port` is `null` when this belt cannot read the
 *  target's port, which a port-scoped entry can never admit. */
function admittedByAllowlist(hostname: string, port: number | null): boolean {
  const host = unbracket(hostname).toLowerCase();
  const ports = privateEndpointAllowlist.hostPorts.get(host);
  if (ports !== undefined) {
    return port !== null && ports.has(port);
  }
  if (privateEndpointAllowlist.hosts.has(host)) {
    return true;
  }
  return isIP(host) !== 0 && addressInAdmittedRanges(host);
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
        // A hostname NOT listed by name, whose RESOLVED address lands inside an admitted RANGE, is admitted
        // here — the one gate where the address is in hand. It is PORT-BLIND by construction (no port
        // reaches a dns.lookup override), which is exactly why `ranges` only ever holds any-port entries.
        const blocked = addrs.find((a) => shouldBlockEgress(a, hostname, allowlist, ranges) && !addressInAdmittedRanges(a));
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
    // Port is available HERE (undici passes options.port to the connector) but NOT in the lookup override
    // (node's `dns.lookup` never sees one) — so the port-scoped decision MUST live in the connect wrapper,
    // and a port-scoped entry is therefore keyed on an exact host, never on a range.
    // The deployment's admitted private endpoints (F12) — read LIVE so a Governance edit is honoured on the
    // very next connect.
    if (admittedByAllowlist(options.hostname, effectivePort(options.protocol, options.port))) {
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
