---
kind: spec
status: active
updated: 2026-07-03
---

# 12 — The GM Seat: Human GM, AI GM, and the Hybrid Table

> **Status: COMMITTED (D58 + Nate's seat directive, 2026-07-01) — prescriptive design; the ledger
> D-entry wins on any conflict.** RPG mode serves BOTH tables: "folks who have friends and those
> who don't." This doc is AUTHORITATIVE for the seat axis; where it amends docs 03–11 it says so
> explicitly and those docs carry pointer notes back here.

**The frame (the governing rule): the GM is a SEAT, not a mode.** There is no `if (gmMode)`
anywhere — the same discipline as `no-if(isGroup)`. The seat is game DATA: held by the synthetic
group character → AI GM (docs 01–11 unchanged); held by a human participant → human GM.
*(Pointer note — D60: an AGENT-PRINCIPAL holder is a committed THIRD seat state;
`agent-principal-design/05` §2 amends this doc's three seat-keyed sites — `requireGmSeat`'s
sentinel, the gather dispatch, and the director-disarm/GM-eyes keys — from "human vs NULL" to
"holder KIND". This doc stays authoritative for the human/NULL states.)* The
deterministic substrate, the state model, clocks, encounter legality, the information rings — all
seat-agnostic. The one structural insight this design exploits: **the 23 D48 tools were already
thin wrappers over `domain/rpg` VERBS** (05 §3 — every tool names its owning verb). A human GM
invokes those SAME verbs via tRPC (the GM console, 11 §15); the AI GM reaches them through the
recurse loop. **One vocabulary, two invokers** — the dispatch point is `can()` + who's calling,
never a branch in the verb body.

---

## 1. The seat — storage, assignment, movement

**DECISION: `rpg_games.gmUserId` — text FK → `users.id` SET NULL, nullable. `NULL` = the AI holds
the seat** (the synthetic group character authors GM turns — the docs-01–11 design, unchanged).
Non-null = that human participant is the GM. *(Rejected: a `chat_participants` flag — chat stays
rpg-blind (05 §0), and the seat is game canon, not room membership. Rejected: `GroupConfig` — a
chat contract; same reason. Rejected: a seat on `rpg_party` — the GM is not a party member; a GM
with a player character is two roles and must stay two rows.)* Amends 03 §1 (the column is in the
R1 baseline).

- **Who assigns:** the HOST, via `rpg.assignGmSeat(chatId, userId | null)` (host-only; the target
  must be a present human participant). Audited: a journal `event` entry ("GM seat passed to X") +
  `gameChanged` on the bus. Assignment at `createGame` comes from the wizard (§7).
- **Can it move mid-campaign:** YES, host-gated, with two guards: refused while an encounter is
  `active` (mid-fight authority swaps are chaos), and the verb surfaces a soft warning outside a
  session boundary (LEAN: swap at session start/end; enforced only as UX friction, not a
  constraint — a table whose GM's laptop died mid-scene must not be wedged). Seat→AI and AI→seat
  swaps are the same verb (`null` target).
- **Host ≠ GM: ALLOWED and first-class.** Host = room authority + funding (`runAsUserId`, D19);
  GM = narrative authority. A friend can GM a room you host. The consequence for secrets is §6.

## 2. The `can()` matrix gains a seat axis

New predicate in the rpg auth substrate: `requireGmSeat(game, actor)` where `actor` is resolved by
the CALLER PATH — tRPC verbs pass the `Principal`; the tool executor passes the sentinel
`{kind:"gm-model"}` (it runs as host per D19, but seat authority is checked against the SEAT, not
the funding identity):

```
requireGmSeat: actor.kind === "gm-model"  → allow iff game.gmUserId IS NULL   (the AI holds the seat)
               actor is a user            → allow iff game.gmUserId === actor.userId
```

ONE predicate; no verb body branches on seat. Consequence for free: **when a human holds the seat,
the AI-GM tool set cannot fire** (the tool path fails `requireGmSeat`) — and GATHER never attaches
it anyway (§3). The 07 §3.1 matrix re-partitions (this table supersedes it on the rows it names):

| Authority | Verbs (tool-twins included) |
|---|---|
| **GM seat** (human holder, or the AI turn when seat is NULL) | snapshot patches on scene + others' rows · `advanceTime` · clocks create/tick (incl. hidden) · `upsertNpc`/`applyReputation` · quests + GM journal types · map edit/reveal/`moveParty` · `startEncounter`/`encounterRound`/`attemptFlee`/`concludeEncounter` · `grantLoot` · `offerChoices` · `requestIllustration` · `transitionState` · `setWidgetValue` · `requestCheck` (§3) · scene plan/create/conclude/abandon (narrative acts — moved from host) |
| **Host** (room/config authority — unchanged) | game config · `assignGmSeat` · sessions start/conclude/`applySessionOutcome` · checkpoints save/restore · `confirmCharacterDeath` · widgets CRUD · `recruitNpc` (roster consequence) · world-gen regenerate |
| **Member** | own tracker row edit (+locks) · own `rollDice` · `resolvePendingCheck` on own pending check (§3) · journal `note` · member views |
| **GM-eyes reads** (§6) | the seat holder ∪ (host only when seat is NULL) |

WHY scenes moved GM-ward and `recruitNpc` stayed host: creating a scene is framing the story
(seat); recruiting changes the ROSTER and spends the host's box on a new AI participant (room).
*(Rejected: a third `rpg_roles` table — the seat is one column; role explosion for two authorities
is ceremony.)*

## 3. Human-GM turn flow — no narrator generation, same pipeline

With a human seat there simply ARE no AI-GM turns: the GM writes messages as a normal participant
(their message is a plain member post; the client badges it via the seat — 11 §15; authority lives
in the verbs they fire, never in message text). The turn pipeline is untouched: arbitration still
runs — it just has no narrator to pick unless AI NPC actors exist (§5). `gatherTurnContext`
contributes per SPEAKER IDENTITY, which is the one dispatch point (data-driven, like arbitration
policies — this is not an `if(gmMode)`; it is "what does THIS speaker get to see," and it already
had to exist for ring enforcement):

- narrator/synthetic-group-character speaker (only exists when seat is NULL) → the full GM context
  (docs 05/06, unchanged);
- a character speaker (an AI NPC actor, §5) → the TABLE-VISIBLE ring only: scene state, that
  character's own sheet/arc, party-public info — **never `{{rpgSecrets}}`** (an AI actor at a
  human-GM table is a player, and players don't read the GM's notes);
- a human sender → flags only (dice/address detection), as today.

### The check request/resolve handshake (built for the seat; a consent upgrade for the AI GM too)

NEW table `rpg_pending_checks` (03 §10b, R1 baseline): `id` text PK `RpgPendingCheckId` (`rpgpend_`), `gameId` FK CASCADE,
`targetPartyMemberId` FK, `skill`, `dc` (2..30), `advantage`/`disadvantage`, `reason`,
`requestedBy` CHECK in `["gm-seat","gm-model"]`, `status` CHECK in
`["pending","resolved","declined","expired"]`, `result` text(json) nullable, `createdAt`,
`resolvedAt` nullable. Partial index: one pending check per party member.

Flow: the GM (human via console `rpg.requestCheck`, or the AI via the `request_check` tool variant)
creates a pending check → `rpg.checkRequested` bus event → the target player sees a "Roll it" chip
(11 §16) → `rpg.resolvePendingCheck(pendingId)` (member, own row only — distinct from the `resolveCheck` engine verb the `skill_check` tool wraps, 05 §3 #2) → the server rolls (04 §2, same
engine, same consequence picker) → the result posts as a server-minted NARRATOR message that
names the player — `[check: Vex — Stealth 14 vs DC 15 — partial]` (via the `postNarratorMessage`
chat verb, 02 §1.1 #2/#5; never a forged user-authored row — `authorUserId` is only ever a
principal that acted, the D19 attribution-honesty rule) + lands in `result` → the next GM turn
(human reads the chip; AI GATHER includes
resolved-since-last-turn checks). `decline` is first-class (the player narrates refusal instead —
agency). Auto-`expired` after 24h.

**AI-GM default remains auto-resolve** (the 05 §3 `skill_check` tool — snappy solo play).
**`houseRules.playerRollsOwnChecks: boolean (default false)`** (03 §1.1 amendment) flips the AI GM
to the handshake: the reminder swaps `skill_check` guidance for `request_check` — players roll
their own dice, the tabletop consent ritual. *(Rejected: handshake-only for both — it doubles
every solo check into two turns; rejected: no handshake — a human GM cannot roll FOR players
without it feeling like the server played their character.)*

## 4. What the AI does at a human-GM table — `config.assist`

`RpgGameConfig` gains (03 §1.1 amendment):

```ts
assist: z.object({
  npcActors: z.boolean().default(false),        // §5 — AI plays specific roster characters
  recapOnSessionStart: z.boolean().default(true),
  lorebookUpkeep: z.boolean().default(false),   // reuses config.lorebook.*
}).default({}),
```

The crew re-partitions by seat (06 §3 amendment — the WHEN column, not the runners):

| WorkloadKind | AI-GM table | Human-GM table |
|---|---|---|
| `rpg-world-gen` | setup (unchanged) | SAME — "generate a world I'll run" is a first-class human-GM flow (host verb) |
| `rpg-recap` | session start (unchanged) | seat-invokable button (assist.recapOnSessionStart auto-fires it) |
| `rpg-session-distill` | host conclude (unchanged) | SAME (the human GM gets machine minutes; host accepts outcomes) |
| `rpg-lorebook-upkeep` | keeper toggle (unchanged) | seat-invokable / assist toggle |
| `rpg-illustration` / `rpg-npc-portrait` | cadence/tool (unchanged) | seat-invokable console buttons (cadence gate bypassed — a human decided) |
| `rpg-director` | the hidden hand (unchanged) | **NEVER RUNS** — a human GM IS the director; its cadence counter doesn't arm when `gmUserId` is set (one data check at the enqueue site, not a branch in the runner) |
| `rpg-scene-plan` / `rpg-scene-distill` / `rpg-recruit-card` | unchanged | seat/host-invokable per the §2 matrix |

The "GM assistant" beyond crew = what the chat already gives the seat: `{{memory}}` recall,
databank lookups (09d), and the GM-eyes panel (§6). *(Rejected: a bespoke GM-assistant agent — a
second brain with no owned data; the crew + chat substrate already cover every named ask.)*

## 5. Hybrid — human GM + AI NPC actors (the "has friends" killer mode)

`assist.npcActors: true` ⇒ character participants speak AS THEMSELVES via the EXISTING arbitration
engine (chat Part III §6 — nothing new is built): game chats with a human seat set
`GroupConfig{output:'per-speaker', cardScope:'scoped'}` at seat assignment (vs `narrator+merged`
when the seat is NULL — a config write, the same createGame code path, still no chat branch).
Each AI actor's turn gathers the table-visible ring (§3) — actors are structurally spoiler-proof.

**GM supersedes arbitration** via existing chat verbs: force a turn (`forceCharacterTurn`),
mute/unmute (`setParticipantDisabled`), `@mention` override — all HOST-gated chat verbs today.
V1 posture (FLAG, not stub): when host ≠ GM, NPC-actor control routes through the host (typical
tables have host == GM, so this bites rarely); the clean fix — chat accepting an injected
"delegate" principal check for those three verbs — is a chat-domain decision deferred to the seam
list *(rejected for now: rpg re-implementing force-turn — a second turn-trigger path)*. The manual
arbitration policy already generalizes: `policy:'manual'` + GM force IS "the GM calls on actors."

## 6. Hidden state — GM-eyes keys on the SEAT, and the spoiler-free host

Docs 01–11 gated ring-1 (secrets/twists/hidden clocks/gmNotes) to "host". With seats:
**GM-eyes = the seat holder; the host retains it ONLY while the seat is NULL.** A host who assigned
the seat to a friend is (usually) a PLAYER — auto-showing them the twist bank is a spoiler bug, not
a privilege. Authority is preserved without spoilers: the host can always reassign the seat to
self (audited, visible to the table) — secrets are one deliberate, logged act away, never ambient.
*(Rejected: host ∪ seat always — spoils the playing host; rejected: seat-only even when NULL — an
AI-GM table would have NO human able to inspect a stuck campaign.)*

Mechanics (all existing machinery, re-keyed): `RpgGmView`, the host `rpg.stream` variant (hidden
clock events), the GM map view, quest `gmNotes` — every "host" gate in 03/05/08 for READS becomes
`requireGmEyes` (= the §2 rule). The D22-style level-clamp precedent carries it: views project by
the caller's resolved authority server-side; the client renders what arrives (11 §15 GM-eyes panel
mounts iff `RpgGmView` resolves). Crew inputs re-key too: `rpg-session-distill` for a human-GM
table still reads secrets (they're the GAME's, and its output goes to seat+host surfaces — the
banner renders for both, host accepts).

