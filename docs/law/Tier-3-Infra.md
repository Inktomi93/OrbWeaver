---
kind: law
status: active
updated: 2026-09-24
---

# Orbweaver — `infra`: the sealed I/O adapters (auth · crypto · network · storage · image)

**infra is a sealed executor.** Each adapter is a thin I/O handle a domain *injects* and calls. No adapter reaches UP into a domain, and none imports `@orb/db`; db-dependent steps are injected in. The providers execution tier lives in the `@orb/inference` package; its law is `docs/law/Tier-3b-Providers.md`.

## What this tier owns

Each sealed adapter is a factory returning an opaque handle. `entry/` constructs it once and injects it. The adapter knows nothing about the domain that calls it.

### `infra/auth` — verification + the 4-mode dispatcher

The db-free Strategy executor turning request `Headers` (+ the raw TCP peer) into a pre-row `ResolvedIdentity` (or `null`). One contract (`contract.ts`: `AuthConfig`/`ResolveDeps`/`IdentityResolution`/`ModeResolver` + the NEW MODE CHECKLIST), four modes (`single-user | local | forward-header | oidc`) behind ONE dispatcher (`dispatch.ts`: `MODE_RESOLVERS` + the loopback-peer-gated owner fallback). Owns:

- **The mode dispatcher** — `resolve(headers, deps)` + `ownerFallbackAllowed(peerIp, headers)` (a LOOPBACK TCP peer on a request with no relay tell, never the client `Host`: a proxy can rewrite `Host`, so it is not a fact about the network). ONE branch point; modes never import each other.
- **JWT/JWKS verification** (`jwks.ts`) — `jwksFor` (fail-closed JWKS build from the forwarded literal-or-URL; LRU-bounded, sha256-keyed, `ASSUMES(single-replica)`) + jose `jwtVerify` with a pinned RS256/ES256 alg allowlist, composed by `createForwardJwtVerifier()` into the `ForwardJwtVerifier` port the seam injects (`verifyForwardJwt`, wired at `entry/lifecycle.ts`).
- **The Host allowlist decision** (`host-allowlist.ts`) — `refusedHost` + the throttled `host_not_allowed` notice; `entry/http/host-allowlist.ts` mounts it before the principal resolves. Deny-only (see "The Host allowlist refuses; it never admits").
- **The pre-row `ResolvedIdentity`** — `{ externalId, handle, groups, email }` (`@orb/contracts/identity`); **NO `userId`** and NO `role` by design (infra must not know DB row ids).
- **The per-request signals** — the `IdentityResolution` envelope `{ identity, via, hasCsrfHeader }` (`contract.ts`), where infra's `via` is `"header" | "fallback"` only (`"cookie"` is the seam's own, post-D40) and `hasCsrfHeader` comes from `csrf.ts`; the CSRF gate itself is enforced at the seam/ladder.
- **Mint-side crypto** (`password.ts`) — scrypt + `SESSION_SECRET` pepper + constant-time verify + the dummy-hash enumeration floor; consumed by the entry login route.
- **Post-D40 (Route A): the cookie modes are inert at infra.** `modes/cookie-session.ts` resolves `null` and homes only the cookie names, one per request transport (`sessionCookieFor`: `__Host-orb_session` over https, `orb_session_insecure` over plain http); `transport.ts` decides the transport per request, `https` only when a trusted hop sends `X-Forwarded-Proto: https`. The cookie→user read is the DOMAIN step `sessions.validate(token)` (returns `userId`), called DIRECTLY by the seam BEFORE infra's `resolve`. There is deliberately no `validateCookie`/`upsertUser`/`determineRole` in `ResolveDeps` — an infra port for validation would be forced to drop the `userId` (invariant 3), reintroducing the "validate threw the id away" bug.

### `infra/crypto` — the `SecretBox` + the boot secrets path

