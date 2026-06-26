# Orbweaver — `admin`: the gating surface + user administration

> **Status: planning (target spec).** Ground-truth: whole-file recon of neo-tavern's
> `src/server/domain/admin/` (13 files, 554 lines), `src/server/domain/_shared/admin.ts`
> (`requireAdmin`), `_shared/users.ts` (the user-management primitives), `src/server/trpc/trpc.ts`
> (the `adminProcedure`/`adminMiddleware` rung), and `trpc/routers/user-admin.ts`. The defining tension:
> **admin is the GATING surface, but the permission model it gates with is only one-third wired.** Per
> `_FANOUT-BRIEF.md` §7.1 (identity/auth/permission spine), permission = global-role × resource-role ×
> capability, and only global `admin|user` exists today. Authoritative upstream: `_FANOUT-BRIEF.md` §4
> (admin pain — "gating surfaces: requireAdmin, role") + §7.1 (the spine, READ IN FULL) + §7.4 (types) +
> §7.5 (the `users.role` axis — 35 touches / 33 inline redecls); `reports/shared-dissolution.md` §5
> (`_shared/admin.ts` → `domain/admin`; `_shared/users.ts` → `domain/sessions`); `structure.md` §4
> (the 8-slot template) + §7 (the gates); `domains.md` (the admin row — "admin surfaces / gating").

---

## What this domain owns

- **The `requireAdmin` + `requireOwner` gate primitives** — the global-role gate seams (`_shared/admin.ts`
  today is `requireAdmin` only). `requireAdmin` = `can(p,'admin',global)` passes for **owner ∪ admin**
  (D17 — the role axis is now `owner|admin|user`); the NEW **`requireOwner`** = `can(p,'owner',global)` is
  owner-only and gates the **box-credential mint + admin grant/revoke + owner-only surfaces**. Each takes a
  `Db` + an already-resolved `userId` (+ optional `role` hint — fast path skips the `SELECT`); returns the
  `userId` (chainable) or throws `DomainForbiddenError`. These are the **verb-tier half** of the 2-layer
  global-role gate (the transport-tier `adminMiddleware` is the other half — see §Cross-feature
  composition). owner ⊇ admin lives ONLY in the seam (no scattered `role === 'admin'`/`'owner'`).
- **The user-administration verbs (11)** — `listUsers`, `setRole`, `setEnabled`, `createUser`,
  `resetPassword`, `listSessions`, `revokeSession`, `revokeUserSessions`, `vllmEngines`,
  `restartVllmEngine`. Every one is admin-gated (`requireAdmin`, defense-in-depth even though the tRPC
  `adminProcedure` already gated). This is the **multi-user management surface** — admin-only; ordinary
  users self-manage through settings/auth, not here.
- **The last-admin guard + owner-immutability (load-bearing, D17)** — `setRole` (demote) and `setEnabled`
  (disable) must never zero out the enabled-admin set; **AND the `owner` is immutable** — it cannot be
  demoted, disabled, or removed, and there is **exactly one** (the bootstrap OWNER; transfer is a future
  owner-only action). `setRole` is **owner-only** (only the owner grants/revokes `admin`; `user↔admin`
  only, never to/from `owner`). Two layers (unchanged shape): a friendly `SELECT count(*)` of OTHER enabled
  admins (`otherEnabledAdminCount`) for the fast-path `last_admin` error, plus the atomic backstop — an
  `EXISTS (… other enabled admin …)` clause ON THE UPDATE — and an owner-row guard (`role='owner'` rows are
  un-demotable / un-disablable, enforced on the UPDATE).
- **The `AdminUserView` read-model + its persistence** — `loadUser`, `otherEnabledAdminCount`,
  `listAllUsers`, and the `userCols` projection. admin is one of the few features allowed to read the
  `users` table directly (the `no-direct-users-read` chokepoint exempts `domain/admin` — every read here
  `requireAdmin`s first, so the discipline holds).

This domain does **not** own:

- **Identity resolution + the `users`-row upsert** — `ensureUser` / `provisionIdentity` (the
  handle/externalId → row primitives, OWNER_HANDLES role seeding, SSO provisioning) are
  `_shared/users.ts` → **`domain/sessions`**. admin's `createUser`/`setRole` verbs *administer* the
  `users` table; `sessions` *resolves identity into* it. The seam: admin's create/reset verbs lean on
  `sessions` user primitives (today they bypass it with a direct `INSERT` — see §Movement) and on
  `infra/auth`'s `hashPassword`.
