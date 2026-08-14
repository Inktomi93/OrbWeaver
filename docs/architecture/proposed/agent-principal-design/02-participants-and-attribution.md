---
kind: design
status: parked
updated: 2026-08-14
---

# 02 — Participants and Attribution: the Kind Split, Live `authorUserId`, and the D19 Reconcile

> **Status: COMMITTED (D60, 2026-07-01) — prescriptive design; the ledger D-entry wins on any
> conflict.** The roster half: how `chat_participants` represents "userId-backed AND AI-driven"
> (the thing the XOR forbids today), and how authorship threads through the live persist path.

---

## 1. The axis split — `kind:'agent'` replaces the overloaded XOR

**The load-bearing scout finding (AGENTS-2 §8.6):** `chat_participants.kind` means BOTH
identity-table (users vs characters) AND human-vs-AI at once, welded together by the 2-way XOR
CHECK (`user_id XOR character_id`). An agent principal is userId-backed *and* AI-driven —
unrepresentable. The fix splits the meanings by making `kind` the DRIVE axis and the columns the
IDENTITY axis:

**DECISION: `PARTICIPANT_KINDS` gains `'agent'`** (4-member:
`["human", "character", "agent", "observer"]` — observer stays reserved, still not wired into any
shape rule), **and the actor XOR CHECK is replaced by a per-kind SHAPE CHECK:**

```sql
-- chat_participants_kind_shape (REPLACES chat_participants_actor_xor):
CHECK (
  (kind = 'human'     AND user_id IS NOT NULL AND character_id IS NULL)
  OR (kind = 'character' AND character_id IS NOT NULL AND user_id IS NULL)
  OR (kind = 'agent'     AND user_id IS NOT NULL AND character_id IS NULL)
  OR (kind = 'observer'  AND user_id IS NULL     AND character_id IS NULL)  -- reserved; still un-seatable (no insert path)
)
```

`human` and `agent` share a column shape — deliberately. The columns answer "which identity table
does this seat FK?"; `kind` answers "who drives it?". That second bit is exactly the information
the XOR could never carry. *(Rejected: a separate `isAi` boolean column orthogonal to `kind` —
it makes incoherent combinations representable (`character` + `isAi:false`?) and every consumer
must keep two axes coherent by hand; a closed kind tuple with per-kind shape CHECKs is the
D24/D18 born-at-creation discipline. Rejected: seating agents as `kind:'human'` rows with a flag
elsewhere — the memory-witnessing, cast, and arbitration machinery all dispatch on `kind`; hiding
agent-ness off-axis makes every one of them silently wrong. Rejected: `kind:'character'` with a
userId — re-overloads the axis in the opposite direction and breaks the XOR discipline the schema
was born with.)*

**The DB does not FK-verify `kind='agent' ⇒ users.kind='agent'`** (cross-table CHECKs don't exist
in SQLite). That belt is the seating chokepoint's (doc 04 §3): the ONE agent-seat insert path
verifies the target row is `kind='agent'` + enabled before insert — the invite-redeem
"one chokepoint, no stray INSERT" precedent (chat.md Part III §2). A human userId in an agent
seat (or vice versa) is refused at the verb; a test pins it.

**`UNIQUE(chatId, userId)` already covers agents** — one seat per agent per room, and the re-join
`ON CONFLICT` upsert (kick-then-reseat) works unchanged. Lifecycle columns (`joinSeq`, `leftSeq`,
`joinHistoryVisibility`) apply verbatim — an agent participant has join/leave horizons exactly
like a human (this is what makes witnessing free, §5).

### 1.1 The derived kind-sets (contracts) — every consumer dispatches, none re-derives

```ts
// @orb/contracts/chat — next to PARTICIPANT_KINDS (the one home)
export const AI_DRIVEN_KINDS  = ["character", "agent"] as const satisfies readonly ParticipantKind[];
export const USER_BACKED_KINDS = ["human", "agent"]    as const satisfies readonly ParticipantKind[];
export const isAiDriven  = (k: ParticipantKind): boolean => (AI_DRIVEN_KINDS as readonly string[]).includes(k);
export const isUserBacked = (k: ParticipantKind): boolean => (USER_BACKED_KINDS as readonly string[]).includes(k);
```

Consumers and their migration (each is a dispatch-site flip, found by the compiler):

