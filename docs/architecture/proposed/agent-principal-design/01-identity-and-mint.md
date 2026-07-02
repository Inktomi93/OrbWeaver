# 01 — Identity and the Mint: `users.kind`, the Owner Link, and `provisionAgentPrincipal`

> **Status: COMMITTED (D60, 2026-07-01) — prescriptive design; the ledger D-entry wins on any
> conflict.** The identity half of the transition: what a `users` row for an agent IS, how it can
> never log in (structurally, not by convention), who owns it, and the verb that mints it.

---

## 1. The `users` table gains TWO columns (`kind` + `ownerUserId`) — and a shape CHECK

The reserved cross-cutting `db/schema/users.ts` (the identity root every owned table FKs) gains:

| Column | Type | Notes |
|---|---|---|
| `kind` | text, `enum: USER_KINDS`, NOT NULL, default `'human'` | `'human' \| 'agent'`. Derives the canonical tuple (below); a CHECK mirrors it at the SQL level (the `users.role` pattern, verbatim) |
| `ownerUserId` | text, self-FK → `users.id` **CASCADE**, nullable | NULL for humans; NOT NULL for agents (CHECK-tied to `kind`). The human responsible for this agent |

```ts
// @orb/contracts/identity — the ONE home (§7.5 discipline; the USER_ROLES precedent)
export const USER_KINDS = ["human", "agent"] as const;
export type UserKind = (typeof USER_KINDS)[number];
export const userKindSchema = z.enum(USER_KINDS);
```

**The agent shape CHECK (the structural no-login core):**

```sql
-- users_kind_check:   kind in ('human', 'agent')
-- users_agent_shape:  the agent flavor is loginless, unprivileged, and owned — by DDL, not prose
CHECK (
  kind <> 'agent'
  OR (role = 'user' AND password_hash IS NULL AND external_id IS NULL AND owner_user_id IS NOT NULL)
)
-- users_human_shape:  a human never carries an owner link (the axis is coherent both ways)
CHECK (kind <> 'human' OR owner_user_id IS NULL)
```

**WHY `kind` is a tuple and not `isAgent: boolean`:** AGENTS-2 §8.6 floats both. A boolean cannot
grow (a future principal flavor — a service account, a webhook identity — forces a second boolean
and an incoherent 2×2), and the codebase's §7.5 law is string-union axes with exhaustive dispatch,
zero booleans-as-axes. `USER_KINDS` extends by a tuple member + a `tsc`-forced dispatch arm.
*(Rejected: `isAgent` boolean — unextendable, and every consumer branches `if` instead of
dispatching exhaustively.)*

**WHY `role` is CHECKed to `'user'`:** an agent principal must never satisfy
`requireAdmin`/`requireOwner` even if every runtime belt fails. The global-role axis (D17) is a
HUMAN privilege axis; an agent's authority is the doc-03 capability ceiling, never a role grant.
The CHECK makes a privileged agent row unrepresentable; `admin.setRole` additionally refuses agent
targets at the verb tier (doc 06 §1 — defense-in-depth, the admin 2-layer doctrine).