- **Credential minting** — the `max-pro-sub` mint is the ONE privileged-credential construction site. It
  is the OWNER's box credential, so it is gated by **`requireOwner`, not `requireAdmin`** (D17 — a delegated
  admin is NOT the box owner and never resolves the owner's sub; was a `role === 'admin'` check,
  `_shared/credentials.ts:547–565`). That mint is a **`credentials`** concern; admin owns the *gate
  primitive* (`requireOwner`), not the construction. A member/agent-triggered `max-pro-sub` turn is refused
  unless explicit owner consent (`triggeredBy ≠ owner` → fail-closed). (The buddy `agent` route reuses the
  same gate primitive — confirming the gate is shared, the mint is not.)
- **Session lifecycle** — `revoke` / `listForUser` / `revokeAllForUser` mechanics belong to
  **`domain/sessions`**; admin reaches them through the injected `SessionAdminPort` (dependency
  inversion) and audits the admin action.
- **The vLLM supervisor** — `allEngineStatuses` / `getVllmEngineController` are **`infra/providers`**;
  admin's `vllmEngines`/`restartVllmEngine` are a thin admin-gated surface over them (today a direct
  `#server/providers` import — should be an injected port; see §Movement).
- **The transport `adminProcedure` / `adminMiddleware`** — the request-edge half of the 2-layer gate is
  **`transport/trpc`** (it reads `ctx.auth.role`, resolved once at the seam). The *role value* it checks
  comes from identity resolution (`sessions`/the auth seam); admin neither owns nor resolves it.
- **`logAudit`** — every admin write audits, but the audit sink is **`foundation/observability/audit`**.

---

## The permission model (the central design question)

Per §7.1 the target permission model is three-axis: **`permission = global-role × resource-role ×
capability`**. Today only the first axis is wired, and admin is where it lives.

| Axis | Today (verified) | Orbweaver target |
|---|---|---|
| **global-role** `owner \| admin \| user` (D17) | **WIRED, 2-layer** — `adminMiddleware` (transport) reads `ctx.auth.role`; `requireAdmin` (verb) re-checks. Real enforcement. (Today 2-member; D17 adds `owner`.) | Keep the 2-layer enforcement. `requireAdmin` = `can(p,'admin',global)` (**owner ∪ admin**); a new `requireOwner` = `can(p,'owner',global)` (owner-only) gates the box-credential mint + admin grant/revoke. The owner is the box owner (sole `max-pro-sub` holder, immutable, exactly one). |
| **resource-role** `chat_participants.role: host \| member` | **EXISTS in schema, gates NOTHING** — principal-scout: 33 writes, 0 authority reads ("added-but-unwired"). Access control is pure single-owner row-scoping (`chats.ownerId === ctx.userId`). | Wire `host\|member` as **chat** authority (chat's to wire — but admin's permission model frames it). Replace owner-equality with participant-membership. |
| **capability** (per-action) | **none** — privilege is scattered `role === 'admin'` / `ownerId === userId` checks. | Introduce a real `can(principal, action, resource)` seam; `requireAdmin` and `requireHost` are its first two implementations. |

**What admin owns in this model:** the **global-role gate primitive** (`requireAdmin`) and the
**user-admin verbs** that mutate the global-role axis (`setRole`/`setEnabled`/`createUser`). admin does
NOT own the resource-role axis (that's chat's `chat_participants`) or the capability seam's other
implementations (`requireHost`, agent capability ceilings — §7.1 LOCKED makes agents first-class
principals with a capability ceiling enforced *by this model* rather than by borrowed identity).

**The seam target (not a rewrite — a re-home + a wrapper):** the dispatch-scout measured the
`users.role` axis at **35 touches with 33 inline `"admin" | "user"` re-spellings** (§7.5) — no exported
`UserRole` union. Orbweaver: ONE `UserRole` in `@orb/contracts`, and the scattered `role === 'admin'`
checks (transport `adminMiddleware`, the credentials max-pro-sub gate, buddy routing) converge on a
single `can()` seam whose first concrete check is `requireAdmin`. Keep the 2-layer enforcement; just
give the privilege check one name and one importable union.

