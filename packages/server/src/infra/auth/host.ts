// Pure host normalize — lowercase + strip the `:port`, handling the bracketed IPv6 form
// (`[::1]:8788` → `::1`). Multiple auth callers need it: the owner-fallback origin gate (`dispatch.ts`)
// and the JWKS-allowlist host match (`config.ts`). Pure (no env, no I/O) → a `@orb/kit/net` candidate;
// kept infra-local while every consumer is infra (core/Tier-3-Infra.md Open decisions).

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
