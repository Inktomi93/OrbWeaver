# Orbweaver — `credentials`: resolve + CRUD + metadata (un-inverted)

> **Status: planning (authoritative detail).** The credentials domain owns ALL credential logic — the
> turn-time resolver, per-user CRUD, the health probe + circuit-breaker, the env→DB boot seed, and the
> crypto seam (AES-256-GCM via `infra/crypto`). The defining change from neo-tavern: **un-inversion** —
> 641 lines of resolve logic + store primitives were exiled to `domain/_shared/credentials.ts` because
> `chat/engine` couldn't import across a domain boundary; in orbweaver that exile ends and every piece
> lives in its natural home (the feature, its contracts, or the injected-op model). Authoritative
> upstream: `domains.md` §"credentials" + §"Cross-cutting concept homes"; `_FANOUT-BRIEF.md` §4
> (credentials pain ledger) + §7.1 (identity/auth/permission spine, esp. the `max-pro-sub` owner-gate
> and AAD invariant); `structure.md` §4 (the 8-slot template).

---

## What this domain owns

- **The turn-time credential resolver** — `resolveCredential(args)`: the single chokepoint before every
  chat verb. Branches on `source` (`max-pro-sub | openrouter | vllm | custom_openai`) and returns a
  `ResolvedCredential` (brand-protected). The ONLY construction sites for `ResolvedCredential` are the
  four arms of this function + `mintVllmCredential` (boot-only) + `buildKeylessCatalogCredential`
  (keyless catalog fetch). In neo-tavern this lived in `_shared/credentials.ts:517`; here it is a verb
  (`domain/credentials/verbs/resolve.ts`) surfaced on the service interface.
- **Per-user encrypted credential CRUD** — `upsert`, `setActive`, `remove`, `markRevoked`,
  `clearRevoked`, `list`. Ownership-scoped (a user may only operate on their own rows). In neo-tavern
  the CRUD primitives were split between `_shared/credentials.ts` (for cross-domain callers) and
  `domain/credentials/verbs/` (ownership-scoped variants); here all CRUD lives in the domain.
- **Health probe + circuit-breaker** — `testHealth`: decrypt-by-id → probe → side-effects
  (`markRevoked` / `clearRevoked` / strike count). The throttle (60s cooldown) and 3-strike revocation
  are correct feature logic; the in-memory LRU Maps (`health-cache.ts`) move from `persistence/` to a
  named subsystem.
- **Provider metadata parsing** — `providerMetadataSchema` + `parseProviderMetadata`: the Zod runtime
  gate on the `metadata` JSON blob (`custom_openai` `baseUrl`, `google_vertex` project/region). This is
  a domain-contract schema, not an inline persistence concern.
- **Custom-endpoint inspection** — `inspectEndpoint`: drives the "Test endpoint" flow (send a shaped
  request, report the redacted wire + raw response). Consumes `infra/providers` (sealed — through the
  injected op model).
- **`user_credentials` DB rows** — all SELECT/INSERT/UPDATE for this table; the domain's `persistence/`
  is the only writer.
- **Env→DB boot seed** — `seedCredentialFromEnv`: idempotent single-user-only write of the
  `OPENROUTER_API_KEY` env var into a labeled `openrouter` credential row. Composition-root concern;
  lives in `entry/` in orbweaver (not in the domain).

This domain does **not** own: the AES-256-GCM engine (that is `infra/crypto/secrets` — the `SecretBox`
injectable); `CredProvider` / `CredentialSource` type definitions (those are `@orb/contracts`, the
cross-boundary wire type); `ResolvedCredential` brand type (that is `@orb/contracts`, consumed by
`infra/providers` runners); the per-turn `maybeRevokeOnAuthFailed` call-site wiring (chat engine and
compaction verbs call `credentials.maybeRevokeOnAuthFailed` through the composition-root injection, not
through a sideways import); connection routing (that is the `connection` domain's
`resolveRole` — it calls `credentials.resolve` through an injected op).

---

## The un-inversion invariant (locked)

> **`domain/_shared` does not exist in orbweaver.** Every function that lived in
> `_shared/credentials.ts` has exactly one natural home; the exile was the workaround, not the design.

The inversion happened because `chat/engine` and `buddy/ask` could not cross the domain boundary to
reach `domain/credentials/persistence/`. The fix in orbweaver is the injection model:

| `_shared/credentials.ts` export | Neo-tavern caller | Orbweaver destination |
|---|---|---|
| `resolveCredential` | chat/context, buddy/ask, models/context | `domain/credentials/verbs/resolve.ts`; injected into `chat.context`, `connection.context`, `buddy.context` at the composition root |
| `maybeRevokeOnAuthFailed` | chat/engine, chat/compaction | `domain/credentials/verbs/maybe-revoke-on-auth-failed.ts`; injected into `chat.context` at the composition root |
| `upsertCredential`, `setCredentialActive`, `removeCredential` | credentials/verbs (own feature) | `domain/credentials/persistence/queries.ts`; called from own verbs directly |
| `markCredentialRevoked`, `clearCredentialRevoked` | credentials/verbs/test-health | `domain/credentials/persistence/queries.ts`; called from own verbs directly |
| `decryptCredentialById` | credentials/verbs/test-health | `domain/credentials/persistence/queries.ts`; called from own verbs directly |
| `mintVllmCredential` | entry/_shared/role-clients-binder | `domain/credentials/verbs/mint-vllm.ts`; injected into the vLLM role-clients builder at the composition root |
| `buildKeylessCatalogCredential` | models/persistence/snapshot | `domain/credentials/verbs/build-keyless-catalog.ts`; injected into `connection.context` at the composition root |
| `parseProviderMetadata`, `providerMetadataSchema` | credentials/* own feature | `domain/credentials/contract/params.ts` (the schema) + `domain/credentials/substrate/parse-metadata.ts` (the parser) |
| `CredProvider` re-export | credentials/contract/params, credentials/contract/views | `@orb/contracts/credentials` (the canonical source) |

---

## The `ResolvedCredential` brand (load-bearing)

`ResolvedCredential` is a **brand-protected union type** in `@orb/contracts`. The brand means an
arbitrary `{ source, ... }` object literal cannot satisfy the type — construction is gated by the `as
ResolvedCredential` cast, and the ONLY legal casts are inside `domain/credentials/verbs/resolve.ts`.

The `max-pro-sub` arm is the most critical: it is unconstructable except AFTER the `requireOwner`
(`role === 'owner'`) check — it is the OWNER's box credential (ledger D17; a delegated admin is NOT the
box owner and never resolves the owner's sub). The identity/auth spine (§7.1) calls this out explicitly
— "the max-pro-sub mint is the ONLY construction site." Orbweaver can harden this to tier-1 by giving
`max-pro-sub` a distinct opaque subtype that can only be constructed by a factory function gated on the
owner principal:

```typescript
// @orb/contracts/credentials.ts (cross-boundary; consumed by both domain and infra/providers)
declare const CredentialBrand: unique symbol
export type ResolvedCredential =
  | MaxProSubCredential     // opaque — constructed ONLY by domain/credentials; sub path only
  | OpenRouterCredential    // branded  — requires a key; any user
  | VllmCredential          // branded  — loopback; boot-time or per-turn
  | CustomOpenAiCredential  // branded  — requires baseUrl + optional key

// The max-pro-sub factory: accepts a Principal, returns the opaque type ONLY IF requireOwner passes
// (the factory lives in domain/credentials/verbs/resolve.ts; the type lives in @orb/contracts)
```

This replaces the four `as ResolvedCredential` casts with one explicit factory per arm — each cast is
the only legal construction for that arm, and `tsc` enforces it. The vLLM and keyless-catalog
construction sites (`mintVllmCredential`, `buildKeylessCatalogCredential`) become named verbs on the
service with their own brand-gated factories.

---

## AES-256-GCM AAD invariant (load-bearing, must survive migration)

The AAD bound to every GCM ciphertext is:

```
aad = `${userId}|${provider}`
```

This binds every row to its `(userId, provider)` slot. A row moved to a different slot WILL NOT decrypt
(GCM tag verification fails). **This string MUST remain byte-identical across any refactor.** Any change
to the separator, the field order, or the stringification is a silent data-loss event for all existing
credentials. The `infra/crypto/secrets` `SecretBox` implementation carries the `aad` parameter; the
`credentials` domain supplies the value from `persistence/queries.ts`. Gate: **test-time** — a
round-trip test asserts decrypt(encrypt(plaintext, aad), aad) === plaintext AND that swapping the AAD
yields a GCM failure, not a silent wrong decrypt.

---

## The 8-slot layout

```
domain/credentials/
├── index.ts                      FRONT DOOR — the only legal external import
├── service.ts                    COMPOSITION ROOT — wires verbs + injected deps. ZERO logic.
├── context.ts                    DI BUNDLE — explicit CredentialContext interface (not ReturnType<>)
├── contract/
│   ├── service.ts                CredentialsService interface — read this to know everything the domain does
│   ├── params.ts                 every verb's *Params; also providerMetadataSchema + ProviderMetadata type
│   ├── results.ts                every verb's *Result
│   ├── views.ts                  CredentialView — read-model (plaintext never leaks: no ciphertext/iv/tag)
│   └── errors.ts                 CredentialsNotFoundError (HTTP 400, not 404 — intentional), CredentialsConflictError
├── verbs/
│   ├── resolve.ts                resolveCredential — the turn-time resolver; the ONLY ResolvedCredential construction site
│   ├── add.ts                    upsert (ownership-scoped)
│   ├── set-active.ts             setActive — flip the active flag; enforces one-active-per-(user,provider)
│   ├── remove.ts                 remove (ownership-scoped)
│   ├── list.ts                   list CredentialViews for a user (no secret fields)
│   ├── test-health.ts            probe + throttle check + side-effects (markRevoked / clearRevoked)
│   ├── mark-revoked.ts           runner-internal revoke (credentialId only; no userId check — runner proved access)
│   ├── mark-revoked-by-user.ts   user-facing revoke (adds ownership check)
│   ├── clear-revoked.ts          clear a revocation (ownership-scoped)
│   ├── fetch-models.ts           OpenAI /models best-effort fetch (wraps the infra adapter)
│   ├── inspect-endpoint.ts       custom-endpoint "Test endpoint" flow (inject: providers.inspect)
│   ├── maybe-revoke-on-auth-failed.ts  post-turn auth_failed side-effect (called by chat + compaction via injection)
│   ├── mint-vllm.ts              mintVllmCredential — boot-time vLLM loopback credential (no user, no DB row)
│   └── build-keyless-catalog.ts  buildKeylessCatalogCredential — keyless public-OR catalog fetch credential
├── persistence/
│   ├── queries.ts                all SELECT/UPDATE/INSERT/DELETE for user_credentials; toCredentialView projection
│   └── aad.ts                    aadFor(userId, provider) — one place, never inline
├── substrate/
│   ├── parse-metadata.ts         parseProviderMetadata — Zod parse + narrow; called from persistence on read
│   └── credential-not-found.ts   mapOwnershipResult helper (not-found and not-owned collapse → 400, not 404)
└── health/                       named subsystem for the health throttle + circuit-breaker state
    ├── cache.ts                  in-memory LRU Maps (throttle window + strike counters); ASSUMES(single-replica) — annotated
    └── types.ts                  HealthCacheEntry, StrikeRecord (subsystem-internal shapes)
```

**Renamed subsystem:** `persistence/health-cache.ts` (a module-scope in-memory throttle in a folder
named for DB access) → `health/cache.ts`. The `health/` subsystem holds only in-memory state; it has
no DB access. `persistence/` holds only DB queries.

**Moved infra adapter:** `persistence/openai-models.ts` (a raw `fetch()` against a user-supplied URL)
→ `infra/network/openai-models.ts`. A raw I/O adapter is not a DB query; `persistence/` is queries
only. `verbs/fetch-models.ts` calls it through an injected op.

---

## Verbs (the `CredentialsService` interface)

```typescript
CredentialsService = {
  // Turn-time
  resolve(params: ResolveCredentialParams): Promise<ResolvedCredential>
  maybeRevokeOnAuthFailed(params: MaybeRevokeParams): Promise<void>

  // CRUD
  add(params: AddCredentialParams): Promise<CredentialView>
  setActive(params: SetActiveParams): Promise<CredentialView>
  remove(params: RemoveCredentialParams): Promise<void>
  list(params: ListCredentialsParams): Promise<CredentialView[]>

  // Health
  testHealth(params: TestHealthParams): Promise<CredentialHealth>
  markRevoked(params: MarkRevokedParams): Promise<void>          // runner-internal path (no userId check)
  markRevokedByUser(params: MarkRevokedByUserParams): Promise<void>  // user-facing path (ownership check)
  clearRevoked(params: ClearRevokedParams): Promise<void>

  // Custom endpoint
  fetchModels(params: FetchModelsParams): Promise<string[]>
  inspectEndpoint(params: InspectEndpointParams): Promise<EndpointInspection>

  // Boot / connection helpers (injected cross-domain; not exposed to tRPC)
  mintVllmCredential(): VllmCredential
  buildKeylessCatalogCredential(params: KeylessCatalogParams): OpenRouterCredential
}
```

**`markRevoked` vs `markRevokedByUser`:** the runner-internal variant takes only `credentialId` — the
runner proves access by having the credential's id from a completed turn's resolved credential; adding an
ownership check here would break the runner path (the runner does not have `userId` at revoke time).
The two variants MUST NOT be unified into one ownership-checking verb without threading `userId` through
the runner path first.

**`testHealth` probes by `credentialId`, not by `active=true`:** the health UI allows probing any owned
credential, including inactive ones. The probe path uses `decryptCredentialById` (by id), not
`resolveCredential` (by active=true). If these two read paths are consolidated, health loses the ability
to probe inactive credentials.

---

## Public surface (`index.ts`)

```typescript
// Errors
export { CredentialsNotFoundError, CredentialsConflictError } from './contract/errors'

// Service types
export type {
  CredentialsService,
  CredentialsServiceDeps,
  CredentialContext,
} from './contract/service'

// View types (what the client receives — no secret fields)
export type { CredentialView } from './contract/views'

// Factory
export { createCredentialsService } from './service'
```

**`ResolvedCredential`, `CredentialHealth`, `ProviderMetadata`, `CredProvider`** live in
`@orb/contracts/credentials` — they are cross-boundary types consumed by `infra/providers` runners
and by the `connection` domain. They are NOT re-exported from this front door; callers import from
`@orb/contracts` directly.

**`providerMetadataSchema`** (the Zod schema) also lives in `@orb/contracts/credentials` because the
client needs it for form validation on custom-endpoint metadata fields (same pattern as
`createCharacterSchema` in `@orb/contracts/character`). `domain/credentials/substrate/parse-metadata.ts`
imports from `@orb/contracts` and applies the parse.

**`seedCredentialFromEnv`** (boot seed) lives in `entry/boot/seed-credential.ts`, NOT in the domain or
its front door. It is a composition-root concern: it calls `createCredentialsService` after the boot
owner-seed (`entry/boot/seed-owner.ts` — `provisionIdentity` + `determineRole` from `domain/sessions`)
has provisioned the owner at entry, and is never imported by any domain.

---

## Movement table

| Unit | Outcome | Target | Rationale | Enforcement tier |
|---|---|---|---|---|
| `_shared/credentials.ts` — `resolveCredential` / `resolveCredentialImpl` | stays domain feature | `domain/credentials/verbs/resolve.ts` | The resolver is the domain's core verb. Exile to `_shared` was a workaround for the cross-feature ban. Chat/connection/buddy call it through composition-root injection. | resolve-time: `_shared` does not exist in orbweaver; dep-cruiser `domain-no-cross-feature` enforces injection model |
| `_shared/credentials.ts` — `maybeRevokeOnAuthFailed` | stays domain feature | `domain/credentials/verbs/maybe-revoke-on-auth-failed.ts` | Feature verb; chat/compaction access it through an injected op, not a sideways import. | resolve-time (same package dep discipline) |
| `_shared/credentials.ts` — `upsertCredential`, `setCredentialActive`, `removeCredential`, `markCredentialRevoked`, `clearCredentialRevoked`, `decryptCredentialById` | stays domain feature | `domain/credentials/persistence/queries.ts` | DB-store primitives; lived in `_shared` only so test-health and the own verbs could reach them without triggering the cross-feature rule. In orbweaver they are own-feature persistence, accessed directly from own verbs. | resolve-time |
| `_shared/credentials.ts` — `mintVllmCredential` | stays domain feature | `domain/credentials/verbs/mint-vllm.ts` | A named credentials verb (mint a boot-time vLLM loopback credential). The boot binder calls it through composition-root injection. | resolve-time |
| `_shared/credentials.ts` — `buildKeylessCatalogCredential` | stays domain feature | `domain/credentials/verbs/build-keyless-catalog.ts` | A named credentials verb (mint a keyless OR catalog credential). Injected into `connection` at the composition root. | resolve-time |
| `_shared/credentials.ts` — `providerMetadataSchema`, `parseProviderMetadata`, `ProviderMetadata` type | → `contracts` (schema/type) + domain substrate (parser) | `@orb/contracts/credentials` (schema + type); `domain/credentials/substrate/parse-metadata.ts` (the parser call) | `ProviderMetadata` is a cross-boundary wire type (client needs it for custom-endpoint form fields). The Zod schema is a cross-boundary validator. The `parse` call is a domain substrate helper. | resolve-time: `@orb/contracts` is the declared dep for cross-boundary types; client imports schema from there, not from server domain |
| `_shared/credentials.ts` — `CredProvider` re-export | → `contracts` | `@orb/contracts/credentials` (canonical source) | `CredProvider` is a cross-boundary type; the re-export through `_shared` was double-homing. Callers import from `@orb/contracts` directly. | resolve-time |
| `_shared/credentials.ts` — `aadFor()` helper | stays domain feature | `domain/credentials/persistence/aad.ts` | The AAD binding `${userId}|${provider}` is a domain-persistence concern (one file, never inline). Must be a single canonical site to make the byte-identical invariant auditable. | test-time: round-trip crypto test asserts AAD format is stable |
| `persistence/health-cache.ts` (module-scope LRU Maps) | stays domain feature, renamed | `domain/credentials/health/cache.ts` | In-memory throttle + strike state is NOT a DB query; belongs in a named subsystem not in `persistence/`. Adds the `ASSUMES(single-replica)` annotation. | lint-time: dep-cruiser `persistence-no-in-memory-state` rule (gate candidate) |
| `persistence/openai-models.ts` (raw `fetch()`) | → `infra` | `infra/network/openai-models.ts` | A raw I/O adapter against a user-supplied URL is not a DB query. `persistence/` is queries only. The `fetch-models` verb calls it through an injected op. | lint-time: dep-cruiser `persistence-no-io` rule (gate candidate) |
| `boot-seed.ts` | → `entry` | `entry/boot/seed-credential.ts` | A composition-root concern: runs after the boot owner-seed (`entry/boot/seed-owner.ts` — `provisionIdentity` + `determineRole`, `domain/sessions`) + calls `createCredentialsService`. In neo-tavern it imports from both `_shared/credentials.ts` and `_shared/users.ts` — cross-_shared coupling. In orbweaver `entry/` is the correct tier for boot wiring; it can import any domain front door. | resolve-time: `entry/` is the topmost tier; imports flow downward |
| `providers/contract/credential.ts` — `ResolvedCredential` brand type | → `contracts` | `@orb/contracts/credentials` | A cross-boundary type: the credentials domain produces it; `infra/providers` runners consume it. Currently in `providers/contract/` (infra) which creates an infra→domain conceptual dependency for the type. In `@orb/contracts` both tiers are consumers (down from contracts). | resolve-time: `@orb/contracts` is the declared dep for cross-boundary types; `infra/providers` imports from there, not from domain |
| `providers/contract/health.ts` — `CredentialHealth` type | → `contracts` | `@orb/contracts/credentials` | Cross-boundary: the credentials domain's `testHealth` return type AND `infra/providers` `probe()` return type. Currently in `providers/contract/` (infra); moving to `@orb/contracts` makes both consumers equal. | resolve-time |
| `context.ts` — `ReturnType<>` inference (implicit interface shape) | stays domain feature | `domain/credentials/contract/service.ts` top — as `export interface CredentialContext` | The inferred type is invisible at a glance. The explicit interface is readable, matches the 8-slot template, and satisfies the `no-inline-types` rule. | lint-time: `no-inline-types` dep-cruiser gate |
| `contract/errors.ts` — `CredentialsNotFoundError extends DomainOperationError` (HTTP 400, not 404) | stays domain feature | `domain/credentials/contract/errors.ts` — unchanged; the 400 asymmetry is DOCUMENTED as a contract invariant | 400 is deliberate: not-owned and not-found collapse to prevent existence leaks. Any client that keys on 404 for "row gone" will miss credential errors; the discriminator is the `code: 'credential_not_found'` field, not the HTTP status. Add a contract docstring. | test-time: contract test asserts the HTTP status is 400 and `code` field is 'credential_not_found' |
| `_shared/ids.ts` — `newTypeId` (used across credentials) | → `@orb/kit` | `@orb/kit/ids` | Pure TypeID mint; zero I/O, zero domain. The canonical `kit` case (shared across all domain docs). | resolve-time |
| `_shared/errors.ts` — `DomainOperationError`, `DomainNotFoundError` etc. | → `@orb/kit` | `@orb/kit/errors` | Pure error base classes; no domain deps. | resolve-time |
| `_shared/db-errors.ts` — `isConstraintViolation` / `isCredentialUniqueViolation` (4-depth walk) | → `@orb/db` | `@orb/db/kit` | DB-error classifier; domain-agnostic. The 4-depth `error.cause` walk that finds `LibsqlError` is a DB-layer concern. | resolve-time |
| `ResolveCredentialArgs` inline interface (`_shared/credentials.ts:492–496`) | stays domain feature | `domain/credentials/contract/params.ts` | The resolver verb's input shape; currently inline in `_shared` because the resolver lives there. Moves to the domain contract. | lint-time: `no-inline-types` |
| `CredentialRow` subset interface (`_shared/credentials.ts:364–373`) | stays domain feature | `domain/credentials/persistence/queries.ts` (as a local type or `typeof` drizzle `$inferSelect`) | Internal DB-row projection for the resolver's column-subset query. Not a cross-boundary type; stays in persistence. Prefer the drizzle inferred type. | lint-time: `no-inline-types` (it's not exported; no leak today) |
| `isCredentialUniqueViolation` — 4-depth `error.cause` walk | → `@orb/db` | `@orb/db/kit` | Same pattern as `workloads/persistence/constraints.ts` — a DB-error classifier that walks drizzle's wrapping chain. Lives in `@orb/db`, called from credentials persistence. | resolve-time |

---

## Cross-feature composition (the injection model)

The credentials domain is consumed by `connection`, `chat`, `buddy`, and `entry`. None of these import
`domain/credentials` internals — all access is through the front door or through composition-root
injection.

**Injected into `connection.context` at the composition root:**

| Op injected | Provided by | Used for |
|---|---|---|
| `credentials.resolve` | credentials domain | `resolveRole` — resolves the credential for any role's backend |
| `credentials.buildKeylessCatalogCredential` | credentials domain | keyless OR catalog fetch (public endpoints) |

**Injected into `chat.context` at the composition root:**

| Op injected | Provided by | Used for |
|---|---|---|
| `credentials.resolve` | credentials domain | per-turn credential resolution (passed through from `connection.context`) |
| `credentials.maybeRevokeOnAuthFailed` | credentials domain | post-turn `auth_failed` side-effect in the engine and compaction verbs |

**Injected into `buddy.context` at the composition root:**

| Op injected | Provided by | Used for |
|---|---|---|
| `credentials.resolve` | credentials domain | routing buddy turns (max-pro-sub → agent-sdk, else local vLLM) |
| `credentials.mintVllmCredential` | credentials domain | building the vLLM credential for buddy's local turn |

**Injected into `infra/providers/vllm/role-clients` builder at the composition root:**

| Op injected | Provided by | Used for |
|---|---|---|
| `credentials.mintVllmCredential` | credentials domain | minting the loopback vLLM credential at boot for each role client |

No domain (chat, buddy, models/connection) reaches into `domain/credentials/persistence/` or
`domain/credentials/verbs/` directly — all access goes through the front door or through injected ops.

---

## Spine thread intersections

### §7.1 Identity / auth / permission

The `max-pro-sub` credential is the one auth-gated construction site — **owner-only** is the invariant
(ledger D17: the box belongs to the `owner`, not any `admin`). The `resolve.ts` verb runs `requireOwner`
(`principal.role === 'owner'`) BEFORE minting the opaque `MaxProSubCredential` type. In orbweaver this is
an opportunity to promote from tier-3 (a comment + a cast) to tier-2 (a factory function that accepts a
`Principal` and returns the opaque type only if the owner guard passes — the `as ResolvedCredential` cast
is then only legal inside that factory).

The credential AAD binds `(userId, provider)` — the identity/auth spine notes this as the
"origin-gated security belt" that makes row-lifting impossible without re-encryption. Preserve exactly.

The `CredentialsNotFoundError` HTTP-400 asymmetry (not-owned and not-found collapse) is an auth-correct
design: leaking existence is a privacy/security failure. The `code` field is the discriminator for
clients, not the status.

### §7.2 Settings / config

`CREDENTIALS_KEY_AUTO=true` → auto-key path: writes `.credentials-key` next to the DB on first boot.
This is an `infra/crypto` concern (a one-shot boot side-effect of `SecretBox` initialization), NOT a
settings-tier concern. The boot-fatal behavior (no key + no auto-key = disable the box, never crash)
is correctly inside `infra/crypto/secrets.ts`. The orbweaver target: `infra/crypto` exports
`SecretBox`; the box receives its key from `entry/` (which reads `env.CREDENTIALS_KEY` via
`foundation/env`); the auto-key path is `infra/crypto`'s boot initialization, injected into `entry/`.

The "back up `.credentials-key` alongside the DB" invariant must be documented in `infra/crypto`
(not in the domain doc) — the domain consumes the SecretBox as an opaque injectable; it doesn't know
where the key comes from.

### §7.4 Types and schemas — one home, one direction

- `ResolvedCredential` (brand union) → `@orb/contracts/credentials` (cross-boundary; both domain and
  infra/providers are consumers flowing DOWN from contracts).
- `CredentialHealth` → `@orb/contracts/credentials` (cross-boundary; domain's `testHealth` return type
  AND infra `probe()` return type).
- `ProviderMetadata` type + `providerMetadataSchema` → `@orb/contracts/credentials` (cross-boundary;
  client needs the schema for custom-endpoint form fields).
- `CredProvider` union → `@orb/contracts/credentials` (canonical source; no re-export through server).
- `CredentialView` → `domain/credentials/contract/views.ts` (domain-internal view; re-exported from
  front door for client type-only use).
- `ResolveCredentialArgs` / `AddCredentialParams` / `TestHealthParams` / etc. → `domain/credentials/
  contract/params.ts` (domain-internal arg shapes; currently inline in `_shared` or `persistence/`).
- `CredentialContext` → `domain/credentials/context.ts` top — explicit `export interface
  CredentialContext`, never `ReturnType<typeof createCredentialContext>`.
- `HealthCacheEntry` / `StrikeRecord` → `domain/credentials/health/types.ts` (subsystem-internal;
  never exported from the front door).
- `CredentialRow` DB-row subset → `domain/credentials/persistence/queries.ts` as a local type (not
  exported; prefers `typeof userCredentials.$inferSelect` where possible).

### §7.5 String-union dispatch discipline

The resolver's `source` union (`max-pro-sub | openrouter | vllm | custom_openai`) is DISTINCT from the
DB `provider` enum (`openrouter | anthropic | openai | google_vertex | custom_openai`). This is
intentional — the resolver routes only the four implemented sources; `anthropic / openai / google_vertex`
are schema-reserved forward-compat slots with no runner today. The gap must be explicit:

```typescript
// @orb/contracts/credentials.ts
export type CredentialSource = 'max-pro-sub' | 'openrouter' | 'vllm' | 'custom_openai'
export type CredentialProvider = 'openrouter' | 'anthropic' | 'openai' | 'google_vertex' | 'custom_openai'

// The resolver dispatch is exhaustive over CredentialSource:
// switch (source) { case 'max-pro-sub': ... case 'openrouter': ... case 'vllm': ...
//   case 'custom_openai': ... default: assertNever(source) }
// anthropic/openai/google_vertex are storable CredentialProvider values that have no CredentialSource dispatch arm yet.
```

ONE importable `CredentialSource` canonical union in `@orb/contracts/credentials` (no inline re-spelling).
**It is the single home for the provider-source axis (D31): `@orb/contracts/connection` re-exports it as
`ChatSource`** (routing's `source` IS the credential source — same 4 members), rather than declaring a
second tuple. (Distinct from the broader `CredentialProvider`/`CredProvider` storable-provider union,
which has members like `anthropic`/`openai`/`google_vertex` with no resolver arm yet — see the open
decision below.) The resolver switch uses `assertNever` for exhaustiveness. Any new source arm = add to the
union + add the switch arm + add the runner arm in `infra/providers` → `tsc` error if any of the three is
missing. Gate candidate: **`exhaustive-dispatch`** (from §7.5).

### §8.4 Escape hatches

The `as ResolvedCredential` casts (four in neo-tavern) are the target of the tier-2 promotion. Once
each arm has its own opaque factory function, the `as` cast is encapsulated inside the factory and never
appears at call sites. The `parseProviderMetadata` Zod parse at the read seam is the MODEL for the
`CredentialRow` inline fields — apply the same pattern to any other `unknown` column on
`user_credentials` (today `metadata` is the only one; if `ciphertext` or `iv` ever needed runtime
validation, this is where it goes).

---

## Invariants (gate candidates)

1. **`ResolvedCredential` is constructed only inside `domain/credentials/verbs/resolve.ts`** (and the
   two named boot-helper verbs). No other file may produce a value satisfying the brand.
   *Enforcement: compile-time — the opaque type's construction API is the only entry point; the `as`
   cast is encapsulated in the factory; no exported constructor. Any attempt to construct it elsewhere
   fails `tsc`.*

2. **`max-pro-sub` is owner-only (`requireOwner`, D17)** — the `MaxProSubCredential` factory returns
   the opaque type only after the `role === 'owner'` check.
   *Enforcement: compile-time — the factory signature accepts a `Principal`; the owner check is
   inside; the opaque return type can't be fabricated.*

3. **AAD = `${userId}|${provider}` — byte-identical, never inline** — the single `aadFor()` function
   in `persistence/aad.ts` is the only production site. No verb or persistence function re-derives
   the AAD string independently.
   *Enforcement: lint-time (dep-cruiser: all `box.encrypt` / `box.decrypt` calls in the domain must
   import from `persistence/aad.ts`); test-time: round-trip asserts format stability.*

4. **`CredentialView` never exposes secret fields** — `ciphertext`, `iv`, `tag` are never present in
   any type or value returned by the front door or by any tRPC handler.
   *Enforcement: compile-time — `CredentialView` does not include those fields; `toCredentialView`
   in `persistence/queries.ts` is the only projection; tRPC return types are all `CredentialView`.*

5. **`testHealth` probes by `credentialId`, not by `active=true`** — the inactive-credential probe
   path is distinct from the resolver's active-only read.
   *Enforcement: test-time — a health contract test asserts an inactive credential can be probed
   without activating it.*

6. **`markRevoked` (runner-internal) does NOT ownership-check** — `markRevokedByUser` (user-facing)
   does. The two verbs MUST NOT be merged until `userId` is threaded through the runner revoke path.
   *Enforcement: compile-time — two separate verb signatures; the `CredentialsService` interface
   lists both explicitly; no shared implementation.*

7. **`persistence/` contains DB queries only** — no `fetch()`, no module-scope Maps.
   *Enforcement: lint-time — dep-cruiser `persistence-no-io` rule: no `fetch`/`axios`/`http.request`
   in `domain/*/persistence/`; dep-cruiser `persistence-no-in-memory-state` rule: no module-scope
   `Map`/`Set` declarations in `domain/*/persistence/`.*

8. **`health/cache.ts` carries the `ASSUMES(single-replica)` marker** — the in-memory throttle and
   strike state are per-process. If the single-replica assumption is ever abandoned, the `health/`
   subsystem is the seam to replace with a shared store.
   *Enforcement: lint-time — a `check` gate validates the `ASSUMES(single-replica)` comment is
   present on the module-scope Map declarations (same gate pattern neo-tavern uses for buddy).*

9. **The boot wiring (`entry/boot/seed-owner.ts` then `entry/boot/seed-credential.ts`) is the ONLY
   caller of the owner-seed (`provisionIdentity` + `determineRole`) + `credentials.add` at boot** — no
   domain imports another domain's users/auth primitives at the module level.
   *Enforcement: resolve-time — `entry/` is the only tier that can import both `domain/credentials`
   and `domain/sessions`/`domain/admin` simultaneously; a cross-domain import from `domain/credentials`
   into `domain/sessions` or vice versa fails the `domain-no-cross-feature` dep-cruiser rule.*

---

## Open decisions

- **`MaxProSubCredential` factory signature — DECIDED (2026-06-25): accepts a `Principal`** and does the
  `requireOwner` (owner-only, D17) check inside (one gate site; the `as ResolvedCredential` cast is
  encapsulated in the factory). The identity-model coupling is acceptable — the factory IS the gate. (ledger §2.)
- **`CredentialSource` vs `CredentialProvider` as two distinct types** — the current code collapses
  them into one usage site. Orbweaver explicitly separates them (dispatch vs storage). Confirm the
  distinction is enforced in `@orb/db/schema/credentials.ts` (the column is `CredentialProvider`) vs
  `domain/credentials/contract/params.ts` (the resolver arg is `CredentialSource`).
- **Custom/BYO backend descriptor** — `tiers/providers.md §1a` says the user declares the model
  profile (context window, max output, sampling, reasoning). The `providerMetadataSchema` today has only
  `baseUrl` + `headers`. In orbweaver, add `modelProfile?: CustomModelProfile` to the metadata schema
  (keyed into the `ModelCapability` descriptor). The inspector probes or the user fills it in.
- **`google_vertex` / `anthropic` / `openai` providers** — storable in the DB today, no resolver arm.
  Before adding a runner for any of these, add the `CredentialSource` union member + the resolver arm +
  the `infra/providers` strategy simultaneously. Do NOT add partial scaffolding (a DB row with no
  runner is a stranded credential that shows as "revoked / not found" to the user).
- **Health throttle state persistence** — the 60s throttle and 3-strike counter reset on process
  restart. If a credential is at 2 strikes and the process restarts, it starts over. Acceptable for
  single-replica (a ASSUMES(single-replica) design choice). If ever multi-replica: the `health/`
  subsystem is the seam; the rate-limit bucket row pattern (used by `rate_limit_buckets` today) is the
  model to copy.