| Consumer | Today keys on | Becomes |
|---|---|---|
| `parseParticipant` (the discriminated-union parser + `satisfies never`) | 2 arms + XOR | 3 arms (`AgentParticipant { kind:'agent', userId, … }`); the `never` guard enumerates the work — the tripwire doing its job |
| arbitration (`select-speakers` / policies — "only considers `kind:'character'`") | `kind === 'character'` | `isAiDriven(kind)` — an agent is arbiter-selectable; its `talkativeness`/`disabled` columns apply verbatim |
| the present-and-contributing predicate | human=persona-present; character=card | gains the agent arm: present iff `leftSeq IS NULL AND NOT disabled` **AND the principal row is enabled** (the doc-03 containment read — one indexed users read on the roster load, cached per turn) |
| `{{group}}`/`{{groupNotMuted}}`/`{{notChar}}` macros | character cast | `AI_DRIVEN_KINDS` cast; the agent's display name arrives from the doc-04 speaker source |
| cast/WI keyword name-set | characters + present personas | + agent display names |
| D22 `getRosterCardView` | characterId-keyed | agent seats get the doc-06 §5 `AgentCardView` (name + sourceKind floor) |

*(Enforcement: `AI_DRIVEN_KINDS`/`USER_BACKED_KINDS` carry `satisfies readonly ParticipantKind[]`
so a 5th kind fails `tsc` at the set definitions; the per-consumer dispatches stay
`assertNever`-gated per §7.5.)*

## 2. Live `authorUserId` stamping — the acting principal on the persist path

**Ground truth (verified in-tree):** orbweaver's `messages` slot already carries `authorUserId`
(SET NULL FK), `canon-write.ts` already accepts it, and HUMAN posts already stamp it (the caller's
`Principal.userId` — chat.md §11 "author server-stamped"). What does NOT exist is an ASSISTANT row
with a non-null `authorUserId` — assistant attribution is `characterId`-only. The neo-era "never
stamped on the live path" finding is half-dissolved; the remaining NEW build is exactly one thing:

**DECISION: attribution rides the SPEAKER, resolved in the engine.** The per-speaker loop already
resolves a roster participant per turn; the persist params gain the speaker's authorship:

```ts
// the engine's speaker→attribution mapping (exhaustive over the AI-driven kinds)
kind === 'character' → { characterId: speaker.characterId, authorUserId: null,            personaId: null }
kind === 'agent'     → { characterId: null,                authorUserId: speaker.userId,  personaId: null }
// human rows are posts, not turns — stamped from Principal.userId at the verb (unchanged)
```

