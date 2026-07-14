# 06 — Ripples: Admin, Sessions, Notifications, Invites, Card Views, Export

> **Status: COMMITTED (D60, 2026-07-01) — prescriptive design; the ledger D-entry wins on any
> conflict.** Every surface an agent-shaped `users` row touches, each with its verdict + enforcer.
> The organizing rule: an agent row must be VISIBLE where humans administer, INERT where humans
> authenticate, and DEGRADABLE where data leaves the system.

---

## 1. Admin surfaces

- **`listUsers` shows agents — DECISION (RATIFIED, Nate 2026-07-01): default ALL, with the kind
  as a first-class column/filter axis — one table, kind badge, no separate Agents surface.**
  `ListUsersParams` gains `kind?: UserKind` (absent = all); `AdminUserView` gains
  `kind` + `ownerHandle` (join via `users.ownerUserId` — NULL for humans). WHY default-all:
  an invisible principal is the one thing an admin containment surface must never have — the
  §8.6 fear is a runaway you can't see; the client renders a Humans/Agents tab off the same
  procedure. *(Rejected: default humans-only — hides exactly the rows `setEnabled`-as-containment
  operates on; rejected: a separate `listAgents` verb — two list surfaces to keep consistent for
  one filter bit.)*
- **`setRole` REFUSES agent targets** — `cannot_modify_agent` (`DomainOperationError` reason,
  the `cannot_modify_owner` pattern): the fast-path `loadUser` kind pre-check + the atomic
  backstop `WHERE kind <> 'agent'` ON THE UPDATE (both layers, the owner-immutability mechanism
  verbatim). The `users_agent_shape` CHECK (`role='user'`) is the DDL floor beneath both. An
  agent's authority is the doc-03 ceiling; the role axis is human-only — admin.md's open
  question, closed as its own lean predicted.
- **`setEnabled` ACCEPTS agent targets — it IS the containment verb** (doc 03 §5). Audited like
  every admin write; `cannot_disable_self` can never fire (an agent is never the actor). The
  disable tail's `revokeAllForUser` no-ops harmlessly (agents have no sessions — zero rows).
- **`createUser` mints humans only** — the params never carry `kind`; the INSERT hardcodes
  `'human'`. Agent rows come only from `provisionAgentPrincipal` (doc 01 inv 3).
  `resetPassword` refuses agent targets (`cannot_modify_agent`) — there is no password to reset
  and no legitimate reason to add one (the DDL CHECK would refuse the write anyway; the verb
  gives the honest error first).

## 2. Sessions — structurally sessionless (the doc 01 §3 belts, listed as this domain's rows)

`validate` (kind-filtered join) · `create` (refuses agent targets) · `ensureUser` /
`provisionIdentity` (refuse the `__agent__` namespace AND `kind='agent'` matches) · the
owner-fallback (owner-only by construction). The API-token surface (a sessions verb, same table)
inherits all of it — an agent can hold neither a browser session nor an API token. *(A
programmatic "act as my agent" API is a NON-GOAL: acting as an agent happens only inside the
turn engine; an API token FOR an agent would be wall-one demolition — recorded so nobody builds
it as a convenience.)*

## 3. Notifications — no agent recipients (v1 lean)

`NotificationEvent.recipientUserId` means "a human inbox." **Lean: agents are never recipients in
v1** — nothing reads an agent's inbox (no session → no subscription → durable rows that rot).
Enforcement: `notifications.record` refuses a `kind='agent'` recipient (one indexed read, loud
`DomainOperationError`) — cheap, and it converts a silent-rot bug into a caller bug.
*(Criterion to revisit: an agent-facing surface that CONSUMES an inbox appears — e.g. buddy's
observer wanting durable cross-session signals; that would be a deliberate design, not a
recipient-type widening.)* The doc-04 §3 `agent-seat-requested` member notifies the HOST (a
human) — consistent.

## 4. Invites and kick

- **An agent cannot be invited** — structurally: redeem requires a `Principal`; and by policy:
  invites are the HUMAN membership chokepoint, agents enter via `seatAgent` (doc 04 §3 — the one
  agent-seat path, host+owner two-party). `createInvite`'s targeted-by-handle path refuses
  `__agent__` handles (the namespace belt again — one predicate, reused).
- **An agent CAN be kicked — kick IS the per-room containment story** (doc 03 §5): `leftSeq`
  stamp, witnessing horizon closed, no stream to tear down (agents hold no SSE subscription).
  Re-seating is the normal `ON CONFLICT` re-join upsert. Host-handoff never lands on an agent
  (the nominee must accept — no Principal, no accept; the nominate verb refuses agent targets
  for the honest error).

## 5. D22 member-card visibility — the `AgentCardView`

`getRosterCardView` is character-keyed; an agent seat has no card. Members of a room may still
ask "who is this?" — the answer is a **minimal, fixed projection** (not level-clamped):
`AgentCardView { displayName, sourceKind, ownerHandle }` from the doc-04 speaker source + the
satellite. WHY not the D22 level ladder: the levels clamp CARD content (sheet/lore/steering);
an agent's "steering internals" are its soul — owner-private by the same logic that keeps a
card's internals owner-private at low levels, and there is no room-shareable middle tier worth
building until someone asks. *(Lean; criterion: an owner wanting to share soul details in-room —
then mirror `memberCardVisibility` with an owner-set cap.)* The avatar floor: none in v1
(`avatarAssetId` null — doc 04 §5); the client renders the buddy sprite locally where it has it.

## 6. Export / import — agent authorship degrades honestly

- **`exportChat`** (JSONL/TXT, host-gated D29): agent-authored rows serialize as assistant lines
  with the agent's display name (the roster map the builder already consumes) + a provenance
  field on the JSONL row (`agent_author: { handle, sourceKind }` — additive, ST-tolerant).
  Nothing secret leaves: the soul prompt is NOT exported (it never entered canon).
- **Import** of a chat containing agent authors: **degrades to plain assistant rows**
  (`authorUserId` null — exactly what SET NULL produces when an agent is deleted; one
  degradation shape, two causes). NO re-mint on import — a principal is an authority object,
  not portable data; silently minting one from a file is an privilege-creation path.
  *(Rejected: re-linking to the importer's own buddy — wrong identity wearing old lines;
  rejected: refusing the import — punishes the user for the file's history.)*
- **Character/persona export**: untouched (agents have neither).

## 7. Client (sketch — the D44 world; normative detail rides the build chunks)

The agent badge on messages (roster-map-derived, never body-parse); the Agents tab on the admin
users table (kind filter + owner column + the enable/disable flip with a containment-worded
confirm); the seat-request/approve affordance in the roster panel (doc 04 §3); the roster chip
for an agent participant (AgentCardView popover). All server-projected by existing authority
(D22 discipline: the client renders what arrives).

## 8. Invariants (gate candidates)

1. **`setRole`/`resetPassword`/`createUser` cannot touch/produce an agent row**; `setEnabled`
   can. *(test: the admin verb × agent-target matrix; the atomic `WHERE kind <> 'agent'`
   backstops under race.)*
2. **No notification row ever carries an agent recipient.** *(test: record-refusal; a schema
   sweep in the containment suite.)*
3. **The `__agent__` namespace is refused at EVERY handle-accepting surface** — ensureUser,
   provisionIdentity, createUser, targeted invites. *(one shared predicate in
   `@orb/contracts/identity` (`isReservedAgentHandle`) + per-surface tests — the predicate is
   one-homed so a new surface can't re-spell it.)*
4. **Export never emits soul content; import never mints a principal.** *(test: round-trip a
   chat with agent rows — provenance out, null-author in, zero new users rows.)*
