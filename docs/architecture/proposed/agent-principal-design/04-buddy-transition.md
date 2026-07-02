# 04 — The Buddy Transition: Firewall Inversion, the Speaker Source, and Seating

> **Status: COMMITTED (D60, 2026-07-01) — prescriptive design; the ledger D-entry wins on any
> conflict.** Buddy is the first (and in v1, only) agent-principal adopter. This doc specs the
> `buddy_turns` firewall inversion, how chat voices a soul it has never heard of, and the seating
> flow. buddy.md's resolved buddy-local decisions are CARRIED, not re-opened.

---

## 1. The two lives of one buddy (the frame)

| Surface | Identity used | Transcript | Funding | Status |
|---|---|---|---|---|
| **Solo** (`buddy.ask`/`confirm`/`history`) | borrowed-owner (as today — `buddies.userId` IS the owner at every seam) | `buddy_turns` (buddy-local) | the owner (owner-delegated resolve; `max-pro-sub` for the owner's buddy — D17) | **UNCHANGED, byte-identical.** buddy.md's resolved call: "the solo `buddy_turns` transcript SURVIVES as the solo-chat case" — carried |
| **Room** (a seat in a real chat) | **the agent principal** (`kind:'agent'` roster row → the buddy's `users` row) | chat canon (`messages`, self-attributed — doc 02 §2) | the HOST (`runAsUserId`, D19 — doc 02 §3) | **NEW — this doc** |

**WHY keep solo on borrowed-owner rather than migrating it to the principal:** the solo chat is a
private owner⇄buddy surface with no attribution ambiguity (there is exactly one human), the
borrowed posture already delivers credential inheritance for free (ledger §3), and migrating it
buys nothing while risking the deterministic-gacha/soul/idempotent-hatch machinery. The principal
exists FOR shared spaces. *(Rejected: rewrite `ask` to run as the principal — a churn-only
migration; rejected: two transcripts merged into one chat row — the solo chat is not a room and
gains none of a room's machinery (roster, invites, arbitration) it would then have to carry.)*

## 2. The `buddies` table split — owner-link vs own-principal (the §8.6 item, resolved)

`buddies.userId` (PK, FK users CASCADE) today means "the OWNER." It keeps meaning exactly that —
the buddy is 1:1 with its owner, the soul/bones/mood state is owner-keyed, nothing moves.
**The agent principal is NOT a `buddies` column** — the link lives on the identity side:
`users.ownerUserId` (doc 01 §1) + `agent_principals.sourceKind='buddy'` resolve
principal → owner → `buddies` row (one FK hop each way; the mint's deterministic handle also
encodes it). *(Rejected: `buddies.principalUserId` FK — a second home for one edge; the identity
root already carries the owner link, and a nullable column on `buddies` would need its own
backfill + coherence story. The D23 test: the buddy's principal is reachable by ONE query on
`users(ownerUserId, kind='agent')` + the satellite's sourceKind — derive, don't stamp.)*

## 3. Seating — `chat.seatAgent` (the ONE agent-seat chokepoint) + the consent flow

```ts
// chat/contract/params.ts
export interface SeatAgentParams {
  readonly chatId: ChatId;
  readonly ownerUserId: UserId;          // whose agent (v1: whose buddy)
  readonly sourceKind: AgentSourceKind;  // 'buddy'
}
// The verb (host-gated): requireHost → verify the agent's OWNER is a present human member →
// provisionAgentPrincipal (the lazy mint, injected op — doc 01 §4) → verify users.kind='agent' +
// enabled → roster INSERT {kind:'agent', userId: agentUserId, role:'member', joinSeq: maxSeq} →
// bus event. Unseating = the normal kick path (leftSeq) — no new verb.
```

**The consent model (two authorities, both required):**
- the **HOST** consents to the seat (room authority — an agent in the cast affects everyone's
  prompt + the host's spend, since the host funds its turns);
- the **OWNER** consents to their agent being used (it is their companion + their solo context's
  persona) — expressed by the owner being the one who ASKS. v1 flow: the owner (a present member)
  requests via the client; when owner==host that collapses to one `seatAgent` call (the
  overwhelming v1 case). When owner≠host, the request rides a `notifications.emit`
  (`agent-seat-requested`, additive member) → the host calls `seatAgent` — the host-handoff
  two-party precedent, without a new state table (the request is advisory; the verb re-verifies
  everything). *(Rejected: host may seat ANY member's buddy unilaterally — uses someone's
  companion without their act; rejected: owner may self-seat into any room — bypasses host cast
  authority (member-contributed cast is rejected in D22's model for cards; same logic for
  agents). Rejected-for-v1: a standing `buddies.allowRoomInvites` consent flag — machinery for a
  consent the two-party flow already expresses; criterion: build it if the ask/approve round-trip
  proves annoying in real multi-human use.)*

**The seat-join is the mint moment** (doc 01 §4): first `seatAgent` for an owner mints the
principal; every later one finds it (`created:false`).

## 4. The firewall inversion — what inverts, what replaces the compile-time guarantee

Today's guarantee: `BuddyAgentRequest` has no `chatId` — passing chat context to a buddy turn is
a **compile error**; buddy writes no `messages`. After the transition:

- **The solo path keeps the exact same shape.** `BuddyAgentRequest` still has no `chatId`;
  `buddy.ask` still writes only `buddy_turns`. Nothing to migrate, nothing to weaken.
- **The room path never enters the buddy domain.** An agent's room turn is a CHAT ENGINE turn —
  the speaker is a roster row; chat owns chatId natively; the reply persists through chat's one
  canon-write path, self-attributed (doc 02 §2). Buddy code is not on the call stack.
- **The REPLACEMENT guarantee (the new invariant):** *the buddy domain never writes chat canon.*
  Enforcement: resolve/lint — `domain/buddy/**` imports no chat persistence and receives no
  canon-write op (dep-cruiser `domain-no-cross-feature` already forbids the import; the
  compose-root injection table for buddy simply never includes one). The inversion is thus not
  "buddy may now write messages" — it is "the buddy's principal may now SPEAK, and chat does the
  writing," which is a strictly smaller trust grant than the old fear.

## 5. How chat voices a soul — the `AgentSpeakerSource` registry

Chat resolves a character speaker's identity via injected `character.getCard`. An agent speaker
needs the same RESOLVE-phase product (a system-prompt identity + a display name) from a source
chat must not know exists (buddy). The seam:

```ts
// @orb/contracts/chat — the RESOLVE-phase product for an agent speaker (the card-shape minus the card)
export interface AgentSpeakerIdentity {
  readonly displayName: string;          // the soul's name → speaker labels, macros, cast lists
  readonly systemPrompt: string;         // buildBuddySystemPrompt output (the soul prompt — buddy-local builder, unchanged)
  readonly avatarAssetId: AssetId | null; // v1: null (sprites are client-side; criterion: a real avatar lands with the D22 card view)
}
export type ResolveAgentSpeaker = (agentUserId: UserId) => Promise<AgentSpeakerIdentity | null>;

// entry/compose — the registry: a mapped Record over AGENT_SOURCE_KINDS (exhaustive-dispatch;
// a new source kind fails tsc here until it registers a resolver)
const AGENT_SPEAKER_SOURCES = {
  buddy: buddyService.resolveSpeakerIdentity,  // NEW buddy front-door op: ownerUserId ← users row → soul → prompt
} as const satisfies Record<AgentSourceKind, ResolveAgentSpeaker>;
// ChatContext gains ONE injected op: resolveAgentSpeaker(agentUserId) — entry composes the
// dispatch (read agent_principals.sourceKind → the registered resolver). Chat stays source-blind.
```

*(Rejected: chat importing buddy's soul — sideways; rejected: copying the soul into an
`agent_principals.displayName`/prompt column — a second home that goes stale the moment the soul
mutates (souls are mutable — stats grow); rejected: minting a hidden `characters` card for the
buddy so `getCard` "just works" — buddy.md's resolved call is soul-NOT-card, and a shadow card is
the lossy `createFromCharacter` mistake in a new hat.)*

**The turn itself** (all existing seams, listed for the builder):
- **RESOLVE:** the agent speaker's identity via `resolveAgentSpeaker`; its egocentric view is
  chat canon through the ONE view-builder + witnessing (doc 02 §5) — **this closes buddy.md's
  deferred view-convergence item exactly on its stated criterion** ("when buddy joins a group
  chat its view becomes chat canon via the view-builder — converge then"). The solo view stays
  the `buddy_turns` transcript (buddy-local, per the same resolved item).
- **Connection:** `resolveRole('agent')` + the per-agent override — the committed per-agent
  routing axis; the agent's window discipline comes from the capability descriptor.
- **Credential/funding:** the host's, via `runAsUserId` (doc 02 §3). The owner-delegation arm
  (doc 01 §6) is NOT on this path.
- **Mode:** default = a plain stateless roleplay turn (no tools — the firewall's non-agent-mode
  posture). Tool-mode room turns (the buddy bringing its hands to a room) are **AP4-deferred**
  with the ceiling already specced (`'tool-propose'`, doc 03) — *criterion: a concrete room use
  case for buddy tools; the solo hands are not blocked on it.*
- **Persist:** self-attributed (doc 02 §2); stats host-attributed (doc 02 §4); memory witnesses
  it via the shared bucket (doc 02 §5).

## 6. The observer interplay (PD-45 — a note, not new machinery)

The buddy observer reacts to chat events keyed on "whose buddy reacts" (workload owner / chat
host). A seated buddy hearing its OWN room's events must not quip-react to itself: the signal
router drops events whose acting principal is the reacting owner's own agent (one id comparison).
Recorded here so the observer build (PD-45) lands with the belt; no design change.

## 7. Invariants (gate candidates)

1. **Solo is byte-identical** — `buddy.ask`/`history`/`confirm` behavior, the `buddy_turns`
   schema, and the no-chatId request shape are untouched. *(contract test + `tsc`.)*
2. **Buddy never writes chat canon** — no canon-write op on `BuddyContext`; no chat persistence
   import. *(resolve/lint + the compose-table review.)*
3. **`seatAgent` is the ONE agent-seat insert path** — host-gated, owner-present-verified,
   kind-verified, mint-idempotent. *(test: the refusal matrix — non-host, absent owner, disabled
   agent, human target, double-seat.)*
4. **The speaker-source registry is exhaustive** over `AGENT_SOURCE_KINDS` — a new source cannot
   ship without a resolver. *(compile: the `satisfies Record`.)*
5. **The room turn is chat's one turn path** — no buddy-side dispatch, no second runner.
   *(invariant #3, re-pinned: the agent speaker rides `runChatTurn` like every AI speaker.)*