## 7. Session zero — "Who runs the game?"

The wizard (11 §10) gains one radio in step 2: **AI Game Master (default) · Me · A friend…**
(member picker; assignable later via the GM drawer if the friend hasn't joined yet). Picking a
human GM: hides the AI-GM dials that no longer apply (gm standalone/character voice — there's no
GM prompt; the packaged preset still clones, its GM sections inert-but-harmless since no narrator
turn renders them *(LEAN: keep the clone — the table may flip the seat to AI later and everything
just works; resolves if preset clutter annoys)*), shows `assist.*` toggles, keeps world-gen
(§4 — the human GM's prep assistant). Cheap UI, big clarity.

## 8. Build-plan deltas (10 amendments)

The seat is SCHEMA + AUTH shape → it lands EARLY; the console UI trails:

- **R1**: `rpg_games.gmUserId` + `rpg_pending_checks` + the `houseRules.playerRollsOwnChecks` /
  `assist` config fields (born into baseline — no later migration).
- **R3**: `requireGmSeat`/`requireGmEyes` predicates + `assignGmSeat` + the re-keyed view
  projections + the matrix tests (the §2 table as the table-driven `can()` fixture).
- **R3 (same chunk)**: the pending-check verbs (`requestCheck`/`resolvePendingCheck`/decline/expire).
- **R4**: the speaker-identity gather variants (§3) + the `request_check` tool +
  `playerRollsOwnChecks` reminder swap + per-speaker GroupConfig on seat assignment.
- **R6/R7**: the crew seat-invokable arms + the director's seat-aware enqueue gate.
- **Client**: C12 (GM console + GM-eyes panel, **M**) + C13 (pending-check chips + GM message
  badge + wizard radio, **S**) — specced in 11 §15–16; C12 grows C7's drawer, so sequence after C7.

## 9. Test plan additions

- `requireGmSeat` truth table (gm-model × seat-NULL/set; user × holder/other/host).
- Spoiler tests re-run per seat state: canary secrets absent from (a) member views, (b) HOST views
  while a human seat is set, (c) NPC-actor gather output.
- Handshake lifecycle goldens: request → resolve (bands + consequences fire once) / decline /
  expire; one-pending-per-member index; `playerRollsOwnChecks` reminder swap.
- Hybrid: an NPC-actor turn in a human-GM game assembles WITHOUT `{{rpgSecrets}}` and cannot
  invoke GM-seat tools (the tool path denies).
- Seat movement: assign mid-encounter refused; journal audit row; AI↔human round-trip leaves a
  playable game (GroupConfig flips, director arm/disarm).
