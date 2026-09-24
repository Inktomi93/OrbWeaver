// Pure host normalize — lowercase + strip the `:port`, handling the bracketed IPv6 form
// (`[::1]:8788` → `::1`). Its consumers are allowlist reads: the JWKS-URL host match (`jwks.ts`), the
// allowlist/issuer parse that feeds it (`config.ts`), and the request Host allowlist (`host-allowlist.ts`,
// deny-only). It is NOT part of the owner-fallback gate: `dispatch.ts` gates on the raw loopback TCP peer,
// because a `Host:` header is not a fact about the network. Pure (no env, no I/O) → a `@orb/kit/net`
// candidate; kept infra-local while every consumer is infra (docs/law/Tier-3-Infra.md Open decisions).

export function normalizeHost(host: string): string {
  const h = host.trim().toLowerCase();
  if (h.startsWith("[")) {
    const end = h.indexOf("]");
    // Inside the brackets (a bare IPv6 literal); tolerate a missing close-bracket.
    return end === -1 ? h.slice(1) : h.slice(1, end);
  }
  const colon = h.indexOf(":");
  // A single colon = host:port (IPv4/hostname); many colons = a bare IPv6 literal (leave intact).
  if (colon !== -1 && colon === h.lastIndexOf(":")) {
    return h.slice(0, colon);
  }
  return h;
}
