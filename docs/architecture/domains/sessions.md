# Orbweaver — `sessions`: the BFF browser session + identity resolution

> **Status: planning (target spec).** Ground-truth: whole-file recon of neo-tavern's
> `src/server/domain/sessions/` (10 files, 264 lines), the auth seam it feeds
> (`src/server/auth/` + `src/server/auth-context.ts`), and `src/server/domain/_shared/users.ts`
> (`ensureUser` / `provisionIdentity` / `ownerHandles` / `determineRole` — the dissolution routes these
> HERE). The defining change from neo-tavern: this domain **absorbs identity resolution + the
> `users`-row upsert** out of the `_shared` drawer, and the whole stack stops resolving identity twice.
> The central boundary the name forces: **BFF session ≠ SDK chat session** — two unrelated concepts that
> share the word "session." Authoritative upstream: `domains.md` (the `sessions` row: "auth/BFF
> sessions — distinct from SDK chat sessions"); `_FANOUT-BRIEF.md` §4 (sessions pain) + **§7.1
> (identity/auth/permission spine)** + §7.4 (types); `reports/shared-dissolution.md` §5 (`_shared/users.ts`
> → `domain/sessions`), §4 (`ResolvedIdentity` → `@orb/contracts/identity`; `SessionView` →
> `@orb/contracts/session`); `structure.md` §3 (tiers), §4 (the 8-slot template), §7 (gates).

---

## What this domain owns

**The revocable server-side browser session (the Backend-For-Frontend pattern) AND the identity→tenant
resolution that turns a credential into a `users` row.** These two were split across `domain/sessions`
and `domain/_shared/users.ts` in neo-tavern only because the auth seam needed the upsert and the BFF
session lived in a feature; in orbweaver they are one domain — the home for "who is this caller, and
what is their live login state."

Specifically:

- **Session lifecycle** — `create` (mint a 32-byte opaque token; persist only its peppered hash + a
  30-day expiry; audit `AUTH_LOGIN`), `validate` (token → resolved caller, or `null` for
  missing/revoked/expired/disabled; slides expiry on a 5-minute throttle), `revokeByToken` (logout),
  `revoke` (admin kick one device), `revokeAllForUser` (admin disable / kick-all), `listForUser` (the
  admin device list). 6 verbs.
- **Token crypto + timing** — `hashToken` (HMAC-`SESSION_SECRET`-peppered SHA-256, throws loud if the
  secret is unset), `SESSION_TTL_MS` (30d), `SLIDE_THROTTLE_MS` (5m). Pure crypto reading `SESSION_SECRET`
  down from `foundation/env`; no DB.
- **Identity resolution + the `users`-row upsert** (from `_shared/users.ts`) — `ensureUser` (handle →
  `UserId`, JIT-create on first sight; the single-user / non-cookie path) and `provisionIdentity` (the
  SSO seam upsert: keys on the stable `externalId`, falls back to `handle`; seeds `role` from
  `OWNER_GROUP`/`OWNER_HANDLES` on insert, preserves it on update unless `RE_DERIVE_ROLE_ON_LOGIN`).
- **Role-derivation policy** — `ownerHandles()` + `determineRole(handle, groups)`: the one
  access-control decision the app owns (**`owner`** iff identity ∈ `OWNER_GROUP` or handle ∈ `OWNER_HANDLES`;
  else `user`, D17). **`admin` is NEVER env-derived — it is GRANTED** by the owner via `setRole` (owner-only).
  The sanctioned call-time `process.env` trio lives here (see §Esoteric).
- **The `sessions` table** — all SELECT/INSERT/UPDATE for the BFF session rows.
- **The `users`-row read/write seam** — the lookup + upsert queries against the `users` table (the
  table *definition* stays in `@orb/db`; this domain is its only resolution-path writer).

This domain does **NOT** own:

- **The SDK "chat session"** — `DbSessionStore` / `buildSeedFrames` / reseed (prompt-cache lineage,
  `session_entries` table in `db/schema/sdk-session.ts`). That is a **backend-internal concern of the
  claude-agent-sdk strategy, owned by the `chat` domain** (`domains.md`: "the session-seeding logic …
  lives in the chat domain and must NOT move into providers"). It shares only the word "session." See
  §"BFF session ≠ SDK chat session."
- **Auth VERIFICATION** — JWT/JWKS validation, the mode-resolver dispatch, cookie/CSRF/host parsing
  (`auth/trust-header.ts`, `auth/<mode>/resolver.ts`, `auth/_shared/{jwks-cache,cookie,csrf,host,config}.ts`).
  That is `infra/auth` — a sealed, db-free Strategy executor. It produces a `ResolvedIdentity`; it never
  touches a `users` row (the upsert is injected into it via `ResolveDeps`).
- **Cookie I/O** — `setSessionCookie` / `clearSessionCookie` / `refreshSessionCookie` and the
  `__Host-neo_session` name. That is the **route layer** (`entry/http` + the OIDC/local route handlers).
  This domain is pure DB + crypto — it returns a token string; the route sets the cookie.
- **The composition-root auth SEAM** — `createAuthResolver` / `resolveOwner` (today `auth-context.ts`).
  That moves to **`entry/`** (the one tier allowed to wire `infra/auth` + `domain/sessions` together).
- **The boot owner-seed** — the one-time `role=owner` backfill for the owner handle (D17). A `entry/boot`
  concern (same tier as credentials' `seedCredentialFromEnv`).
- **The `users` table definition** — `@orb/db` (a reserved cross-cutting schema file; admin / credentials
  / sessions all FK it). This domain owns the *resolution queries*, not the schema.
- **`ResolvedIdentity` / `SessionView` / `Principal` types** — `@orb/contracts` (cross-boundary; see §7.4).
- **Admin gating** — `admin` consumes `revoke` / `revokeAllForUser` / `listForUser` through an injected
  `SessionAdminPort`, never a sideways import.

---

## BFF session ≠ SDK chat session (the naming collision, resolved)

Two concepts wear the word "session." They are unrelated and must stay in different domains, different
tables, different tiers:

| | **BFF/auth session** (this domain) | **SDK chat session** (chat domain) |
|---|---|---|
| What | revocable browser login: identity + live login state | prompt-cache lineage for a stateful agent-sdk turn |
| Table | `sessions` (`db/schema/sessions.ts`) | `session_entries` (`db/schema/sdk-session.ts`) |
| Keyed on | peppered token hash → `users` row | chat + seed-frame transcript resume |
| Produced by | a login mint (OIDC callback / local login) | `DbSessionStore` / `buildSeedFrames` / reseed |
| Lifecycle | create → per-request validate → revoke | seed → resume → reseed across turns |
| Owner | `domain/sessions` | `domain/chat` (backend-internal to the claude-sdk strategy) |

The `db/schema/sessions.ts` comment already flags this ("NOT to be confused with `session_entries` …").
Orbweaver makes the separation structural: the `sessions` domain has **zero** SDK-frame code, and the
`stateful | stateless` `ChatRequest` dimension (which correlates 1:1 with the agent-sdk today) stays a
`chat`↔`providers` concern. *Enforcement: resolve-time* — `domain/sessions` declares no dep on the
claude-sdk strategy or `session_entries`; the only shared token is a comment.

---

## Resolve identity ONCE → one immutable `Principal` (the §7.1 redesign)

Today identity is resolved **twice per request** across **three shapes** with `role`/`userId` duplicated:

1. `infra/auth` (`resolveIdentity`) dispatches the mode → `ResolvedIdentity { externalId, handle, groups }`
   — **no `userId`** (infra must not know DB row ids).
2. The seam calls `provisionIdentity(db, identity)` → computes the row id keyed on `externalId`, plus
   `enabled` + `role`. (For cookie modes, `validate` *already* JOINed `users` and threw the id away.)
3. `createContext` then calls `ensureUser(db, identity.handle)` **again**, re-resolving the SAME row by
   `handle` to populate `Context.userId` — a redundant query whose only correctness guarantee is that
   `users.handle` is unique so the two lookups converge.

That is `ResolvedIdentity → AuthContext → Context`, three principal shapes (`role` duplicated in two,
`userId` re-queried in the third). **Target:** carry `userId` out of the first resolution; construct one
immutable `Principal` at the seam; flow it down unchanged.

```ts
// @orb/contracts/identity.ts
//   ResolvedIdentity = the mode-resolver OUTPUT (pre-row, infra/auth produces it — no userId by design).
//   Principal        = the post-seam, immutable, db-resolved caller. Constructed ONCE at the entry seam.
export interface Principal {
  userId: UserId;            // resolved ONCE — validate (cookie) / provisionIdentity (SSO) / owner-seed (fallback)
  role: UserRole;            // owner | admin | user (D17) — the single global-authz axis carried downstream
  handle: Handle;
  externalId: ExternalId | null;
  via: "cookie" | "header" | "fallback";  // subsumes viaCookie/viaFallback (CSRF + owner discriminators)
}
```

`AuthContext` and `Context.{userId,role}` collapse into `Principal`. The seam builds it from whichever
path resolved the caller — `sessions.validate` returns the `userId` for cookie modes (the JOIN already
has it), `provisionIdentity` returns it for header/SSO modes, the owner-fallback mints it without a DB
touch. **One construction site, no re-query.** *Enforcement: compile-time* (`Principal.userId` is
required; nothing downstream can fabricate it) + *lint* (dep-cruiser: `ensureUser`/`provisionIdentity`
are called ONLY from the `entry/` seam — a domain verb that re-resolves identity is RED).

The 4 auth modes stay clean — one dispatcher (`MODE_RESOLVERS`), one branch point — and stay in
`infra/auth`. This redesign does not touch them; it changes only what the seam does with their output.

---

## 8-slot layout

```
domain/sessions/
├── index.ts            FRONT DOOR — SessionsService (interface) + createSessionsService;
│                         type-only re-export of SessionView/ResolvedIdentity/Principal from @orb/contracts
├── service.ts          COMPOSITION ROOT — wires create · validate · revoke · list · identity verbs. Zero logic.
├── context.ts          DI BUNDLE — explicit SessionsContext interface { db } (not ReturnType<>);
│                         the seam if a shared read ever emerges
├── contract/
│   ├── service.ts      interface SessionsService — the authoritative verb listing
│   ├── params.ts       create/revoke/provision params; ProvisionInput { externalId, handle, groups }
│   ├── results.ts      { token, sessionId, expiresAt }; ProvisionResult { userId, enabled, role }
│   ├── views.ts        (re-exports SessionView from @orb/contracts/session — not re-declared)
│   └── errors.ts       (none today — validate returns null; hashToken throws plain Error on misconfig)
├── verbs/
│   ├── create.ts       mint token + persist peppered hash + AUTH_LOGIN audit
│   ├── validate.ts     token → { principal-fields incl. userId } | null; per-request gates; throttled slide
│   ├── revoke.ts       revokeByToken (logout) · revoke (admin one-device) · revokeAllForUser (kick-all)
│   ├── list.ts         listForUser → SessionView[] (admin device list)
│   ├── ensure-user.ts  ensureUser — handle → UserId, JIT create (single-user / non-cookie path)
│   └── provision-identity.ts  provisionIdentity — the SSO seam upsert (externalId-keyed, role policy)
├── persistence/
│   ├── sessions.ts     all sessions-table SELECT/INSERT/UPDATE; toSessionView projection
│   └── users.ts        the users-row lookup + upsert queries (table def stays in @orb/db)
├── substrate/
│   └── role-policy.ts  ownerHandles() + determineRole() — the sanctioned process.env trio (see §Esoteric)
└── tokens/             named subsystem: token crypto + timing (pure, no db)
    └── tokens.ts       hashToken (peppered, throws if SESSION_SECRET unset) + SESSION_TTL_MS / SLIDE_THROTTLE_MS
```

**Verbs:** create · validate · revokeByToken · revoke · revokeAllForUser · listForUser · ensureUser ·
provisionIdentity (8 logical verbs; the three revoke paths share `revoke.ts` — one file, one guard
mechanic, same as tag's `attach.ts`).

**New vs neo-tavern:** there was no `persistence/` (each verb ran its own query) and no `substrate/`;
absorbing `_shared/users.ts` adds both. The `users.ts` upsert is genuinely shared read+write logic now
co-located with the session validate path, so a `persistence/` is justified (the README's "no shared
read primitive" rationale no longer holds once identity resolution joins the domain).

---

## Public surface (`index.ts`)

```ts
// Service
export type { SessionsService } from "#domain/sessions/contract/service";
export { createSessionsService } from "#domain/sessions/service";

// Cross-boundary types (re-exported type-only for callers; canonical home is @orb/contracts)
export type { SessionView } from "@orb/contracts/session";
export type { ResolvedIdentity, Principal } from "@orb/contracts/identity";
```

The tRPC router never calls `sessions` directly for auth — the **seam** (`entry/`) consumes
`SessionsService.validate` + `provisionIdentity` + `ensureUser` and produces the `Principal` the
procedure ladder gates on. `admin` consumes `revoke`/`revokeAllForUser`/`listForUser` through an
injected `SessionAdminPort` (structural subset). The OIDC/local route handlers call
`SessionsService.create` to mint, then set the cookie themselves.

---

## Movement table

| Unit | Outcome | Target | Rationale | Enforcement tier |
|---|---|---|---|---|
| `sessions/verbs/{create,validate,revoke,list}.ts` | stays domain feature | `domain/sessions/verbs/` | The BFF session lifecycle is the domain's core. Pure DB + crypto, no cookie I/O. | resolve-time |
| `sessions/tokens.ts` (`hashToken`, `SESSION_TTL_MS`, `SLIDE_THROTTLE_MS`) | stays domain feature, named subsystem | `domain/sessions/tokens/tokens.ts` | Pure crypto + timing; reads `SESSION_SECRET` DOWN from `foundation/env`. A named subsystem, not `persistence/` (no DB) and not `kit` (reads env + is feature-specific). | resolve-time (foundation is below domain); test-time (round-trip + missing-secret-throws) |
| `sessions/context.ts` — `ReturnType<typeof createSessionsContext>` | stays domain feature, made explicit | `domain/sessions/contract/service.ts` — `export interface SessionsContext` | The inferred type is invisible at a glance; the explicit interface satisfies `types-in-contract`. | lint-time (`types-in-contract` gate) |
| `_shared/users.ts` — `ensureUser` | stays a feature, re-homed | `domain/sessions/verbs/ensure-user.ts` (query in `persistence/users.ts`) | Identity RESOLUTION + the `users`-row upsert is this domain (brief §7.1). Exiled to `_shared` only so the auth seam + ~30 callers could reach it. In orbweaver the seam injects it; other domains never call it (they receive `Principal.userId`). | resolve-time (`_shared` does not exist); lint (only the `entry/` seam imports it) |
| `_shared/users.ts` — `provisionIdentity` | stays a feature, re-homed | `domain/sessions/verbs/provision-identity.ts` | The SSO upsert seam: externalId-keyed, role-seeded, enabled/role preserve-on-update. A sessions/identity verb. | resolve-time; test-time (the role-policy matrix) |
| `_shared/users.ts` — `ownerHandles`, `determineRole` | stays a feature, re-homed | `domain/sessions/substrate/role-policy.ts` | Pure role-derivation policy (the one access-control decision the app owns). The sanctioned call-time `process.env` reads of the owner-role trio live here, isolated to one file. | lint-time (env-reader exception list = exactly these vars in this one substrate file) |
| `_shared/users.ts` — the removed `withOwner` HOC (comment) | drop | — | Already removed 2026-06-02; the inline 2-line form is the live pattern. Do not resurrect. | n/a |
| `auth-context.ts` — `createAuthResolver`, `resolveOwner`, `AuthResolver`, `OwnerResolution` | → `entry` (the seam) | `entry/auth/seam.ts` | The composition-root seam: the ONE place allowed to wire `infra/auth` (verification) + `domain/sessions` (resolution/upsert/validate). Produces the one `Principal`. `entry/` is the topmost tier; it may import both. | resolve-time (`entry/` only) |
| `auth/*` (`trust-header.ts` dispatcher, `<mode>/resolver.ts`, `_shared/{jwks-cache,cookie,csrf,host,config,password}.ts`) | → `infra` | `infra/auth/` | Auth VERIFICATION is a sealed, db-free Strategy executor. The db-dependent steps (cookie-validate, user upsert) are INJECTED via `ResolveDeps` so infra never imports domain/db. | resolve-time (infra is below domain; injection only) |
| `auth/_shared/oidc-store.ts` (`createOidcStore`) | → **`domain/sessions/persistence`** (NOT `infra/auth`) | `domain/sessions/persistence/oidc-store.ts` | **CORRECTED 2026-06-25** (verified + flagged by tiers/infra.md): it imports `@orb/db` (`Db` + `oidcTransactions`) — stateful PKCE/state KV persistence, NOT db-free verification, so it cannot be sealed `infra/auth`. The `oidc` route calls it through the sessions domain. Reconciles the §esoteric note that already acknowledged it's a DB table. | resolve-time (infra stays db-free; the DB write is the domain's) |
| `auth/_shared/cookie.ts` (set/clear/refresh + `__Host-` name) + the OIDC/local route handlers | → `entry`/route layer | `entry/http/auth-routes.ts` | Cookie I/O is the route layer's job; the domain returns a token string. The §11 `__Host-` contract is route-tier. | resolve-time |
| `auth-context.ts` owner-fallback identity mint (`{ externalId:null, handle, groups:[] }`, `viaFallback:true`) | → the seam (`entry`) | `entry/auth/seam.ts` | The un-credentialed owner path mints a `Principal` with `via:"fallback"` and NO DB touch (the owner is the owner by definition, not a revocable user). `via:"fallback"` is the safe "this IS the owner" discriminator. | compile-time (`Principal.via` discriminant) |
| The one-time `role=owner` owner backfill / owner-seed (D17) | → `entry/boot` | `entry/boot/seed-owner.ts` (`ensureOwner`) | Composition-root boot concern (same tier as `seedCredentialFromEnv`, which already calls `ensureOwner`). Reads `OWNER_HANDLES`; calls the sessions upsert at boot. | resolve-time (`entry/` is topmost) |
| `shared/contracts/session.ts` — `SessionView` | → `contracts` | `@orb/contracts/session` | Cross-boundary DTO: produced by sessions, consumed by admin (via port) and the client device list. Already in `shared/contracts` precisely to dodge the domain↔domain import. | resolve-time (`@orb/contracts` is below both server and client) |
| `shared/contracts/identity.ts` — `ResolvedIdentity` | → `contracts` | `@orb/contracts/identity` | Cross-boundary: `infra/auth` produces it, `domain/sessions` + the seam consume it. Branded `Handle`/`ExternalId` cast lives at the producer. | resolve-time |
| `trpc/context.ts` — `AuthContext` + `Context.{userId,role}` + `auth/identity.ts` `IdentityResolution` (3 principal shapes) | merge / reconcile | one `Principal` in `@orb/contracts/identity` | The §8.2 finding: identity/principal fragmented across 3 differently-named shapes for one concept (`AuthContext`/`IdentityResolution`/`OwnerResolution`/`Context.userId`). One immutable `Principal`, constructed once. | compile-time (the single `Principal` type) + manual reconcile |
| `auth/identity.ts` — `AuthConfig`, `ResolveDeps`, `ModeResolver` | → `infra/auth` (cross-mode contract) | `infra/auth/contract.ts` | The infra auth module's internal contract (mode shape + injected db-deps). Infra-internal, not cross-package. | resolve-time |
| SDK `DbSessionStore` / `buildSeedFrames` / `session_entries` (NOT in this slice) | stays in `chat` | `domain/chat` | Explicitly NOT sessions: prompt-cache lineage, backend-internal to the claude-sdk strategy. Naming collision only. | resolve-time (no dep from `domain/sessions`) |

---

## Cross-feature composition (the injection model)

The sessions domain sits at the bottom of the identity stack: `infra/auth` is injected INTO with one of
its verbs, the `entry/` seam composes it, and `admin` consumes a slice of it. No feature reaches into
`domain/sessions/persistence/` or `verbs/` directly.

**Injected INTO `infra/auth` (`ResolveDeps`) at the `entry/` seam:**

| Op injected | Provided by | Used for |
|---|---|---|
| `sessions.validate` (as `validateSessionCookie`) | sessions domain | the cookie modes' (`oidc`/`local`) token→identity step; keeps `infra/auth` db-free |
| `onSessionSlide` callback | the route layer | refresh the cookie's `Max-Age` when a throttled server-side slide actually wrote |

**Consumed at the `entry/` seam (to build the one `Principal`):**

| Op | Provided by | Used for |
|---|---|---|
| `sessions.validate` | sessions domain | cookie path → identity **+ userId** |
| `sessions.provisionIdentity` | sessions domain | SSO/header path → `{ userId, enabled, role }`; the `enabled` gate (disabled → unauthenticated) |
| `sessions.ensureUser` | sessions domain | the owner-fallback / single-user handle→`UserId` convergence |

**Injected into `admin.context` at the composition root (the `SessionAdminPort`):**

| Op injected | Provided by | Used for |
|---|---|---|
| `sessions.listForUser` | sessions domain | `AdminService.listSessions` (the per-user device table) |
| `sessions.revoke` | sessions domain | `AdminService.revokeSession` (kick one device) |
| `sessions.revokeAllForUser` | sessions domain | `AdminService.revokeUserSessions` + `setEnabled` (disable → kick-all) |

The `admin` port is structural dependency-inversion: `admin/contract` declares `SessionAdminPort`
(`listForUser`/`revoke`), the real `SessionsService` satisfies it. *Enforcement: resolve-time* —
`domain/admin` may not import `#domain/sessions`; it receives the port type + the runtime op at the root.

---

## Spine thread intersections

### §7.1 identity / auth / permission

This domain is the **anchor** of the §7.1 spine. The headline redesigns:

- **Resolve once → one `Principal`** (above). Carry `userId` out of `resolve()`; never re-query. Kills
  the `ensureUser`-after-`provisionIdentity` double resolution.
- **Verification vs resolution vs minting are three tiers.** JWT/JWKS verification = `infra/auth`;
  identity resolution + the `users` upsert = `domain/sessions`; cookie minting + the owner-fallback
  `Principal` = `entry/` seam; the boot owner-seed = `entry/boot`. Each boundary is a tier edge
  (resolve-time), not prose.
- **`role:host|member` (per-resource authority) is NOT this domain.** Sessions resolves the global
  `owner|admin|user` axis only (D17). The chat-participant authority axis (§7.1: "added-but-unwired") is `chat`'s.
- **Agents as first-class principals (§8.6 — direction, not built).** When agents become real `users`
  rows, the mint verb — **`provisionAgentPrincipal`** (a non-SSO, non-loginable users-row minted from
  inside the app) — sits in **this domain**, next to `provisionIdentity`. Precedent: the synthetic
  `__group__${chatId}` character mint (a from-inside-the-app principal). It would need a
  `users.isAgent`/`kind` column (in `@orb/db`) with non-loginable semantics (`passwordHash` NULL,
  `externalId` NULL, never resolved by any auth mode). Credential inheritance (does an agent inherit the
  owner's `max-pro-sub`?) is a flagged decision, not mechanical (see Open decisions).

### §7.4 types & schemas — one home, one direction

- `ResolvedIdentity` → `@orb/contracts/identity` (infra produces, domain/seam consume). The brand cast
  (`castId<Handle>` / `castId<ExternalId>`) lives ONCE at the producer (the mode resolver / the
  validate read-seam).
- `Principal` → `@orb/contracts/identity` (the post-seam immutable; supersedes the 3 fragmented shapes).
- `SessionView` → `@orb/contracts/session` (the domain's `contract/views.ts` re-exports, never re-declares).
- `users.role` union (`owner|admin|user`, D17) → `@orb/contracts/identity` as `UserRole` (one importable union;
  the §7.5 census found **35 touch / 33 inline re-decls** of the old `"admin"|"user"`). The `db/schema/users.ts`
  enum column and the contracts union must agree (one source, mirrored by a test).
- Domain-internal params/results (`ProvisionInput`, `ProvisionResult`, create params) →
  `domain/sessions/contract/`.

### §7.5 string-union dispatch discipline

`UserRole` (`owner|admin|user`, D17) is the axis this domain governs. Target: ONE importable union in
`@orb/contracts/identity`; the `determineRole` return + the `Principal.role` + the `db` enum all derive
it. The 4 auth modes (`single-user|local|forward-header|oidc`) dispatch through `MODE_RESOLVERS` — a
`Record<AuthConfig["mode"], ModeResolver>` (the gold-standard mapped-type Record) in `infra/auth`; a 5th
mode is a `tsc`-checked addition (the NEW MODE CHECKLIST). Gate candidates: `no-inline-union-redecl`
(`UserRole`) + `exhaustive-dispatch` (the mode record).

---

## Esoteric / load-bearing quirks to preserve

**`externalId` keys SSO / `handle` keys the rest (rename stability).** `provisionIdentity` matches on
the stable `externalId` first so an authentik username rename updates `handle` on the SAME row (never a
duplicate); `ensureUser` / single-user / owner-fallback key on `handle` (their `externalId` stays NULL).
SQLite's "UNIQUE permits multiple NULLs" is what lets `externalId` be unique-when-set with no partial
index. **If you change the match order or key, renames silently fork into duplicate tenants.**

**The owner-fallback is bootstrap AND an origin-gated security belt.** `via:"fallback"` (today
`viaFallback`) is the SAFE "this is the owner" discriminator — NOT `externalId === null` (a
forward-header identity also has `externalId === null` when no uid header was forwarded). Under SSO
modes the fallback is granted ONLY on a local origin (`isLocalOrigin` reads `Host`, not
`X-Forwarded-Host` — a proxy-rewritten host can only REMOVE trust, never grant it; fails closed). Under
`single-user` it is unconditional (the only way in). **Removing the origin gate hands every anonymous
public request owner+admin.** (The gate itself lives in `infra/auth`; the `Principal.via` discriminator
it produces is consumed here + at the seam.)

**The 3-principal-shape fragmentation to reconcile** (`ResolvedIdentity → AuthContext → Context`). They
have different field names for one concept and re-resolve `userId`. This is the §8.2 manual-reconcile
item; the `Principal` is the resolution. Do not port the three shapes forward.

**`RE_DERIVE_ROLE_ON_LOGIN` — preserve-by-default, opt-in re-derive.** On a `provisionIdentity` UPDATE,
`role` is PRESERVED by default (a manual `userAdmin.setRole` grant survives the user's next login — no
per-request role churn). Set `RE_DERIVE_ROLE_ON_LOGIN=true` to re-derive from `OWNER_GROUP`/`OWNER_HANDLES`
every login (so removing a user from `OWNER_GROUP` in authentik demotes them next login). The boolean
parse is **tolerant** (`true`/`1`/`yes`, case-insensitive) — the pre-fix exact `=== "true"` silently
disabled group-driven revocation on `"True"`/`"1"`. **`enabled` is NEVER reset on update regardless of
the flag** — else a disabled user re-enables themselves by logging in; only a fresh INSERT is enabled.

**The sanctioned call-time `process.env` trio.** `ownerHandles()` / `determineRole` /
`provisionIdentity` read `OWNER_HANDLES` / `OWNER_GROUP` / `RE_DERIVE_ROLE_ON_LOGIN` from `process.env`
at CALL time, NOT via the frozen parsed `env` object — the documented exception to the
"`foundation/env` is the only `process.env` reader" doctrine, so per-test `vi.stubEnv` takes effect on
the role-derivation matrix. `OWNER_HANDLES`/`OWNER_GROUP` ARE declared in `env` (schema/docs source of
truth); `RE_DERIVE_ROLE_ON_LOGIN` is deliberately off parsed-env. **Keep this list to exactly these
three, isolated to `substrate/role-policy.ts`** — the `kit-purity`/env-reader gate carves out this one
file, not the domain.

**`hashToken` throws if `SESSION_SECRET` is unset** — the earlier `?? ""` floor was a silent-vuln hazard
(a future non-cookie caller would HMAC the empty string). Loud misconfiguration beats silent forgery.
Sessions exist only in `oidc`/`local` modes, both of which env-refine `SESSION_SECRET` as required, so
the throw is unreachable in correct deploys — it guards future call sites.

**Atomic single-statement revoke.** Each revoke is one `UPDATE … WHERE isNull(revokedAt) RETURNING` —
no read-then-write window where a concurrent revoke double-audits or a freshly-minted session escapes.
Only the call that actually flips `revokedAt` gets a returned row (the loser matches nothing, skips the
audit). The returned row attributes the logout to its user (the token is not identity).

**Per-request gates take effect on the NEXT request, not at TTL.** `validate` re-checks
revoked/expired/`users.enabled` every request, so logout / admin-disable / kick are immediate. Expiry
slides only past `SLIDE_THROTTLE_MS` (so an authenticated burst doesn't write every call); `onSlide`
reports the new expiry so the route can refresh the cookie `Max-Age` (else the cookie expires 30d after
LOGIN regardless of activity).

**Trim the handle before lookup/insert** — local login trims the submitted handle, so a row stored with
surrounding whitespace would never match (silent duplicate user). **Race-tolerant inserts** —
`onConflictDoNothing` on the unique column (`externalId` OR `handle`) + re-read absorbs the concurrent
first-login loser.

**Sessions are fully DB-backed — no in-memory state.** Unlike credentials' `health/cache` (an
`ASSUMES(single-replica)` per-process Map), this domain has no module-scope state; the OIDC transaction
store already moved to a DB table (`oidc_transactions`). It is multi-replica safe today. (The one
per-process cache in the identity stack — the JWKS LRU — lives in `infra/auth`, not here.)

**Session-fixation posture (deliberate).** No session-id rotation on login/privilege change today: the
token is 32 random bytes minted server-side AFTER an authenticated mint (no pre-auth id to fixate); the
cookie is `__Host-`+HttpOnly+Secure+SameSite=Lax; privilege transitions are admin-driven. If a
user-driven privilege step is ever added (impersonation exit, MFA step-up, role self-grant), MINT a
fresh session + revoke the old at that transition.

---

## Invariants (gate candidates)

1. **BFF session ≠ SDK chat session.** Separate tables (`sessions` vs `session_entries`), separate
   domains (`sessions` vs `chat`), separate tiers. `domain/sessions` has zero SDK-frame code.
   *Enforcement: resolve-time (no dep from `domain/sessions` on the claude-sdk strategy / `session_entries`)
   + the `db/schema/sessions.ts` cross-reference comment.*

2. **Identity is resolved ONCE → one immutable `Principal`; `userId` is carried, never re-queried.**
   *Enforcement: compile-time (`Principal.userId` required; one construction site at the seam) + lint
   (`ensureUser`/`provisionIdentity` imported ONLY by the `entry/` seam — a domain/transport re-resolve
   is RED).*

3. **The token is never stored; only its peppered hash.** No `token` column; `hashToken` throws if
   `SESSION_SECRET` is unset. *Enforcement: compile-time (the `sessions` row has `tokenHash`, no `token`)
   + test (round-trip; missing-secret throws, never HMACs `""`).*

4. **`externalId` keys SSO, `handle` keys the rest.** A username rename updates `handle` on the same
   row; no duplicate tenant. *Enforcement: test (rename → same row; concurrent first-login → one row).*

5. **The owner/admin fallback is granted only via the `via:"fallback"` discriminator + origin gate;
   never via `externalId === null`.** *Enforcement: compile-time (`Principal.via` discriminant) + test
   (anonymous request on a public origin → `null`/401; on a local origin → owner+admin).*

6. **`enabled` is never reset on a provision UPDATE; `role` is preserved unless
   `RE_DERIVE_ROLE_ON_LOGIN`.** *Enforcement: test (the role-policy matrix — disabled-stays-disabled;
   preserve-vs-re-derive; tolerant boolean parse).*

7. **Revoke is one atomic statement; only the flipping call audits.** *Enforcement: test (concurrent
   revoke → single audit row; freshly-minted session never escapes a kick-all).*

8. **Per-request validate enforces revoked/expired/`enabled` every request.** *Enforcement: test
   (revoke / disable takes effect on the next request, not at TTL).*

9. **Verification (infra) / resolution+upsert (domain) / minting (route) / owner-seed (entry/boot) are
   distinct tiers.** *Enforcement: resolve-time (`infra/auth` declares no domain/db dep — db steps
   injected via `ResolveDeps`; cookie I/O is route-tier; the seam is `entry/`).*

10. **The sanctioned `process.env` trio lives only in `substrate/role-policy.ts`.** *Enforcement: lint
    (the env-reader exception allowlist = exactly `OWNER_HANDLES`/`OWNER_GROUP`/`RE_DERIVE_ROLE_ON_LOGIN`
    in this one file; any other `process.env` read in the domain is RED).*

11. **`UserRole` has one declaration.** `owner|admin|user` (D17) lives once in `@orb/contracts/identity`; the `db`
    enum + `determineRole` return + `Principal.role` derive it. *Enforcement: `no-inline-union-redecl`
    (count must be 1) + a test asserting the db enum matches.*

---

## Open decisions

- **`Principal` shape — does it carry `groups`?** Today `validate` always returns `groups: []` by design
  (SSO groups are consumed into `users.role` at login; downstream needs only `role`). Lean: drop
  `groups` from `Principal` — `role` is the sole carried authz axis. Revisit only if a downstream
  consumer needs live group membership (none today).
- **Does `validate` return `userId` directly, or a full `Principal`?** The cookie-validate JOIN already
  has `users.id`; returning it kills the re-query (invariant #2). But header/SSO modes resolve `userId`
  via `provisionIdentity`, and the fallback mints it with no DB touch — so the `Principal` is assembled
  at the seam from three return shapes, not by `validate` alone. Confirm `validate`'s result type
  (`{ userId, role, handle, externalId, enabled }`) vs the legacy `ResolvedIdentity`.
- **`provisionAgentPrincipal` + `users.isAgent`/`kind` (§8.6).** The agent-principal mint belongs in
  this domain (precedent: synthetic group character). Needs a non-loginable `users` flavor in `@orb/db`
  and the guarantee that no auth mode ever resolves an agent row. **Credential inheritance** (agent
  inherits owner's `max-pro-sub` tier?) is a flagged decision spanning sessions + credentials, not
  mechanical.
- **API tokens reuse the `sessions` store.** The `sessions.label` column is already reserved ("future
  API tokens reuse this store"). Decide whether a long-lived API-token surface is a sessions verb
  (`createApiToken` with a far expiry + a `label`) or its own domain. Lean: a sessions verb — same
  table, same revoke/list machinery, distinguished by `label` + TTL.
- **Where does the role-derivation policy ultimately belong — sessions or admin/settings?**
  `ownerHandles`/`determineRole` are identity-provisioning policy (→ sessions), but `OWNER_HANDLES` is
  also read by the credentials boot-seed's `ensureOwner`. Reconcile via the `entry/boot` seam owning the
  owner-seed and importing `domain/sessions`' policy — not by duplicating the predicate.
- **Session-id rotation** — parked until a user-driven privilege transition exists (see §Esoteric). The
  mint-fresh-and-revoke seam would be a `validate`/`create` pairing in this domain.
