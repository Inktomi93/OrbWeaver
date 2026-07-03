// Shared IP / CIDR matching for the network egress belt (and, later, the ingress belt + the auth origin
// gate). One home for the private-range knowledge. Pure (no env, no I/O, no node:*) so it unit-tests
// directly; the env-configured extra ranges (TRUSTED_PRIVATE_RANGES, EGRESS_ALLOWLIST, IP_ALLOWLIST) are
// merged by callers, never read here.
//
// Covers IPv4 + IPv6, including the IPv4-mapped IPv6 form (`::ffff:127.0.0.1`) proxies emit — reduced to
// its IPv4 value so a mapped loopback matches `127.0.0.0/8`. (Kit candidate — kept as infra/network
// substrate per core/Tier-3-Infra.md until a client consumer appears.)

// biome-ignore-all lint/suspicious/noBitwiseOperators: IP/CIDR math is fundamentally bitwise — parsing an
// address packs octets/hextets via shift+OR, and prefix masking is shift+AND on the integer address.

/** The dotted-quad matcher (hoisted — useTopLevelRegex; this is a hot path called per address). */
const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
/** A single IPv6 hextet (1–4 hex digits). */
const HEXTET_RE = /^[0-9a-fA-F]{1,4}$/;

/** A parsed IP as a fixed-width big-endian integer + its bit width (32 for v4, 128 for v6). */
interface ParsedIp {
  value: bigint;
  bits: 32 | 128;
}

const V4_BITS = 32;
const V6_BITS = 128;
const V4_GROUPS = 4;
const V6_GROUPS = 8;
const OCTET_MAX = 255;
const OCTET_SHIFT = 8n;
const HEXTET_SHIFT = 16n;
const HEXTET_MASK = 0xffffn;
const V4_MAPPED_PREFIX = 0xffffn;
const V4_MASK = 0xffffffffn;
const HEX_RADIX = 16;
const DOUBLE_COLON_SPLIT_PARTS = 2;
const ZERO = 0n;
const ONE = 1n;

/** Parse an IPv4 dotted-quad → 32-bit value, or null. */
function parseIpv4(ip: string): bigint | null {
  const m = IPV4_RE.exec(ip);
  if (!m) {
    return null;
  }
  let value = ZERO;
  for (let i = 1; i <= V4_GROUPS; i++) {
    const octet = Number(m[i]);
    if (octet > OCTET_MAX) {
      return null;
    }
    value = (value << OCTET_SHIFT) | BigInt(octet);
  }
  return value;
}

/** The `head` (the colon-grouped part) + the two hextets an embedded IPv4 tail expands to. */
interface V6Split {
  head: string;
  tailGroups: string[];
}

/** Split off an embedded IPv4 tail (e.g. `::ffff:127.0.0.1`) into two hextets; null on a bad tail. A
 *  tail-less address returns `{ head: ip, tailGroups: [] }` unchanged. */
function splitEmbeddedV4(ip: string): V6Split | null {
  const lastColon = ip.lastIndexOf(":");
  const maybeV4 = ip.slice(lastColon + 1);
  if (!maybeV4.includes(".")) {
    return { head: ip, tailGroups: [] };
  }
  const v4 = parseIpv4(maybeV4);
  if (v4 === null) {
    return null;
  }
  let head = ip.slice(0, lastColon + 1);
  const tailGroups = [
    ((v4 >> HEXTET_SHIFT) & HEXTET_MASK).toString(HEX_RADIX),
    (v4 & HEXTET_MASK).toString(HEX_RADIX),
  ];
  // head now ends with ':' — drop it so the split below is clean, unless head is just "::".
  if (head.endsWith(":") && !head.endsWith("::")) {
    head = head.slice(0, -1);
  }
  return { head, tailGroups };
}

/** Fold an exactly-8 array of hextet strings into a 128-bit value, or null on a bad hextet. */
function hextetsToBigInt(groups: string[]): bigint | null {
  let value = ZERO;
  for (const g of groups) {
    if (!HEXTET_RE.test(g)) {
      return null;
    }
    value = (value << HEXTET_SHIFT) | BigInt(Number.parseInt(g, HEX_RADIX));
  }
  return value;
}