- **`secrets.ts`** — `createSecretBox(key)` → AES-256-GCM `{ enabled, encrypt(plaintext, aad), decrypt(sealed, aad) }`; fresh 12-byte IV per seal; the `Sealed` `{ciphertext, iv, tag}` shape. **Carries the `aad` parameter, never derives the value** (the `${userId}|${provider}` string is `domain/credentials`' single `aadFor()` site).
- **`key.ts`** — `resolveCredentialsKey` and `resolveSessionSecret`: an explicit `CREDENTIALS_KEY` (hex OR base64, exactly 32 bytes) or `SESSION_SECRET` always wins; otherwise each reads its keyfile under the data layout's `secrets/` dir (`credentials_key`, `session_secret`; mode 0600, the names in `foundation/data-layout`). A keyfile that exists but cannot be used resolves to `null` and is never replaced; a keyfile that does not exist yet resolves to `absent` and is NOT written here. **Never throws at boot**: `entry/boot/boot-secrets.ts` settles an `absent` keyfile after the schema migrations — generated through `loadOrCreateKeyfile` when no row depends on it, a boot refusal naming the file when one does (a sealed credential row for the key; a password hash, a session row or a live chat invite for the pepper). A `null` credentials key is a disabled box; encrypt/decrypt throw at CALL time only. A `null` session secret makes `entry/lifecycle.ts` refuse a cookie mode. The generated value never enters `process.env`.

### `infra/network` — raw fetch adapters + the SSRF/edge checks

- **`image-guard.ts`** — the image-fetch guard (size/content-type/redirect checks) over `safeFetch`, consumed by avatar-by-URL and hub-import image fetches.
- **`egress.ts`** — `installEgressFirewall()` (the first boot step in `entry/lifecycle.ts`; a no-op unless `EGRESS_FIREWALL` is set): swaps undici's global dispatcher for one with TWO gates — (1) a DNS lookup that rejects private/loopback/Tailscale *resolved* addresses and hands the resolved address straight to connect (closing the DNS-rebind TOCTOU), AND (2) a connector-level pre-check that rejects a private **IP-literal** target (v4/v6, bracket-tolerant) before the socket opens — both exempt any host in `EGRESS_ALLOWLIST` (the OIDC issuer host is auto-added, so enabling the firewall never breaks a LAN issuer) — because undici only invokes the lookup for hostnames needing DNS, so an IP-literal target would otherwise bypass gate 1 (every practical SSRF vector uses an IP literal). Plus `safeFetch` — the defense-in-depth wrapper for user-supplied-URL features: size cap, content-type allowlist, redirect cap with per-hop re-validation, forwarded headers, single-use body guard. Endpoint model discovery lives in `@orb/inference`; its direct fetch is judged by the deployment's F12 admission before the dial and by this module's global dispatcher at connect time. The IP certificate's ACME client is the one server egress outside both gates; the header of `egress.ts` records why (D269).
- **The ingress IP allowlist** (`ingress.ts`) — `ipAllowlistMiddleware(cidrs)` + `clientIp(c)` (peer-vs-XFF trust precedence), mounted by `entry/app.ts`. `isTrustedHop` is the one trusted-proxy predicate: the `X-Forwarded-For` read here and the `X-Forwarded-Proto` read in `infra/auth/transport.ts` both use it.
- **`ip-ranges.ts`** — the pure CIDR matcher all checks share, including the auth owner-fallback LOOPBACK-peer gate (`isInRanges(peerIp, ["127.0.0.0/8","::1/128"])`, `infra/auth/dispatch.ts`). The literal parse it matches with is `@orb/kit/ip`, shared with the setup wizard through `@orb/kit/allowed-hosts`; it returns null on malformed input and never throws, because request headers reach it.

### `infra/storage` — the content-addressed byte store + the archive codec

- **`cas.ts`** — the per-user CAS (`<owner>/ab/cd/<hash>`, D21 — no cross-user byte-dedup/existence-oracle; ownership is gated ABOVE it by the assets domain + the owner-gated `/blob` route). Crash-atomic write; write-once dedup with an injected-clock mtime bump for GC's grace window.
- **`variant-cache.ts`** — the derived-webp cache, sibling to the CAS; atomic but `fsync:false` (reproducible from the original).
- **`zip.ts`** — the streaming zip codec (`packZip` for export download, `extractZip` for hub/upload import). `extractZip` is the hostile-input boundary: buffers the archive under a cap, parses the CENTRAL directory (NEVER the local headers — a crafted archive can desync them), validates each entry before inflating, then stages inflated bytes to disk. The bit/shift/mask ops are the zip byte-format exemption.

### `infra/image` — the sharp adapter (D6)

`imageTransform` op injected into `domain/assets/verbs/resolve-variant` (width-snap = domain policy; sharp = infra I/O; the blob route never touches sharp). Strips ALL metadata (EXIF/GPS/XMP/ICC) while `.rotate()` bakes in orientation first; throws on non-image bytes (the validation seam assets leans on). Detail: `infra/image/index.ts` header.

NOT owned: identity RESOLUTION + the `users` upsert (→ `domain/sessions`); the auth seam (→ `entry/auth/seam.ts`); cookie I/O + mint routes (→ `entry/http/auth-routes.ts`); the OIDC PKCE transaction store (db-backed `oidc_transactions` → `domain/sessions/persistence/oidc-store.ts` — a db import CANNOT live in sealed infra); the AAD value (→ credentials); the assets INDEX/GC/variant policy (→ `domain/assets`); `isAssetHash` (a `@orb/kit/assets` pure guard storage imports DOWN as its path-traversal defense).

## The sealed-executor invariant

> **infra reaches DOWN (foundation, kit, contracts) only. A domain import FROM infra source is RED. A `@orb/db` import from infra is RED.** Domains consume infra through handles injected at `entry/`; db-dependent steps arrive injected IN.

The proof is `infra/auth`: it verifies forwarded JWTs and consumes the OIDC PKCE/state transaction (a DB read) yet imports neither `domain/sessions` nor `@orb/db` — those arrive via `ResolveDeps` (`verifyForwardJwt`, `oidcStore`), wired at the seam. Same pattern for storage (the `assets` row upsert is the domain's, around `cas.putBytes`) and crypto (key from entry, AAD from the domain). *Enforcement: dep-cruiser `infra-below-domain` + `infra-no-db`.*

Composition asymmetry: storage/crypto/network/image are *called by* domains via injected handles; `infra/auth` is *composed at the seam* and has its verification deps injected *into* it. All obey the same physics.

| Handle | Constructed at | Injected into |
| - | - | - |
| `SecretBox` | `entry/` boot | `credentials.context` |
| `installEgressFirewall()` | `entry/` boot | global undici dispatcher |
| `ipAllowlistMiddleware` | `entry/app.ts` | Hono chain |
| `refusedHost` + `createHostNotAllowedNotice` | `entry/app.ts` via `entry/http/host-allowlist.ts` | Hono chain, before the principal middleware |
| `Cas` / `VariantCache` | `entry/` | `assets.context`, export, the blob route |
| `imageTransform` | `entry/` | `assets.resolve-variant` |
| `resolve` + `ResolveDeps` | `entry/auth/seam.ts` | the seam calls infra; deps injected into infra |

## Spine intersections

- **§7.1 — the three-tier split:** verification = `infra/auth` (no `userId`); resolution + the `users` upsert = `domain/sessions` (`sessions.validate` called directly by the seam, D40); minting + the `Principal` = `entry/auth/seam.ts`. A 5th mode is a `tsc`-checked addition (`MODE_RESOLVERS` is a `Record<AuthConfig["mode"], ModeResolver>` mapped type + the NEW MODE CHECKLIST).
- **§7.2 — the generated boot secrets are an `infra/crypto` boot side-effect,** not a settings concern; "back up the data root except `cache/`" is the operator invariant, and `secrets/credentials_key` and `secrets/session_secret` ride in it beside `db/`. `password.ts` takes the pepper `entry/lifecycle.ts` resolved once, never reading env itself.
- **§7.4 — one home:** `ResolvedIdentity` → `@orb/contracts/identity`; `AuthConfig`/`ResolveDeps` → `infra/auth/contract.ts` (infra-internal); `SecretBox`/`Sealed`/`Cas`/`VariantCache` → adapter-own contracts (server-down only, NOT `@orb/contracts` — no client need).

## Esoteric quirks

**JWKS fails closed — every rejection returns `null`, never a 500, never a fall-through.** The forward-header signed path has FIVE fail-closed points: (1) JWT present but no meta-JWKS → reject (stripped/spoofed); (2) verify on but allowlist empty → refuse request-supplied JWKS entirely; (3) `jwksFor` nulls on bad-JSON/non-https/off-allowlist; (4) verified but no `preferred_username` → reject (never fall through to the unsigned path with a usernameless-but-valid JWT); (5) `jwtVerify` throws → reject. **A present-but-invalid JWT NEVER silently falls through to the unsigned path.**

**The GCM AAD binding.** `aad` binds `${userId}|${provider}` into the GCM tag; a row moved to a different slot fails tag verification loudly — never a silent wrong decrypt. The string must stay byte-identical across refactors; the box carries it verbatim and is the wrong place to "normalize" it.

**The box degrades on a bad secret and refuses on a missing one that data depends on.** Malformed/wrong-length explicit key → `enabled:false`. A keyfile that exists but is corrupt or unreadable fails closed and is never overwritten: a new value would orphan every stored credential, or every local password and session. A keyfile that does not exist is generated only when nothing in the db depends on it; otherwise the boot stops in `entry/boot/boot-secrets.ts` with a message naming the file, because a regenerated secret would orphan the same rows silently. A new keyfile is written to a private temp file and hard-linked into place, so two racing boots share the one key that wins, and a planted symlink at the path is never written through. The first-boot write notice and the fault notice go to stderr (logger unavailable — `logger → env → crypto` would cycle), silenced under `NODE_ENV=test`.

**CAS fsync vs variant-cache no-fsync — the deliberate durability asymmetry.** The CAS is CANON: temp under `rootDir/.tmp` (same filesystem — a cross-device rename silently degrades to non-atomic copy) → fsync file → rename → EXPLICIT `fsyncDir(parent)` (`atomically` never fsyncs the directory). The variant cache is reproducible, so `fsync:false`. Dedup bumps the existing blob's mtime (injected clock) so GC's grace window protects deduped re-imports; `ENOENT` there = concurrent GC swept it → write fresh.

**`isAssetHash` is the path-traversal guard.** `cas.blobPath`, the variant paths, and the blob route all THROW on a non-64-hex hash (can't contain `/` or `..`). It lives in `@orb/kit/assets`; storage imports it DOWN.

**CSRF: infra PRODUCES the signal, the gate is SPLIT above it.** Infra yields `via` + `hasCsrfHeader`; enforcement lives at the seam + the route/procedure ladder, split by content-type: the four CORS-simple byte-ingest routes gate `via !== "header"` (cookie AND the loopback fallback both need `x-orb-csrf`), tRPC keys on `cookie` only. `SameSite=Lax` + the custom header is the whole CSRF story; that split and the OPEN tRPC finding live in `Spine-Identity-and-Auth.md` invariant 9, which is that gate's one home.

**The owner-fallback gate reads the raw LOOPBACK TCP PEER, never the `Host` header.** `ownerFallbackAllowed(peerIp, headers)` (`dispatch.ts`) is true iff the socket peer is in `127.0.0.0/8`/`::1` — the unspoofable value the kernel reports — and the request carries no relay tell; `undefined` fails closed. It is ONE rule across all four modes, **`single-user` included: its fallback is not unconditional**, so a non-loopback caller in single-user authenticates nobody and 401s. The old Host/trusted-ranges gate and its TRUSTED_LOCAL_HOSTS env are deleted: a client-supplied `Host:` is never a fact about the network — a proxy/vite `changeOrigin` hop can launder a LAN request into a loopback-looking Host — so the gate must not read it.

**A relayed request is never the operator.** A same-host proxy or tunnel (cloudflared, `tailscale serve`, Caddy or nginx on `127.0.0.1`) makes every external request a loopback peer. `forwarded.ts::hasForwardingHeader` refuses the fallback, on every peer and in every mode, when any of `forwarded`, `x-forwarded-for`, `x-real-ip`, `cf-connecting-ip`, `x-forwarded-proto` or `x-forwarded-host` is present; presence is the signal, never the value. The refusal logs one `owner_fallback_relayed` line per TCP peer per hour (`relay-notice.ts`), because a tunnel sends every visitor from one peer. The same predicate gates the local first-run owner-password claim and its `localFirstRun` flag. The dev vite proxy sends none of these, because it does not set http-proxy's `xfwd` option. The guard fails open for a relay that sends no forwarding header, which is why prod + an SSO mode + `AUTH_FALLBACK=owner` stays boot-fatal in `foundation/env` unless `AUTH_BREAK_GLASS=true`.

**The Host allowlist refuses; it never admits.** A page on a name its owner rebinds to `127.0.0.1` is same-origin with this server. Its requests arrive on a loopback socket with no relay tell, so the owner fallback, the local first-run claim and a loopback-trusted forward-header proxy would all serve it. A browser cannot set `Host`, so `host-allowlist.ts::refusedHost` judges it before the principal resolves, in every mode, with no off switch. localhost, `*.localhost` and IP literals pass. On bare metal the machine's own name and `<name>.local` pass too: a rebinding page controls DNS only for its own domain, so it cannot make the victim resolve the victim machine's name to it, and the residual is an mDNS spoofer already on the LAN. In a container that name is a random id and is not admitted. Any other name must be in `ALLOWED_HOSTS` or be an `OIDC_REDIRECT_URIS` host. The grammar is `@orb/kit/allowed-hosts`, shared with the setup wizard; a dot-led entry over one label (`.com`, `.lan`) is a parse refusal, because it admits a whole top-level domain. `X-Forwarded-Host` from a trusted hop is judged beside `Host`, never instead of it: loopback is a trusted hop, so the rebinding page can send that header too. A passing host grants nothing, because the peer gate and the relay tell still decide the owner fallback. A refusal is a 421 that names the host and the fix, and logs one `host_not_allowed` line per host per hour.

**`password.ts` — pepper, constant-time floor, loud-on-misconfig.** Passwords are HMAC-peppered with `SESSION_SECRET` before scrypt (a stolen DB alone can't offline-brute-force); `pepper()` THROWS if `SESSION_SECRET` is unset. Unknown/SSO-only handles verify against `DUMMY_PASSWORD_HASH` so scrypt always runs (defeats the enumeration timing oracle). Cost pinned (`N=2^15,r=8,p=1`); format `scrypt$salt$hash` carries an algo prefix for lazy KDF migration. **Rotating `SESSION_SECRET` invalidates all local passwords.**

**Ingress `clientIp` — peer-vs-XFF trust precedence.** Start from the un-spoofable socket peer; only when the peer is a trusted proxy (private/loopback, or in `FORWARD_AUTH_TRUSTED_PROXIES`) is `X-Forwarded-For` read, from the right: skip trusted hops and take the first untrusted one. Never the leftmost entry: an appending proxy keeps the client's own value there, so reading it lets a visitor reset the login throttle or pass `IP_ALLOWLIST`. A direct public peer's forwarded headers are ignored, and `X-Real-IP` is never read (one canonical forwarded header, not a second spoofable parse path — D77). Loopback is ALWAYS allowed (self-lockout backstop). The same resolver feeds the tRPC seam + the login throttle: one observed identity for all three gates.

**The egress firewall resolves DNS once** and passes the resolved address straight to connect (rebinding-safe), always allows the OIDC issuer host (plus any `EGRESS_ALLOWLIST` host), blocks if ANY resolved address is private.

## Invariants

1. **infra reaches DOWN only — no domain import, no `@orb/db` import.** *(dep-cruiser `infra-below-domain` + `infra-no-db`; the oidc-store's db import is why it lives in `domain/sessions`.)*
2. **Verification deps are INJECTED (`ResolveDeps`), never imported; the cookie→user step is the seam's direct `sessions.validate` call, never an infra port (D40).** *(compile-time + `infra-no-db`.)*
3. **`ResolvedIdentity` carries NO `userId`.** *(compile-time; the seam adds it when building `Principal`.)*
4. **`MODE_RESOLVERS` is exhaustive over `AuthConfig["mode"]`.** *(mapped-type `Record` — a missing case fails `tsc`.)*
5. **JWKS/JWT verification fails closed** (all five points → `null`). *(test-time.)*
6. **`SecretBox` carries the `aad`, never derives it; AAD-swap → GCM failure, not silent wrong decrypt.** *(compile + test-time.)*
7. **The box degrades at boot, throws only at call.** *(test-time.)*
8. **CAS writes are crash-atomic + content-verified; CAS fsyncs, the variant cache does not.** *(test-time.)*
9. **Every storage path goes through `isAssetHash`.** *(guard-first + test-time.)*
10. **The egress firewall never re-resolves between check and connect.** *(test-time.)*
11. **A request for a host outside localhost, IP literals and the configured names is refused before the principal resolves, in every mode.** *(test-time: `tests/server/entry/lifecycle-host-allowlist.suite.int.test.ts` and the first-run lifecycle suite.)*

## Open decisions

- **`ip-ranges.ts` — the CIDR matcher stays in infra.** The literal parse moved to `@orb/kit/ip` because the setup wizard needs the same IP test. The matcher and the range sets have only infra consumers.
- **`safeFetch`** is wired; consumers today are the fetch helpers in `egress.ts`, the plugin membrane, and the entry-composed background/update/inline-image fetches. Endpoint model discovery is a distinct `@orb/inference` capability over direct fetch plus the global dispatcher; it is not an infra adapter.