---

## 8-slot layout

```
domain/admin/
├── index.ts            FRONT DOOR — re-exports AdminService (interface), AdminUserView (type),
│                         ActorRole/UserRole (type), createAdminService. The @public comment notes the
│                         client consumes AdminUserView via tRPC service-method-signature inference.
├── service.ts          COMPOSITION ROOT — createAdminService(db, deps) wires all 11 verbs. ZERO logic.
│                         The one structural dep beyond db is the injected SessionAdminPort (+ the vLLM
│                         supervisor port + requireAdmin's home stays in-domain).
├── context.ts          DI BUNDLE — explicit `interface AdminContext` (NOT ReturnType<>): db + the
│                         injected SessionAdminPort + the vLLM supervisor port + loadUser /
│                         otherEnabledAdminCount / listAllUsers reads.
├── contract/
│   ├── service.ts      interface AdminService (the 11-verb authoritative API) + SessionAdminPort
│   │                     (the dependency-inversion port) + AdminContext (explicit, top of file)
│   ├── params.ts       every verb's *Params — the { actorId, callerRole?, userId?, role?, … } shapes,
│   │                     declared ONCE (today re-spelled inline in all 7 verb files + the interface)
│   ├── results.ts      void | AdminUserView | { revoked: number } | Record<string,EngineStatus> | string
│   ├── views.ts        AdminUserView (read-model; no passwordHash / no secret columns)
│   └── errors.ts       (none of its own — see §Esoteric: admin throws kit errors, by design)
├── verbs/
│   ├── list-users.ts       listUsers
│   ├── set-role.ts         setRole (the demote last-admin guard)
│   ├── set-enabled.ts      setEnabled (disable last-admin guard + cannot_disable_self + revoke tail)
│   ├── create-user.ts      createUser (invalid_handle / user_exists TOCTOU / weak_password)
│   ├── reset-password.ts   resetPassword (existence-before-audit + revoke-all)
│   ├── sessions.ts         listSessions / revokeSession / revokeUserSessions (delegate to the port)
│   └── vllm.ts             vllmEngines / restartVllmEngine (delegate to the supervisor port)
├── persistence/
│   └── queries.ts      loadUser · otherEnabledAdminCount · listAllUsers (+ the userCols projection).
│                         The atomic last-admin EXISTS-on-UPDATE stays in the verbs (per-verb clauses).
├── substrate/          (none — admin has no pure feature-local helpers; the guards are db clauses)
└── (no named subsystems)
```

**Verbs (11):** listUsers · setRole · setEnabled · createUser · resetPassword · listSessions ·
revokeSession · revokeUserSessions · vllmEngines · restartVllmEngine. (`sessions.ts` and `vllm.ts` each
group ops that share identical guard + delegation mechanics — same "one logical group per file"
allowance tag.md uses for `attach.ts`.)

---

## Public surface (`index.ts`)

```ts
// Service contract (client consumes AdminUserView via tRPC service-method-signature inference)
export type { AdminService } from "#domain/admin/contract/service";
export type { AdminUserView } from "#domain/admin/contract/views";

// The privilege union (re-exported from contracts for ergonomics; canonical home is @orb/contracts)
export type { UserRole } from "@orb/contracts/identity";

// Factory
export { createAdminService } from "#domain/admin/service";
```

`SessionAdminPort` is **not** re-exported — it is a private dependency-inversion port; the composition
root satisfies it structurally with the real `SessionsService`. `requireAdmin` is **not** on the front
door either: it is a same-tier primitive injected into `settings` at the composition root (a domain may
not sideways-import another domain's front door, and `requireAdmin` is not part of the `AdminService`
verb surface — it is the gate primitive the verbs and `settings` both consume). The tRPC router
(`transport/trpc/routers/user-admin.ts`) imports this front door only.

---

## Movement table

