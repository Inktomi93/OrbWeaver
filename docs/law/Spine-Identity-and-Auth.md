---
kind: law
status: active
updated: 2026-09-25
---

# Orbweaver — Spine: Identity, Auth, and Permission

Canonical doc for spine §7.1; `Constitution.md` §5 points here. Also the one page for the permissions
model (D121 clause B): §1–§2b are the mechanics, §2c–§2e are the model a reviewer reasons from. For
agent-principal detail, ledger D60 is the design of record; §4 states what is on the tree.

## 1. Resolution — one pipeline, one mint

Identity resolves once at the edge into one immutable `Principal` (`@orb/contracts/identity`) that flows
down unchanged. Three tiers, one direction:

| Tier | Home | Does | Never does |
| - | - | - | - |
| VERIFICATION | `infra/auth` (sealed, db-free) | headers → pre-row `ResolvedIdentity` + signals (`via`, `hasCsrfHeader`) | upsert, derive role, mint `Principal` |
| RESOLUTION | `domain/sessions` | users-row upsert, `determineRole`, cookie `validate` | construct `Principal` |
| CONSTRUCTION | `entry/auth/seam.ts` | the one `Principal` mint | re-verify |

Code comments cite the numbered invariants below as "invariant N":

1. **One mint.** `entry/auth/seam.ts` is the only module that mints a `Principal` from a request; no
   `domain/` code constructs one. Entry-tier composition and lifecycle code also build Principals, split
   into two classes: **row-derived** (`createHostPrincipalResolver` reads `users.role` in
   `entry/compose/services.ts`, which also carries the role-clients binder `roleClientsFor` —
   `entry/compose/world-info.ts`, which builds its own `resolveOwnerPrincipal =
   createHostPrincipalResolver(deps.sessions)` (world-info.ts:125) — `entry/lifecycle.ts`'s boot seed)
   and **the fail-closed floor** (a synthetic `role:"user"` for role-irrelevant host-ops in
   `entry/compose/chat.ts`, `entry/compose/imagery.ts`, `entry/compose/search-discovery.ts`). No entry
   site stamps a role that grants authority. A new synthetic-Principal site must land in one of these
   two classes and name which; a third class is a defect.
2. **Resolve once.** Everything below the seam reads `Principal.userId`. Nothing re-resolves or
   re-queries identity.
3. **`ResolvedIdentity` carries no `userId` and no `role`.** Infra must not know DB row ids; the seam
   adds them.
4. **`MODE_RESOLVERS` is exhaustive** over `AuthConfig["mode"]` (mapped-type `Record`; a new
   `AUTH_MODES` member fails `tsc`).
5. **JWKS/JWT verification fails closed.** Every reject path returns `null` (fallback or 401), never a
   500 and never a fall-through to unsigned.
6. **`can()` is the only privilege-comparison site.** No `role === 'admin'` or `role === 'host'` compare
   exists outside `domain/admin/guard.ts`; chat feeds its loaded roster into
   `can(principal, action, {kind:'chat', roster})`. `roster` in this doc names the code-level
   `chat_participants` membership (`verbs/participants.ts`, `substrate/participants-host.ts`,
   `participants-humans.ts`). It is not the user-facing Roster, which names the saved
   seats-knobs-rules template (`domain/roster-preset`). The room's seated characters are Characters.
   Never carry this doc's `roster` into user-facing copy.
7. **`Principal.via === "fallback"` is the safe discriminator for "this is the owner" admission**,
   gated on peer, never on `externalId === null`. It admits the owner; it does not grant owner (D135
   amends this clause's earlier wording). The seam resolves which row through `ownerHandles()`
   (resolution-tier policy, never verification's `DEFAULT_USER_HANDLE` placeholder) and reads
   `users.role` off that row through the same `createHostPrincipalResolver` the frozen-host bridge uses.
   The security boundary is `ownerFallbackAllowed`, which gates on the raw loopback TCP peer — the
   socket, never the client-supplied `Host` header — one rule across all four modes, including
   `single-user`. A `Host`-based gate would hand owner to anyone who can reach the port: forging
   `Host: 10.x.x.x` claims a trusted LAN range outright, and a proxy's `changeOrigin` can separately
   launder a LAN request into a loopback-looking `Host` header. Gating on the peer closes both routes,
   so every proxied or LAN request must authenticate, and SSO is mandatory everywhere Caddy fronts. A
   same-host proxy or tunnel still arrives on a loopback socket, so the gate also refuses any request
   that carries a relay tell (`infra/auth/forwarded.ts`), on every peer and in every mode. The local
   first-run owner-password claim and its `localFirstRun` flag use the same gate. The role is read, not stamped, so a request Principal and the frozen-host Principal for
   the same caller cannot disagree.
8. **Sessions: the raw cookie token is never stored** (a peppered HMAC-SHA-256 `token_hash` is the
   validate lookup key); `sessions.validate` re-checks revoked/expired/`users.enabled` per request, so a
   disable or revoke kills a live cookie on its next request. All three request paths gate on `enabled`,
   not just the cookie one (D135 clause G): the SSO path on `provisioned.enabled`, and the owner fallback
   in its own resolver — its row read (`loadUserById`) deliberately gates nothing, so the frozen-host
   bridge can still resolve a disabled-or-offline host's authority. That bridge keeping no gate is the
   intended divergence, not an oversight.
9. **CSRF gates on `hasCsrfHeader`, keyed to the ambient-credential paths.** Only `via:"header"` (a
   trusted proxy asserts the identity; a browser cannot forge the proxy's headers) is CSRF-immune by
   construction. The cookie path and the loopback owner fallback path are both ambient — the browser
   auto-attaches the cookie, and the fallback rides the loopback socket — so a cross-site page can drive
   either. The gate splits by content-type: the byte-ingest routes (`entry/http/upload.ts`, which
   registers `/api/assets/upload`, `/api/databank/upload` and `/api/import`, plus `import-tree.ts`,
   `import-chat.ts`, and `import.ts`'s `/api/import/bundle`) accept a CORS-simple content-type, so they
   gate on `via !== "header"` — cookie and fallback both need the `x-orb-csrf` header. tRPC
   (`transport/trpc/trpc.ts`) keys on `cookie` only, which the un-cookied loopback dev tooling relies on.

   That tRPC exemption holds only because of the content-type guard at the mount (`entry/app.ts`); the
   guard is required, not defense in depth. `@trpc/server`'s `getContentTypeHandler` also matches
   `multipart/form-data` and `application/octet-stream` as mutations, and `multipart/form-data` is
   CORS-simple — so without the guard, a plain cross-site `<form>` could reach the mount with no
   preflight and no CORS grant. Wherever `AUTH_FALLBACK=owner` is live (every `single-user` box, every
   dev stack, any break-glass session), a page loaded in the box's own browser could drive an
   input-less loopback-owner mutation cross-site on that route family. The guard refuses any POST to
   `/api/trpc/*` whose content-type does not select tRPC's JSON handler (415), on every path, while
   `application/json` (with or without `; charset=utf-8`) still runs on every path. Only the cookie
   path is refused (403) when `x-orb-csrf` is missing; the fallback path with `application/json` and no
   `x-orb-csrf` still runs (200) — the un-cookied loopback dev tooling relies on that. GET is untouched —
   tRPC's method map admits GET for queries and subscriptions only. Enforcer:
   `tests/server/entry/app.test.ts:565`, the describe covering the tRPC mount's refusal of a non-JSON
   mutation, driven through the real mount. The tRPC gate rests on this: `application/json` is not a
   CORS-simple content-type, and this app mounts no CORS middleware.
10. **One chokepoint for external identity.** Every SSO mode reaches `users` through the
    `provisionIdentity` verb (`domain/sessions`); a new mode adds a caller, never a second upsert. The
    production census is two: the `oidc` callback (`entry/http/auth-routes.ts`: verified claims through
    `identityFromClaims` to the verb) and the `forward-header` request path (`entry/auth/seam.ts`:
    `resolve` in `infra/auth` to the verb); `local` and `single-user` carry no external identity
    (password verify, or peer-gated `ensureUser`). The verb owns bind-once: the handle fallback may bind
    an unbound row and may never rebind a bound one (`isSubjectMismatch`,
    `domain/sessions/substrate/role-policy.ts`, shared with the admin link capability rather than
    re-spelled), together with the access gate, the collision hard-deny, the JIT gate and the owner
    singleton, in one ruled precedence. That precedence is the pure `decideProvision`
    (`domain/sessions/substrate/decide-provision.ts`, D254): the verb interprets its decision, and a
    batch-shaped signup statement that decides through the same function is not a second upsert. Such a
    statement carries only the race-relevant checks in SQL: the unique indexes and a `NOT EXISTS` on email.
    The one such statement is the `oidc` pending-join confirm (`domain/sessions/verbs/pending-signup.ts`).
    A mode with its own upsert would carry its own, weaker, takeover
    posture. Enforcers: `infra/auth` is db-free and may not import a domain, so a mode resolver
    structurally cannot write; `no-direct-users-read` reds any domain outside sessions/admin touching
    `users`. Entry is the tier where a second upsert could still be hand-written; the two callers above
    are the census, and a third is a review defect. The rules live at the verb and its header comment,
    never restated here.

## 2. Permission = global-role × resource-role × capability

- **Global:** `USER_ROLES = owner|admin|user` (`@orb/contracts/identity`, D17). `max-pro-sub`
  construction is `requireOwner`-gated. `admin` is granted by the owner either via `admin.setRole` or,
  under OIDC, via owner-configured IdP group membership (`OIDC_ADMIN_GROUPS`, D65) — a second
  owner-controlled mechanism for the same authority, not a delegation. When group governance is active
  (`OIDC_ADMIN_GROUPS` or `OIDC_ALLOWED_GROUPS` set), roles re-derive from groups on each login (a
  `setRole` grant to a non-group-member is wiped on the next login); `OIDC_ALLOWED_GROUPS` is a
  fail-closed login gate. The owner row is never group-derived, gated, or downgraded (D65).
- **Resource:** `chat_participants.role: host|member` is chat authority (D18); there is no
  `chats.ownerId`. Membership derives "my chats"; host-handoff (`nominateHostHandoff`/
  `acceptHostHandoff`, `domain/chat/verbs/participants.ts`) moves authority. A non-member gets
  `ChatNotFoundError`, not `FORBIDDEN`, so membership leaks nothing.
- **Capability:** the kind-keyed third factor, the agent ceiling. Not built (see §4): the axis exists in
  the type system (`ToolCapability` is `can()`-shaped: `{scope:"chat", action: ChatAction} |
  {scope:"global", action: GlobalAction}`), but the runtime agent ceiling does not.

The two built factors route through the one `can()` seam (invariant 6); `ResourceRef` is a discriminated
union, so a new resource kind breaks the `can()` switch until handled.

### 2b. Ownership is inherited through the FK chain, never re-stamped per table

A table without an `ownerId` column is not unscoped: its scope derives from the Principal through its FK
chain to the owning row, gated at the producer verb. The pattern (D18/D20): chats scope via
`chat_participants` membership; a chat's messages, variants, digests and pending_turns inherit through
`chatId`; vector rows carry only their producer FK, and search derives owner-scope from the producer's
category; character satellites (sprites, embeddings) inherit through `characters.ownerId`; asset
variants inherit through `assets.ownerId`. Authorization lives at the verb (`fetchOwned`,
`requireParticipant`, `requireHost` on the root row); everything below flows down. Adding a redundant
owner stamp to a child table is a defect — two sources of truth that can disagree (D20: derive, never
stamp). Before flagging "missing scope" on a table or query, walk the FK chain to its root and find the
verb gate. The cross-tenant IDOR sweep (`cross-tenant-sweep.suite.int.test.ts`) proves this holds at the
transport boundary.

The `/blob/:hash` route is the sharpest instance: it resolves the caller from the session cookie and
runs `fetchOwned` (or the roster-avatar membership exception) — it never serves on bare row existence —
and answers with `Cache-Control: private`. This is a per-request control-flow property, so it is held
by the behavioural suite above rather than a structural gate.

## 2c. The three layers (read this before filing a permission finding)

Permission in orbweaver is three independent tiers. They compose; none substitutes for another, and a
finding that confuses two tiers is not a finding.

| Tier | Vocabulary | Home | The one thing agents get wrong |
| - | - | - | - |
| APP | `user \| admin \| owner` over `GlobalAction` | `users.role` (D17/D65) → `can(principal, "admin"\|"owner", …)` | A global admin grants zero host power inside a room. The lattice `owner ⊇ admin` governs APP surfaces only; `decideChat` never consults `UserRole`. An admin who is not a member of a chat gets `ChatNotFoundError` like any stranger. |
| ROOM | `host \| member` over `ChatAction` (`read \| host`) | `chat_participants.role` (D18) → `can(principal, "host", {kind:"chat", roster})` | Chats are ownerless. The creator becomes the host, and the room is functionally theirs, but structurally there is no `chats.ownerId`: host is a transferable roster role (`nominateHostHandoff`/`acceptHostHandoff` via `chats.pendingHostUserId`), and membership is the scope. "Who owns this chat" has no answer; "who is its host, and who is in it" have exact ones. |
| VISIBILITY | per-member / per-span policy values | `substrate/auth/clamp.ts` + `substrate/member-visibility.ts` | The default is visible. A room is a shared document; members see it; the host may limit. Limits are options the host sets, never defaults, and each is a policy value the projection class resolves, not an authority gate. |

The host's three options to limit (a visibility finding must name which one it bypasses):

1. **The D16 history floor** — per-member `joinHistoryVisibility` (`full` default, or `from-join`),
   resolved to a `messages.seq` floor by `resolveHistoryFloorSeq`. The host is never clamped: authority
   implies visibility.
2. **Hidden spans / the reveal eye** (producer-stamped member text; `member-visibility.ts`, gate
   `scrubber-home`) — the
   host reads canon verbatim, every other present role reads the stripped bytes, and on a
   deception-active game the reasoning channel strips too (D110 ruling A).
3. **The D22 member-card level** — per-chat `memberCardVisibility` clamped by `clampMemberCard`; the
   host always resolves `full`.

A role read answers exactly one of three questions, and each has one home:

- **"May this caller act?"** is the enforcement class. The comparison lives in the kernel (`can()`),
  reached through the domain's cited chokepoint (`chat/substrate/auth/decide.ts::assertHost`/
  `permitsHost`; `rpg/guard.ts::assertHostRole`), which owns the leak-free refusal shape and nothing
  else.
- **"May this viewer read the hidden bytes?"** is the data-projection class. `member-visibility.ts::
  viewerHoldsHost` is the host bit; `viewerReadsHidden` is the named check the payload boundary calls;
  both are deliberately Principal-free — routing a projection through `can()` would thread a Principal
  into pure code for no behavior change. It has its own home so it can legitimately diverge later, such
  as a co-GM who commands the room but must not read deception truth.
- **"Which seat is the host?"** is a roster lookup (role to identity, D19), homed at
  `substrate/participants-host.ts::hostSeatOf`/`hostUserIdOf`, whose consumers want an owner for a
  downstream read (card/preset/connection ownership, the stats delta's owner, the notification
  recipient) and whose `userId` guard is the one answer for that class.

Ask which question a site answers before "fixing" its spelling. The three homes cross-cite each other;
collapsing any two of them is a defect, not a cleanup.

## 2d. Who owns what — the map is derived, not written here

This page never duplicates the ownership map; it names where the machine-checked truth lives.

| Question | The answer's home |
| - | - |
| Which tables may stamp an `ownerId` at all? | `tooling/src/verify/gates/ownerid-registry.ts` — `OWNERID_CLASSIFICATIONS`, every row carrying its D23 justification (true producer, parentless per-user aggregate, or sanctioned scope-subject). Two-direction check: a new stamp reds; a stale row reds. |
| Which domain owns which table? | `tooling/src/verify/gates/own-tables-only.ts` — the map is read off `packages/db/src/schema/<file>.ts` at run time (schema file to same-named domain), total, with `SCHEMA_OWNERS`/`TABLE_OWNERS` for the non-1:1 rows. A foreign write is unconditionally red; a foreign read belongs in `persistence/` or an injected op. |
| Who owns a row with no `ownerId`? | §2b — the FK chain to the owning root, gated at the producer verb. Walk the chain before flagging "missing scope". |
| Who owns a chat? | Nobody (D18). Membership is the scope; host is the transferable role — see §2c. |
| Which principal classes exist, and which are enforcement-gated? | The principal-flow census and its gate paths (the class-(a) ownership stamp is already gated by `ownerid-registry`; the membership step is behavioral-only — the cross-tenant sweep, `cross-tenant-sweep.suite.int.test.ts`, is the proof, by design). |

## 2e. By design — the do-not-re-flag register

These are ruled and intentional. Re-raising one without new evidence is noise; add to this list when a
review re-flags something already ruled.

- **A member sees the history they were admitted to — that is the point.** `joinHistoryVisibility`
  defaults to `full`; a member reading pre-join canon in a room they were invited to is the product
  working. A finding must name which option (§2c) was bypassed, or it is not a leak.
- **The `permitsHost`/`viewerReadsHidden` split is two classes, not two spellings** (§2c). Do not
  "unify" them.

## 3. Construction

The sanctioned `Principal`/credential construction and cookie sites; everything else consumes.

- `entry/auth/seam.ts` — the mint, across all three request paths (cookie via `sessions.validate`,
  header SSO upsert, loopback-peer-gated owner fallback), plus the frozen-host bridge. The fallback path
  and the frozen-host bridge share one row-to-`Principal` mapper (D135): both read `users.role`, so no
  path in this file invents a role. They differ only on admission: the fallback path adds the `enabled`
  gate its two sibling request paths apply (clause G); the bridge makes no admission decision and applies
  none. The unknown-id `?? "user"` is a fail-closed degrade on an absent row, not a grant. An
  un-credentialed `via:"fallback"` principal is not a debug-route curiosity: under `single-user` it is
  what reaches every owner- and admin-gated tRPC surface (admin-gated meaning owner ∪ admin,
  `ROLES_FOR_GLOBAL_ACTION.admin`). `ownerFallbackAllowed` is what defends that boundary.
- `entry/http/auth-routes.ts` — the session cookie write side, under the request transport's name
  (`infra/auth/transport.ts`); mints session tokens via `domain/sessions` and never re-implements resolution.
  Its cookie sites are login, first-run, the local signup-through-invite route, and the `oidc` callback
  and pending-join confirm routes. A signup or confirm mints only after its one gated batch commits with
  every `RETURNING` non-empty, and a confirm mints only for an enabled account (D254). The pending-join
  cookie (`infra/auth/modes/oidc.ts`) is `HttpOnly` and `SameSite=Strict`. It carries a fresh secret that
  the server stores only as a peppered hash, and it is never a session.
- `entry/app.ts` — the `Set-Cookie` writer: the per-request auth middleware re-issues the same token
  `sessions.validate` just accepted, with a fresh max-age. It never mints; re-issuing a second copy read
  independently would silently log the caller out, so the token it writes must be the one the seam
  authenticated.
- `entry/boot/seed-owner.ts` — the one-time boot-only `role=owner` backfill for `OWNER_HANDLES`: no
  owner `Principal` exists at boot to call the guarded `admin.setRole`.
- The role-clients binder, folded into `entry/compose/services.ts`, constructs no `Principal` (D135
  clause G). It takes the row-to-`Principal` resolver as a dependency because
  `entry/compose/automation-plugin.ts`'s `/autobg` path binds a bundle for an automation rule's author
  at request time, and a rule author holds only D18 room-host authority. A stamped role here would grant
  authority downstream at the `mintMaxProSub` owner gate, which keys on `principal.role`.
- `entry/lifecycle.ts` — the boot-seed `Principal` for the default preset, characters and persona, plus
  the env credential seed. Row-derived, not stamped (clause G): `seedOwner` writes `role=owner` onto that
  row a few lines earlier, and the Principal reads it back, so a box whose owner row is somehow below
  `owner` seeds at its honest role instead of overriding the table from memory.
- `entry/compose/chat.ts` — the frozen-host bridge (`resolveHostPrincipal`/`hostPrincipal`); mints
  synthetic Principals for role-irrelevant and owner-gated host-ops when no request `Principal` exists.
- `entry/compose/services.ts` — wires `createHostPrincipalResolver`, minting synthetic Principals for
  the same offline host-ops seam. It does not wire agent-principal provisioning; the only `agent`
  identifiers here are agent-SDK backend config (see §4).

## 4. Agents as first-class principals — a doorway, not the tree (D60)

Not built. This section is a doorway to the design, not a description of the tree. On the tree today:
there is no `canAgent`, no `agent_principals` table, no `provisionAgentPrincipal`, and no containment
suite. The only live agent surface is dormant DDL, kept so the re-land needs no second migration.

- **What is on the tree (the reserved seams):** `USER_KINDS` carries `agent` as a tuple member (never
  an `isAgent` boolean), and the `users_agent_shape` check makes an agent row loginless, `role='user'`,
  and owned by DDL (`packages/db/src/schema/users.ts`); `chat_participants_kind_shape` carries the
  dormant `agent` (userId-backed) and `observer` (both-null) branches (`packages/db/src/schema/chat.ts`);
  `rosterMemberSpecSchema` documents where those branches graft back; the deny seam is pre-named in
  `admin/guard.ts` and `chat/guard.ts`. Every live `Principal` is human.
- **Committed, not yet built — the capability factor re-lands with the seat wave:** the agent ceiling
  (a `canAgent` successor over a closed action union, decided at the kernel), its containment suite, and
  `ChatMembership` widening to carry `kind` (the construction sites are the compile-forced update set:
  `decide.ts`, `chat/guard.ts`, `resolve-stream-authority.ts`, the tool-use ceiling check). Until then,
  buddy's borrowed-owner posture (D17) is the shipping posture.
- **The constraint the seat wave inherits** (D121 clause A, the agents rider): chat tools execute under
  the host principal, so an agent initiator would otherwise inherit the host's full tool ceiling. It
  never does — an initiator's ceiling derives from its own capability factor at the point of initiation,
  never by inheritance through a turn's execution context.
- Design of record: ledger D60 and the parked agent-principals plan
  (`../plans/agent-principals/design.md`). A parked plan is not quotable as build authority; D60
  describes the design, not the tree.

## BFF session ≠ SDK chat session

Two unrelated concepts sharing a word: the BFF browser session (`sessions` table — identity) vs. the
agent-sdk prompt-cache lineage (`session_entries` table, backend-internal, D8). Separate tables, homes,
tiers; never merge or cross-reference them.

## Persona — three axes, three homes

The human principal's presentation identity (map: `Constitution.md` §6):

| Axis | Home | Meaning |
| - | - | - |
| active | `chat_participants.activePersonaId` | each human's lines render under their own persona (multi-human native) |
| anchor | `chats.anchorPersonaId` | the stable `{{user}}` POV — a mid-chat persona switch never rewrites the card's established `{{user}}`; dual-persona render rule lives in `chat/assembly` |
| attribution | `messages.personaId` + `authorUserId` (server-stamped, slot-level) | who actually said it — a swipe never re-voices |

There is no `chats.personaId` second home.

### Persona pointers: user level and chat level

The chat-level table above has two user-level partners in settings `seeds`:

| Pointer | Home | Meaning |
| - | - | - |
| default | `seeds.defaultPersonaId` | the user's home identity, marked as the pinned persona in the persona list |
| current | `seeds.currentPersonaId` | who the user plays as when a new chat starts |

Neither user-level pointer is read live inside a chat. `startChat` resolves the founding anchor once, in
this order (`domain/chat/verbs/start-chat.ts::resolveFoundingAnchor`):

1. The explicit `anchorPersonaId`, which the caller must own.
2. The one persona connected to a solo founding character.
3. `current`.
4. `default`.

The result seeds `chats.anchorPersonaId` and the host seat's `chat_participants.activePersonaId`. A
later change to `current` or `default` affects only chats founded after it.

The client resolves "playing as" with `current`, then `default`, then the first owned persona
(`packages/client/src/features/persona/lib/persona-current.ts`).

Keep all five pointers apart. The common persona defect reads one pointer where another is meant.
`Chat-Macro-Resolution.md` §3 and §4 own which pointer each `{{user}}` context reads. ADR 0153 owns who
may change this resolution order.

## Client session freshness

→ [`client-architecture-lockdown.md`](client-architecture-lockdown.md) §10a/§12 row 12/§13 rule 7 —
the three-class data contract, the durable-local per-user-namespacing + referential-integrity contract,
the session channel (`lib/session-channel.ts`, `session-channel-boundary` gate), and the recovery ladder
(`data/stale-session.ts`). D138. This spine states identity resolution; the lockdown doc owns what the
client does when a resolved session goes stale.

## Esoterica

- `externalId` keys SSO (stable authentik sub/uid, unique-when-set); `handle` keys everything else
  (rename stability).
- Credential AAD binds `${userId}|${provider}` — single production site
  `domain/credentials/persistence/aad.ts`; `SecretBox` carries the AAD, never derives it.
