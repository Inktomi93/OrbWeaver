---
kind: law
status: active
updated: 2026-08-03
---

# Orbweaver — Spine: Identity, Auth, and Permission

Canonical doc for spine §7.1 (`AGENTS.md` §5.1 points here), and THE permissions-model page (D121 clause B): §1–§2b are the mechanics, §2c–§2e are the model a reviewer reasons from. Agent-principal detail: ledger D60 is the DESIGN of record; §4 states what is actually on the tree.

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
- **Capability:** the kind-keyed third factor — the agent ceiling. **NOT BUILT today** (§4): the axis exists in the type system (`ToolCapability` is `can()`-shaped: `{scope:"chat", action: ChatAction} | {scope:"global", action: GlobalAction}`), the runtime agent ceiling does not.

The two BUILT factors route through the one `can()` seam (invariant #6); `ResourceRef` is a discriminated union, so a new resource kind breaks the `can()` switch until handled.

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

## 2c. THE THREE LAYERS (the permissions model — read this before filing a permission finding)

Permission in orbweaver is three independent tiers. They compose; none substitutes for another, and a
finding that confuses two tiers is not a finding.

| Tier | Vocabulary | Home | The one thing agents get wrong |
| - | - | - | - |
| **APP** | `user \| admin \| owner` over `GlobalAction` | `users.role` (D17/D65) → `can(principal, "admin"\|"owner", …)` | **A global admin grants ZERO host power inside a room.** The lattice `owner ⊇ admin` governs APP surfaces only; `decideChat` never consults `UserRole`. An admin who is not a member of a chat gets `ChatNotFoundError` like any stranger. |
| **ROOM** | `host \| member` over `ChatAction` (`read \| host`) | `chat_participants.role` (D18) → `can(principal, "host", {kind:"chat", roster})` | **Chats are OWNERLESS.** The creator becomes the host — the room is functionally theirs — but structurally there is no `chats.ownerId`: host is a TRANSFERABLE roster ROLE (`nominateHostHandoff`/`acceptHostHandoff` via `chats.pendingHostUserId`), and MEMBERSHIP is the scope. "Who owns this chat" has no answer; "who is its host, and who is in it" have exact ones. |
| **VISIBILITY** | per-member / per-span policy VALUES | `substrate/auth/clamp.ts` + `substrate/member-visibility.ts` | **The default is VISIBLE.** A room is a shared document; members see it; the host MAY limit. Limits are OPTIONS the host sets, never defaults, and each is a policy value the projection class resolves — not an authority gate. |

**The host's three options to limit (the complete set — a visibility finding must name which one it bypasses):**

1. **The D16 history floor** — per-member `joinHistoryVisibility` (`full` default, or `from-join`), resolved to a `messages.seq` floor by `resolveHistoryFloorSeq`. The HOST is never clamped ("authority implies visibility").
2. **Hidden spans / the reveal eye** — producer-stamped member text (`member-visibility.ts`, gate `scrubber-home`); the host reads canon verbatim, every other present role reads the stripped bytes, and on a deception-active game the reasoning channel strips too (D110 ruling A).
3. **The D22 member-card level** — per-chat `memberCardVisibility` clamped by `clampMemberCard`; the host always resolves `full`.

**The THREE QUESTIONS (the taxonomy every role read answers — three questions, three homes, zero inline
re-spellings; landed 2026-08-03 as the role-authority clause's stage R2):**

> A role read is answering exactly one of three questions, and each has ONE home. **"May this caller ACT?"** is the ENFORCEMENT class — the comparison lives in the kernel (`can()`), reached through the domain's cited chokepoint (`chat/substrate/auth/decide.ts::assertHost`/`permitsHost`; `rpg/guard.ts::assertHostRole`), which owns the leak-free refusal shape and nothing else. **"May this viewer READ the hidden bytes?"** is the DATA-PROJECTION class — `member-visibility.ts::viewerHoldsHost` is the host bit, `viewerReadsHidden` is the named lens the payload boundary asks through, and both are deliberately Principal-free: routing a projection through `can()` threads a Principal into pure code for zero behavior change. It has its own home precisely so it can legitimately DIVERGE later (a co-GM who commands the room but must not read deception truth). **"WHICH SEAT is the host?"** is neither — it is a roster LOOKUP (role → identity, D19), homed at `substrate/roster-host.ts::hostSeatOf`/`hostUserIdOf`, whose consumers want an OWNER for a downstream read (card/preset/connection ownership, the stats delta's owner, the notification recipient) and whose `userId` belt is the one answer for the class. Ask which question a site answers before "fixing" its spelling: the three homes cross-cite each other, and collapsing any two of them is a defect, not a cleanup.

## 2d. Who owns what — the map is DERIVED, not written here

This page never duplicates the ownership map; it names where the machine-checked truth lives.

| Question | The answer's home |
| - | - |
| Which tables may stamp an `ownerId` at all? | `scripts/check/gates/ownerid-registry.ts` — `OWNERID_ALLOWLIST`, every row carrying its D23 justification (true producer · parentless per-user aggregate · sanctioned scope-subject). Two-direction ratchet: a new stamp is RED, a stale row is RED. |
| Which DOMAIN owns which table? | `scripts/check/gates/own-tables-only.ts` — the map is READ OFF `packages/db/src/schema/<file>.ts` at run time (schema file ↔ same-named domain), TOTAL, with `SCHEMA_OWNERS`/`TABLE_OWNERS` for the non-1:1 rows. A foreign WRITE is unconditionally RED; a foreign READ belongs in `persistence/` or an injected op. |
| Who owns a row with no `ownerId`? | §2b — the FK chain to the owning root, gated at the producer verb. Walk the chain BEFORE flagging "missing scope". |
| Who owns a CHAT? | Nobody (D18). Membership is the scope, host is the transferable role — see §2c. |
| Which principal classes exist, and which are enforcement-gated? | The principal-flow census + its gate arms (the class-(a) ownership stamp is already gated by `ownerid-registry`; the membership rung is behavioral-only — the cross-tenant sweep, `cross-tenant-sweep.suite.int.test.ts`, is that proof, by design). |

## 2e. BY DESIGN — the do-not-re-flag register

These are ruled, intentional, and re-flagged by cold reviewers about once a wave. Re-raising one without
new evidence is noise; ADD to this list when a review re-flags something already ruled.

- **A member sees the history they were admitted to — that IS the point.** `joinHistoryVisibility` defaults to `full`; a member reading pre-join canon in a room they were invited to is the product working. A finding must name which OPTION (§2c) was bypassed, or it is not a leak.
- **Empty rpg state-anchor slots are not lost work.** A hand-door write on a COMMITTED head clone-forwards onto a fresh narrator slot whose only job is to key the new snapshot (`domain/rpg/snapshot-edit.ts`, `contract/service.ts`); an empty-content slot is that anchor, deliberately unflagged. Refusals are raised BEFORE the clone-forward precisely so a rejected edit leaves no slot at all.
- **`adopt-only` engine stacks never spawn, and fail fast when the engines are down.** That is the posture (`ENGINES_POSTURE`), not broken wiring — snap/e2e stacks adopt a running fleet or refuse honestly.
- **The `permitsHost`/`viewerReadsHidden` split is two classes, not two spellings** (§2c). Do not "unify" them.

## 3. Construction

The sanctioned `Principal`/credential construction + cookie sites — everything else consumes:

- `entry/auth/seam.ts` — the mint (all three request paths: cookie via `sessions.validate` → header SSO upsert → origin-gated owner fallback) + the frozen-host bridge.
- `entry/http/auth-routes.ts` — the `__Host-orb_session` cookie WRITE side (mints session tokens via `domain/sessions`; never re-implements resolution).
- `entry/app.ts` — the SLIDE's `Set-Cookie` writer: the per-request auth middleware re-issues the SAME token `sessions.validate` just accepted with a fresh max-age. It never mints, and re-issuing a second copy read independently would silently log the caller out — the token it writes must be the one the seam authenticated.
- `entry/boot/seed-owner.ts` — the one-time boot-only `role=owner` backfill for `OWNER_HANDLES` (the chicken-egg: no owner `Principal` exists at boot to call the guarded `admin.setRole`).
- `entry/compose/role-clients.ts` — mints a synthetic owner `Principal` to bind the boot-time role-clients bundle.
- `entry/lifecycle.ts` — mints a synthetic owner `Principal` for the boot-seed steps (default preset/characters/persona).
- `entry/compose/chat.ts` — the frozen-host bridge (`resolveHostPrincipal`/`hostPrincipal`) mints synthetic Principals for role-irrelevant and owner-gated host-ops when no request `Principal` exists.
- `entry/compose/services.ts` — wires `createHostPrincipalResolver`, minting synthetic Principals for the same offline host-ops seam. (It does NOT wire agent-principal provisioning — that claim was purge residue, corrected 2026-08-03 with §4; the only `agent` identifiers here are agent-SDK backend config.)

## 4. Agents as first-class principals — the DOORWAY, not the tree (D60)

**NOT BUILT — this section is a DOORWAY, not a description of the tree** (truth-repaired 2026-08-03, D121; the machinery this section once claimed as built was purged 2026-07-25 and the claim survived the purge). On the tree TODAY: there is no `canAgent`, no `agent_principals` table, no `provisionAgentPrincipal`, and no containment suite — the only live agent surface is DORMANT DDL kept so the re-land needs no second migration.

- **What IS on the tree (the reserved seams):** `USER_KINDS` carries `agent` as a tuple member (never an `isAgent` boolean) and the `users_agent_shape` CHECK makes an agent row loginless/`role='user'`/owned BY DDL (`packages/db/src/schema/users.ts`); `chat_participants_kind_shape` carries the dormant `agent` (userId-backed) and `observer` (both-null) arms (`packages/db/src/schema/chat.ts`); `rosterMemberSpecSchema` documents where those arms graft back; the deny SEAM is pre-named in `admin/guard.ts` + `chat/guard.ts`. Every live `Principal` is human.
- **COMMITTED (not yet built) — the capability factor re-lands with the seat wave:** the agent ceiling (a `canAgent` successor over a CLOSED action union, decided at the kernel) + its containment suite + `ChatRoster` widening to carry `kind` (the construction sites are the compile-forced update set — `decide.ts`, `chat/guard.ts`, `resolve-stream-authority.ts`, the tool-use ceiling check). Until then, buddy's borrowed-owner posture (D17) is the shipping posture.
- **The constraint the seat wave inherits (D121 clause A, the agents rider):** chat tools execute under the HOST principal, so an agent initiator would otherwise inherit the host's full tool ceiling. It never does — **an initiator's ceiling derives from its OWN capability factor at the point of initiation, never by inheritance through a turn's execution context.**
- Design of record: ledger D60 + the agent-principal design set parked in `../proposed/` (see its `INDEX.md`) — a parked set is not quotable as build authority, and D60 describes the DESIGN, not the tree.

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
