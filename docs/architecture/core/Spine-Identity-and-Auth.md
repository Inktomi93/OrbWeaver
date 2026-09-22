---
kind: law
status: active
updated: 2026-08-30
---

# Orbweaver — Spine: Identity, Auth, and Permission

Canonical doc for spine §7.1 (`AGENTS.md` §5 points here), and THE permissions-model page (D121 clause B): §1–§2b are the mechanics, §2c–§2e are the model a reviewer reasons from. Agent-principal detail: ledger D60 is the DESIGN of record; §4 states what is actually on the tree.

## 1. Resolution — one pipeline, one mint

Identity resolves ONCE at the edge into one immutable `Principal` (`@orb/contracts/identity`) that flows down unchanged. Three tiers, one direction:

| Tier | Home | Does | Never does |
| - | - | - | - |
| VERIFICATION | `infra/auth` (sealed, db-free) | headers → pre-row `ResolvedIdentity` + signals (`via`, `hasCsrfHeader`) | upsert, derive role, mint `Principal` |
| RESOLUTION | `domain/sessions` | users-row upsert, `determineRole`, cookie `validate` | construct `Principal` |
| CONSTRUCTION | `entry/auth/seam.ts` | the ONE `Principal` mint | re-verify |

The numbered invariants (code comments cite these as "invariant #n"):

