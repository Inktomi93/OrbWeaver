# 05 — The Seats It Unlocks: Party Member, GM Seat, and the Crew Bright Line

> **Status: COMMITTED (D60, 2026-07-01) — prescriptive design; the ledger D-entry wins on any
> conflict.** The three downstream seats, each with its minimum contract delta. The point of
> designing them NOW: prove the identity spine's shape is sufficient — none of these require a
> second identity mechanism, and two of the three require near-zero schema.

---

## 1. Buddy joins a PARTY (rpg) — the schema already fits

`rpg_party` (rpg-design/03 §4) carries `characterId XOR userId` — the userId column exists for
human players' seats. **An agent principal's userId slots into that same column with ZERO schema
change**: the XOR holds, `UNIQUE(gameId, userId)` holds, `joinedSession`/`leftSession` horizons
hold. The buddy-in-a-party is: the doc-04 roster seat (`kind:'agent'`) + an `rpg_party` row
(`userId = agentUserId`, `provenance:'joined'`, a sheet).

Minimum contract deltas:

| Delta | Where | What |
|---|---|---|
| `rpg.joinParty` accepts an agent seat | rpg verbs | today: sheet-from-persona for human joins. Agent arm: sheet seeded from the soul via the doc-04 `AgentSpeakerIdentity` (name/short-description) + the wizard/host-tuned attributes — the same host-approved flow |
| speech | none | the agent party member speaks when arbitration selects it — which per rpg-design/12 §5 means it matters at **human-GM tables with `assist.npcActors`-style per-speaker output** (AI-GM narrator tables voice companions through the GM, and an agent member is voiced by ITS OWN turns only in per-speaker rounds). The gather ring for an agent speaker = the TABLE-VISIBLE ring (rpg-12 §3's speaker-identity dispatch — an agent player is a player; **never `{{rpgSecrets}}`**) |
| checks/dice | none | `rpg_pending_checks.targetPartyMemberId` FKs the party row — a pending check can target the agent seat. `resolvePendingCheck` is member-own-row… and the agent has no Principal to call it. **Delta: agent-targeted checks auto-resolve** (the AI-GM `skill_check` default posture applied to the AI player) — one data check at the resolve gate, not a branch |

*(Rejected: a third `rpg_party` column for agents — the userId column IS the principal seat;
that's the whole point of first-class. Rejected: agent party members at AI-GM narrator tables
speaking via their own turns in v1 — narrator output mode owns the voice there; don't fork the
output-axis rules for one seat kind.)*

## 2. An agent principal holds the GM SEAT (rpg-design/12) — three re-keys, no schema

`rpg_games.gmUserId` is a plain FK → `users.id`. An agent's userId satisfies it **structurally
today**. The question "does the seat predicate just work?" — honest answer: the FK and the
id-equality arm work; three call sites keyed on "human seat vs NULL" need re-keying to
"holder KIND," because an agent-held seat is a THIRD state (a persistent-identity AI GM, distinct
from the seat-NULL synthetic-narrator AI GM):

1. **`requireGmSeat`** (rpg-12 §2): the `{kind:"gm-model"}` sentinel arm widens —
   `allow iff gmUserId IS NULL` becomes `allow iff the seat is AI-held` (NULL **or** the holder
   resolves `users.kind='agent'` AND the running speaker IS that agent — the engine passes the
   speaker's `AgentActor`, doc 03 §1, and `canAgent` has already gated `'speak'`). The user arm
   (`gmUserId === actor.userId`) is untouched — an agent holder never arrives as a user actor
   (no Principal), so no verb-side hole opens.
2. **The gather dispatch** (rpg-12 §3 — "full GM context only when the seat is NULL"): re-keys to
   *the speaker holds the seat* — the narrator/synthetic speaker when NULL, **the agent speaker
   when it is the holder**. An agent GM gathers the FULL GM ring (it IS the GM — secrets, hidden
   clocks, twist bank), which is safe for exactly the doc-03 reason: the agent cannot leak them
   through any surface but its own narration, same as the seat-NULL model today.
3. **The director disarm + GM-eyes** (rpg-12 §4/§6): both key on `gmUserId IS NOT NULL` today;
   both re-key on **holder kind**. Director: disarms for a HUMAN holder, stays armed for an agent
   holder (an agent GM wants its hidden hand exactly like the seat-NULL GM). GM-eyes: seat holder
   ∪ host-when-AI-held — i.e. the host keeps GM-eyes when the seat is NULL **or agent-held** (the
   seat is held by software; a human must be able to inspect a stuck campaign — the rpg-12 §6
   rejected-alternative reasoning, extended one state).

Each is a data-read fix at an existing dispatch point — no `if(agentGm)` branches in verb bodies
(the rpg-12 "seat is data, not a mode" law extends cleanly). **What an agent GM buys over
seat-NULL** (why anyone would): a persistent, named, soul-bearing GM identity — cross-campaign
memory of ITS OWN GMing via witnessing, per-agent connection tuning, and self-attributed GM
authorship (`authorUserId` instead of the synthetic group character… **decision: NO** — GM
narration in rpg games stays authored by the synthetic group character even under an agent
holder, because memory keying (`scopedCharacterId`, D55) and inv-9 ("narrator authored by the
group character, never NULL") hang off it; the agent holds the AUTHORITY axis, the group
character keeps the AUTHORSHIP-bucketing axis. One seat, two axes, no rework of the memory
substrate.) *(Lean on timing: build AFTER buddy-in-room proves the seat machinery (AP4);
criterion: the first user ask for "my buddy runs our campaign," which is the feature's actual
name.)*

## 3. Crew / workload attribution — the bright line (lean: NEVER a principal, with the criterion)

The crew (D59) runs every member as a WorkloadKind with `ownerId = host`, thinking via the sealed
`agentTurn`, writing through domain-of-affect verbs. **Does it EVER become an agent principal?**

**Lean: NO — permanently, for everything the crew currently is.** The reasoning, not just the
verdict: crew members are **proposers** (pure structured output; the standing D59 rule — "a
member that acts mid-run is an actor, not a proposer"). Attribution-as-a-principal exists to make
*canon authorship* honest — and no crew artifact IS canon authorship: keeper entries are lore rows
written under host authority (world-info owns them), card proposals await a human owner's accept,
edit proposals apply through `chat.editMessage` under the accepting HUMAN's `can()`, the
director's guidance is a host-ring injection, guides are host room-state. `runAs-host` +
workload provenance rows already attribute that work correctly; a principal per member would be
six users rows with nothing to author. The same holds for the rpg crew's WorkloadKinds.

**The bright-line criterion (recorded so the seam is known):** *the moment any crew-like
capability AUTHORS A CANON MESSAGE in its own voice — posts to `messages` as itself rather than
proposing — it MUST come through an agent seat (a `kind:'agent'` roster row + self-attribution,
docs 02/04), never through runAs-host authorship.* That is the rejected marinara echo-chamber
shape (already SUBSUMED BY BUDDY, D59) and any future "NPC crew poster": the rule prevents the
one dishonest state — model-authored canon wearing a human's `authorUserId` — from ever being the
cheap path. Enforcement when it fires: the canon-write path's speaker→attribution map (doc 02 §2)
has no runAs-host arm for AI-authored rows; a workload runner holds no canon-write op
(compose-table review + dep-cruiser).

## 4. Invariants (gate candidates)

1. **An agent party seat rides the existing `rpg_party.userId` column** — no agent-specific
   party schema. *(compile: no new column exists to misuse.)*
2. **An agent speaker at a game table never gathers `{{rpgSecrets}}` unless it HOLDS the seat.**
   *(the rpg-12 spoiler-canary tests, extended one row: agent-player vs agent-GM.)*
3. **GM narration stays group-character-authored under any seat holder.** *(inv-9 carried; the
   memory keying tests unchanged.)*
4. **No workload runner can author canon** — the crew bright line is structural (no canon-write
   op on any runner env). *(compose review + dep-cruiser.)*
