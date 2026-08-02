---
kind: law
status: active
updated: 2026-07-13
---

# Orbweaver — Spine: Identity, Auth, and Permission

Canonical doc for spine §7.1 (`AGENTS.md` §5.1 points here). BUILT — current law. Agent-principal detail: ledger D60 wins over this digest on any conflict; the design set is parked in `../proposed/` (see its `INDEX.md`) ([`../proposed/README.md`](../proposed/README.md)).

## 1. Resolution — one pipeline, one mint

Identity resolves ONCE at the edge into one immutable `Principal` (`@orb/contracts/identity`) that flows down unchanged. Three tiers, one direction:

| Tier | Home | Does | Never does |
| - | - | - | - |
| VERIFICATION | `infra/auth` (sealed, db-free) | headers → pre-row `ResolvedIdentity` + signals (`via`, `hasCsrfHeader`) | upsert, derive role, mint `Principal` |
| RESOLUTION | `domain/sessions` | users-row upsert, `determineRole`, cookie `validate` | construct `Principal` |
| CONSTRUCTION | `entry/auth/seam.ts` | the ONE `Principal` mint | re-verify |

The numbered invariants (code comments cite these as "invariant #n"):

1. **One mint.** `entry/auth/seam.ts` is the only module that mints a `Principal` FROM A REQUEST; entry-tier composition/lifecycle code mints synthetic Principals — never from a request, carrying an `owner` or `user` role (`entry/compose/role-clients.ts`, `entry/lifecycle.ts` boot-seed, `entry/compose/chat.ts` host-ops, `entry/compose/services.ts`) — and NO `domain/` code ever constructs one.
2. **Resolve once.** Everything below the seam reads `Principal.userId`; nothing re-resolves or re-queries identity.
3. **`ResolvedIdentity` carries NO `userId` and NO `role`.** Infra must not know DB row ids; the seam adds them.
4. **`MODE_RESOLVERS` is exhaustive** over `AuthConfig["mode"]` (mapped-type `Record` — a new `AUTH_MODES` member fails `tsc`).
5. **JWKS / JWT verification fails closed.** Every reject path → `null` (→ fallback or 401), never a 500, never a fall-through to unsigned.
6. **`can()` is the ONLY privilege-comparison site.** No `role === 'admin'` / `role === 'host'` compare outside `domain/admin/guard.ts`; chat feeds its loaded roster into `can(principal, action, {kind:'chat', roster})`.
7. **`Principal.via === "fallback"` is the SAFE "this IS the owner" discriminator** — origin-gated, mints `role:"owner"` (D17), NOT `externalId === null`.
8. **Sessions: the raw cookie token is never stored** (peppered HMAC-SHA-256 `token_hash` is the validate lookup key); `sessions.validate` re-checks revoked/expired/`users.enabled` per request, so a disable/revoke kills a live cookie on its next request.
9. **CSRF gates on `hasCsrfHeader`, keyed to the cookie path** (header/fallback auth is CSRF-immune by construction).

## 2. Permission = global-role × resource-role × capability

- **Global:** `USER_ROLES = owner|admin|user` (`@orb/contracts/identity`, D17). `max-pro-sub` construction is `requireOwner`-gated. **`admin` is granted by the owner EITHER via `admin.setRole` OR — under OIDC — via owner-configured IdP group membership (`OIDC_ADMIN_GROUPS`, D65): a new owner-controlled mechanism for the same authority, not a delegation. When group governance is active (`OIDC_ADMIN_GROUPS`/`OIDC_ALLOWED_GROUPS` set) roles RE-DERIVE from groups each login (a `setRole` grant to a non-group-member is wiped next login); `OIDC_ALLOWED_GROUPS` is a fail-closed login gate. The OWNER row is never group-derived, gated, or downgraded (D65).**
- **Resource:** `chat_participants.role: host|member` IS chat authority (D18) — there is NO `chats.ownerId`. Membership derives "my chats"; host-handoff (`nominateHostHandoff`/`acceptHostHandoff`, `domain/chat/verbs/roster.ts`) moves authority; a non-member gets `ChatNotFoundError`, not FORBIDDEN (leak-free by design).
- **Capability:** the agent ceiling — `canAgent` over the closed `AGENT_ACTIONS` union (§4).

