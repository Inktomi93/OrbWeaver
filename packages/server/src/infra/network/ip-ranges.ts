// Shared IP/CIDR matching for the egress/ingress/auth-origin belts. Pure (no env/I/O) so it unit-tests
// directly. The literal parse is `@orb/kit/ip` (one home, shared with the Host allowlist grammar); a mapped
// loopback (`::ffff:127.0.0.1`) reduces to its IPv4 value there, so it matches `127.0.0.0/8` here.

import { parseCidr, parseIp } from "@orb/kit/ip";

const ONE = 1n;

// biome-ignore-start lint/suspicious/noBitwiseOperators: prefix masking is shift+AND on the integer address.
/** True if `ip` falls inside `cidr` (e.g. "10.0.0.0/8", "fc00::/7", or a bare IP = /max). */
export function matchesCidr(ip: string, cidr: string): boolean {
  const range = parseCidr(cidr);
  const addr = parseIp(ip);
  if (range === null || addr === null || range.net.bits !== addr.bits) {
    return false;
  }
  const { net, prefix } = range;
  if (prefix === 0) {
    return true;
  }
  const mask = ((ONE << BigInt(prefix)) - ONE) << BigInt(net.bits - prefix);
  return (net.value & mask) === (addr.value & mask);
}
// biome-ignore-end lint/suspicious/noBitwiseOperators: end of the block above

/** True if `ip` matches ANY range in `ranges` (CIDR or bare IP). */
export function isInRanges(ip: string, ranges: readonly string[]): boolean {
  for (const r of ranges) {
    if (matchesCidr(ip, r)) {
      return true;
    }
  }
  return false;
}

// Built-in "trusted private" set: loopback, RFC1918, Tailscale/CGNAT, link-local, IPv6 equivalents.
// Callers EXTEND this via env (TRUSTED_PRIVATE_RANGES), never mutate it.
export const DEFAULT_TRUSTED_RANGES: readonly string[] = [
  "0.0.0.0/8", // RFC1122 "this host" — dest 0.0.0.0 routes to loopback on Linux (SSRF bypass otherwise)
  "127.0.0.0/8", // IPv4 loopback
  "10.0.0.0/8", // RFC1918
  "172.16.0.0/12", // RFC1918 (incl. Docker default bridges)
  "192.168.0.0/16", // RFC1918
  "100.64.0.0/10", // CGNAT — Tailscale
  "169.254.0.0/16", // IPv4 link-local
  "198.18.0.0/15", // RFC2544 benchmarking — routable-looking but never a legit egress target
  "224.0.0.0/4", // IPv4 multicast (incl. SSDP 239.255.255.250) — never a unicast egress target
  // IPv6 unspecified/IPv4-compatible block — `::` routes to ::1 on Linux; never legit egress.
  "::/96",
  "::1/128", // IPv6 loopback
  "fc00::/7", // IPv6 unique-local (ULA)
  "fe80::/10", // IPv6 link-local
  "2002::/16", // 6to4 — embeds an arbitrary IPv4 (incl. a private one); block the whole block
  "2001::/32", // Teredo — IPv6-over-UDP tunnel that can reach an internal v4; block the whole block
];

/** True if `ip` is loopback / private / Tailscale / link-local per DEFAULT_TRUSTED_RANGES. */
export function isPrivateOrLoopback(ip: string): boolean {
  return isInRanges(ip, DEFAULT_TRUSTED_RANGES);
}
