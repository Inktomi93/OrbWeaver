# Orbweaver — `identity / auth / permission`: resolve once, gate everywhere

> **Status: planning (authoritative spine).** This is the cross-cutting §7.1 thread — it threads through
> `sessions`, `admin`, `credentials`, `buddy`, `chat`, and `infra`, and a per-domain reader checks its
> slice against THIS doc rather than re-deciding the model. The domain docs did the recon and own the
> mechanics; this doc lands the ONE canonical decision and the enforcement gates. It consolidates: the
> three-tier auth split (verify / resolve / mint), the ONE immutable `Principal`, the three-axis
> permission model (global × resource × capability), and the LOCKED first-class-principal transition for
> agents. Authoritative siblings: `domains/sessions.md` (the anchor — resolve-once, the 4 modes,
> `provisionIdentity`/`ensureUser`), `domains/admin.md` (global-role gating, `requireAdmin` 2-layer, the
> `can()` seam, the owner-immutability guard), `domains/credentials.md` (the AAD belt, the `max-pro-sub`
> owner-gate), `domains/buddy.md` (the §8.6 buddy-as-principal transition + the firewall inversion),
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
// the ONE global-authz axis (kills 33 inline redecls) — owner|admin|user (ledger D17, was admin|user)
export const USER_ROLES = ["owner", "admin", "user"] as const satisfies readonly UserRole[];
export type UserRole = "owner" | "admin" | "user";
//   owner = the box owner: sole max-pro-sub/wallet holder; grants/revokes admin; immutable; EXACTLY ONE.
//   admin = delegated administrator (all admin surfaces, NOT the box owner). user = normal.