**WHY the owner link lives ON `users` (not only in the satellite):** referential physics. D18
says a user hard-delete cascades their memberships; the same law must hold for their agents — a
deleted human must not leave orphaned agent principals that still hold seats. `ownerUserId`
self-FK CASCADE makes owner-delete → agent-delete → (via the existing FKs) roster-row CASCADE and
`messages.authorUserId` SET NULL, all without a reaper. *(Rejected: owner link only in the
`agent_principals` satellite — deleting the owner would cascade the satellite row but ORPHAN the
agent's `users` row, requiring a hand-rolled GC sweep — the exact D24 anti-pattern
(`duplicate_pairs`' manual reaper) this schema exists to never repeat.)* D23 verdict: `ownerUserId`
is the row's own owning link (the row references its owner directly — the KEEP case, like
`chat_tags`), not a derivable mirror.

**`users.id` for agents stays the plain `Branded<"UserId">` nanoid** (db.md esoteric #4) — an
agent userId must be substitutable everywhere a userId flows (`chat_participants.userId`,
`messages.authorUserId`, `rpg_games.gmUserId`, `rpg_party.userId`); a distinct brand would poison
every FK. The kind axis, not the id shape, carries agent-ness.

## 2. The `agent_principals` satellite — the registry (`@orb/db/schema/agent-principals.ts`)

One thin table keyed on the agent's users row; the dispatch + admin-surface metadata that does NOT
belong on the reserved identity root:

| Column | Type | Notes |
|---|---|---|
| `userId` | text PK, FK → `users.id` **CASCADE** | the agent's own principal row |
| `sourceKind` | text, `enum: AGENT_SOURCE_KINDS`, NOT NULL, CHECK | WHAT kind of agent this is — the doc-04 speaker-source registry's dispatch key |
| `createdAt` | integer (epoch ms), NOT NULL | injected clock |

```ts
// @orb/contracts/identity
export const AGENT_SOURCE_KINDS = ["buddy"] as const; // extensible: a future standalone-agent kind is a tuple member + a registry arm
export type AgentSourceKind = (typeof AGENT_SOURCE_KINDS)[number];
```

**WHY a satellite at all (vs. `sourceKind` on `users`):** the identity root is reserved
cross-cutting — every owned table FKs it, and every future agent source would otherwise touch the
one file the whole schema hangs off. The satellite is where agent-only metadata grows
(per-agent ceiling overrides, a display blurb, a future avatar ref) without nullable-column
pollution on `users`. **WHY not MORE on the satellite now:** nothing else is needed — display
identity comes from the source (buddy's soul, via the doc-04 registry), containment state is
`users.enabled` (one home — doc 03 §4), and per-agent connection overrides are `connection`'s
per-agent axis, already decided (`participants-agents-identity.md` §6). *(Rejected: a fat
`agents` table duplicating soul/name — a second home for the buddy identity; the soul stays in
`buddies`, doc 04.)* D23 verdict: the satellite's owner derives via `userId → users.ownerUserId`
(one FK — DERIVE, no stamp).

**Uniqueness:** one agent per `(ownerUserId, sourceKind)` in v1 (a user has ONE buddy — the
`buddies` PK is already `userId`). Enforced by the deterministic handle (§4), not a composite
index on the satellite — the handle IS the natural key, and a future multi-agent source (named
standalone agents) simply salts the handle differently. *(Lean, with criterion: add
`UNIQUE(ownerUserId via users, sourceKind)` semantics per-source when a source that must be
singleton-per-owner arrives that does NOT have a deterministic handle; today both properties come
from one place.)*

## 3. The structural no-login guarantee (three layers, each named)

"An agent can never log in" must be **unrepresentable, then refused, then tested** — the
enforcement ladder (AGENTS-1 §2.2):

1. **DDL (compile-for-data):** the `users_agent_shape` CHECK — no `passwordHash` (local login has
   nothing to verify), no `externalId` (no SSO subject can ever match), `role='user'`.
2. **Domain refusals (the belts):**
   - `sessions.validate` adds `AND users.kind = 'human'` to its user JOIN — a session row can
     never resolve to an agent even if one were somehow minted for it; `sessions.create` refuses
     `kind:'agent'` targets loudly (`DomainForbiddenError`). There is no legitimate caller.
   - `sessions.ensureUser` + `sessions.provisionIdentity` **refuse the reserved handle
     namespace** (`__agent__` prefix, §4) AND refuse to match/update a `kind:'agent'` row. This
     closes the impersonation hole: a forward-header deployment forwarding
     `X-User: __agent__buddy__<id>` must get a hard refusal, never a JIT-create and never a match
     against the agent's row. (The synthetic character precedent already reserves `__group__` the
     same way — but characters never reached auth, so THIS namespace refusal is new and
     load-bearing.)
   - The entry seam's owner-fallback mints the owner — untouched; it can never produce an agent.
3. **Tests (the containment suite, doc 07 §4):** every auth mode × an existing agent row →
   refusal; the reserved-namespace matrix; a type-level test that no `Principal` construction
   site accepts a `kind` field (Principal has no kind — see doc 03 §1 for why that absence is the
   design).

## 4. `provisionAgentPrincipal` — the mint verb (`domain/sessions/verbs/provision-agent.ts`)

Sessions owns it (`sessions.md` already claims it: "the mint verb sits in this domain, next to
`provisionIdentity`"). The signature and semantics:

```ts
// domain/sessions/contract/params.ts
export interface ProvisionAgentParams {
  readonly ownerUserId: UserId;          // the responsible human (must be kind='human', enabled)
  readonly sourceKind: AgentSourceKind;  // 'buddy' in v1
}
// contract/results.ts
export interface ProvisionAgentResult {
  readonly agentUserId: UserId;
  readonly created: boolean;             // false = the idempotent re-call found the existing row
}
```

Semantics, in order:

1. **Gate:** the owner row must exist, be `kind='human'`, and be `enabled` (a disabled human
   cannot mint hands). Throws `DomainNotFoundError`/`DomainForbiddenError`.
2. **Deterministic handle:** `__agent__${sourceKind}__${ownerUserId}` — the idempotency key AND
   the display-debuggable name. The `__agent__` prefix is the reserved namespace (§3.2). WHY
   deterministic: idempotency without a lookup table, and the `users_handle_unique` index becomes
   the race arbiter.
3. **Insert-or-adopt (the hatch-race pattern):** INSERT the `users` row
   (`kind:'agent'`, `role:'user'`, `ownerUserId`, handle as above, `enabled:true`) + the
   `agent_principals` row in ONE `db.batch`; on the handle-unique constraint violation, re-read
   the winner and return it (`created:false`) — byte-for-byte the `hatch` idempotent-PK-race
   precedent (buddy.md). A re-call after a partial failure self-heals (the batch is atomic).
4. **Audit:** `logAudit('AGENT_PRINCIPAL_MINTED', …)` — a principal coming into existence is a
   security-relevant event.

**Who calls it, and WHEN — DECISION: LAZY, at first seat-join.** The seating verb (doc 04 §3
`chat.seatAgent`; a future standalone-agent create verb) calls an injected
`sessions.provisionAgentPrincipal` op wired at `entry/compose`. Buddy `hatch` does NOT mint.
WHY lazy: (a) a solo-only buddy (the overwhelming v1 population) never needs a principal — the
firewalled `buddy_turns` posture is complete without one, and hatch stays decoupled from the
identity spine; (b) no principal rows to administer/contain for users who never touch rooms —
`listUsers` doesn't fill with inert agents; (c) the mint is idempotent, so eager-vs-lazy is purely
a call-site choice — moving to eager later is deleting nothing. *(Rejected: mint-at-hatch — every
hatched buddy pollutes the admin user surface and widens the containment audit for zero
capability; rejected: mint-at-first-message-in-room — the seat-join is the authorization moment,
and a seat without a principal row would need a nullable-then-backfilled roster userId, breaking
the doc-02 shape CHECK.)*

**Cross-feature wiring:** `chat` (the seating verb) receives
`sessions.provisionAgentPrincipal` as an injected op on `ChatContext` — sessions is a leaf both
can reach at compose; no sideways import (`domain-no-cross-feature`).

## 5. The synthetic-group-character precedent, compared honestly

AGENTS-2 §8.6 names `mintSyntheticGroupCharacter` (`__group__${chatId}`) as the precedent. What
actually carries over, and what does NOT:

| Property | `__group__` character | agent principal | Verdict |
|---|---|---|---|
| From-inside-the-app identity mint | yes | yes | **carries** — same pattern: a deterministic reserved-namespace handle, an idempotent find-or-mint, hidden from normal user-facing lists |
| Reserved handle namespace | `__group__` (filtered by `synthetic=true`) | `__agent__` (filtered by `kind='agent'`) | **carries** — incl. the "every list/query must filter" invariant (character.md inv 3 ↔ doc 06 §1 listUsers axis) |
| The table it mints into | `characters` (content — a card row) | `users` (the identity/authz root) | **does NOT carry** — a characters row grants nothing; a users row is FK'd by sessions, credentials AAD, admin verbs, `rpg_games.gmUserId`. The safety burden is categorically higher, which is WHY §3's CHECK+refusal belts exist and have no character-side analogue |
| Authority | none — it's a memory/authorship bucket | none by default — but it is a userId every userId-shaped seam will accept | **the difference IS the design problem** — doc 03 (the ceiling) exists because of this row |
| Who mints | chat's room-create path via injected `character.mintSyntheticGroupCharacter` | the seating verb via injected `sessions.provisionAgentPrincipal` | **carries** — identity creation lives in the identity-owning domain, injected into the orchestrator |

The honest summary: the precedent proves the MINT MECHANICS (namespace, idempotency, injection
seam) — it proves nothing about safety, because a synthetic character was never a principal. Do
not cite it to skip doc 03.

## 6. Credential inheritance (the ledger §3 default, realized — not re-decided)

The ledger's committed default stands verbatim: **the OWNER's agents inherit the owner's tier via
owner-delegated `credentials.resolve`** — the agent's resolve delegates to
`users.ownerUserId` (one FK read), never a re-mint under the agent's id (the AAD is GCM-bound to
`${ownerUserId}|provider` and cannot be row-lifted); a delegated admin's agents and any non-owner
agent resolve their own owner's credentials, never the box sub (D17). The one-arm addition to
`credentials.resolve`: an agent-context resolve call carries the DELEGATED userId (the owner's),
which the seating/turn paths obtain from `users.ownerUserId`. **Where this actually fires is
narrower than it sounds (doc 04 §5):** in-room turns are funded by the HOST (`runAsUserId`, D19 —
unchanged), so owner-delegation matters only for the agent's own out-of-room work (solo buddy —
which is still the borrowed-owner path today and stays it). No new credential surface ships in
AP1–AP3; the arm lands with the first out-of-room agent-funded call site. *(Criterion, per the
ledger: confirmed when `users.kind` lands — this doc IS that confirmation; the default is
INHERIT-for-OWNER.)*

## 7. Invariants (gate candidates)

1. **An agent row is loginless by DDL** — `kind='agent'` ⇒ no password, no externalId,
   `role='user'`, owner NOT NULL. *(compile-for-data: the two CHECKs; test: INSERT matrix.)*
2. **No auth path resolves an agent** — validate/ensureUser/provisionIdentity refuse
   `kind='agent'` rows AND the `__agent__` namespace. *(test: the containment suite's auth
   matrix; lint: the refusal predicates live in sessions, the only `users`-auth reader.)*
3. **`provisionAgentPrincipal` is the ONLY agent-row INSERT site** — no other verb writes
   `kind:'agent'`. *(lint: dep-cruiser — `users` INSERTs outside `domain/sessions` +
   `domain/admin` are already RED (the `no-direct-users-read/write` chokepoint); test: the mint
   is the only green path.)*
4. **The mint is idempotent under race** — two concurrent seat-joins converge on one row.
   *(test: the hatch-race pattern test, transplanted.)*
5. **Owner-delete cascades the agent** — no orphaned agent principals, ever. *(compile-for-data:
   the self-FK CASCADE; test: delete-owner → agent row, satellite, roster rows all gone;
   `messages.authorUserId` SET NULL.)*
6. **`USER_KINDS`/`AGENT_SOURCE_KINDS` are one-homed** in `@orb/contracts/identity`; the db
   enums derive them. *(the `USER_ROLES` pattern: `no-inline-union-redecl` + a db↔contracts
   mirror test.)*