| Unit | Outcome | Target | Rationale | Enforcement tier |
|---|---|---|---|---|
| `_shared/admin.ts` — `requireAdmin(db, userId, role?)` | stays domain feature (the gate primitive) | `domain/admin/persistence/queries.ts` or `domain/admin/guard.ts` (a named in-domain primitive, NOT the front door) | `_shared` dissolves. `requireAdmin` takes a `Db` + principal (imports `db`, downward — legal in a domain). It is the verb-tier half of the 2-layer gate; the settings domain consumes it via **composition-root injection** (settings can't sideways-import admin). | Resolve-time: `_shared` does not exist; the cross-feature ban means settings receives `requireAdmin` as an injected op, not an import |
| All 7 admin verb files | stays domain feature | `domain/admin/verbs/*` | They are the user-admin business logic; fit the 8-slot template unchanged (the last-admin guard, TOCTOU translation, existence-before-audit all preserved). | Lint-time: `verb-naming` + `feature-structure` |
| `_shared/users.ts` — `ensureUser`, `provisionIdentity`, `ownerHandles`, `determineRole` | **→ another feature** | `domain/sessions` | Identity *resolution* (handle/externalId → row, OWNER_HANDLES role seeding, SSO upsert) is sessions' job, not admin's. admin *administers* the `users` table; sessions *populates* it. `createUser` (admin) and `provisionIdentity` (sessions) are distinct write paths. | Resolve-time: `_shared` dissolves; admin's create/reset verbs receive sessions' user primitives via injection (cross-feature ban) |
| `create-user.ts` / `reset-password.ts` — direct `users` INSERT/UPDATE + `hashPassword` import from `#server/auth/_shared/password` | re-routed | `infra/auth` for `hashPassword` (sealed adapter, injected); the row write stays in admin persistence but the **handle-uniqueness primitive** aligns with sessions' `ensureUser` shape | `hashPassword` is an I/O-adjacent auth adapter (`infra`, injected down). The `INSERT` is admin's (it owns admin-created local users), but it must share the TOCTOU-safe conflict shape with sessions to avoid two divergent user-creation paths. | Resolve-time (`infra/auth` injected) + Compile-time (shared `UserRole` on the role column) |
| `SessionAdminPort` (the dependency-inversion port) | stays domain feature | `domain/admin/contract/service.ts` | The port pattern is exactly right: admin declares the slice of sessions it needs; the composition root injects the real `SessionsService`. No over-indirection. Preserve. | Compile-time: the port interface; the root's `createAdminService(db, { sessions, … })` fails `tsc` if sessions doesn't satisfy it |
| `vllm.ts` — `allEngineStatuses` / `getVllmEngineController` from `#server/providers` (direct infra reach) | re-routed via injected port | `infra/providers` (the supervisor); admin declares a `VllmSupervisorPort` in `contract/service.ts`, injected at the root | A domain reaching directly into `infra` is a downward import that's *legal* by the cake but breaks the "domains receive infra via injection" discipline (so the verb is testable without a live supervisor). Mirror the SessionAdminPort pattern. | Lint-time: dep-cruiser `domain-no-direct-infra` (gate candidate) — domain verbs import infra adapters only as injected ports |
| `users.role` axis — inline `"admin" \| "user"` re-spelled 33× (incl. `ActorRole` in `contract/service.ts`, every verb param, the tRPC `z.enum(["admin","user"])`) | **→ contracts** | `@orb/contracts/identity` — `userRoleSchema` (zod) + `UserRole` (inferred); `ActorRole` collapses into `UserRole` | §7.5 measured 35 touches / 33 redecls, no importable union. One zod schema the tRPC router, the client form, and the domain all import; the TS type derives from it. The `users.role` drizzle column derives its enum from the same source (or mirrors with a test). | Compile-time: downstream re-spellings diverging from the contracts import break at `tsc`; Lint-time: `no-inline-union-redecl` counts redecls (must be 1) |
| Per-verb param shapes — `{ actorId; callerRole?; userId; role }` etc., re-declared inline in all 7 verbs AND the `AdminService` interface | stays domain, de-duplicated | `domain/admin/contract/params.ts` | The `no-inline-types` gate: arg shapes belong in `contract/params.ts`, declared once; verbs and the interface import them. Today the same 4-field object literal is spelled ~9 times. | Lint-time: `no-inline-types` / `types-in-contract` |
| `AdminContext = ReturnType<typeof createAdminContext>` | stays domain, made explicit | `domain/admin/contract/service.ts` (top) as `export interface AdminContext` | The inferred type is invisible at a glance; the explicit interface matches the template and satisfies the no-inline-types rule (same change credentials.md makes for `CredentialContext`). | Lint-time: `no-inline-types` |
| `AdminUserView` | stays domain-internal | `domain/admin/contract/views.ts` (re-exported from front door) | The client's user-admin feature receives it via **tRPC service-method-signature inference** (type-only, the legal client→server edge), NOT via a deep import — so it does not need a `contracts` home. (Contrast `TagView`, which the client *deep-imports* → contracts. Confirm the orbweaver client stays inference-only; if it ever imports the shape directly, promote to `contracts/identity`.) | Resolve-time: client imports `@orb/server` type-only; tRPC inference carries the shape |
| `requireAdmin` consumer: `settings/verbs/app-settings.ts` (direct `import from ../../_shared/admin`) | re-wired to injection | `domain/settings` receives `requireAdmin` as an injected op at the composition root | settings' `getAppSettings`/`updateAppSettings` are admin-gated. In orbweaver settings can't sideways-import `domain/admin`; the root injects the gate primitive. This is the admin↔settings injection seam called out in the dissolution inventory. | Resolve-time: `domain-no-cross-feature` — settings importing `#domain/admin` is RED; the op arrives via context |
| `max-pro-sub` mint + its `role === 'admin'` gate (`_shared/credentials.ts:547–565`) | **→ another feature** (the mint); the *gate primitive* is admin's | `domain/credentials/verbs/resolve.ts` (mint); the role check uses admin's `requireOwner`/`can()` seam (D17 — the box credential is owner-only) | admin owns the GATE, credentials owns the CONSTRUCTION. The mint is the only `ResolvedCredential` `max-pro-sub` construction site (credentials.md invariant #2); admin frames *why* it's gated (owner-only, D17) but does not mint. | Compile-time: the `MaxProSubCredential` opaque factory takes a `Principal`; the owner check is the gate primitive credentials injects/calls |
| `logAudit` (from `_shared/audit.ts`, fanIn 60) | **→ foundation** | `foundation/observability/audit` | Audit is a cross-cutting observability sink, read-down-into by all tiers. admin is a heavy caller (every write audits) but does not own it. | Resolve-time: `foundation` is below domain; admin imports it downward |
| `DomainForbiddenError` / `DomainOperationError` / `DomainNotFoundError` | **→ kit** | `@orb/kit/errors` | Pure error base classes, zero domain knowledge. admin throws all three; it declares none of its own (§Esoteric). **BOOT-CRITICAL** per dissolution §1. | Resolve-time |
| `isConstraintViolation` (createUser TOCTOU translation) | **→ db-kit** | `@orb/db/kit` | DB-error classifier (the `cause`-chain walk), domain-agnostic; unify with credentials' variant. | Resolve-time |
| `newId<UserId>()` (createUser) | **→ kit** | `@orb/kit/ids` | The canonical TypeID mint; zero I/O. | Resolve-time |

---

## Cross-feature composition (the injection model)

admin is the hub where global-role enforcement, session management, user identity, and the engine
supervisor meet — but it imports **none** of those siblings. Everything arrives through the front door's
factory or composition-root injection.

**admin's own dependencies (injected into `AdminContext` at the root):**

| Op / port injected | Provided by | Used for |
|---|---|---|
| `SessionAdminPort` (`listForUser`, `revoke`, `revokeAllForUser`) | `domain/sessions` (the real `SessionsService` satisfies it structurally) | `listSessions` / `revokeSession` / `revokeUserSessions`; the disable/reset "revoke all" tail |
| `VllmSupervisorPort` (`allEngineStatuses`, `getController`) | `infra/providers` (the supervisor) | `vllmEngines` / `restartVllmEngine` |
| sessions' user primitives (`ensureUser`-shaped uniqueness) | `domain/sessions` | aligning `createUser`'s write path with identity resolution's |
| `hashPassword` | `infra/auth` | `createUser` / `resetPassword` |
| `logAudit` | `foundation/observability/audit` | every write verb |

**admin as a provider (its primitives injected into others):**

| Op injected | Into | Used for |
|---|---|---|
| `requireAdmin` (the gate primitive) | `domain/settings` (`getAppSettings`/`updateAppSettings`) | admin-gating the runtime-toggle reads/writes |
| `requireOwner` / the `can()` seam | `domain/credentials` (the `max-pro-sub` box-credential gate — owner-only, D17) | the owner check at the box-credential mint |
| `requireAdmin` / the `can()` seam | `transport/trpc` (`adminMiddleware` is the transport mirror) | the global-role check at every admin-privileged site |

No domain imports `#domain/admin` internals; `transport/trpc/routers/user-admin.ts` imports only the
front door.

---

## Spine thread intersections

### §7.1 Identity / auth / permission (the load-bearing thread)

admin **is** the global-role axis of the three-axis model (`global × resource × capability`). The thread
fixes that touch this domain:

- **Resolve identity ONCE at the edge → one immutable `Principal`.** Today `actorId` + `callerRole` are
  threaded through every verb as two loose fields (the `callerRole` fast-path lets `requireAdmin` skip
  the `SELECT` because `adminMiddleware` already resolved `ctx.auth.role`). Target: the verb signatures
  take a `Principal` (carrying `userId` + `role`), and `requireAdmin`/`can()` read it — the dual
  fast/slow path collapses into "the principal already knows its role."
- **The 2-layer global-role gate is REAL and STAYS.** `adminMiddleware` (transport, reads
  `ctx.auth.role`, no db round-trip) + `requireAdmin` (verb, db fallback) is defense-in-depth, not
  redundancy to collapse. Keep both rungs; just route the privilege decision through one `can()` seam.
- **`chat_participants.role: host | member` is added-but-unwired** (33 writes, 0 authority reads). It is
  the **resource-role** axis. Wiring it is **chat's** job (a `requireHost` predicate replacing
  owner-equality), but admin's permission model is what *frames* it as the second axis — do not delete it
  ("unwired ≠ worthless").
- **Agents are first-class principals (LOCKED).** An agent gets its own `users` row + a capability
  ceiling enforced *by the permission model* (not by borrowed owner-identity). admin's `setRole` should
  never grant a non-loginable agent principal `admin`; the `UserRole` axis and a future `isAgent`/`kind`
  column on `users` interact here (the column is sessions/identity's to add; admin's verbs must respect
  it — e.g. `createUser` mints loginable humans only).
- **Esoteric to preserve (§7.1 list):** the **owner-fallback bootstrap belt** — `ensureUser`/`determineRole`
  provisions any handle in `OWNER_HANDLES` as **`owner`** (D17 — the one access-control decision the app
  owns; `admin` is granted later by the owner via `setRole`, never derived from env); in `single-user` mode
  the owner is *always* `owner`, so `adminMiddleware`/`requireAdmin` can never deny there. This is both the
  bootstrap (the first principal exists without a prior owner to create them) and a security belt. The
  `max-pro-sub` mint is the only privileged-credential construction site, **owner-gated** (`requireOwner`).

### §7.4 Types & schemas — one home, one direction

- `UserRole` (`owner | admin | user`, D17) → `@orb/contracts/identity` (cross-boundary: tRPC + client form +
  the db column + every domain that gates). The single most re-spelled admin shape (33× as the old 2-member).
- `AdminUserView` → `domain/admin/contract/views.ts` (domain-internal; client gets it via tRPC inference,
  not a deep import — so NOT contracts, unless the orbweaver client imports it directly).
- Verb param shapes → `domain/admin/contract/params.ts` (declared once; today inline ~9×).
- `AdminContext` → explicit `interface` in `contract/service.ts` (never `ReturnType<>`).
- `SessionAdminPort` / `VllmSupervisorPort` → `domain/admin/contract/service.ts` (domain-internal ports).

### §7.5 String-union dispatch discipline

The `users.role` axis is the canonical offender: 33 inline `"admin" | "user"` re-spellings, no exported
union, the gate scattered as `role === 'admin'` across transport, credentials, buddy, and admin itself.
Target: ONE importable `UserRole` + `userRoleSchema` in contracts; the privilege *dispatch* converges on
a single `can(principal, action, resource)` seam (or `requireAdmin` as its first concrete form), so a new
privilege check can't re-spell the union or re-implement the role read. Gate candidates:
**`no-inline-union-redecl`** (union count must be 1) + a lint rule that the only `role === 'admin'`
comparison site is inside the `can()`/`requireAdmin` primitive.

---

## Esoteric / load-bearing quirks to preserve

**The `adminProcedure` + `requireAdmin` 2-layer (defense-in-depth).** The transport `adminMiddleware`
gates at the request edge (reads `ctx.auth.role`, surfaces a `securityEvent("admin_required", …)` on
denial — the highest-signal forensic line: a non-admin probing admin endpoints); `requireAdmin` re-checks
inside every verb. This is deliberate redundancy: a verb called from a non-tRPC path (a job, a test
fixture, a future internal caller) is still gated. **Do not collapse to one layer** — the verb gate is
what makes the verb safe independent of its caller.

**The last-admin atomic backstop.** The `EXISTS (SELECT 1 FROM users other WHERE other.role='admin' AND
other.enabled=1 AND other.id != ?)` clause ON THE UPDATE (in both `setRole` and `setEnabled`) is the
concurrency-safe guard: two admins demoting/disabling each other both pass the friendly `SELECT count`
pre-check, but only the write that still sees another enabled admin commits (the loser matches 0 rows →
`last_admin`). The `SELECT count` alone is a TOCTOU race; the EXISTS-on-UPDATE is the real defense. Both
must survive — the count is the friendly error, the EXISTS is the correctness.

**The `callerRole` fast-path / slow-path duality.** `requireAdmin(db, userId, role?)` skips the role
`SELECT` when the resolved role is passed (the tRPC seam already has it in `ctx.auth.role`). The slow
path (no role) preserves backward-compat for test fixtures that synthesize an `AuthContext` without
running `provisionIdentity`, and for non-tRPC callers. Under the `Principal` refactor this collapses
(the principal always carries its role), but the *behavior* — never trust a caller-supplied role without
the seam having resolved it — must be preserved.

**Existence-before-audit.** Every targeted write (`setEnabled`, `resetPassword`) does `loadUser` (throws
`DomainNotFoundError`) BEFORE the UPDATE + audit. Without it, a no-op UPDATE on a missing `userId` writes
a phantom audit row for an action that never happened, then throws — a forensic lie. Preserve the order:
existence check → write → audit.

**`cannot_disable_self`.** `setEnabled` rejects an admin disabling their own account (locks the deployment
out of itself). Distinct from `last_admin` (which is about the *set*, this is about the *actor*).

**TOCTOU translation on `createUser`.** The handle-existence `SELECT` then `INSERT` is check-then-act; a
concurrent `createUser` taking the handle in between surfaces a raw `SQLITE_CONSTRAINT`, translated to the
same typed `user_exists` the `SELECT` path throws. Keep the translation (via the unified
`isConstraintViolation` in `@orb/db/kit`).

**No custom error class (by design).** admin throws `DomainNotFoundError` + `DomainOperationError`
(reasons: `last_admin` / `cannot_disable_self` / `user_exists` / `weak_password` / `invalid_handle` /
`restart-engine`) + `DomainForbiddenError` (from `requireAdmin`) — all kit primitives. The reason-string
is the discriminator. This is correct; do not invent an `AdminError`.

**The `no-direct-users-read` chokepoint exemption.** admin reads the `users` table directly (most
features must not). The exemption holds *because* every read here `requireAdmin`s first. The orbweaver
gate must carry the exemption forward (admin + sessions are the only `users`-table readers).

---

## Invariants (gate candidates)

1. **Every admin verb calls `requireAdmin` (defense-in-depth).** Independent of the transport
   `adminMiddleware`. No admin verb executes its body before the gate.
   *Enforcement: lint-time — a dep-cruiser/AST rule asserts every export in `domain/admin/verbs/`
   awaits `requireAdmin` (or `can(p,'admin',…)`) as its first statement; test-time: a verb called with a
   `user`-role principal throws `DomainForbiddenError`.*

2. **`requireAdmin` is the single global-role gate seam.** No scattered `role === 'admin'` outside it
   (and its transport mirror `adminMiddleware`). credentials' max-pro-sub gate and buddy routing route
   through it.
   *Enforcement: lint-time — `no-inline-union-redecl` + a rule that `role === 'admin'` appears only inside
   the `can()`/`requireAdmin` primitive.*

3. **The last-admin guard keeps BOTH layers.** The friendly `otherEnabledAdminCount` pre-check AND the
   atomic `EXISTS`-on-UPDATE in `setRole` + `setEnabled`.
   *Enforcement: test-time — a concurrent demote/disable race (two admins, each targeting the other)
   leaves exactly one enabled admin; the loser gets `last_admin`.*

4. **Existence-check precedes audit on every targeted write.** A write to a missing `userId` throws
   `DomainNotFoundError` and writes NO audit row.
   *Enforcement: test-time — a `setEnabled`/`resetPassword` on a nonexistent id asserts zero audit rows
   written.*

5. **`AdminUserView` never exposes secret columns.** `passwordHash` (and any future secret) is absent
   from `userCols`, the view, and every tRPC return.
   *Enforcement: compile-time — `AdminUserView` excludes the field; `userCols` is the only projection;
   all router returns are `AdminUserView`.*

6. **`UserRole` has one declaration.** `@orb/contracts/identity`; the db column, the tRPC schema, the
   client form, and the domain all derive from it.
   *Enforcement: compile-time (drift breaks `tsc`) + lint-time (`no-inline-union-redecl`, count = 1).*

7. **admin imports no sibling domain or infra adapter directly.** sessions, credentials, providers,
   settings all arrive as injected ports/ops at the composition root.
   *Enforcement: resolve-time — `domain-no-cross-feature`; lint-time — `domain-no-direct-infra`.*

8. **The `max-pro-sub` mint is gated by admin's owner-gate primitive (`requireOwner`, D17 — the box
   credential is owner-only) but constructed in credentials.** admin owns the gate, not the construction.
   *Enforcement: compile-time — the `MaxProSubCredential` opaque factory (credentials) takes a
   `Principal` and applies the owner check; the factory is the only construction site.*

