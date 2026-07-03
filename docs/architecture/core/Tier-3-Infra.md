# Orbweaver — `infra`: the sealed I/O adapters (auth · crypto · network · storage)

> **Status: planning (target spec).** Ground-truth: whole-file recon of neo-tavern's
> `src/server/auth/` (20 files) + `auth-context.ts`, `src/server/crypto/secrets.ts`,
> `src/server/network/` (`egress-firewall.ts`, `ingress-allowlist.ts`, `ip-ranges.ts`),
> `src/server/storage/` (`cas.ts`, `variant-cache.ts`, `zip-extract.ts`), and the one misfiled raw
> adapter `domain/credentials/persistence/openai-models.ts`. **`providers` is excluded — it gets its
> own survey.** The defining design line: **infra is a sealed executor.** Each of the four adapters is
> a thin I/O handle a domain _injects_ and calls; none of them reach UP into a domain, and (the load-
> bearing physics) **none of them import `@orb/db`** — the db-dependent steps are injected in. Authoritative
> upstream: `Core-0-Architecture-and-Structure.md` §3 (the tier list — `entry→transport→domain→infra→foundation→kit`, imports
> flow DOWN), §7 (the 13 legibility gates); `AGENTS.md` §2 (one-directional hard rule), §3 (the
> `→ infra` taxonomy row: "external I/O adapter — provider, crypto, storage, network, auth
> verification"), §7.1 (identity/auth spine — **auth VERIFICATION is infra; identity RESOLUTION + the
> users-row upsert is `domain/sessions`**); `core/Core-Legacy-Migration-and-Gaps.md` §0 (kit-purity LOCKED),
> §5 (`openai-models` → `infra/network`); the adjacent domain docs `domain/sessions` (the auth
> seam split), `domain/credentials` (the crypto seam + AAD belt), `domains/assets.md` (the CAS
> byte-store vs the assets-domain index split).

---

## What this tier owns

Four sealed adapters. Each is a factory that returns an opaque handle (`SecretBox`, `Cas`,
`AuthResolver`-input resolver, a `fetch` op); the composition root (`entry/`) constructs it once and
injects it into whichever domain needs it. The adapter knows nothing about the domain that calls it.

### `infra/auth` — JWT/JWKS verification + the 4-mode dispatcher

The db-free Strategy executor that turns request `Headers` into a pre-row `ResolvedIdentity` (or
`null`). One contract (`AuthConfig` / `ResolveDeps` / `ModeResolver`), four pluggable modes
(`single-user | local | forward-header | oidc`) behind ONE dispatcher (`MODE_RESOLVERS`), shared pure
helpers (JWKS cache, cookie read, CSRF signal, host normalize, config parse, password KDF). It owns:

- **The mode dispatcher** — `resolveIdentity(headers, config, deps)`: looks up `MODE_RESOLVERS[mode]`,
  runs it, then applies the **origin-gated owner fallback** (`ownerFallbackAllowed` / `isLocalOrigin`).
  ONE branch point; modes never import each other.
- **The four mode resolvers** — `single-user` (always-null → unconditional fallback), `local` + `oidc`
  (both delegate to the shared cookie resolver; only the MINT side differs), `forward-header` (the
  signed-JWT and unsigned-network-trust paths). _(Per ledger **D40** the cookie modes' token→user read is
  being lifted OUT of infra to the seam's direct `sessions.validate` call at 4c/4e — infra carries no
  `userId`; see the seam table. The `oidc` MINT side — discovery + PKCE + code
  exchange via `openid-client` v6 — lives at `entry/http/auth-routes.ts` (`core/Tier-5-Entry.md` › Runtime
  dependencies), not here: infra owns **verify** with `jose`, entry owns the client-side mint.)_
- **JWT/JWKS verification** — `jwksFor` (build a jose keyset from the forwarded `X-Authentik-Meta-Jwks`
  literal-or-URL, **fails closed** on bad JSON / non-https / off-allowlist; LRU-bounded, sha256-keyed),
  `jwtVerify` with a pinned alg allowlist + optional iss/aud.
- **The pre-row `ResolvedIdentity`** — `{ externalId, handle, groups }`, branded at the cast seam in the
  resolver. **NO `userId`** by design: infra must not know DB row ids.
- **The per-request CSRF + fallback signals** — `viaCookie` (a cookie request has cross-site surface),
  `viaFallback` (the SAFE "this is the owner" discriminator), `hasCsrfHeader`.
- **Mint-side crypto** — `password.ts` (scrypt + `SESSION_SECRET` pepper + constant-time verify + the
  dummy-hash enumeration floor). Pure `node:crypto`; reads env DOWN; consumed by the entry login route.

### `infra/crypto` — the `SecretBox` (AES-256-GCM) + the auto-key boot path

- **`SecretBox`** — `createSecretBox(key)` → `{ enabled, encrypt(plaintext, aad), decrypt(sealed, aad) }`.
  AES-256-GCM, fresh 12-byte IV per seal, GCM auth tag. **Carries the `aad` parameter; never derives the
  value** (the `${userId}|${provider}` string is supplied by `domain/credentials`).
- **The boot key path** — `credentialsKeyFromEnv()` / `resolveAutoKey()`: decode `CREDENTIALS_KEY`
  (hex OR base64, validated at exactly 32 bytes), or the `CREDENTIALS_KEY_AUTO` path (generate +
  persist `.credentials-key` mode 0600 next to the DB). **Degrades, never throws at boot:** no/invalid
  key → a _disabled_ box (`enabled:false`; encrypt/decrypt throw at CALL time, the store rejects writes).