/** Parse an IPv6 literal (with `::` compression and optional IPv4 tail) → 128-bit value, or null. */
function parseIpv6(ip: string): bigint | null {
  if (!ip.includes(":")) {
    return null;
  }
  const split = splitEmbeddedV4(ip);
  if (split === null) {
    return null;
  }
  const { head, tailGroups } = split;
  const doubleColon = head.split("::");
  if (doubleColon.length > DOUBLE_COLON_SPLIT_PARTS) {
    return null;
  }
  const left = doubleColon[0] ? doubleColon[0].split(":") : [];
  const compressed = doubleColon.length === DOUBLE_COLON_SPLIT_PARTS;
  const right = compressed && doubleColon[1] ? doubleColon[1].split(":") : [];
  const groups = compressed
    ? [
        ...left,
        ...new Array(V6_GROUPS - left.length - right.length - tailGroups.length).fill("0"),
        ...right,
        ...tailGroups,
      ]
    : [...left, ...tailGroups];
  if (groups.length !== V6_GROUPS) {
    return null;
  }
  return hextetsToBigInt(groups);
}

/** Parse an IP string (v4 or v6, incl. IPv4-mapped v6) into a comparable integer + width, or null. */
export function parseIp(ip: string): ParsedIp | null {
  const trimmed = ip.trim();
  const v4 = parseIpv4(trimmed);
  if (v4 !== null) {
    return { value: v4, bits: V4_BITS };
  }
  const v6 = parseIpv6(trimmed);
  if (v6 === null) {
    return null;
  }
  // Reduce an IPv4-mapped address (::ffff:0:0/96) to plain IPv4 so it matches v4 CIDRs.
  if (v6 >> BigInt(V4_BITS) === V4_MAPPED_PREFIX) {
    return { value: v6 & V4_MASK, bits: V4_BITS };
  }
  return { value: v6, bits: V6_BITS };
}

/** True if `ip` falls inside `cidr` (e.g. "10.0.0.0/8", "fc00::/7", or a bare IP = /max). */
export function matchesCidr(ip: string, cidr: string): boolean {
  const slash = cidr.indexOf("/");
  const netStr = slash === -1 ? cidr : cidr.slice(0, slash);
  const net = parseIp(netStr);
  const addr = parseIp(ip);
  if (!(net && addr) || net.bits !== addr.bits) {
    return false;
  }
  let prefix: number;
  if (slash === -1) {
    prefix = net.bits;
  } else {
    const prefixStr = cidr.slice(slash + 1);
    // A trailing-slash / empty prefix ("10.0.0.0/") must NOT silently become /0 (Number("")===0), which
    // would match EVERY address — a fail-open misconfiguration. Reject it.
    if (prefixStr.trim() === "") {
      return false;
    }
    prefix = Number(prefixStr);
  }
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > net.bits) {
    return false;
  }
  if (prefix === 0) {
    return true;
  }
  const mask = ((ONE << BigInt(prefix)) - ONE) << BigInt(net.bits - prefix);
  return (net.value & mask) === (addr.value & mask);
}

/** True if `ip` matches ANY range in `ranges` (CIDR or bare IP). */
export function isInRanges(ip: string, ranges: readonly string[]): boolean {
  for (const r of ranges) {
    if (matchesCidr(ip, r)) {
      return true;
    }
  }
  return false;
}

// The built-in "trusted private" set: loopback, RFC1918, Tailscale/CGNAT (100.64.0.0/10), link-local,
// plus IPv6 loopback / ULA / link-local. Docker's default bridges live in 172.16.0.0/12 (RFC1918) so
// they're already covered. Callers EXTEND this via env (TRUSTED_PRIVATE_RANGES), never mutate it.
export const DEFAULT_TRUSTED_RANGES: readonly string[] = [
  "127.0.0.0/8", // IPv4 loopback
  "10.0.0.0/8", // RFC1918
  "172.16.0.0/12", // RFC1918 (incl. Docker default bridges)
  "192.168.0.0/16", // RFC1918
  "100.64.0.0/10", // CGNAT — Tailscale
  "169.254.0.0/16", // IPv4 link-local
  "::1/128", // IPv6 loopback
  "fc00::/7", // IPv6 unique-local (ULA)
  "fe80::/10", // IPv6 link-local
];

/** True if `ip` is loopback / private / Tailscale / link-local per DEFAULT_TRUSTED_RANGES. */
export function isPrivateOrLoopback(ip: string): boolean {
  return isInRanges(ip, DEFAULT_TRUSTED_RANGES);
}
