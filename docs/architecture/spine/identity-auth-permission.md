# Orbweaver — `identity / auth / permission`: resolve once, gate everywhere

> **Status: planning (authoritative spine).** This is the cross-cutting §7.1 thread — it threads through
> `sessions`, `admin`, `credentials`, `buddy`, `chat`, and `infra`, and a per-domain reader checks its
> slice against THIS doc rather than re-deciding the model. The domain docs did the recon and own the
> mechanics; this doc lands the ONE canonical decision and the enforcement gates. It consolidates: the
> three-tier auth split (verify / resolve / mint), the ONE immutable `Principal`, the three-axis
> permission model (global × resource × capability), and the LOCKED first-class-principal transition for
> agents. Authoritative siblings: `domains/sessions.md` (the anchor — resolve-once, the 4 modes,
> `provisionIdentity`/`ensureUser`), `domains/admin.md` (global-role gating, `requireAdmin` 2-layer, the
> `can()` seam, the last-admin guard), `domains/credentials.md` (the AAD belt, the `max-pro-sub`
> admin-gate), `domains/buddy.md` (the §8.6 buddy-as-principal transition + the firewall inversion),
> `tiers/infra.md` (auth VERIFICATION is sealed/db-free → `ResolvedIdentity` with no `userId`).
> `_FANOUT-BRIEF.md` §7.1 + §8.6 carry the recon; `structure.md` §7 the gate vocabulary.

## 0. The principle — resolve identity ONCE at the edge; gate on what you resolved

Today identity is resolved **twice per request** across **three differently-named shapes**
(`ResolvedIdentity → AuthContext → Context`), with `role` duplicated in two and `userId` re-queried in
the third. And authorization is **one-third built**: a real global `admin|user` axis, a `host|member`
resource axis that exists in schema but gates nothing, and no capability layer at all — so access control
is, in practice, pure single-owner row-scoping (`chats.ownerId === ctx.userId`). That single-owner
assumption is exactly what breaks for multi-human chats and for agents.

> **Orbweaver: identity is resolved ONCE at the entry seam into ONE immutable `Principal` that flows
> down unchanged; every privilege decision routes through ONE `can(principal, action, resource)` seam.**
> Never re-query identity. Never scatter `role === 'admin'` / `ownerId === userId`. The three auth tiers
> (verify / resolve / mint) are tier edges, not prose; the three permission axes are one model.

## 1. The canonical model — the ONE `Principal`

Auth happens in **three tiers**, each producing a distinct, named artifact:

| Tier | Where | Produces | Knows DB ids? |
|---|---|---|---|
| **VERIFICATION** | `infra/auth` (sealed, db-free) | `ResolvedIdentity { externalId, handle, groups }` + the per-request signals (`via`, `viaCookie`, `hasCsrfHeader`) | **NO** — infra must not know row ids |
| **RESOLUTION + upsert** | `domain/sessions` (`provisionIdentity` / `ensureUser` / `validate`) | the `users` row (`userId`, `enabled`, `role`) | yes (it owns the upsert) |
| **CONSTRUCTION (minting the Principal)** | `entry/auth/seam.ts` (the ONE composition seam) | the immutable `Principal` | — assembles it |

The seam constructs the Principal **once**, from whichever path resolved the caller, and carries it down:

```ts
// @orb/contracts/identity.ts
//   ResolvedIdentity = the mode-resolver OUTPUT (pre-row; infra produces it — NO userId by design).
//   Principal        = the post-seam, immutable, db-resolved caller. Constructed ONCE at entry/auth/seam.ts.
export type UserRole = "admin" | "user";          // the ONE global-authz union (kills 33 inline redecls)

export interface Principal {
  userId: UserId;            // resolved ONCE: validate (cookie) | provisionIdentity (SSO) | owner-seed (fallback)
  role: UserRole;            // the single global-authz axis carried downstream
  handle: Handle;
  externalId: ExternalId | null;
  via: "cookie" | "header" | "fallback";  // subsumes viaCookie/viaFallback (CSRF + owner discriminators)
}
```