1. **One mint.** `entry/auth/seam.ts` is the only module that mints a `Principal` FROM A REQUEST, and NO `domain/` code ever constructs one. Entry-tier composition/lifecycle code also builds Principals, and since D135 clause G they split two ways: **ROW-DERIVED** (`createHostPrincipalResolver` reads `users.role` — `entry/compose/services.ts` — which since the 2026-09-19 extraction also carries the role-clients binder, `roleClientsFor`, resolving its funder through the injected resolver — `entry/compose/world-info.ts`, `entry/lifecycle.ts`'s boot seed) and **the FAIL-CLOSED FLOOR** (a synthetic `role:"user"` for ops where the role is irrelevant — `entry/compose/chat.ts`'s non-role-sensitive host-ops, `entry/compose/imagery.ts`, `entry/compose/search-discovery.ts`). **No entry site stamps a role that GRANTS authority.** A new synthetic-Principal site must land in one of those two classes and say which; a third class is a defect.
2. **Resolve once.** Everything below the seam reads `Principal.userId`; nothing re-resolves or re-queries identity.
3. **`ResolvedIdentity` carries NO `userId` and NO `role`.** Infra must not know DB row ids; the seam adds them.
4. **`MODE_RESOLVERS` is exhaustive** over `AuthConfig["mode"]` (mapped-type `Record` — a new `AUTH_MODES` member fails `tsc`).
5. **JWKS / JWT verification fails closed.** Every reject path → `null` (→ fallback or 401), never a 500, never a fall-through to unsigned.
6. **`can()` is the ONLY privilege-comparison site.** No `role === 'admin'` / `role === 'host'` compare outside `domain/admin/guard.ts`; chat feeds its loaded roster into `can(principal, action, {kind:'chat', roster})`. **Word warning (#901, 2026-08-30):** `roster` in this doc is the CODE spelling of a chat room's `chat_participants` membership (`verbs/participants.ts`, `substrate/participants-host.ts`, `participants-humans.ts`) and is unchanged. It is NOT the user-facing **Roster**, which since #901 Fork 2 names the saved seats+knobs+rules TEMPLATE (`domain/roster-preset`). The room's seated characters are **Characters** (Fork 1). Never carry this doc's `roster` into user-facing copy.
7. **`Principal.via === "fallback"` is the SAFE "this IS the owner" discriminator** — PEER-gated, NOT `externalId === null`. **It ADMITS the owner; it does not GRANT owner (D135, amending this clause's former "mints `role:"owner"`" wording).** The seam resolves WHICH row through `ownerHandles()` (resolution-tier policy — never verification's `DEFAULT_USER_HANDLE` placeholder) and reads `users.role` off it through the same `createHostPrincipalResolver` the frozen-host bridge uses. The security boundary is entirely `ownerFallbackAllowed`, which since 2026-08-19 (#298 f2) gates on the **raw LOOPBACK TCP peer** — the unspoofable socket, NOT the client-supplied `Host` header — ONE rule across all four modes, `single-user` included. (The former Host/trusted-ranges gate handed owner to anyone who could reach the port and forge `Host: 10.x.x.x`, and a proxy/vite `changeOrigin` could launder a LAN request into a loopback-looking Host; the peer gate closes both, so every proxied/LAN request must authenticate and SSO is mandatory everywhere Caddy fronts.) The role is READ, not stamped, so the request Principal and the frozen-host Principal for one caller can no longer disagree.
8. **Sessions: the raw cookie token is never stored** (peppered HMAC-SHA-256 `token_hash` is the validate lookup key); `sessions.validate` re-checks revoked/expired/`users.enabled` per request, so a disable/revoke kills a live cookie on its next request. **All THREE request arms gate on `enabled`, not just the cookie one** (D135 clause G): the SSO arm on `provisioned.enabled`, the owner fallback in its own resolver — because its row read (`loadUserById`) deliberately gates nothing so the frozen-host bridge can still resolve a disabled-or-offline host's authority. That bridge keeping NO gate is the intended divergence, not an oversight.
9. **CSRF gates on `hasCsrfHeader`, keyed to the AMBIENT-credential arms.** Only `via:"header"` (a trusted proxy asserts the identity — a browser cannot forge the proxy's headers) is CSRF-immune by construction. The COOKIE and the loopback owner FALLBACK arms are BOTH ambient (the browser auto-attaches the cookie; the fallback rides the loopback socket), so a cross-site page can drive either — the earlier "header/fallback is CSRF-immune" claim was TRUE of the header arm and FALSE of the fallback arm (#300). The gate is therefore split by content-type physics: the FOUR byte-ingest registrars (`entry/http/upload.ts` — which registers `/api/assets/upload`, `/api/databank/upload` AND `/api/import` behind one `authCsrfGuard` — plus `import-tree.ts`, `import-chat.ts`, and `import.ts`'s `/api/import/bundle`, closed last as #300's fourth route) accept a CORS-**simple** content-type (no preflight) so they gate `via !== "header"` — cookie AND fallback both need the `x-orb-csrf` header; tRPC (`transport/trpc/trpc.ts`) keys on `cookie` only, which is what the un-cookied loopback dev tooling relies on. **That tRPC exemption is legitimate ONLY because of the CONTENT-TYPE BELT at the mount (`entry/app.ts`), and the belt is load-bearing, not depth (closed 2026-08-19, #300 leg 5).** The exemption's original stated reason — "a tRPC mutation requires `application/json`, so a cross-site page hits a preflight the app never answers" — is FALSE for `@trpc/server` 11.18: `getContentTypeHandler` also matches `multipart/form-data` and `application/octet-stream`, both dispatched as `type:"mutation"`, and `multipart/form-data` IS CORS-simple, so a plain cross-site `<form>` reached the mount with no preflight and no CORS grant. Wherever `AUTH_FALLBACK=owner` is live (every `single-user` box; every dev stack; any break-glass session) a page loaded in the box's OWN browser could therefore drive an input-less loopback-owner mutation cross-site — the #300 class, on the one route family left exempt. Proven behaviorally against the assembled app, not inferred: pre-belt, a `multipart/form-data` POST with NO `x-orb-csrf` on the `fallback` arm returned 200 and RAN `tag.pruneUnusedTags`; post-belt the same request is 415 with the resolver never entered, while `application/json` (with or without `; charset=utf-8`) still runs on that arm and the cookie arm still 403s without the header. The belt refuses any POST to `/api/trpc/*` whose content-type does not select tRPC's JSON handler, on EVERY via arm; GET is untouched (no content-type, and tRPC's method map admits GET for queries/subscriptions only). ENFORCER: `tests/server/entry/app.test.ts` — the content-type-belt describe, driven through the real mount. **What the tRPC gate now rests on, stated so it can be re-checked: `application/json` is not a CORS-simple content-type and this app mounts no CORS middleware.**
10. **ONE CHOKEPOINT for external identity: every SSO mode reaches `users` through the `provisionIdentity` verb (`domain/sessions`), and a new mode adds a CALLER, never a second upsert.** The whole production census is two: the `oidc` callback (`entry/http/auth-routes.ts` — verified claims → `identityFromClaims` → the verb) and the `forward-header` request arm (`entry/auth/seam.ts` — `resolve` in `infra/auth` → the verb); `local`/`single-user` carry no external identity (password verify / peer-gated `ensureUser`). The verb is where bind-once lives — the handle fallback may BIND an unbound row and may NEVER REBIND a bound one (`isSubjectMismatch`, `domain/sessions/substrate/role-policy.ts`, SHARED with the admin link capability rather than re-spelled) — together with the access gate, the collision hard-deny, the JIT gate and the owner singleton, in one ruled precedence. A mode with its own upsert would carry its own, weaker, takeover posture. ENFORCERS: `infra/auth` is db-free and may not import a domain, so a mode resolver structurally cannot write (tier physics); `no-direct-users-read` REDs any domain outside sessions/admin touching `users`. ENTRY is the tier where a second upsert could still be hand-written — the two callers above are the census, and a third is a review defect. The rules themselves are the verb + its header, never restated here.

## 2. Permission = global-role × resource-role × capability

- **Global:** `USER_ROLES = owner|admin|user` (`@orb/contracts/identity`, D17). `max-pro-sub` construction is `requireOwner`-gated. **`admin` is granted by the owner EITHER via `admin.setRole` OR — under OIDC — via owner-configured IdP group membership (`OIDC_ADMIN_GROUPS`, D65): a new owner-controlled mechanism for the same authority, not a delegation. When group governance is active (`OIDC_ADMIN_GROUPS`/`OIDC_ALLOWED_GROUPS` set) roles RE-DERIVE from groups each login (a `setRole` grant to a non-group-member is wiped next login); `OIDC_ALLOWED_GROUPS` is a fail-closed login gate. The OWNER row is never group-derived, gated, or downgraded (D65).**
- **Resource:** `chat_participants.role: host|member` IS chat authority (D18) — there is NO `chats.ownerId`. Membership derives "my chats"; host-handoff (`nominateHostHandoff`/`acceptHostHandoff`, `domain/chat/verbs/participants.ts`) moves authority; a non-member gets `ChatNotFoundError`, not FORBIDDEN (leak-free by design).
- **Capability:** the kind-keyed third factor — the agent ceiling. **NOT BUILT today** (§4): the axis exists in the type system (`ToolCapability` is `can()`-shaped: `{scope:"chat", action: ChatAction} | {scope:"global", action: GlobalAction}`), the runtime agent ceiling does not.

The two BUILT factors route through the one `can()` seam (invariant #6); `ResourceRef` is a discriminated union, so a new resource kind breaks the `can()` switch until handled.

### 2b. Ownership is INHERITED through the FK chain, never re-stamped per table

**A table without an `ownerId` column is not unscoped — its scope DERIVES from the Principal through
its FK chain to the owning row, gated at the producer verb.** The pattern (D18/D20): chats scope via
`chat_participants` membership; a chat's messages/variants/digests/pending_turns inherit through
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

> A role read is answering exactly one of three questions, and each has ONE home. **"May this caller ACT?"** is the ENFORCEMENT class — the comparison lives in the kernel (`can()`), reached through the domain's cited chokepoint (`chat/substrate/auth/decide.ts::assertHost`/`permitsHost`; `rpg/guard.ts::assertHostRole`), which owns the leak-free refusal shape and nothing else. **"May this viewer READ the hidden bytes?"** is the DATA-PROJECTION class — `member-visibility.ts::viewerHoldsHost` is the host bit, `viewerReadsHidden` is the named lens the payload boundary asks through, and both are deliberately Principal-free: routing a projection through `can()` threads a Principal into pure code for zero behavior change. It has its own home precisely so it can legitimately DIVERGE later (a co-GM who commands the room but must not read deception truth). **"WHICH SEAT is the host?"** is neither — it is a roster LOOKUP (role → identity, D19), homed at `substrate/participants-host.ts::hostSeatOf`/`hostUserIdOf`, whose consumers want an OWNER for a downstream read (card/preset/connection ownership, the stats delta's owner, the notification recipient) and whose `userId` belt is the one answer for the class. Ask which question a site answers before "fixing" its spelling: the three homes cross-cite each other, and collapsing any two of them is a defect, not a cleanup.

## 2d. Who owns what — the map is DERIVED, not written here

This page never duplicates the ownership map; it names where the machine-checked truth lives.

| Question | The answer's home |
| - | - |
| Which tables may stamp an `ownerId` at all? | `tooling/src/verify/gates/ownerid-registry.ts` — `OWNERID_CLASSIFICATIONS`, every row carrying its D23 justification (true producer · parentless per-user aggregate · sanctioned scope-subject). Two-direction ratchet: a new stamp is RED, a stale row is RED. |
| Which DOMAIN owns which table? | `tooling/src/verify/gates/own-tables-only.ts` — the map is READ OFF `packages/db/src/schema/<file>.ts` at run time (schema file ↔ same-named domain), TOTAL, with `SCHEMA_OWNERS`/`TABLE_OWNERS` for the non-1:1 rows. A foreign WRITE is unconditionally RED; a foreign READ belongs in `persistence/` or an injected op. |
| Who owns a row with no `ownerId`? | §2b — the FK chain to the owning root, gated at the producer verb. Walk the chain BEFORE flagging "missing scope". |
| Who owns a CHAT? | Nobody (D18). Membership is the scope, host is the transferable role — see §2c. |
| Which principal classes exist, and which are enforcement-gated? | The principal-flow census + its gate arms (the class-(a) ownership stamp is already gated by `ownerid-registry`; the membership rung is behavioral-only — the cross-tenant sweep, `cross-tenant-sweep.suite.int.test.ts`, is that proof, by design). |

## 2e. BY DESIGN — the do-not-re-flag register

These are ruled, intentional, and re-flagged by cold reviewers about once a wave. Re-raising one without
new evidence is noise; ADD to this list when a review re-flags something already ruled.

- **A member sees the history they were admitted to — that IS the point.** `joinHistoryVisibility` defaults to `full`; a member reading pre-join canon in a room they were invited to is the product working. A finding must name which OPTION (§2c) was bypassed, or it is not a leak.
- ~~Empty rpg state-anchor slots~~ RETIRED 2026-08-03 (D124): hand-written state moved off the message plane — the slot class no longer exists.
- **`adopt-only` engine stacks never spawn, and fail fast when the engines are down.** That is the posture (`ENGINES_POSTURE`), not broken wiring — snap/e2e stacks adopt a running fleet or refuse honestly.
- **The `permitsHost`/`viewerReadsHidden` split is two classes, not two spellings** (§2c). Do not "unify" them.

## 3. Construction

The sanctioned `Principal`/credential construction + cookie sites — everything else consumes:

- `entry/auth/seam.ts` — the mint (all three request paths: cookie via `sessions.validate` → header SSO upsert → loopback-peer-gated owner fallback) + the frozen-host bridge. **The fallback path and the frozen-host bridge share ONE row→`Principal` mapper** (D135): both read `users.role`, so no path in this file invents a role. They differ on ADMISSION only — the fallback arm adds the `enabled` gate its two sibling request arms apply (clause G); the bridge, which makes no admission decision, does not. The unknown-id `?? "user"` is a fail-closed degrade on an absent row, not a grant. **An un-credentialed `via:"fallback"` principal is not a debug-route curiosity: under `single-user` it is what reaches every owner- and admin-gated tRPC surface** (admin-gated = owner ∪ admin, `ROLES_FOR_GLOBAL_ACTION.admin`), so "who this arm admits" is the whole boundary and `ownerFallbackAllowed` is what defends it.
- `entry/http/auth-routes.ts` — the `__Host-orb_session` cookie WRITE side (mints session tokens via `domain/sessions`; never re-implements resolution).
- `entry/app.ts` — the SLIDE's `Set-Cookie` writer: the per-request auth middleware re-issues the SAME token `sessions.validate` just accepted with a fresh max-age. It never mints, and re-issuing a second copy read independently would silently log the caller out — the token it writes must be the one the seam authenticated.
- `entry/boot/seed-owner.ts` — the one-time boot-only `role=owner` backfill for `OWNER_HANDLES` (the chicken-egg: no owner `Principal` exists at boot to call the guarded `admin.setRole`).
- the role-clients binder, folded into `entry/compose/services.ts` on 2026-09-19 (its own `entry/compose/` module before that) — **constructs NO `Principal`** (D135 clause G, truth-repaired 2026-08-07: this line used to sanction a synthetic owner mint "to bind the **boot-time** bundle", and the code's reach was never boot-only). It takes the row→`Principal` resolver as a dep, because `entry/compose/automation-plugin.ts`'s `/autobg` arm binds a bundle for an automation rule's AUTHOR at request time, and a rule author holds only D18 ROOM host authority — the old `role:"owner"` stamp handed such an author the owner's verdict at `connection.resolveRole`, and downstream at the `mintMaxProSub` owner gate, which keys on `principal.role`.
- `entry/lifecycle.ts` — the boot-seed `Principal` for default preset/characters/persona + the env credential seed. **Row-derived, not stamped** (clause G): `seedOwner` writes `role=owner` onto that row a few lines earlier and the Principal reads it back, so a box whose owner row is somehow below `owner` seeds at its honest role instead of overriding the table from memory.
- `entry/compose/chat.ts` — the frozen-host bridge (`resolveHostPrincipal`/`hostPrincipal`) mints synthetic Principals for role-irrelevant and owner-gated host-ops when no request `Principal` exists.
- `entry/compose/services.ts` — wires `createHostPrincipalResolver`, minting synthetic Principals for the same offline host-ops seam. (It does NOT wire agent-principal provisioning — that claim was purge residue, corrected 2026-08-03 with §4; the only `agent` identifiers here are agent-SDK backend config.)

## 4. Agents as first-class principals — the DOORWAY, not the tree (D60)

**NOT BUILT — this section is a DOORWAY, not a description of the tree** (truth-repaired 2026-08-03, D121; the machinery this section once claimed as built was purged 2026-07-25 and the claim survived the purge). On the tree TODAY: there is no `canAgent`, no `agent_principals` table, no `provisionAgentPrincipal`, and no containment suite — the only live agent surface is DORMANT DDL kept so the re-land needs no second migration.

- **What IS on the tree (the reserved seams):** `USER_KINDS` carries `agent` as a tuple member (never an `isAgent` boolean) and the `users_agent_shape` CHECK makes an agent row loginless/`role='user'`/owned BY DDL (`packages/db/src/schema/users.ts`); `chat_participants_kind_shape` carries the dormant `agent` (userId-backed) and `observer` (both-null) arms (`packages/db/src/schema/chat.ts`); `rosterMemberSpecSchema` documents where those arms graft back; the deny SEAM is pre-named in `admin/guard.ts` + `chat/guard.ts`. Every live `Principal` is human.
- **COMMITTED (not yet built) — the capability factor re-lands with the seat wave:** the agent ceiling (a `canAgent` successor over a CLOSED action union, decided at the kernel) + its containment suite + `ChatMembership` widening to carry `kind` (the construction sites are the compile-forced update set — `decide.ts`, `chat/guard.ts`, `resolve-stream-authority.ts`, the tool-use ceiling check). Until then, buddy's borrowed-owner posture (D17) is the shipping posture.
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

## Client session freshness

**→ [`client-architecture-lockdown.md`](client-architecture-lockdown.md) §10a/§12 row 12/§13 rule 7** —
the three-class data contract, the durable-local per-user-namespacing + referential-integrity contract,
the session channel (`lib/session-channel.ts`, `session-channel-boundary` gate), and the recovery ladder
(`data/stale-session.ts`). D138. This spine states identity RESOLUTION; the lockdown doc owns what the
CLIENT does when a resolved session goes stale.

## Esoterica (load-bearing)

- `externalId` keys SSO (stable authentik sub/uid, UNIQUE-when-set); `handle` keys everything else (rename stability).
- Credential AAD binds `${userId}|${provider}` — single production site `domain/credentials/persistence/aad.ts`; `SecretBox` carries the AAD, never derives it.