- **The `Sealed` shape** — `{ ciphertext, iv, tag }` (all base64); the on-disk blob stored on
  `user_credentials`.

### `infra/network` — raw fetch adapters + the SSRF/edge belts

- **The `/models` probe** — `fetchOpenAiModels({ baseUrl, apiKey, headers })`: `GET {baseUrl}/models`
  against a USER-supplied OpenAI-compatible endpoint. Best-effort: any failure returns `[]`, never
  throws, logs a redacted error. (Moved here from `domain/credentials/persistence/`.)
- **The egress SSRF firewall** — `installEgressFirewall()`: swaps undici's global dispatcher for one
  whose DNS lookup **rejects private/loopback/Tailscale resolved addresses** and hands the _resolved_
  address straight to connect (closing the DNS-rebind TOCTOU). Plus `safeFetch` (staged, unwired):
  response-size cap, content-type allowlist, max-redirects cap, single-use body guard.
- **The ingress IP allowlist** — `ipAllowlistMiddleware(cidrs)` + `clientIp(c)` (peer-vs-XFF trust
  precedence). A blunt network gate mounted in front of everything; loopback always allowed.
- **The shared CIDR matcher** — `parseIp` / `matchesCidr` / `isInRanges` / `DEFAULT_TRUSTED_RANGES` /
  `isPrivateOrLoopback` (v4 + v6 incl. IPv4-mapped). Pure — the substrate all three belts AND
  `infra/auth`'s origin gate share.

### `infra/storage` — the content-addressed byte store

- **The CAS** — `createCas(rootDir)` → `Cas` (`putBytes`/`read`/`exists`/`verify`/`remove`/`listHashes`/
  `blobPath`). **Per-user keyed** `<owner>/ab/cd/<hash>` (ledger D21 — assets are per-user, not global; no
  cross-user byte-dedup/existence-oracle, within-user dedup preserved); `blobPath` takes the owner +
  hash. The byte store is a sealed adapter; **ownership is gated above it** (the `domain/assets`
  `fetchOwned` + the owner-gated `/blob` route — caddy skips forward-auth so `<img>` GETs aren't bounced,
  the app gates via the session cookie). Crash-atomic write (temp-under-root →
  fsync file → rename → **fsync dir**); write-once dedup with an mtime bump for GC's grace window.
- **The variant cache** — `createVariantCache(rootDir)` → `VariantCache` (`read`/`put`/`removeAll`).
  Derived-webp cache, sibling to the CAS, per-hash directory. Atomic but **`fsync:false`** — it's a
  cache, reproducible from the CAS original.
- **The archive extractor** — `extractZipToDir(bytes|stream, destDir, opts)`: streaming zip extraction
  with zip-bomb (declared + streamed byte caps, compression allowlist), zip-slip, and CPU-DoS
  (`terminate()`) defenses; serves the **import** flow.

---

This tier does **NOT** own:

- **Identity RESOLUTION + the `users`-row upsert** — `provisionIdentity` / `ensureUser` / `validate` /
  `determineRole`. That is `domain/sessions`. `infra/auth` _produces_ a `ResolvedIdentity` and _injects
  out_ the need for a `users` row. The cookie→user resolution is NOT an infra port: per ledger **D40** it
  is the DOMAIN step `sessions.validate` (which returns `userId`), called DIRECTLY by the seam — equating
  it with an injected `ResolveDeps` port would force the row id to be dropped (infra carries no `userId`,
  invariant #3), recreating neo's "validate threw the id away" bug.
- **The composition-root auth SEAM** — `createAuthResolver` / `resolveOwner` (today `auth-context.ts`).
  The ONE place allowed to wire `infra/auth` + `domain/sessions` together. → `entry/auth/seam.ts`.
- **Cookie I/O + the mint routes** — `setSessionCookie` / `clearSessionCookie` / `refreshSessionCookie`
  - the `__Host-neo_session` name + `local/routes.ts` + `oidc/routes.ts`. The route layer (`entry/http`).
- **The OIDC PKCE transaction store** — `oidc-store.ts`. It is **db-backed** (`oidc_transactions` table)
  so it CANNOT live in sealed infra (see §Conflicts). → `domain/sessions` persistence (or `entry`).
- **The AAD VALUE** — `${userId}|${provider}`. `infra/crypto` carries the `aad` param byte-for-byte;
  the single `aadFor()` production site is `domain/credentials/persistence/aad.ts`.
- **The `ResolvedCredential` brand / `CredentialHealth`** — `@orb/contracts/credentials` (consumed by
  `infra/providers` runners, out of this slice).
- **The assets INDEX** — the `assets` table, `storeBlob` coherence primitive, GC/reap, variant-sizing
  policy (`BLOB_WIDTHS`/`snapBlobWidth`). That is `domain/assets`. Storage owns BYTES; the domain owns
  the blob↔row pair.
- **The `isAssetHash` guard itself** — it's a pure primitive in `@orb/kit/assets`; storage _imports it
  down_ as its path-traversal guard but does not own it.

---

## The sealed-executor invariant (the tier's whole reason for existing)

> **infra reaches DOWN (foundation, kit) only. A domain import FROM infra is RED. A `@orb/db` import
> from infra is RED.** Domains consume infra through handles injected at `entry/`; the db-dependent
> steps an adapter needs are injected IN (never imported).

The cleanest proof is `infra/auth`: it must verify a forwarded JWT (crypto) and consume an OIDC
PKCE/state transaction (a DB read), yet it imports neither `domain/sessions` nor `@orb/db`. Those steps
arrive through `ResolveDeps` (`verifyForwardJwt`, `oidcStore`), wired at the `entry/` seam. (The
cookie→user read is deliberately NOT one of these injected steps: per ledger **D40** it is RESOLUTION,
not verification — the DOMAIN step `sessions.validate` the seam calls directly, because a cookie's
validation IS a `users`-row read and infra must not carry the resulting `userId`, invariant #3.) The
same pattern holds for storage
(the `assets` row upsert is the _domain's_ job, around a `cas.putBytes` call) and crypto (the box gets
its key from `entry/`, the AAD value from the domain). _Enforcement: resolve-time_ — `@orb/server`'s
infra tier declares no dep that would let it resolve `domain/*` or reach `@orb/db` (package + subpath
physics); _lint backstop_ — dep-cruiser `infra-no-domain` + `infra-no-db`.

---

## Internal layout

```
infra/
├── auth/                        SEALED auth-VERIFICATION executor (db-free; ResolveDeps inject the db steps)
│   ├── index.ts                 front door — resolveIdentity + the cross-mode contract types
│   ├── contract.ts              AuthConfig · ResolveDeps · IdentityResolution · ModeResolver + NEW MODE CHECKLIST
│   ├── dispatch.ts              resolveIdentity (MODE_RESOLVERS record) + ownerFallbackAllowed + isLocalOrigin
│   ├── modes/
│   │   ├── single-user.ts       always-null → the unconditional fallback takes over
│   │   ├── local.ts             delegates to cookie-session
│   │   ├── oidc.ts              delegates to cookie-session
│   │   └── forward-header.ts    signed-JWT path + unsigned network-trust path + opt-in IP gate
│   ├── jwks.ts                  jwksFor (fail-closed JWKS build) + the LRU (ASSUMES single-replica)
│   ├── cookie-session.ts        read __Host cookie (validate is DOMAIN: seam calls sessions.validate — D40, port removed 4c/4e)
│   ├── csrf.ts                  hasCsrfHeader (the viaCookie-gated mutation signal)
│   ├── host.ts                  normalizeHost (port-strip, IPv6-bracket-aware)   ← kit candidate (pure)
│   ├── config.ts                authConfigFromEnv (reads foundation/env DOWN) + CSV/host-list parse
│   └── password.ts              scrypt + SESSION_SECRET pepper + dummy-hash floor (mint-side crypto)
├── crypto/
│   ├── secrets.ts               SecretBox (AES-256-GCM) + Sealed; carries aad, never derives it
│   └── key.ts                   credentialsKeyFromEnv / resolveAutoKey (CREDENTIALS_KEY_AUTO boot path)
├── network/
│   ├── openai-models.ts         fetchOpenAiModels — raw /models probe vs a user URL (best-effort, never throws)
│   ├── egress.ts                installEgressFirewall (SSRF/DNS-rebind) + safeFetch (staged seam)
│   ├── ingress.ts               ipAllowlistMiddleware + clientIp (edge belt; mounted by entry/app.ts)
│   └── ip-ranges.ts             parseIp/matchesCidr/isInRanges/DEFAULT_TRUSTED_RANGES   ← kit candidate (pure)
└── storage/
    ├── cas.ts                   Cas — sharded blob I/O, crash-atomic write+fsync, dedup, listHashes
    ├── variant-cache.ts         VariantCache — derived-webp cache, atomic but fsync:false
    └── zip-extract.ts           extractZipToDir — zip-bomb/zip-slip/CPU-DoS defenses (import flow)
```

`infra/auth` is the only adapter big enough to want the front-door/contract split; crypto, network and
storage export their factories + handle interfaces directly (they have no public interface a consumer
gates on beyond the handle type).

---

## Movement table

| Unit                                                                                                         | Outcome                             | Target                                           | Rationale                                                                                                                                                                                                                                     | Enforcement tier                                                                                              |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `auth/trust-header.ts` — `resolveIdentity` (MODE_RESOLVERS) + `ownerFallbackAllowed` + `isLocalOrigin`       | stays infra, renamed                | `infra/auth/dispatch.ts`                         | The one branch point of the verification strategy. Pure dispatch + the origin gate; no db.                                                                                                                                                    | resolve-time (infra below domain) + compile-time (the `Record<AuthConfig["mode"], ModeResolver>` mapped type) |
| `auth/identity.ts` — `AuthConfig`, `ResolveDeps`, `IdentityResolution`, `ModeResolver`, NEW MODE CHECKLIST   | stays infra                         | `infra/auth/contract.ts`                         | The infra-internal cross-mode contract (mode shape + the injected db-deps). Not cross-package — infra-internal.                                                                                                                               | resolve-time                                                                                                  |
| `auth/{single-user,local,oidc,forward-header}/resolver.ts`                                                   | stays infra                         | `infra/auth/modes/<mode>.ts`                     | The pluggable mode strategies. db-free; per **D40** the cookie modes' token→user read moves to the seam's direct `sessions.validate` call (the `validateCookie` injection is removed at 4c/4e), leaving infra the verify paths only.          | resolve-time + compile-time (each `satisfies ModeResolver`)                                                   |
| `auth/_shared/jwks-cache.ts` — `jwksFor` + the LRU                                                           | stays infra                         | `infra/auth/jwks.ts`                             | JWT/JWKS verification is the core infra job. The per-process LRU is `ASSUMES(single-replica)` state.                                                                                                                                          | lint-time (`infra-jwks-cache` ASSUMES marker, same gate pattern as credentials' health cache)                 |
| `auth/_shared/cookie-resolver.ts` — `resolveCookieSession`                                                   | stays infra (until 4c/4e)           | `infra/auth/cookie-session.ts`                   | Reads the opaque token from the cookie header. Per **D40** the cookie→user read is RESOLUTION, not verification: the `validateCookie` injection is REMOVED at 4c/4e and the seam calls `sessions.validate` directly (which returns `userId`). | resolve-time                                                                                                  |
| `auth/_shared/csrf.ts` — `hasCsrfHeader`                                                                     | stays infra                         | `infra/auth/csrf.ts`                             | Produces the per-request CSRF SIGNAL. The gate (403 on cookie-mutation w/o header) is enforced at the seam/route.                                                                                                                             | resolve-time                                                                                                  |
| `auth/_shared/host.ts` — `normalizeHost`                                                                     | stays infra (kit candidate)         | `infra/auth/host.ts`                             | Pure host normalize used by the origin gate + JWKS allowlist match. Pure → could be `@orb/kit/net`; only infra consumers today.                                                                                                               | resolve-time (see Open decisions)                                                                             |
| `auth/_shared/config.ts` — `authConfigFromEnv` + parse helpers                                               | stays infra                         | `infra/auth/config.ts`                           | env → `AuthConfig`. Reads `foundation/env` DOWN (allowed). The fail-closed `jwksAllowlistFromEnv` lives here.                                                                                                                                 | resolve-time (foundation is below infra)                                                                      |
| `auth/_shared/password.ts` — scrypt + pepper + `verifyPassword` + `DUMMY_PASSWORD_HASH`                      | stays infra                         | `infra/auth/password.ts`                         | Mint-side credential-verification crypto (local mode). Pure `node:crypto`; reads `SESSION_SECRET` DOWN; consumed by the entry login route.                                                                                                    | resolve-time + test-time (round-trip; throws if `SESSION_SECRET` unset; constant-time)                        |
| `auth/_shared/oidc-store.ts` — `createOidcStore` (PKCE/state)                                                | **→ `domain/sessions/persistence`** | `domain/sessions/persistence/oidc-store.ts`      | **It imports `@orb/db` (`oidc_transactions`).** A db-dependent store CANNOT live in sealed infra (the `infra-no-db` physics). It is session-mint state. **RESOLVED 2026-06-25 — consistent with domain/sessions (ledger R5).**                    | resolve-time (`infra-no-db` would go RED if left in infra)                                                    |
| `auth/_shared/cookie.ts` — `setSessionCookie`/`clear`/`refresh` + `__Host-` name                             | **→ entry**                         | `entry/http/auth-routes.ts`                      | Cookie I/O is the route layer's job; the domain returns a token string. (Per domain/sessions.)                                                                                                                                                    | resolve-time                                                                                                  |
| `auth/{local,oidc}/routes.ts` — the mint handlers                                                            | **→ entry**                         | `entry/http/auth-routes.ts`                      | Session MINTING (PKCE machine, password verify, session insert, cookie set) is the route layer.                                                                                                                                               | resolve-time                                                                                                  |
| `auth-context.ts` — `createAuthResolver`, `resolveOwner`, `AuthResolver`, `OwnerResolution`                  | **→ entry (the seam)**              | `entry/auth/seam.ts`                             | The ONE place wiring `infra/auth` (verify) + `domain/sessions` (resolve/upsert). Builds the one `Principal`.                                                                                                                                  | resolve-time (`entry/` is topmost; may import both)                                                           |
| `auth/identity.ts` — `ResolvedIdentity` re-import                                                            | **→ contracts**                     | `@orb/contracts/identity`                        | Cross-boundary: infra/auth produces it, domain/sessions + the seam consume it. Branded cast lives at the producer (the resolver).                                                                                                             | resolve-time                                                                                                  |
| `crypto/secrets.ts` — `SecretBox`, `createSecretBox`, `Sealed`                                               | stays infra, split                  | `infra/crypto/secrets.ts`                        | The AES-256-GCM engine; the credentials domain's injected encryption seam. Carries `aad`, never derives it.                                                                                                                                   | resolve-time + test-time (round-trip; AAD-swap → GCM failure not silent wrong decrypt)                        |
| `crypto/secrets.ts` — `credentialsKeyFromEnv`, `resolveAutoKey`, `decode32Bytes`                             | stays infra, split                  | `infra/crypto/key.ts`                            | The boot key path (`CREDENTIALS_KEY` decode + `CREDENTIALS_KEY_AUTO`). Boot side-effect; the key is injected into `entry/` → `createSecretBox`.                                                                                               | resolve-time + test-time (unset/bad → disabled box, never throws at boot)                                     |
| `domain/credentials/persistence/openai-models.ts` — `fetchOpenAiModels`                                      | **→ infra**                         | `infra/network/openai-models.ts`                 | A raw `fetch()` vs a user-supplied URL is NOT a DB query. `persistence/` is queries only; the `fetch-models` verb calls this through an injected op. (Per shared-dissolution §5 + domain/credentials.)                                            | lint-time (`persistence-no-io`) + resolve-time                                                                |
| `network/egress-firewall.ts` — `installEgressFirewall`, `safeFetch`, `shouldBlockEgress`                     | stays infra                         | `infra/network/egress.ts`                        | The SSRF/DNS-rebind belt (`installEgressFirewall` wired at boot). `safeFetch` is a STAGED seam (zero callers — unwired ≠ worthless).                                                                                                          | resolve-time                                                                                                  |
| `network/ingress-allowlist.ts` — `ipAllowlistMiddleware`, `clientIp`, `peerAddress`                          | stays infra                         | `infra/network/ingress.ts`                       | The edge IP belt + the shared client-IP resolver (also used by the tRPC seam + local-login throttle). Hono middleware mounted by `entry/app.ts`.                                                                                              | resolve-time (entry mounts it; gray zone w/ transport — see Open decisions)                                   |
| `network/ip-ranges.ts` — `parseIp`/`matchesCidr`/`isInRanges`/`DEFAULT_TRUSTED_RANGES`/`isPrivateOrLoopback` | stays infra (kit candidate)         | `infra/network/ip-ranges.ts` (or `@orb/kit/net`) | Pure CIDR matcher (no env, no I/O, no `node:*`). Isomorphic-pure → `@orb/kit/net` by the kit-purity ruling; but every consumer is infra (auth + the two belts).                                                                               | resolve-time (see Open decisions)                                                                             |
| `storage/cas.ts` — `Cas`, `createCas`, `PutResult`                                                           | stays infra                         | `infra/storage/cas.ts`                           | The byte store. Pure filesystem adapter keyed by hash; imports only `@orb/kit` (`isAssetHash`) + `node:*` + `atomically`. **NEVER `@orb/db`.** (Per assets.md.)                                                                               | resolve-time (`infra-no-db`) + lint backstop                                                                  |
| `storage/variant-cache.ts` — `VariantCache`, `createVariantCache`                                            | stays infra                         | `infra/storage/variant-cache.ts`                 | Derived-image cache; reproducible-from-original (atomic, no fsync).                                                                                                                                                                           | resolve-time                                                                                                  |
| `storage/zip-extract.ts` — `extractZipToDir`                                                                 | stays infra                         | `infra/storage/zip-extract.ts`                   | Archive byte I/O with zip-bomb/zip-slip defenses; serves the import flow.                                                                                                                                                                     | resolve-time                                                                                                  |
| `shared/_kit/assets.ts` — `isAssetHash`                                                                      | **→ kit** (consumed by storage)     | `@orb/kit/assets`                                | Pure 64-hex guard; the path-traversal defense storage leans on. Storage imports it DOWN. (Per shared-dissolution §1 + assets.md.)                                                                                                             | resolve-time                                                                                                  |
| `shared/_kit/error-message.ts` — `errorMessage` (used by zip-extract + forward-header)                       | **→ kit**                           | `@orb/kit/error-message`                         | Pure primitive.                                                                                                                                                                                                                               | resolve-time                                                                                                  |

---

## Cross-tier composition (domains consume infra via injected handles)

No domain imports an infra internal. Every adapter is constructed once at `entry/` and threaded in as
an opaque handle on the domain's `context.ts`.

**`infra/crypto` → injected as `SecretBox`:**

| Handle                                                   | Constructed at | Injected into                                                       | Used for                                                                                      |
| -------------------------------------------------------- | -------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `SecretBox` (`createSecretBox(credentialsKeyFromEnv())`) | `entry/` boot  | `credentials.context` (and historically chat/buddy/models contexts) | seal/open per-user credential ciphertext; the box receives the `aad` value from `credentials` |

**`infra/network` → injected as fetch ops / mounted at boot:**

| Handle                         | Constructed at | Injected into / mounted                         | Used for                                          |
| ------------------------------ | -------------- | ----------------------------------------------- | ------------------------------------------------- |
| `fetchOpenAiModels` op         | `entry/`       | `credentials.context` (the `fetch-models` verb) | custom-endpoint `/models` discovery (best-effort) |
| `installEgressFirewall()`      | `entry/` boot  | global undici dispatcher                        | SSRF egress block (process-wide)                  |
| `ipAllowlistMiddleware(cidrs)` | `entry/app.ts` | Hono middleware chain                           | the edge IP gate (when `IP_ALLOWLIST` set)        |

**`infra/storage` → injected as `Cas` / `VariantCache`:**

| Handle                                     | Constructed at | Injected into                              | Used for                                                                    |
| ------------------------------------------ | -------------- | ------------------------------------------ | --------------------------------------------------------------------------- |
| `Cas` (`createCas(assetsDir)`)             | `entry/app.ts` | `assets.context`, `export.context`         | the `storeBlob` coherence primitive (CAS-put + row-upsert), export bundling |
| `VariantCache` (`createVariantCache(...)`) | `entry/app.ts` | `assets.context`, the blob route           | derived-webp serve + GC reap                                                |
| `extractZipToDir`                          | `entry/`       | the `import` flow (`entry/http/import.ts`) | archive intake                                                              |

**`infra/auth` → the inverse direction (it is injected INTO, then composed at the seam):**

| Handle                         | Wired at             | Direction            | Used for                                                                            |
| ------------------------------ | -------------------- | -------------------- | ----------------------------------------------------------------------------------- |
| `resolveIdentity`              | `entry/auth/seam.ts` | the seam CALLS infra | headers → `IdentityResolution` (pre-row identity + signals)                         |
| `ResolveDeps.verifyForwardJwt` | `entry/auth/seam.ts` | injected INTO infra  | the forward-header SIGNED path's jose JWT/JWKS verify — keeps infra crypto-dep-free |
| `ResolveDeps.oidcStore`        | `entry/auth/seam.ts` | injected INTO infra  | the db-backed OIDC PKCE/state single-use consume — keeps infra db-free              |

**NOT an infra port (ledger D40):** the cookie→user step is the DOMAIN call `sessions.validate` (which
returns `userId`), invoked DIRECTLY by the seam — never injected into infra. The former
`ResolveDeps.validateSessionCookie` (= `sessions.validate`) equation was the defect: a cookie's
validation IS a `users`-row read, so an infra port for it would be forced to DROP the `userId`
(invariant #3), recreating neo's "validate threw the id away" bug. The port is REMOVED from `ResolveDeps`
when 4c/4e land (the FLAG is planted at `contract.ts`'s `validateCookie` now). `infra/auth` owns only the
db-free verification paths: single-user, the forward-header verify, the OIDC PKCE verify, and the
origin-gated owner fallback.

The asymmetry is the point: storage/crypto/network are _called by_ domains; `infra/auth` is _composed
at the seam_ and has its db/crypto-dependent VERIFICATION steps injected _into_ it (the cookie→user
RESOLUTION step is the seam's own direct domain call, not an injection). All obey the same physics (no
domain/db import).

---

## Spine thread intersections

### §7.1 identity / auth / permission — three tiers, one dispatcher

The headline of the whole spine is the **three-tier split** that `domain/sessions` anchors and this
doc enforces from below:

- **Verification = `infra/auth`** (this tier). JWT/JWKS, the mode dispatch, the origin gate, the CSRF
  signal. Produces a `ResolvedIdentity` with **NO `userId`**.
- **Resolution + the `users` upsert = `domain/sessions`** (`provisionIdentity` / `ensureUser` /
  `validate` — the cookie→user read that returns `userId`, called directly by the seam per D40).
- **Minting + the owner-fallback `Principal` = `entry/auth/seam.ts`**; the boot owner-seed = `entry/boot`.

The 4 modes stay one clean dispatcher: `MODE_RESOLVERS: Record<AuthConfig["mode"], ModeResolver>`. A
5th mode is a `tsc`-checked addition (the NEW MODE CHECKLIST in `contract.ts`). The seam injects the
genuine VERIFICATION db/crypto steps (`oidcStore`, `verifyForwardJwt`) via `ResolveDeps` so verification
never imports domain/db; the cookie→user RESOLUTION step is the seam's direct `sessions.validate` call,
NOT an injected port (D40 — infra carries no `userId`).

### §7.2 settings / config — the `CREDENTIALS_KEY_AUTO` boot path is infra/crypto's

`CREDENTIALS_KEY_AUTO=true` → `infra/crypto/key.ts` writes `.credentials-key` (mode 0600) next to the
DB on first boot. This is an `infra/crypto` boot side-effect, NOT a settings concern. The
boot-fatal contract — **no key → disable the box, never crash** — lives here. The key VALUE comes from
`env.CREDENTIALS_KEY` via `foundation/env`; the box is constructed in `entry/` and injected down. The
**"back up `.credentials-key` alongside the DB"** invariant is documented here (the domain consumes the
box as an opaque injectable and doesn't know where the key came from). `password.ts`'s `SESSION_SECRET`
pepper is the same posture, also read DOWN from `foundation/env`.

### §7.4 types & schemas — one home, one direction

- `ResolvedIdentity` → `@orb/contracts/identity` (infra produces, domain/seam consume).
- `AuthConfig` / `ResolveDeps` / `IdentityResolution` / `ModeResolver` → `infra/auth/contract.ts`
  (infra-internal cross-mode contract; not cross-package).
- `SecretBox` / `Sealed` → `infra/crypto/secrets.ts` (the adapter's own contract; server consumers
  import down — **no client need, so NOT `@orb/contracts`**, same call assets.md makes for `Cas`).
- `Cas` / `VariantCache` / `PutResult` → `infra/storage` (adapter-own contract; server-down only).
- `ResolvedCredential` (brand) / `CredentialHealth` → `@orb/contracts/credentials` (produced by the
  credentials domain, consumed by `infra/providers` runners — out of this slice).

### §7.5 string-union dispatch discipline

`AuthConfig["mode"]` (`single-user | local | forward-header | oidc`) is the one dispatch union this
tier governs — exactly one importable union, dispatched through the `MODE_RESOLVERS` mapped-type Record
(the gold-standard pattern). Gate candidate: `exhaustive-dispatch` (a missing arm fails `tsc`).

---

## Esoteric / load-bearing quirks to preserve

**JWKS fails closed — every rejection returns `null`, never a 500, never a fall-through.** The
forward-header signed path has FIVE fail-closed points, all load-bearing: (1) `verifyForwardJwt && jwt
&& !metaJwks` → reject (a JWT without its JWKS is a stripped/spoofed request); (2) verify on but
`jwksAllowlist` empty → refuse the request-supplied JWKS entirely (no trusted key source ⇒ no trusted
signed path); (3) `jwksFor` returns null on bad-JSON / non-https / off-allowlist URL; (4) verified-but-
**no `preferred_username`** → reject (refuse to fall through to the unsigned header path with a
usernameless-but-valid JWT); (5) `jwtVerify` throws → reject. **A present-but-invalid JWT NEVER silently
falls through to the unsigned path** — that would defeat the cryptographic proof the operator asked for.
The `jwksFor` LRU is sha256-keyed + bounded at 32 to defeat a hostile upstream varying the header.

**The GCM AAD belt — row-lift is impossible without re-encryption, and the box never derives the value.**
`SecretBox.encrypt/decrypt` take `aad` as a parameter and bind it into the GCM tag; the value
`${userId}|${provider}` is supplied by `domain/credentials` from its single `aadFor()` site. A row
moved to a different `(userId, provider)` slot fails tag verification — a loud GCM error, not a silent
wrong decrypt. **The string must stay byte-identical** across any refactor; the box carries it verbatim
and is the wrong place to "normalize" it.

**`CREDENTIALS_KEY_AUTO` + the boot-fatal "disable, never crash".** `credentialsKeyFromEnv` returns
`null` for unset/malformed/wrong-length → `createSecretBox(null)` yields `enabled:false`; encrypt/decrypt
throw only at CALL time and the store rejects writes. The silent env host-key fallback was REMOVED
(2026-06). `decode32Bytes` accepts hex OR base64 (so `openssl rand -hex 32` and `-base64 32` both work),
gated strictly on the 32-byte length. A corrupt existing `.credentials-key` **fails closed** (returns
null — never overwrites; the operator must investigate). The first-boot auto-write notice goes to stderr
(the logger isn't available — `logger → env → crypto` would cycle) and is silenced under `VITEST`.

**CAS fsync vs variant-cache no-fsync — the deliberate durability asymmetry.** The CAS is CANON: temp
file under `rootDir/.tmp` (same filesystem, so the rename is atomic — a cross-device rename would
silently degrade to a non-atomic copy) → `atomically` fsyncs the file fd → rename → then an EXPLICIT
`fsyncDir(parent)` (because `atomically` never fsyncs the containing directory, so a power loss between
rename and the next sync could lose the dir entry). The variant cache is reproducible from the original,
so it writes atomically but with **`fsync:false`** — losing an entry on power loss is just a recompute.
The dedup path bumps the existing blob's mtime so GC's mtime grace window protects deduped re-imports;
an `ENOENT` there means a concurrent GC swept it → fall through and write fresh.

**`isAssetHash` is the path-traversal guard — and it's `@orb/kit`, used by storage.** `cas.blobPath`,
`variantCache.hashDir/variantPath`, and the blob route all THROW on a non-hash (a 64-hex string can't
contain `/` or `..`), so a hostile hash can't escape the sharded tree. The guard lives in
`@orb/kit/assets` (pure); storage imports it DOWN. Storage does not own it — but it depends on it.

**CSRF keys on `viaCookie`.** A cookie request carries cross-site surface; a header/fallback request
does not. `infra/auth` PRODUCES `viaCookie` + `hasCsrfHeader`; the gate (a cookie-authenticated MUTATION
without the custom `x-neo-csrf` header → 403) is ENFORCED at the seam (`resolveOwner`) and the
`authedProcedure` ladder — route/seam tier, not infra. `SameSite=Lax` + the custom header is the whole
CSRF story (a cross-site page can't set a custom header without a CORS preflight the app doesn't grant).

**The origin gate reads `Host`, not `X-Forwarded-Host` (fails closed).** `isLocalOrigin` (the owner-
fallback gate under SSO modes) deliberately reads `Host` — a proxy-rewritten host can only REMOVE trust,
never grant it. A hostname that won't parse as an IP → no match → SSO required. **Removing this gate
hands every anonymous public request owner+admin.** `single-user` mode's fallback is unconditional (the
only way in).

**Network fetch — never-throw + redaction + the staged hardening seam.** `fetchOpenAiModels` is
best-effort: any failure (unreachable, non-2xx, non-OpenAI shape) returns `[]` (the UI falls back to
manual entry), logging only a redacted error string — it never surfaces the user's endpoint/key in a
throw. The egress firewall resolves DNS ONCE and passes the resolved address straight to connect
(rebinding-safe), always allows the OIDC issuer host, and blocks if ANY resolved address is private.
`safeFetch` is the staged seam for the first user-supplied-URL feature (avatar-by-URL, webhooks): a
5 MB size cap (decompression-bomb defense), content-type allowlist, max-redirects cap with per-hop
re-validation, and a single-use body guard. Zero callers today — **unwired ≠ worthless**; it's the seam
to reach for, not residue to delete.

**`password.ts` — the pepper, the constant-time floor, the loud-on-misconfig throw.** Local passwords
are HMAC-peppered with `SESSION_SECRET` before scrypt (a stolen DB alone can't brute-force offline);
`pepper()` THROWS if `SESSION_SECRET` is unset (the earlier `?? ""` floor was a silent-forgery hazard).
Login verifies an unknown/SSO-only handle against `DUMMY_PASSWORD_HASH` so scrypt always runs — defeating
the username-enumeration timing oracle. scrypt cost is pinned explicitly (`N=2^15,r=8,p=1`, OWASP 2023)
so a Node default shift can't silently weaken or break existing hashes. The format `scrypt$salt$hash`
carries an algo prefix for lazy KDF migration. **Rotating `SESSION_SECRET` invalidates all local
passwords** (same blast radius as it invalidating sessions).

**zip-extract — five layered bomb/slip defenses.** (1) reject a DECLARED uncompressed size > per-entry
cap before decompressing; (2) count actual streamed bytes and abort an entry that exceeds its declared
size + cap (catches a lying header); (3) compression-method allowlist (only stored/deflate); (4) zip-slip
(any path resolving outside `destDir` is skipped); (5) `terminate()` on abort so fflate stops inflating
the rest of a bomb (a CPU DoS). Writes are serialized through a `writeChain` so peak memory is bounded to
~one entry's bytes, not the archive total. One bad entry is recorded in `skipped`, not thrown — the rest
of the archive still extracts.

**Ingress `clientIp` — peer-vs-XFF trust precedence.** Start from the un-spoofable socket peer; only when
the peer is itself private/loopback (a same-host proxy like Caddy) is the leftmost `X-Forwarded-For` /
`X-Real-IP` honored. A direct PUBLIC peer's forwarded headers are ignored, so a client can't prepend a
trusted IP to walk the allowlist. Loopback is ALWAYS allowed (a self-lockout backstop). The same resolver
feeds the tRPC seam + the local-login throttle so all three gate on one observed identity.

---

## Invariants (gate candidates)

1. **infra reaches DOWN only — no domain import, no `@orb/db` import.** _Enforcement: resolve-time
   (package + subpath physics) + lint backstop (dep-cruiser `infra-no-domain` + `infra-no-db`). The
   `oidc-store.ts` case is the proof: because it imports `@orb/db`, it CANNOT stay in infra._
2. **The db/crypto-dependent VERIFICATION steps are INJECTED, never imported.** `infra/auth` verifies
   forwarded JWTs and consumes the OIDC PKCE/state store without importing `domain/sessions` or
   `@orb/db` — they arrive via `ResolveDeps` (`verifyForwardJwt`, `oidcStore`). The cookie→user step is
   NOT among them: per D40 it is RESOLUTION (`sessions.validate`, returns `userId`), the seam's direct
   domain call — never an infra port. _Enforcement: compile-time (`ResolveDeps` is the only db seam) +
   resolve-time (`infra-no-db`)._
3. **`ResolvedIdentity` carries NO `userId`.** Infra must not know DB row ids. _Enforcement: compile-time
   (the type has no `userId` field; the seam adds it when building `Principal`)._
4. **`MODE_RESOLVERS` is exhaustive over `AuthConfig["mode"]`.** _Enforcement: compile-time (the
   `Record<AuthConfig["mode"], ModeResolver>` mapped type — a missing arm fails `tsc`)._
5. **JWKS / JWT verification fails closed.** Every rejection path returns `null` (→ owner-fallback or
   401), never a 500, never a fall-through to the unsigned path. _Enforcement: test-time (each of the
   five reject points → `null`)._
6. **`SecretBox` carries the `aad`, never derives it.** The value's single production site is
   `domain/credentials/persistence/aad.ts`. _Enforcement: compile-time (`encrypt`/`decrypt` require the
   `aad` arg) + test-time (AAD-swap → GCM failure, not a silent wrong decrypt)._
7. **The box degrades, never throws at boot.** Unset/invalid key → `enabled:false`; throws only at call.
   _Enforcement: test-time (boot with no key → no throw; encrypt then throws)._
8. **CAS writes are crash-atomic and content-verified.** Temp-under-root → fsync file → rename → fsync
   dir; `verify()` re-hashes on demand. _Enforcement: test-time (a partial write never lands at the
   hash path; `verify` distinguishes corrupt from missing)._
9. **CAS fsyncs; the variant cache does not.** Canon is durable; the cache is reproducible.
   _Enforcement: test-time / code review (`fsync:true` on CAS put, `fsync:false` on variant put)._
10. **Every storage path goes through `isAssetHash`.** `blobPath`/`hashDir`/`variantPath` throw on a
    non-hash. _Enforcement: compile-time (the guard is the first statement) + test-time (a `../` hash
    throws)._
11. **The egress firewall resolves DNS once and never re-resolves before connect.** _Enforcement:
    test-time (`shouldBlockEgress` unit + the rebinding TOCTOU integration case)._

---

## Open decisions

- **`ip-ranges.ts` home — `@orb/kit/net` (pure) vs `infra/network` substrate.** It's isomorphic-pure
  (no env, no I/O, no `node:*`), which by the kit-purity ruling (shared-dissolution §0) points to
  `@orb/kit/net`. But every consumer is infra (auth's origin gate + the two network belts) and there's
  no client need. Lean: keep it `infra/network/ip-ranges.ts` as shared infra substrate unless a client
  consumer ever appears. Same question for `host.ts` (`normalizeHost`).
- **`oidc-store.ts` — RESOLVED (2026-06-25): `domain/sessions/persistence`** (it imports `@orb/db`, so
  sealed infra is out; session-mint state co-located with the validate path). Consistent with
  `domain/sessions` (reconciled) + ledger R5.
- **`password.ts` — `infra/auth` vs `infra/crypto`.** It's credential-verification crypto (scrypt) but
  it belongs to the local AUTH mode and reads `SESSION_SECRET`. Lean: `infra/auth/password.ts` (keeps
  the auth crypto with auth), consistent with domain/sessions. Revisit only if a non-auth caller emerges.
- **`ingress-allowlist.ts` — `infra/network` vs `transport`.** It's a Hono middleware mounted at
  `entry/app.ts` and depends on the Hono `Context` — arguably a transport/edge concern, not a pure
  adapter. Lean: `infra/network` (it's an I/O edge belt; `clientIp` is reused by the transport seam,
  so a shared infra home avoids a transport→transport sideways import).
- **`safeFetch` — keep the staged seam unwired?** Zero callers today; it's the hardening seam for the
  first user-supplied-URL feature. Keep (unwired ≠ worthless); wire on the first avatar-by-URL/webhook.
- **The blob-route `?w=&f=webp` `sharp` transform — RESOLVED (per Core-Laws-and-Precedents.md §7 D6).** The image
  variant transform is EXTRACTED to a new `infra/image` surface: a `sharp` adapter behind an
  `imageTransform` op, injected into `domain/assets/verbs/resolve-variant.ts` (width-snap = domain
  policy; `sharp` = infra I/O). NOT inline in the blob route. This is a fifth `infra` surface under this
  tier (sibling to auth/crypto/network/storage). Cross-ref `domains/assets.md` (which owns the verb).