`AuthContext` and `Context.{userId,role}` collapse into `Principal`. **One construction site, no
re-query.** The seam builds it from three return shapes: `sessions.validate` returns `userId` for cookie
modes (the JOIN already has it — the old code threw it away), `provisionIdentity` returns
`{ userId, enabled, role }` for header/SSO modes, and the owner-fallback mints it with **no DB touch**
(the owner is the owner by definition, not a revocable user). The 4 auth modes
(`single-user | local | forward-header | oidc`) stay one clean dispatcher — a `MODE_RESOLVERS:
Record<AuthConfig["mode"], ModeResolver>` mapped record in `infra/auth`, one branch point — and this
redesign does not touch them; it changes only what the seam does with their output.

**BFF session ≠ SDK chat session.** Two unrelated concepts wear the word "session." The revocable
browser login (`sessions` table, identity + live login state, owned by `domain/sessions`) is THIS
doc's concern. The prompt-cache lineage of a stateful agent-sdk turn (`session_entries` table, owned by
`domain/chat`, backend-internal to the claude-sdk strategy) is NOT. They share only a comment. Keep them
in different domains, tables, and tiers.

## 2. The permission model — global-role × resource-role × capability

`permission = global-role × resource-role × capability`. Three axes; today only the first is wired.

| Axis | Today (verified) | Orbweaver target |
|---|---|---|
| **global-role** `admin\|user` | **WIRED, 2-layer** — transport `adminMiddleware` reads `ctx.auth.role` (no db round-trip); verb-tier `requireAdmin` re-checks (db fallback). Real defense-in-depth. | Keep both rungs. `requireAdmin` becomes `can(p, 'admin', global)` — one implementation behind the seam. |
| **resource-role** `chat_participants.role: host\|member` | **EXISTS in schema, gates NOTHING** — verified: the column is declared (`chat.ts:307`, comment "Consumed in Step 4c; just a column here"); principal-scout measured 33 writes, 0 authority reads. Access control is pure owner-equality (`loadOwnedChat`, ~45 sites across 31 files). | **WIRE it** as chat authority (chat's job): `requireParticipant` / `requireHost` predicates REPLACE owner-equality. "unwired ≠ worthless." |
| **capability** (per-action ceiling) | **none** — privilege is scattered `role === 'admin'` / `ownerId === userId`. | Introduce `can(principal, action, resource)`; `requireAdmin` + `requireHost` are its first two implementations; the agent capability ceiling (§4) is enforced here. |

**Wired vs target, concretely:**
- **Global-role stays 2-layer.** `adminMiddleware` (transport) + `requireAdmin` (verb) is deliberate
  redundancy — a verb called from a non-tRPC path (a job, a fixture, a future internal caller) is still
  gated. Do NOT collapse to one layer. Both rungs route their decision through one `can()` seam; the
  only `role === 'admin'` comparison site is **inside** that primitive.
- **`UserRole` gets one home.** `@orb/contracts/identity` — the §7.5 census found 35 touches / 33 inline
  `"admin" | "user"` re-spellings. The db enum column, the tRPC `z.enum`, the client form, and every
  gating domain derive from the single union (mirrored to the db enum by a test).
- **Owner-equality dies the right way.** `loadOwnedChat` / `ownerId === userId` conflates two questions —
  "load this resource" and "may this principal act on it." Split them: `requireParticipant(principal,
  chatId)` (membership) and `requireHost(principal, chatId)` (authority), reading `chat_participants`.
  This is chat's build, but the permission model frames it as the resource-role axis.

## 3. Per-tier detail (the load-bearing seams)

### Verification (`infra/auth`) — sealed, db-free, fails closed
The mode dispatcher applies the origin-gated owner fallback after the resolver runs. It produces a
`ResolvedIdentity` with **no `userId`** (compile-time invariant: the type has no such field). The
db-dependent steps (cookie-validate, the user upsert) are **injected in** via `ResolveDeps` so infra
never imports `domain/sessions` or `@orb/db`. **JWKS fails closed three+ ways** (a JWT without its
JWKS → reject; an empty allowlist → refuse the request-supplied JWKS; bad-JSON/non-https/off-allowlist
URL → null; verified-but-no-`preferred_username` → reject rather than fall through to the unsigned path;
verify throws → reject). A present-but-invalid JWT NEVER silently downgrades to the unsigned path.

### Resolution (`domain/sessions`) — the upsert, keyed for rename stability
`provisionIdentity` matches on the stable `externalId` first (an SSO username rename updates `handle` on
the SAME row — no duplicate tenant); `ensureUser` / single-user / owner-fallback key on `handle`
(`externalId` NULL). **Change the match order or key and renames silently fork into duplicate tenants.**
`role` is preserved on UPDATE by default (a manual `setRole` grant survives the next login) unless
`RE_DERIVE_ROLE_ON_LOGIN`; `enabled` is NEVER reset on UPDATE (else a disabled user re-enables by logging
in). The owner-role decision (`determineRole` — `admin` iff identity ∈ `OWNER_GROUP` or handle ∈
`OWNER_HANDLES`) is the one access-control decision the app owns.

### Construction (`entry/auth/seam.ts`) — the owner-fallback belt + CSRF gate
The seam mints the Principal and is also where the two request-edge gates fire. **The owner-fallback is
bootstrap AND an origin-gated security belt:** `via:"fallback"` is the SAFE "this IS the owner"
discriminator — **NOT `externalId === null`** (a forward-header identity also has `externalId === null`
when no uid header was forwarded). Under SSO modes the fallback is granted ONLY on a local origin
(`isLocalOrigin` reads `Host`, not `X-Forwarded-Host` — a proxy can only REMOVE trust, never grant it;
fails closed); under `single-user` it is unconditional (the only way in). **Removing the origin gate
hands every anonymous public request owner+admin.** **CSRF keys on `via`/`viaCookie`:** a cookie-
authenticated MUTATION without the custom `x-neo-csrf` header → 403; header/fallback requests carry no
cross-site surface and are exempt. The boot owner-seed (one-time `role=admin` backfill for `OWNER_HANDLES`)
is an `entry/boot` concern.

### The privileged construction sites (gated, not scattered)
- **`max-pro-sub` is the ONLY privileged-credential construction site** (verified `credentials.ts:547–562`
  — the mint sits right after `effectiveRole !== "admin"` → throw). admin owns the GATE primitive
  (`requireAdmin`/`can()`); credentials owns the CONSTRUCTION. Orbweaver promotes the cast to a tier-1
  opaque factory: `MaxProSubCredential` is unconstructable except inside a factory that accepts a
  `Principal` and returns the opaque type only if the admin check passes — the `as ResolvedCredential`
  cast vanishes from call sites.
- **The credential AAD binds `(userId, provider)`** — `aad = ${userId}|${provider}`, supplied by the one
  `aadFor()` site, carried byte-for-byte by `infra/crypto`'s `SecretBox` (which never derives it). A row
  moved to a different slot fails GCM tag verification (a loud error, not a silent wrong decrypt).
  **Must stay byte-identical across any refactor.**

## 4. Agents are FIRST-CLASS PRINCIPALS (LOCKED, §8.6)

> **v1 scope (council 2026-06-25 — DECIDED).** Build **human participant-membership in v1**: the
> `can()` seam + `requireParticipant`/`requireHost` replacing owner-equality (§2–§3). It's free
> greenfield and avoids the measured 45-site/31-file retrofit. **DEFER the agent-principal *mint*
> mechanics below** (`provisionAgentPrincipal`, `users.isAgent`/`kind:'agent'`, agent `authorUserId`
> stamping, the `buddy_turns` firewall inversion) — buddy ships v1 in the borrowed-owner posture (one
> principal, safe). The model below is the locked target the v1 seams must not foreclose. (ledger §5.)
>
> **`can()` interface (DECIDED):** `can(principal, action, resource): void` — **throws
> `DomainForbiddenError` on deny** (matches `requireAdmin`); `resource: ResourceRef` is a discriminated
> union `{ kind:'global' } | { kind:'chat', chatId } | { kind:'character', characterId } | …`;
> `requireAdmin`/`requireParticipant`/`requireHost` are named wrappers. Lives in `domain/admin/guard.ts`.
> When the agent split lands, add an `'observer'` participant kind (the Narrative Director seam).

Today the buddy is **not** a `users` row — it's a per-owner row (`buddies.userId → users.id`) acting
**as the owner**, and that borrowed identity gives three safety properties *for free*: the kill switch
(`agencyEnabled`), the propose/confirm gate (`buddy.confirm` is the sole executor), and the `buddy_turns`
firewall (the buddy writes no chat `messages`; `BuddyAgentRequest` has no `chatId` — passing chat context
is a compile error). Orbweaver makes an agent a **real principal**: its own `users` row + identity, a
seat in `chat_participants`, and **self-attributed messages** (`authorUserId` = the agent, not the
owner). This unifies with multi-human — both want `chat_participants` to carry authz and `authorUserId`
to mean the real author. ONE model, not two.

**The `chat_participants.kind` overload must split.** Verified (`chat.ts`): `kind: ["human",
"character"]` (line 301) means BOTH the identity table (users vs characters) AND human-vs-AI at once,
enforced by the XOR check `(userId IS NULL) <> (characterId IS NULL)` (lines 326–328). An agent principal
is **both** userId-backed **and** AI-driven → **currently unrepresentable** (the XOR forbids a row with
both a userId and a card link; arbitration only considers `kind:"character"`). The fix: introduce a
`kind:"agent"` / `isAi` axis **distinct from the identity-table axis** — an agent row carries a `userId`
(it's a principal) yet is AI-arbitrated. The `parseParticipant` `never`-exhaustiveness guard + the XOR
check are the tripwires that enumerate the work.

**The 6 NEW builds** (vs modifications), per principal-scout:
1. **`provisionAgentPrincipal`** — mint a non-SSO, non-loginable `users` row from inside the app
   (precedent: `mintSyntheticGroupCharacter`, the `__group__${chatId}` synthetic namespace). Lives in
   `domain/sessions`, next to `provisionIdentity`.
2. **`users.isAgent`/`kind` column** (in `@orb/db`) with non-loginable semantics — `passwordHash` NULL,
   `externalId` NULL, **never resolved by any auth mode**. `admin.createUser` mints loginable humans
   only; `setRole` must reject (or not surface) agent rows.
3. **`requireParticipant` / `requireHost`** — split resource-load from authority-check, replacing the
   ~45 `loadOwnedChat` owner-equality sites (chat's build; framed by the resource-role axis).
4. **Principal-id threading into the persist path** — `authorUserId` is **NEVER stamped on the live send
   path today** (verified: only a one-time backfill, `set({ authorUserId: chat.ownerId })`,
   `backfill-roster.ts:67`). Threading a real principal-id (≠ the access `userId`) is a new build.
5. **The agent seat** — userId-backed yet AI-arbitrated (the `kind` split above).
6. **The `buddies.userId` owner-link split** — owner-link-vs-own-principal.

**The firewall INVERTS — and the free safety becomes an explicit capability ceiling.** Once the buddy is
a participant with self-attributed messages, the `buddy_turns`-vs-`messages` firewall inverts: an agent
principal **CAN write to `messages`**. The safety the borrowed-owner identity gave for free (kill switch
+ propose/confirm gate + hourly rate-limit) must **survive as the capability axis of the permission
model**, not as an emergent property of "it's just the owner." A confused/runaway model can still only
*suggest*, never *act* beyond its ceiling — but now that ceiling is `can(agentPrincipal, action,
resource)`, enforced by global × resource × **capability**, not by borrowed identity. The OAuth
credential firewall (empty config dir, OAuth sources nulled — **never extract the OAuth token**, ban
risk) is preserved on every routing path regardless.

## 5. Invariants (gate candidates)

1. **Identity is resolved ONCE → one immutable `Principal`; `userId` is carried, never re-queried.**
   *Enforcement: compile-time (`Principal.userId` required; one construction site at `entry/auth/seam.ts`)
   + lint (`ensureUser`/`provisionIdentity` imported ONLY by the seam — a domain/transport re-resolve is
   RED).*
2. **Three tiers stay distinct.** Verification (`infra/auth`, db-free) / resolution + upsert
   (`domain/sessions`) / minting (the `entry/` seam) / boot owner-seed (`entry/boot`). *Enforcement:
   resolve-time (`infra/auth` declares no domain/`@orb/db` dep — db steps injected via `ResolveDeps`;
   cookie I/O is route-tier; the seam is `entry/`).*
3. **`ResolvedIdentity` carries NO `userId`.** *Enforcement: compile-time (the type has no such field;
   the seam adds it when building `Principal`).*
4. **The 4 modes dispatch through one exhaustive record.** `MODE_RESOLVERS: Record<AuthConfig["mode"],
   ModeResolver>`; a 5th mode is a `tsc`-checked addition. *Enforcement: compile-time (`exhaustive-dispatch`).*
5. **`UserRole` has one declaration** (`@orb/contracts/identity`); the db enum, tRPC schema, client form,
   and every gating domain derive it. *Enforcement: compile-time (drift breaks `tsc`) + lint
   (`no-inline-union-redecl`, count = 1).*
6. **Every privilege decision routes through `can()` / `requireAdmin`.** The only `role === 'admin'`
   comparison site is inside that primitive; the global-role gate keeps BOTH rungs (transport
   `adminMiddleware` + verb `requireAdmin`). *Enforcement: lint (`role === 'admin'` appears only in the
   seam) + test (a `user`-role principal throws `DomainForbiddenError` at the verb).*
7. **The owner/admin fallback is granted only via `via:"fallback"` + the origin gate; never via
   `externalId === null`.** *Enforcement: compile-time (`Principal.via` discriminant) + test (anonymous
   on a public origin → 401; on a local origin → owner+admin).*
8. **JWKS/JWT verification fails closed** — every rejection returns `null` (→ fallback or 401), never a
   500, never a downgrade to the unsigned path. *Enforcement: test (each of the five reject points → null).*
9. **CSRF keys on `via`/`viaCookie`** — a cookie-authenticated mutation without the custom header → 403;
   header/fallback exempt. *Enforcement: test (cookie mutation w/o header → 403; header request passes).*
10. **The `max-pro-sub` mint is gated by admin's primitive but constructed in credentials.**
    *Enforcement: compile-time (the `MaxProSubCredential` opaque factory takes a `Principal` and applies
    the admin check; it is the only construction site).*
11. **The credential AAD `${userId}|${provider}` is byte-identical, single-sited, carried-not-derived.**
    *Enforcement: lint (all `box.encrypt`/`decrypt` import from the one `aadFor()`) + test (round-trip;
    AAD-swap → GCM failure, not a silent wrong decrypt).*
12. **An agent principal is non-loginable and never auth-resolved.** `users.isAgent`/`kind` agent rows
    have `passwordHash`/`externalId` NULL; no auth mode resolves them; `admin.createUser` mints humans
    only; `setRole` rejects agent rows. *Enforcement: compile-time (the mint is `provisionAgentPrincipal`,
    distinct from `provisionIdentity`) + test (no mode resolves an agent row; the agent's actions are
    bounded by its capability ceiling, not the owner's).*
13. **BFF session ≠ SDK chat session.** Separate tables, domains, tiers; `domain/sessions` has zero
    SDK-frame code. *Enforcement: resolve-time (no dep from `domain/sessions` on the claude-sdk strategy /
    `session_entries`).*

## 6. Open decisions

- **The `can(principal, action, resource)` seam shape.** Does `requireAdmin` *become* `can(p, 'admin',
  global)`, or does `can()` wrap `requireAdmin` + `requireHost` as two concrete predicates? Lean:
  introduce `can()` as the seam with `requireAdmin` (global) and `requireHost` (resource, chat's) as its
  first two implementations — so the capability axis has a home to grow into without re-scattering checks.
- **Credential inheritance for agents (flagged, not mechanical).** Does an agent principal inherit the
  owner's `max-pro-sub` tier through admin's gate, or get its own credential? Spans sessions + credentials
  + this spine. (Buddy's "always cheap" today is just a per-agent connection default; the admin gate stays
  in credential resolution — but a self-attributed agent in a shared chat is a new policy question.)
- **`Principal` shape — does it carry `groups`?** Today `validate` returns `groups: []` by design (SSO
  groups are consumed into `users.role` at login). Lean: drop `groups` — `role` is the sole carried
  authz axis. Revisit only if a downstream consumer needs live group membership (none today).
- **Solo buddy chat under the principal model.** Does the `buddy_turns` transcript survive as the
  solo-chat case, or does solo buddy chat become a real chat room with the buddy as a participant? (Buddy
  doc surfaces; spine + chat decide.)
- **`agent` as a thin domain vs a pattern.** Where the agent-turn *composition* lives (a `domain/agent`
  vs chat exposing an injected `agentTurn` op). Lean: pattern (chat owns the one turn path; the shared
  agent contract lives in `contracts`/`providers` without a new domain). A chat-domain + spine call,
  surfaced by buddy — not resolved here.
- **`UserRole` vs an agent capability vocabulary.** `setRole` grants apply to humans; an agent's
  capability ceiling is a separate axis. Confirm the ceiling's representation (a per-action capability
  set vs a coarse agent-tier) when `users.isAgent`/`kind` lands.