All three route through the one `can()` seam (invariant #6); `ResourceRef` is a discriminated union, so a new resource kind breaks the `can()` switch until handled.

### 2b. Ownership is INHERITED through the FK chain, never re-stamped per table

**A table without an `ownerId` column is not unscoped — its scope DERIVES from the Principal through
its FK chain to the owning row, gated at the producer verb.** The pattern (D18/D20): chats scope via
`chat_participants` membership; a chat's messages/variants/digests/pending\_turns inherit through
`chatId`; vector rows carry only their producer FK and search derives owner-scope from the producer's
category; character satellites (sprites, embeddings) inherit through `characters.ownerId`; asset
variants inherit through `assets.ownerId`. The AUTHZ lives at the verb (`fetchOwned` /
`requireParticipant` / `requireHost` on the ROOT row), and everything below flows down — adding a
redundant owner stamp to a child table is a DEFECT (two sources of truth that can disagree; D20's
"derive, never stamp"). **Before flagging "missing scope" on a table or query, walk the FK chain to
its root and find the verb gate — the cross-tenant IDOR sweep (`cross-tenant-sweep.suite.int.test.ts`)
is the proof this holds at the transport boundary.**

## 3. Construction

The sanctioned `Principal`/credential construction + cookie sites — everything else consumes:

- `entry/auth/seam.ts` — the mint (all three request paths: cookie via `sessions.validate` → header SSO upsert → origin-gated owner fallback) + the frozen-host bridge.
- `entry/http/auth-routes.ts` — the `__Host-orb_session` cookie WRITE side (mints session tokens via `domain/sessions`; never re-implements resolution).
- `entry/app.ts` — the SLIDE's `Set-Cookie` writer: the per-request auth middleware re-issues the SAME token `sessions.validate` just accepted with a fresh max-age. It never mints, and re-issuing a second copy read independently would silently log the caller out — the token it writes must be the one the seam authenticated.
- `entry/boot/seed-owner.ts` — the one-time boot-only `role=owner` backfill for `OWNER_HANDLES` (the chicken-egg: no owner `Principal` exists at boot to call the guarded `admin.setRole`).
- `entry/compose/role-clients.ts` — mints a synthetic owner `Principal` to bind the boot-time role-clients bundle.
- `entry/lifecycle.ts` — mints a synthetic owner `Principal` for the boot-seed steps (default preset/characters/persona).
- `entry/compose/chat.ts` — the frozen-host bridge (`resolveHostPrincipal`/`hostPrincipal`) mints synthetic Principals for role-irrelevant and owner-gated host-ops when no request `Principal` exists.
- `entry/compose/services.ts` — wires `createHostPrincipalResolver` + agent-principal provisioning, minting synthetic Principals for the same offline host-ops seam.

## 4. Agents are first-class principals (D60)

Built: an agent is a real `users` row (`kind:'agent'`, `users_agent_shape` CHECK makes it loginless/`role='user'`/owned by DDL) + an `agent_principals` satellite, minted lazily by `sessions.provisionAgentPrincipal` (idempotent; the reserved `__agent__` handle namespace is refused at every auth/handle surface). The roster's per-kind shape CHECK `chat_participants_kind_shape` (`human|character|agent|observer`, `packages/db/src/schema/chat.ts`) shapes each kind. The ceiling: agents are structurally sessionless + `Principal`-less; the one runtime gate is `canAgent(actor, action, room)` over `AGENT_ACTIONS = ["speak","tool-propose"]` — the ceiling IS the union. Proof: `tests/server/domain/admin/containment.suite.int.test.ts`. COMMITTED (not yet built): the seat wave (buddy adoption + rpg GM seat, AP3/AP4a) — until it lands, buddy's borrowed-owner posture (D17) is the shipping posture. Authoritative: ledger D60 (design set parked in `../proposed/` (see its `INDEX.md`), `../proposed/README.md`).

## BFF session ≠ SDK chat session

Two unrelated concepts sharing a word: the BFF browser session (`sessions` table — identity) vs the agent-sdk prompt-cache lineage (`session_entries` table, backend-internal, D8). Separate tables, homes, tiers; never merge or cross-reference them.

## Persona — three axes, three homes

The human principal's presentation identity (map: `AGENTS.md` §6):

| Axis | Home | Meaning |
| - | - | - |
| active | `chat_participants.activePersonaId` | each human's lines render under their own persona (multi-human native) |
| anchor | `chats.anchorPersonaId` | the stable `{{user}}` POV — a mid-chat persona switch never rewrites the card's established `{{user}}`; dual-persona render rule lives in `chat/assembly` |
| attribution | `messages.personaId` + `authorUserId` (server-stamped, slot-level) | who actually said it — a swipe never re-voices |

There is NO `chats.personaId` second home.

## Esoterica (load-bearing)

- `externalId` keys SSO (stable authentik sub/uid, UNIQUE-when-set); `handle` keys everything else (rename stability).
- Credential AAD binds `${userId}|${provider}` — single production site `domain/credentials/persistence/aad.ts`; `SecretBox` carries the AAD, never derives it.
