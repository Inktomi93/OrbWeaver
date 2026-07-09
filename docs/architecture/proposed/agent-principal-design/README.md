# Agent-Principal Design — the prescriptive plan for agents as first-class principals (doc-set index)

> **Status: COMMITTED (D60, 2026-07-01). Build state (trued 2026-07-09): AP0–AP2 LANDED; AP3 is
> PARTIALLY in — the seat verb (`chat.seatAgent`: `createSeatAgent` in `domain/chat/verbs/roster.ts`
> + the `seatAgent:"host"` auth-matrix row + the persistence arm) is in-tree, but
> `resolveAgentSpeaker` is NOT (the placeholder note in `roster.ts` marks it); AP4a/AP4b pending.**
> The §8.6/PD-17 transition — "buddy gets its own ID" — is
> planned work, not a someday note (Nate, 2026-07-01: "we should plan for it, it's kinda
> important"). This doc set is the authoritative design (`Core-Laws-and-Precedents.md` D60 is the
> decision record and wins on any conflict). The evidence base: the neo-tavern principal-scout dig
> (`reports/principal-scout.json`, cited via AGENTS-2 §8.6 — one-line cites only), the v1
> borrowed-owner posture (ledger §3/§5/D17), and the LIVE orbweaver identity spine (`can()` in
> `domain/admin/guard.ts`, the D19 turn-identity triple in `chat/engine/turn-identity.ts`, the
> XOR'd roster in `db/schema/chat.ts` — all built, all read in full for this design). Everything
> here is prescriptive and self-contained: a builder with ONLY this doc set + the orbweaver law
> docs (AGENTS-1/2/3, `core/Spine-Identity-and-Auth.md`, the domain docs it cites) can build the
> whole system. Every decision carries its WHY + the rejected alternative; every lean carries a
> committed default + the criterion that finalizes it.

> **Triage 2026-07-09 (dispatch board — `../README.md` §0):** READY-TO-BUILD. Next: the AP3+AP4a seat wave (needs chat obligation #18 `chat.seatAgent`; the AP4a agent-GM half additionally needs rpg R3). `buddy-observer-reaction-engine.md` lands WITH this wave.

## The one-paragraph design

An agent becomes a **real principal**: its own `users` row (`kind:'agent'`, structurally
loginless — a CHECK, not a convention), owned by a human via a `users.ownerUserId` self-FK
(owner hard-delete cascades the agent — referential physics, no reaper), registered in a thin
`agent_principals` satellite (`sourceKind` drives dispatch), minted **lazily at first seat-join**
by `sessions.provisionAgentPrincipal` (idempotent, deterministic `__agent__` handle namespace —
the synthetic-group-character precedent, honestly compared in doc 01). The roster gains
`kind:'agent'` (userId-backed AND AI-driven — the axis the old XOR could not represent; the XOR
CHECK becomes a per-kind shape CHECK), and an agent's room speech is **real chat canon,
self-attributed** (`authorUserId` = the agent) — inverting the `buddy_turns` firewall for rooms
while the solo transcript survives byte-identical. The safety the borrowed-owner model gave for
free survives as an **explicit, closed capability ceiling**: agents are *sessionless and
Principal-less* (no request path can act as one — unconstructability, not a runtime deny), and the
ONE runtime gate is a `canAgent(actor, action, room)` arm on the existing `can()` seam whose
closed `AgentAction` union IS the ceiling (an un-listed action is unspellable). Containment is one
row flip (`users.enabled = false`) plus kick. Funding never moves: D19 stands — the host's
`runAsUserId` funds room turns, a human `triggeredBy` stays responsible, and only *authorship*
changes hands. The seats this unlocks — buddy in a party (`rpg_party.userId` already fits), an
agent principal holding the RPG GM seat (three data-read re-keys, no schema change), and the
crew's bright-line criterion (never a principal until a member authors canon) — are specced with
minimum contract deltas. One model, one auth spine, no second agent system.

## Reading order

| Doc | What it locks |
|---|---|
| [`01-identity-and-mint.md`](01-identity-and-mint.md) | the `users.kind`/`ownerUserId` columns + CHECKs, the `agent_principals` satellite, `provisionAgentPrincipal` (caller/timing/idempotency/handle namespace), the structural no-login guarantee, the synthetic-group-character precedent compared honestly |
| [`02-participants-and-attribution.md`](02-participants-and-attribution.md) | the `chat_participants.kind:'agent'` axis split (XOR → per-kind shape CHECK), `parseParticipant`, the derived kind-sets, live `authorUserId` threading, the D19 spend/responsibility/authorship reconcile, stats (live + reconcile arms), memory witnessing, message views |
| [`03-capability-ceiling.md`](03-capability-ceiling.md) | the two-wall ceiling: structural Principal-unconstructability + the `canAgent` closed-union arm on the ONE `can()` seam; the ceiling table with per-row enforcers; the kill switch / propose-confirm / rate-limit trio re-derived; containment = one row flip |
| [`04-buddy-transition.md`](04-buddy-transition.md) | the firewall inversion: solo `buddy_turns` byte-identical, room speech = chat canon, the `AgentSpeakerSource` registry (soul → system prompt without chat knowing buddy), the no-chatId guarantee's replacement, seating flow + owner consent |
| [`05-seats.md`](05-seats.md) | the three seats: buddy in a party (`rpg_party.userId` — zero schema change), an agent principal in the RPG GM seat (`gmUserId` + the three re-keys), the crew upgrade criterion (lean: never, with the bright line) |
| [`06-ripples.md`](06-ripples.md) | admin (listUsers/setRole/setEnabled), sessions (structurally sessionless), notifications (no agent recipients v1), invites/kick, D22 agent card view, export/import degradation, buddy-observer interplay |
| [`07-build-plan.md`](07-build-plan.md) | what rides `0000_baseline` vs what builds later; chunks AP1–AP4 with sizes, checkpoints, dependencies; the full test plan incl. the containment suite ("a disabled agent principal can do NOTHING") |

## The verdict card (the executive summary)

| Question | Verdict | One line |
|---|---|---|
| Where does the mint live? | **`sessions.provisionAgentPrincipal`** | next to `provisionIdentity` (sessions.md already claims it); idempotent, `__agent__` handle namespace, called lazily at first seat-join via an injected op |
| What does `users` gain? | **`kind` + `ownerUserId`** | a 2-member `USER_KINDS` tuple (never a boolean) + a self-FK CASCADE owner link; a shape CHECK makes `role='user'`, no password, no externalId, owner-required STRUCTURAL for agents |
| How does the roster represent it? | **`kind:'agent'`** | the XOR CHECK becomes a per-kind shape CHECK; `AI_DRIVEN_KINDS`/`USER_BACKED_KINDS` derived sets keep every consumer exhaustive |
| Who funds an agent's room turn? | **the host (D19, unchanged)** | `runAsUserId` funds, a human `triggeredBy` is responsible, `authorUserId` = the agent — the three axes finally all mean what they say |
| What is the ceiling? | **Principal-unconstructability + `canAgent`** | no session, no Principal, no tRPC path; the one runtime gate is a closed `AgentAction` union on the existing `can()` seam |
| How is a runaway contained? | **`users.enabled = false` (one flip) + kick** | disable removes the agent from every cast/arbitration and refuses its turns everywhere; kick contains one room |
| Does solo buddy change? | **NO — byte-identical** | `buddy_turns` stays the solo transcript; the firewall inverts only for rooms, where the speech is chat's canon, not buddy's |
| Does crew become a principal? | **No (lean), with a bright line** | proposers never need authorship; the criterion: any crew capability that AUTHORS canon messages must come through an agent seat |
| Is the agent-held GM seat a someday? | **NO — a HEADLINE deliverable** | Nate: "agent running GM is wanted" — the GM-seat re-keys ship in the AP3 seat wave; the wave's demo checkpoint is the buddy holding the seat and running a session (doc 05 §2, doc 07 §2) |

## Product ratifications (Nate, 2026-07-01 — settled, do not re-open)

The five product questions this set surfaced, all answered:

1. **Cross-member seating — RATIFIED as designed** (doc 04 §3): owner requests → host approves;
   owner==host collapses to one call. No unilateral host seating, no standing consent flag.
2. **Solo-chat-on-disable — RATIFIED as designed** (doc 03 §5): solo buddy rides
   `agencyEnabled`; the principal `enabled` flip governs rooms/seats only.
3. **Admin view — RATIFIED as designed** (doc 06 §1): ONE `listUsers` table, kind badge +
   filter axis; no separate Agents surface.
4. **Per-agent cost rollup — RATIFIED deferred** (doc 02 §4; Nate: "idgaf"): derive-on-read
   stands; no rollup until a real UI asks.
5. **Agent-held GM seat — WANTED, PULLED FORWARD** (doc 05 §2, doc 07 §2): promoted from a
   trailing AP4 option to a first-class goal of the seat wave — AP4a lands WITH AP3 as one wave,
   and the combined checkpoint demo includes an agent-GM'd session.

## Standing decisions a cold agent must not re-litigate

One turn path (invariant #3) is untouchable — an agent's room turn IS a chat engine turn, never a
second dispatch · the sealed-runner firewall stays in `infra/providers` — this design moves no
part of it · nothing here builds a second auth model — every allow/deny routes through the
`can()`/Principal spine in `domain/admin/guard.ts` (+ its `canAgent` extension) · agents are
STRUCTURALLY sessionless — no auth mode ever resolves a `kind:'agent'` row, ever; the containment
suite pins it · `users.kind` is a tuple, not a boolean · funding follows D19 (`runAsUserId` =
host) — an agent NEVER funds anything and is NEVER `triggeredBy` · the mint is LAZY (first
seat-join), idempotent, and lives in `domain/sessions` · the solo `buddy_turns` transcript
survives (buddy.md's resolved buddy-local decision — carried, not re-opened) · schema
(columns/CHECKs/tuples) rides the `0000_baseline` squash; behavior lands in chunks AP1–AP4
(doc 07) · the agent-held GM seat is a HEADLINE deliverable of the AP3 seat wave, not a trailing
option (Nate, 2026-07-01) · the borrowed-owner posture stays the SHIPPING posture until AP3
lands — nothing in this set weakens it in the interim.
