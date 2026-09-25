// IP literal parsing: an IPv4 dotted quad or an IPv6 literal (with `::` compression and an optional IPv4 tail) to a
// fixed-width integer. Pure and total: malformed input returns null, never throws, because callers feed it request
// headers. An IPv4-mapped IPv6 address (`::ffff:127.0.0.1`) reduces to its IPv4 value so it matches v4 ranges.

// SECURITY: an octet with a leading zero is refused, as `node:net` refuses it. getaddrinfo and WHATWG URL read
// `012.0.0.1` as octal 10.0.0.1, so a decimal reading here would clear one address while the dialler reaches another.
// Refusing it keeps every caller's verdict on the address that is actually dialled; do not relax it to decimal.
const IPV4_RE = /^(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})$/;
/** A single IPv6 hextet (1–4 hex digits). */
const HEXTET_RE = /^[0-9a-fA-F]{1,4}$/;

/** A parsed IP as a fixed-width big-endian integer + its bit width (32 for v4, 128 for v6). */
export interface ParsedIp {
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

// biome-ignore-start lint/suspicious/noBitwiseOperators: IP/CIDR math is fundamentally bitwise — parsing an address packs octets/hextets via shift+OR, and prefix masking is shift+AND on the integer address.
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
  const tailGroups = [((v4 >> HEXTET_SHIFT) & HEXTET_MASK).toString(HEX_RADIX), (v4 & HEXTET_MASK).toString(HEX_RADIX)];
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
  const left = doubleColon[0] !== undefined && doubleColon[0] !== "" ? doubleColon[0].split(":") : [];
  const compressed = doubleColon.length === DOUBLE_COLON_SPLIT_PARTS;
  const right = compressed && doubleColon[1] !== undefined && doubleColon[1] !== "" ? doubleColon[1].split(":") : [];
  const zeroGroups = V6_GROUPS - left.length - right.length - tailGroups.length;
  // More than eight groups around a `::` is malformed; `new Array` would throw a RangeError on the negative count.
  if (compressed && zeroGroups < 0) {
    return null;
  }
  const groups = compressed ? [...left, ...new Array(zeroGroups).fill("0"), ...right, ...tailGroups] : [...left, ...tailGroups];
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

// biome-ignore-end lint/suspicious/noBitwiseOperators: end of the block above