---

## Open decisions

- **The `can(principal, action, resource)` seam shape.** Does `requireAdmin` *become*
  `can(p, 'admin', global)`, or does `can()` wrap `requireAdmin` + `requireHost` as the two concrete
  predicates? Lean: introduce `can()` as the seam, with `requireAdmin` (global) and `requireHost`
  (resource, chat's) as its first two implementations — so the third axis (capability) has a home to grow
  into without re-scattering checks.
- **Where `requireAdmin` physically lives.** A standalone `domain/admin/guard.ts` (a named primitive the
  verbs and the injected-into-settings op both use) vs folding it into `persistence/queries.ts` (it does
  a `SELECT`). Lean: `guard.ts` — it's the gate, not a query, even though it reads.
- **`vllmEngines`/`restartVllmEngine` home.** Are these really admin's, or an `ops`/`connection` admin
  surface? They're a thin admin-gated shell over `infra/providers`. Keep in admin per the "keep"
  directive, but via an injected `VllmSupervisorPort` (not a direct infra import). Revisit if a broader
  ops-admin surface emerges.
- **`AdminUserView` → contracts?** Stays domain-internal IFF the orbweaver client consumes it via tRPC
  inference only. If the fresh client imports the shape directly (as the neo-tavern client's user-admin
  feature pattern suggests it might), promote to `@orb/contracts/identity`.
- **Agent principals + admin verbs (§7.1 LOCKED).** `createUser` mints loginable humans; agent principals
  are minted by `sessions`' `provisionAgentPrincipal` (a NEW build). Does `setRole` ever apply to an agent
  principal? Decision: admin's `UserRole` grants apply to humans; an agent's capability ceiling is a
  separate axis — `setRole` must reject (or not surface) agent rows. Confirm when `users.isAgent`/`kind`
  lands.
- **Credential inheritance for agents (flagged, not mechanical).** Does an agent principal inherit the
  owner's `max-pro-sub` tier through admin's gate, or get its own? This is a permission-model decision the
  admin doc frames but credentials + the §7.1 spine resolve.
- **`workloads`/`corpus.embed`/`credentials.verifyHostClaude` are also `adminProcedure`-gated at
  transport.** Under the `can()` model, do these deployment-global admin gates stay transport-only, or
  also gain a verb-tier `requireAdmin` (defense-in-depth like the user-admin verbs)? Lean: deployment-global
  ops can stay transport-gated; per-resource privileged ops get the 2-layer.
```