An agent-authored assistant row: `authorUserId` = the agent's userId, `characterId` NULL,
`personaId` NULL. The slot stays a pure slot (D26 — attribution is slot-level; a swipe never
re-voices). *(Rejected: also stamping the agent's turns with a synthetic characterId "for
compatibility" — a second identity home; every consumer that assumed assistant⇒characterId is
found and fixed by the compiler instead (the D16 inv-9 "narrator characterId never NULL" rule is
SCOPED: it governs narrator/group turns, which stay group-character-authored; an agent speaker is
a different, self-attributed row kind — the invariant's enumeration gains the agent arm).*

**Render/read model:** `MessageView` already carries `authorUserId`; render chrome derives from
the roster map (`characterId`/`authorUserId` → participant), never body parse (chat.md §12 inv 5
— unchanged, now with a third arm). The client badges agent-authored rows (doc 06 §7).

## 3. The D19 reconcile — three axes, finally all honest

D19's law: **spend follows `runAsUserId`, responsibility follows `triggeredBy`, attribution
follows the actor.** Under borrowed-owner, actor==owner collapsed the third axis; the agent
principal un-collapses it. Precisely:

| Axis | Value for an agent's room turn | Changes? |
|---|---|---|
| **`runAsUserId`** (funding: credentials, settings, model-gating) | the HOST — read from the roster, as every AI turn today | **NO.** An agent never funds anything. The host's box pays for the agent's speech in the host's room, exactly as it pays for a character's. The by-proxy `max-pro-sub` consent belt applies unchanged |
| **`triggeredBy`** (spend budget, abort rights, responsibility) | the responsible HUMAN — the caller for a direct send; the chain-starter for auto-mode | **NO — and it is now a typed invariant: `triggeredBy` is always a human.** Structurally guaranteed: agents cannot be callers (no Principal, doc 03 §1), and auto-mode chains start from a human trigger. An agent turn scheduled by arbitration inherits the round's `triggeredBy` like any AI speaker |
| **`authorUserId`** (authorship) | **the AGENT** | **YES — the one new thing.** "Funded by the owner but AUTHORED by the agent" resolves as: funded by the *host* (D19 said owner only because solo host==owner), authored by the agent |

`resolveTurnIdentity` is untouched (it never emitted authorship — correct); the authorship mapping
in §2 is a new, separate concern beside it. The `no-caller-user-id` gate and the
"caller's `Principal.userId` never reaches `resolveCredential`" invariant both hold verbatim.

## 4. Stats — the economics arms (live + reconcile must stay byte-equal)

The drift contract (stats.md): `applyStatsDelta` over a turn == `reconcileStats` over the same
canon, column-for-column. Agent-authored rows need BOTH arms, decided together:

- **Live delta:** agent-authored assistant economics attribute to **`runAsUserId` (the host)** —
  the same owner-axis every assistant turn already debits (spend follows funding, D19).
  `character_stats` gets NO row (no characterId — the delta builder's character arm skips null;
  a test pins that skipping, not zero-writing).
- **Reconcile:** the rebuild's assistant mapping ("economics by `characters.ownerId`" — PD-21)
  gains the agent arm: an assistant row with `authorUserId` + null `characterId` attributes to
  **the chat's host participant** (`chat_participants(role='host')` — membership data the rebuild
  already walks). NOT to `users.ownerUserId`: a buddy seated in a friend's room burns the
  friend-host's budget (D19), and the reconcile must agree with the live path, not with agent
  ownership. **This answers PD-21's re-open note** ("the multi-owner question re-opens with v2's
  first-class-agent roster — re-decide there"): re-decided — host-attribution, both paths, one
  more int-test row in the PD-21 suite.
- **Per-agent cost visibility — DEFERRED, RATIFIED (Nate, 2026-07-01: "idgaf"):** "what does my
  buddy cost" is answerable on-read (`GROUP BY authorUserId` over agent-authored variants)
  without a fifth rollup table. Build a rollup only when a real UI surface asks for it at a
  scale where the scan hurts. *(Rejected: an `agent_stats` rollup — a new always-written table
  for a question nobody has asked on a single-operator scan-friendly dataset.)*

## 5. Memory witnessing — agents witness like humans; no new bucket kind

D55's scoped machinery is **character-keyed** (`scopedCharacterId` is ALWAYS a real
`CharacterId`; per-witnessing buckets exist per CHARACTER; humans have no egocentric bucket).
Agents slot into the HUMAN side of that design:

- An agent participant's join/leave horizons (`joinSeq`/`leftSeq`) feed the witnessing predicate
  exactly as a human's do — a re-seated agent doesn't retroactively witness what it missed. Free,
  because §1 kept the lifecycle columns.
- **No egocentric digest bucket for agents in v1.** The agent reads the room's shared recall
  (merged bucket) like every participant. Its own lines land in the shared digests as content.
- **Known limit, recorded:** `chat_digest_speakers` (by-character search across rooms) is
  character-FK'd; agent-authored lines are not speaker-indexed. *(Criterion to widen: when
  "find what my buddy said across rooms" is wanted, add a per-type speaker join arm
  (`chat_digest_agent_speakers`, D24 per-type-FK discipline) — additive, no schema rework.)*
- The digest `content_hash` folds stable speaker identity; the agent's stable id is its userId —
  the hash input's speaker-id derivation gains the agent arm (same rename-robustness rationale).

## 6. Invariants (gate candidates)

1. **The kind-shape CHECK is born at creation** and replaces the XOR; `observer` remains
   un-seatable. *(compile-for-data + the parseParticipant `never` guard.)*
2. **One seating chokepoint verifies `users.kind='agent'`** for agent seats — no stray roster
   INSERT can seat a human as an agent or an agent as a human. *(test: the cross-kind refusal
   matrix; lint: roster INSERTs live in chat persistence only — existing rule.)*
3. **An agent-authored assistant row is `{authorUserId: agent, characterId: null}`** — never
   both, never neither for an agent speaker. *(compile: the exhaustive speaker→attribution map;
   test: a room turn by an agent persists exactly this shape.)*
4. **`triggeredBy` is always a human** — no code path can place an agent userId there.
   *(structural: agents have no Principal; test: auto-mode chain through an agent speaker keeps
   the chain-starter.)*
5. **Live and reconcile stats agree on agent rows** (host-attributed, both paths).
   *(test: the PD-21 drift suite gains the agent row.)*
6. **Solo stays byte-identical** — a roster with zero agent participants assembles and renders
   byte-identically to today. *(the `no-if(isGroup)` contract-test pattern, re-aimed:
   `no-if(hasAgent)`.)*