export interface Principal {
  userId: UserId;            // resolved ONCE: validate (cookie) | provisionIdentity (SSO) | owner-seed (fallback)
  role: UserRole;            // the single global-authz axis carried downstream (owner ⊇ admin in the can() seam)
  handle: Handle;
  externalId: ExternalId | null;
  via: "cookie" | "header" | "fallback";  // subsumes viaCookie/viaFallback (CSRF + owner discriminators)
}
```

**The server-owner role split (ledger D17).** `owner` and `admin` were conflated (a 2-member `admin|user` + `OWNER_*`
making the owner "just an admin"), so a delegated admin couldn't be added without handing over the box + the
`max-pro-sub` sub. Now `owner|admin|user` is the one axis: `requireAdmin` = `can(p,'admin',global)` passes for **owner ∪
admin**; a new **`requireOwner`** (owner-only) gates the box-credential mint + admin grant/revoke + owner-only surfaces.
**The owner's box = two resource classes** (D17): hosted creds (`max-pro-sub`/wallet) are **owner-only**, non-owner use
refused unless explicit owner consent (default OFF — ban-prone + money); local compute (the owner's vLLM + in-process
transformers.js/ONNX tier) is shared-by-design but **count-budgeted** + concurrency-bounded + owner-throttleable (default
ON — only contention). NOTE: the per-chat `chat_participants.role: host|member` is a **separate, orthogonal** axis
(resource-scoped) — `host` ≠ the server `owner`.

`AuthContext` and `Context.{userId,role}` collapse into `Principal`. **One construction site, no
re-query.** The seam builds it from three return shapes: `sessions.validate` returns `userId` for cookie
modes (the JOIN already has it — the old code threw it away), `provisionIdentity` returns
`{ userId, enabled, role }` for header/SSO modes, and the owner-fallback mints it with **no DB touch**
(the owner is the owner by definition, not a revocable user). The 4 auth modes
(`single-user | local | forward-header | oidc`) stay one clean dispatcher — a `MODE_RESOLVERS:
Record<AuthConfig["mode"], ModeResolver>` mapped record in `infra/auth`, one branch point — and this
redesign does not touch them; it changes only what the seam does with their output.

**Where each mode's `userId` is resolved (ledger D40 — the identity-resolution invariant).** `infra/auth`
yields NO `userId`/`role` in every mode; the row read is always a tier below it:

| mode | infra produces | injected port returns | `userId` resolved by |
|---|---|---|---|
| forward-header | `ResolvedIdentity` (no id) | `ForwardJwtClaims` — no userId | domain `provisionIdentity` → seam |
| oidc (login) | — | `OidcTransaction` — no userId | route code-exchange → cookie mint |
| single-user / fallback | `{externalId:null, handle, groups:[]}` | — | seam `ensureUser` (handle→UserId) |
| cookie (local/oidc steady) | `ResolvedIdentity` (no id) | — (no infra port; D40) | domain `sessions.validate` → seam |

Three of four modes already obeyed this; the cookie path was the deviation — an infra
`ResolveDeps.validateCookie` (typed `=> ResolvedIdentity`, no `userId`) wired to `sessions.validate`
(which DOES return `userId`) would force the seam to re-query or drop the id. **Resolution (D40, Route A
— Spring's verify→`UserDetailsService`→construct split): the cookie→user read is DOMAIN resolution
(`sessions.validate`) the seam calls directly; the `validateCookie` port is removed at 4c/4e (FLAG
planted at `infra/auth/contract.ts`).**

**BFF session ≠ SDK chat session.** Two unrelated concepts wear the word "session." The revocable
browser login (`sessions` table, identity + live login state, owned by `domain/sessions`) is THIS
doc's concern. The prompt-cache lineage of a stateful agent-sdk turn (`session_entries` table,
backend-internal to the agent-sdk provider — `infra/providers/backends/agent-sdk/session/`, ledger D8;
the chat domain is stateless-first and does NOT own it) is NOT. They share only a comment. Keep them
in different domains, tables, and tiers.

## 2. The permission model — global-role × resource-role × capability

`permission = global-role × resource-role × capability`. Three axes; today only the first is wired.

| Axis | Today (verified) | Orbweaver target |
|---|---|---|
| **global-role** `owner\|admin\|user` (D17) | **WIRED, 2-layer** — transport `adminMiddleware` reads `ctx.auth.role` (no db round-trip); verb-tier `requireAdmin` re-checks (db fallback). Real defense-in-depth. (Today 2-member; D17 adds `owner`.) | Keep both rungs. `requireAdmin` = `can(p,'admin',global)` (passes **owner ∪ admin**); a new **`requireOwner`** = `can(p,'owner',global)` (owner-only) gates the box-credential mint + admin grant/revoke. owner ⊇ admin lives only in the seam. |
| **resource-role** `chat_participants.role: host\|member` | **EXISTS in schema, gates NOTHING** — verified: the column is declared (`chat.ts:307`, comment "Consumed in Step 4c; just a column here"); principal-scout measured 33 writes, 0 authority reads. Access control is pure owner-equality (`loadOwnedChat`, ~45 sites across 31 files). | **WIRE it** as chat authority (chat's job): `requireParticipant` / `requireHost` predicates REPLACE owner-equality. "unwired ≠ worthless." |
| **capability** (per-action ceiling) | **none** — privilege is scattered `role === 'admin'` / `ownerId === userId`. | Introduce `can(principal, action, resource)`; `requireAdmin` + `requireHost` are its first two implementations; the agent capability ceiling (§4) is enforced here. |

**Wired vs target, concretely:**
- **Global-role stays 2-layer.** `adminMiddleware` (transport) + `requireAdmin` (verb) is deliberate
  redundancy — a verb called from a non-tRPC path (a job, a fixture, a future internal caller) is still
  gated. Do NOT collapse to one layer. Both rungs route their decision through one `can()` seam; the
  only `role === 'admin'` comparison site is **inside** that primitive.
- **`UserRole` gets one home.** `@orb/contracts/identity` (`USER_ROLES`/`UserRole` = `owner|admin|user`, D17) — the §7.5
  census found 35 touches / 33 inline re-spellings (then `"admin"|"user"`). The db enum column, the tRPC `z.enum`, the
  client form, and every gating domain **derive** from the single tuple (mirrored to the db enum by a test); §7.5
  exhaustive dispatch over the 3-member axis. No inline role-union re-spelling.
- **Owner-equality dies the right way — and `chats.ownerId` dies with it (D18).** `loadOwnedChat` /
  `ownerId === userId` conflates two questions — "load this resource" and "may this principal act on
  it." Split them: `requireParticipant(principal, chatId)` (membership) and `requireHost(principal,
  chatId)` (authority), reading `chat_participants`. **A chat is membership-scoped, not single-owned, so
  the `chats.ownerId` COLUMN is dropped** (not just the check): the host = `chat_participants(role='host')`
  is the one home for authority + the `runAsUserId`/funding source + the host-only-search scope (derived from
  membership, not a stamped digest `ownerId` — D20);
  `loadOwnedChat` becomes `loadMemberChat → {chat, role}` and "list my chats" is pure membership. This is
  chat's build; the permission model frames it as the resource-role axis. (Owned data splits two ways:
  single-owned — `ownerId`/`fetchOwned` — vs membership-scoped — `chat_participants`/`requireParticipant`.)

### 2a. The chat per-verb auth matrix + the enforcer (resource-role, chat's build — `domains/chat.md` Part III §11)

The resource-role axis is a **typed per-verb matrix**, not a single gate:

| Action class | Required | Note |
|---|---|---|
| read / stream | **member** | `requireParticipant` |
| post a message | **member** | author server-stamped (`authorUserId` + persona), never client-supplied |
| edit / delete a message | **author-or-host** | own row, or host override |
| reseed / reorder / group-config / room-overrides / invites / kick / handoff / anchor-reassignment | **host-only** | `requireHost` |
| lineage walk (fork/export/corpus ancestry) | **gated INDEPENDENTLY per-ancestor** | a fork grants NO parent membership |

**The enforcer is a `scripts/check` gate with an EXPLICIT, default-deny scope** — every `chatId`-taking verb **+ the SSE
subscribe path (a kicked member's stream stops yielding within the kick tx) + bus delivery + cross-domain lineage walkers
+ `forkChat` + `chat_injections` + anchor reassignment** routes through the membership chokepoint; an unlisted `chatId`
surface defaults to deny. (The §8.6 finding: "`requireMember` is a typed security boundary, not a one-line `ensureOwned`
swap" — the biggest review overclaim.)

### 2b. The turn-identity TRIPLE (member-triggered turns run as the host)

A member-triggered AI turn runs as the **host** (`runAsUserId`), not the caller — and the split is a **TRIPLE, not one
id** (neo §10.4): `runAsUserId` rebinds (1) the **id** for credential/routing resolution, (2) the **role** the credential
gate reads (so `max-pro-sub` stays the owner's — the by-proxy refusal, §3), and (3) the **model** that effort/intent is
gated against. **Three identities on a turn, named crisply (D19):** the **caller** is `Principal.userId` (already carried
— membership/CSRF, the `authorUserId` of a human post); **`triggeredBy`** is the human RESPONSIBLE for the turn (spend
budget + abort-rights + attribution) — it equals `Principal.userId` for a direct send but is the **chain-starting human
for an auto-mode turn** (no fresh caller), which is why it's a distinct concept, not a synonym; **`runAsUserId`** is the
host (whose box funds it). *There is no separate `callerUserId` term — the caller is just `Principal.userId`.* Resolve
`runAsUserId` ONCE at turn start; read all host state under that frozen id inside the lock; **the turn path never passes
the caller's `Principal.userId` to `resolveCredential`/`loadUserSettings`** (a `check`-gate + the `turn-identity` gate
enforce it). There is no resolved-credential cache — passing the wrong id IS the entire failure mode.

### 2c. The `AUTH_MODE != single-user` capability gate

The whole multi-human surface (invites / notifications / join / roster authority for non-owners) presupposes ≥2
accounts → it is gated `AUTH_MODE != 'single-user'` as a **server-side guard on every invite/notifications/join
procedure** (404 in single-user), NOT a client hide; the UI surface is HIDDEN (not merely disabled). Wired into the same
enforcer. (`single-user` has one identity, no peers; multi-user rows come from `oidc`/`forward-header` auto-provision or
`local`.)

## 3. Per-tier detail (the load-bearing seams)

### Verification (`infra/auth`) — sealed, db-free, fails closed
The mode dispatcher applies the origin-gated owner fallback after the resolver runs. It produces a
`ResolvedIdentity` with **no `userId`** (compile-time invariant: the type has no such field). The
db/crypto-dependent VERIFICATION steps it needs (the OIDC PKCE/state consume, the forward-header JWT
verify) are **injected in** via `ResolveDeps` so infra never imports `domain/sessions` or `@orb/db`.
**The cookie→user read is NOT one of them (ledger D40):** a cookie's validation IS a `users`-row read —
RESOLUTION, not verification — so it is the DOMAIN step `sessions.validate` (which returns `userId`) the
seam calls DIRECTLY; an infra `ResolveDeps.validateCookie` port would be forced to drop the `userId` (the
no-row-ids invariant), recreating neo's "validate threw the id away" bug, so that port is removed at
4c/4e. **JWKS fails closed three+ ways** (a JWT without its
JWKS → reject; an empty allowlist → refuse the request-supplied JWKS; bad-JSON/non-https/off-allowlist
URL → null; verified-but-no-`preferred_username` → reject rather than fall through to the unsigned path;
verify throws → reject). A present-but-invalid JWT NEVER silently downgrades to the unsigned path.

### Resolution (`domain/sessions`) — the upsert, keyed for rename stability
`provisionIdentity` matches on the stable `externalId` first (an SSO username rename updates `handle` on
the SAME row — no duplicate tenant); `ensureUser` / single-user / owner-fallback key on `handle`
(`externalId` NULL). **Change the match order or key and renames silently fork into duplicate tenants.**
`role` is preserved on UPDATE by default (a manual `setRole` grant survives the next login) unless
`RE_DERIVE_ROLE_ON_LOGIN`; `enabled` is NEVER reset on UPDATE (else a disabled user re-enables by logging
in). The owner-role decision (`determineRole` — **`owner`** iff identity ∈ `OWNER_GROUP` or handle ∈
`OWNER_HANDLES`; else `user`) is the one access-control decision the app owns (D17). **`admin` is never
derived from env — it is GRANTED**: `setRole` (owner-only) promotes a `user`→`admin`; the owner is
immutable (can't be demoted; exactly one — the bootstrap OWNER identity; ownership *transfer* is a future
owner-only action, not v1). The **last-owner / owner-immutability guard** replaces the old last-admin guard.

### Construction (`entry/auth/seam.ts`) — the owner-fallback belt + CSRF gate
The seam mints the Principal and is also where the two request-edge gates fire. **The owner-fallback is
bootstrap AND an origin-gated security belt:** `via:"fallback"` is the SAFE "this IS the owner"
discriminator — **NOT `externalId === null`** (a forward-header identity also has `externalId === null`
when no uid header was forwarded). Under SSO modes the fallback is granted ONLY on a local origin
(`isLocalOrigin` reads `Host`, not `X-Forwarded-Host` — a proxy can only REMOVE trust, never grant it;
fails closed); under `single-user` it is unconditional (the only way in). **Removing the origin gate
hands every anonymous public request owner+admin.** **CSRF keys on `via`/`viaCookie`:** a cookie-
authenticated MUTATION without the custom `x-neo-csrf` header → 403; header/fallback requests carry no
cross-site surface and are exempt. The boot owner-seed (one-time `role=owner` backfill for `OWNER_HANDLES`)
is an `entry/boot` concern.

### The privileged construction sites (gated, not scattered)
- **`max-pro-sub` is the ONLY privileged-credential construction site** (verified `credentials.ts:547–562`
  — the mint sits right after the privilege check → throw). **It is the OWNER's box credential, so the gate
  is `requireOwner`, not `requireAdmin`** (D17 — a delegated admin is NOT the box owner and never resolves
  the owner's sub). admin/the seam owns the GATE primitive (`requireOwner`/`can(p,'owner',global)`);
  credentials owns the CONSTRUCTION. Orbweaver promotes the cast to a tier-1 opaque factory:
  `MaxProSubCredential` is unconstructable except inside a factory that accepts a `Principal` and returns
  the opaque type only if the **owner** check passes — the `as ResolvedCredential` cast vanishes from call
  sites. **max-pro-sub-by-proxy:** a member/agent-triggered `max-pro-sub` turn forces the DB role SELECT on
  `runAsUserId` and is **refused unless explicit owner consent** (default OFF); `triggeredBy` is checked
  separately — never trust a caller-supplied role arg (the §8.4 escalation surface).
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
   resolve-time (`infra/auth` declares no domain/`@orb/db` dep — its db/crypto VERIFICATION steps inject
   via `ResolveDeps`; the cookie→user RESOLUTION step is the seam's direct `sessions.validate` call, not
   an infra port, D40; cookie I/O is route-tier; the seam is `entry/`).*
3. **`ResolvedIdentity` carries NO `userId`.** *Enforcement: compile-time (the type has no such field;
   the seam adds it when building `Principal`).*
4. **The 4 modes dispatch through one exhaustive record.** `MODE_RESOLVERS: Record<AuthConfig["mode"],
   ModeResolver>`; a 5th mode is a `tsc`-checked addition. *Enforcement: compile-time (`exhaustive-dispatch`).*
5. **`UserRole` = `owner|admin|user`, one declaration** (`@orb/contracts/identity`, `USER_ROLES`); the db enum, tRPC
   schema, client form, and every gating domain derive it. *Enforcement: compile-time (drift breaks `tsc`) + lint
   (`no-inline-union-redecl`, count = 1) + `exhaustive-dispatch` over the 3-member axis.*
6. **Every privilege decision routes through `can()`.** `requireAdmin` = `can(p,'admin',global)` (passes **owner ∪
   admin**); `requireOwner` = `can(p,'owner',global)` (owner-only). The only `role === 'owner'|'admin'` comparison site is
   inside that primitive; the global-role gate keeps BOTH rungs (transport `adminMiddleware` + verb `requireAdmin`).
   *Enforcement: lint (`role === 'admin'`/`'owner'` appears only in the seam) + test (a `user` throws at an admin verb; an
   `admin` throws at an owner-only verb).*
7. **The owner/admin fallback is granted only via `via:"fallback"` + the origin gate; never via
   `externalId === null`.** *Enforcement: compile-time (`Principal.via` discriminant) + test (anonymous
   on a public origin → 401; on a local origin → owner+admin).*
8. **JWKS/JWT verification fails closed** — every rejection returns `null` (→ fallback or 401), never a
   500, never a downgrade to the unsigned path. *Enforcement: test (each of the five reject points → null).*
9. **CSRF keys on `via`/`viaCookie`** — a cookie-authenticated mutation without the custom header → 403;
   header/fallback exempt. *Enforcement: test (cookie mutation w/o header → 403; header request passes).*
10. **The `max-pro-sub` mint is gated by `requireOwner` (owner-only) but constructed in credentials.** It is the OWNER's
    box credential (D17) — a delegated admin never resolves it. A non-owner-triggered `max-pro-sub` turn forces the DB
    role SELECT on `runAsUserId` and is refused unless explicit owner consent. *Enforcement: compile-time (the
    `MaxProSubCredential` opaque factory takes a `Principal` and applies the **owner** check; only construction site) +
    test (member-triggered max-pro-sub without consent → refused, fail-closed).*
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
14. **The server owner is unique + immutable** (D17). `determineRole` derives `owner` from `OWNER_*` only; `admin` is
    granted by `setRole` (owner-only); the owner can't be demoted/removed; exactly one. *Enforcement: a **structural
    enforcer** ships with the invariant (D40) — a **partial unique index `WHERE role = 'owner'`** on `users` so a
    second owner cannot be inserted at the DB level (born-compliant; the cleaner enforcer over seed-only-mint
    discipline) — PLUS the test belt (the last-owner / owner-immutability guard; `setRole` from a non-owner →
    `DomainForbiddenError`; demoting the owner → refused). Confirm the partial-unique index lands with the users slice.*
15. **The chat per-verb auth matrix is enforced default-deny over EVERY chatId surface** — verbs + SSE subscribe + bus
    delivery + lineage walkers + `forkChat` + `chat_injections` + anchor reassignment. *Enforcement: a `scripts/check`
    enforcer (every `chatId`-taking surface routes through the membership chokepoint; grep `ownerId ===` in chat → RED) +
    test (a kicked member's SSE stops yielding within the kick tx; a fork grants no parent read).*
16. **The turn-identity triple rebinds id + role + model-gating to `runAsUserId`; `triggeredBy` is separate; the caller
    is `Principal.userId` (no `callerUserId` term, D19).** The caller's `Principal.userId` never reaches
    credential/settings resolution. *Enforcement: compile/lint (`turn-identity` gate — the turn path passes
    `runAsUserId`, never the caller's `Principal.userId`, to `resolveCredential`/`loadUserSettings`) + test
    (`runAsUserId ≠ caller` resolves the host's credential; an auto-mode turn bills `triggeredBy` = the chain-starter).*
17. **The multi-human surface is server-side gated `AUTH_MODE != 'single-user'`** (404 in single-user; UI HIDDEN, not
    disabled). *Enforcement: test (every invite/notifications/join procedure 404s in single-user).*

## 6. Open decisions

- **The `can(principal, action, resource)` seam shape — RESOLVED (ledger §5; was open).** `can()` is the
  ONE decision primitive; it throws `DomainForbiddenError` and takes a typed `ResourceRef` union
  (`{kind:'global'} | {kind:'chat', roster} | …`). It + the **global-role** wrappers `requireAdmin`
  (= `can(p,'admin',global)`, owner∪admin) and `requireOwner` (owner-only) live in **`domain/admin/guard.ts`**
  — a low, dependency-light auth module that every domain imports **down** (not a cross-feature import).
  The **resource** predicates `requireParticipant`/`requireHost` are thin **chat-domain** wrappers: chat
  loads its own roster (`chat_participants` — its data, no extra query; the turn loads it anyway) and calls
  `can(principal, 'read'|'host', {kind:'chat', roster})`. So the DECISION always lives in the one `can()`
  seam; only the chat-specific data fetch is chat's. No `role === 'admin'` / `ownerId === userId` scattered
  anywhere else. *(Resolves the prior open question + the audit's Q1 — the seam home is `admin/guard.ts`,
  chat reaches it by importing `can()` downward and feeding it the roster.)*
- **Credential inheritance for agents — DECIDED (default, 2026-06-26; clarified by D17): the OWNER's agents
  INHERIT the OWNER's box sub via owner-delegated resolution.** (Reworded from "admin-host" → "owner" — with
  the role split, the box belongs to `owner`, not any `admin`.) An agent principal owned by the **owner**
  resolves credentials *as the owner* (`credentials.resolve` delegates to the owner's `userId`), so it can
  use the `max-pro-sub` sub; a delegated **admin** (and its agents), and any non-owner agent, get their own
  credential and never the owner's box. **The AAD belt is the load-bearing constraint, not a policy flag:**
  the sub ciphertext is GCM-bound under `${ownerUserId}|max-pro-sub`, so an agent with its *own* `userId`
  cannot decrypt it — "inherit" therefore means owner-delegated `resolve()`, NOT a re-mint under the agent's
  id. This is **one new arm in `credentials.resolve` at the agent-principal migration**; the v1 borrowed-owner
  posture (§4) already delivers it for free (agent == owner at the credential seam), so the v1 seams must keep
  `resolve` taking a `Principal` + injectable so the delegation arm has a home. (Local compute — the owner's
  vLLM/in-process tier — is NOT "inherited": it is shared-by-design + count-budgeted, D17.) Spans sessions +
  credentials + this spine. (ledger §3 + §7 D17.)
- **`Principal` shape — does it carry `groups`? RESOLVED (ledger §2): NO.** `validate` resolves SSO groups
  into `users.role` at login; `role` is the sole carried authz axis, and the `Principal` interface body
  already excludes `groups`. Recorded as decided (not open). Revisit only if a downstream consumer ever
  needs live group membership (none today).
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
