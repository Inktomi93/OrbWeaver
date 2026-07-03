---
kind: spec
status: active
updated: 2026-07-03
---

# 01 — Vision & the Experience Loop (what game we are building, and why it's fun)

> **Status: COMMITTED (D58, 2026-07-01) — prescriptive design; the ledger D-entry wins on any conflict.** This doc defines the GAME — the player experience the
> `domain/rpg` build must deliver — before any code shape. Every mechanic in the rest of the doc set
> traces back to a loop stage here; a mechanic that serves no loop stage does not get built.
> Marinara facts appear only as one-line rationale citations (the research corpus — archived to git
> history, tombstone at [`../rpg/`](../rpg/README.md) — is the evidence base; you never need to read
> marinara source).

---

## 0. The one-paragraph pitch

Orbweaver's RPG mode turns a chat room into a **table**: the GM is a SEAT — held by the model (the default) or by a HUMAN participant (doc 12; "for folks who have friends and those who don't") —, the server is the
**rules engine and dice tower**, and every human in the roster is a **player** with their own
character. The server owns all math, state, and hidden information; the model narrates outcomes it is
handed and *requests* mechanical actions through tools; the client renders visible stakes (HUD,
clocks, map, tracker) that update live. One `POST chat.send` per player action — no client
orchestration, ever.

## 1. The four design pillars (each with its enforcement)

| # | Pillar | Meaning | Enforced by |
|---|--------|---------|-------------|
| P1 | **Server rolls, model narrates** | No die is ever rolled by the model; no rule is arbitrated by prose. The model REQUESTS a mechanic (tool call), the server resolves it deterministically, the model narrates the resolved numbers. | Tools return server-computed results (05); golden tests pin every formula (04); the model's tool schemas have NO "result" input fields. |
| P2 | **One turn, one path** | A game turn IS a chat turn. RPG context enters in GATHER, side-effects leave as D48 tool calls inside the same recurse loop. No second pipeline, no out-of-band blocking LLM calls, no client sequencing. (Marinara's 3-call client-orchestrated turn is the rejected alternative — the archived corpus verdict.) | buddy.md invariant #3; the rpg domain exposes NO endpoint that runs a completion; async work = Workloads. |
| P3 | **Visible stakes, hidden hands** | Players always see what's at risk (HUD, clocks, tracker, party sheet); they never see the GM's hidden hand (story secrets, plot twists, danger tables, unrevealed map). The information asymmetry is server-enforced, not prompt-enforced. | Hidden state lives in columns the client read-verbs never project (03 §hidden); the GM-only context enters the prompt in the system half only. |
| P4 | **Game-ness is data, not a branch** | A chat becomes a game by having an `rpg_games` row — same turn engine, same roster, same arbitration. Solo play = a party of one human, byte-identical path (the `no-if(isGroup)` discipline extended: **`no-if(isGame)` in chat code** — chat consults injected rpg ops that no-op when absent). | The chat domain gains ZERO rpg imports; all coupling is injected ops wired at `entry/` (02 §injection). |

## 2. Grounding: what makes tabletop sessions work

This design borrows named, battle-tested mechanisms from three tabletop traditions. Cold-read note:
you don't need the source games; the mechanic is fully specified where it's used (doc 04/06).

- **From D&D 5e:** the d20 + modifier vs DC core, attribute modifiers (`floor((score-10)/2)`),
  advantage/disadvantage as the universal situational dial, passive perception as the "GM checks
  without asking" tool. Marinara already ported these correctly — keep.
- **From PbtA (Apocalypse World / Dungeon World):** **degrees of success** — a check is not
  pass/fail but crit / full success / **partial success (success-at-cost)** / failure / fumble — and
  **fail-forward**: a failure always produces a new situation (a complication, a cost, a hard GM
  move), never "nothing happens, try again." This is the single biggest fun upgrade over marinara's
  flat pass/fail: it makes every roll advance the story.
- **From Blades in the Dark / Fronts (Dungeon World):** **progress clocks** — segmented circles
  (4/6/8 segments) that tick toward a named consequence ("The cult completes the ritual", "The city
  guard closes in"). Clocks make offscreen pressure VISIBLE and give failure somewhere to go (a
  failed check ticks a clock instead of dealing damage). Marinara had the embryo
  (`CampaignPressureClock` in its blueprint type) but never surfaced it as a play mechanic — we
  promote clocks to a first-class table + HUD widget + the director's main lever.
- **From OSR practice:** fog of war (the map reveals as explored), reaction/encounter rolls
  (the world is indifferent, not scripted), and **session structure** (session zero → play →
  recap/downtime) as the campaign heartbeat.

### The per-mechanic fun test

Every marinara mechanic was judged against one question: **does it create a player decision or a
visible consequence?** If it only mutates numbers nobody sees or decides on, it's simulation noise.
The verdicts are in §5; the rule for future additions is the same test.

## 3. The experience loop (the spec every chunk serves)

```
 SESSION START ──► SCENE FRAME ──► PLAYER ACTION ──► RESOLUTION ──► NARRATION ──► STATE CHANGE ──┐
      ▲                (GM)          (human turn)     (server math)   (model)       (visible)      │
      │                                                                                            │
      └──────────────────────────── SESSION WRAP ◄────────────────── … loop … ◄───────────────────┘
```

Each stage, prescriptively:

1. **Session start.** The host opens/resumes a game. The turn's GATHER injects: the campaign frame
   (world overview, house rules), the previous-session recap (`rpg_sessions` latest summary), the
   current snapshot (where/when/who/HP), active clocks, and the GM's hidden hand (story secret,
   twist bank) — system-half only. First turn of a session, the GM narrates a recap + scene hook.
   *Server work:* `rpg.startSession` verb bumps session number, seeds the session row.
2. **Scene frame.** The GM's narration establishes place, time, present NPCs, and at least one
   visible hook. The tracker tool (`update_scene`) records the frame into the snapshot so the HUD and
   tracker panel reflect it immediately.
3. **Player action.** A human posts free-form intent ("I pick the lock", "I ask the guard about the
   murders"). In a party, arbitration is the NORMAL chat arbitration — humans post freely, character
   companions speak via the roster policies (chat.md Part III §6). There is no `/party-turn`.
4. **Resolution.** The GM model decides a mechanic applies and emits a tool call
   (`skill_check`, `roll_dice`, `advance_time`, `start_encounter`…). The server resolves it —
   deterministic math, hidden-state consultation (DC from danger table, clock ticks on partial/fail)
   — and returns a **structured outcome** (band, totals, consequences applied) as the tool result.
   The D48 recurse loop feeds it straight back; the model narrates the outcome **in the same turn**.
   (Marinara feeds dice back only on the NEXT user turn via text tags — the recurse loop is the
   upgrade that makes checks feel instant.)
5. **Narration.** Prose only. The model is instructed (06 §format) to narrate the exact outcome it
   was handed — numbers already resolved, clue text already selected — and to end on agency: a
   situation the players can act on, never a cliffhanger that railroads.
6. **State change (visible).** Tool-driven writes (snapshot fields, HP, inventory, clock ticks, HUD
   values, journal entries, map reveal) commit inside the turn and fan out on the rpg bus → the
   client updates the HUD/tracker/map live, mid-narration. Players SEE the wound taken, the clock
   tick, the reputation shift — stakes are never hidden bookkeeping.
7. **Session wrap.** Host (or an automation rule) triggers `rpg.concludeSession` → a **Workload**
   distills the session: summary, resume point, character moments, NPC updates, campaign-plan
   progression, journal consolidation, optional lorebook upkeep. Nothing blocks the last turn.

**The loop's async shadow (the GM's crew, 06):** between turns, Workloads do the offscreen GM work —
the director pass (tick clocks, plant the next twist), lorebook upkeep, session distill. They never
block a turn and never run a completion inside the turn path.

## 4. What "better than marinara" means, concretely

| Axis | Marinara (verified) | This design |
|------|---------------------|-------------|
| Turn shape | Client fires 3 blocking calls (`/generate` → `/game/scene-wrap` → `/game/party-turn`) and stitches results | ONE chat turn; tools inside it; Workloads after it |
| Mechanics feedback | Dice/tags parsed from prose next turn; 1,124-line client tag grammar | Tool results recursed into the SAME turn; zero text-tag grammar |
| Check model | Flat pass/fail d20 | Degrees of success + fail-forward + advantage/disadvantage |
| Pressure | Hidden ints (reputation, morale) mutated by tags | Visible clocks + tiered reputation surfaced on HUD; failure ticks clocks |
| State at rest | ~30 untyped `meta.game*` keys + JSON-text sub-fields, 413 raw `JSON.parse` | Real tables, zod at persistence + LLM edges, FK'd into `0000_baseline` |
| Players | Single human, NPC "party" via extra LLM calls | The ROSTER is the party — multi-human native, arbitration built (chat Part III) |
| Structured output | Prompt-and-pray + jsonish repair + human repair modal (~10 `apply-json` twin endpoints) | Native tool-use / structured output (D48); repair heuristics survive only as the Tier-3b local-model polyfill |
| Hidden info | Prompt-only ("don't reveal the secret") | Server-enforced projection: hidden columns never leave the server except into the system prompt |

## 5. Mechanic verdicts (keep / upgrade / drop / add)

### KEEP (ported faithfully — they pass the fun test)
- **Dice notation + d20 checks + attribute modifiers** — the resolution core (04 §1–2).
- **Passive perception → clue injection** — the "GM notices for you" mechanic; clues create player
  decisions without a roll (04 §10). Upgrade: clues come from the hidden scene-secrets bank, not ad-hoc.
- **Time & weather progression** — cheap, deterministic texture that makes the world feel in motion;
  visible on HUD (04 §8–9).
- **Loot tables (difficulty-weighted rarity)** — earned progression; a legible reward moment (04 §5).
- **Reputation with tier milestones** — social consequence with visible thresholds; tag-scrape
  becomes a tool (04 §6).
- **The encounter sidecar's structure** — initiative, cooldowns, boss mechanics with counterplay,
  merge-back summary. Boss `counterplay` is genuinely good design (a puzzle, not a damage sponge) (07).
- **Swipe-keyed snapshots + commit + field-locks + manual overrides** — the state model that makes
  regeneration safe; the best-engineered part of marinara (03).
- **Checkpoints** — save-scumming is a single-player RPG feature, not a sin (03 §checkpoints).
- **Session lifecycle + structured session summaries** — the campaign heartbeat (06 §session).
- **Asset-manifest pick-before-generate** — reuse art before generating; cost saver (08).

### UPGRADE (same intent, better mechanism)
- **Skill checks → degrees of success + fail-forward** (04 §2). Rejected alternative: keep flat
  pass/fail — rejected because it produces "nothing happens" turns, the classic dead-air failure mode.
- **Campaign pressure → clocks as a live mechanic** (04 §7, 06 §director). Rejected alternative:
  keep raw morale/pressure ints only — rejected because invisible pressure creates no anticipation.
- **Tag grammar → tool calls** (05). Rejected alternative: port the tag parser server-side — rejected
  because it keeps the model in charge of syntax instead of intent, and keeps the repair gauntlet alive.
- **Party members → roster participants** (07 §party). Rejected alternative: keep a
  `partyCharacterIds` list + a party-turn generator — rejected because orbweaver's arbitration
  already does this better (comparison doc Part C), and it forecloses multi-human.
- **GM prompt assembly → preset sections + GATHER/BUILD** (06 §preset). Rejected alternative: a
  hardcoded GM prompt builder à la `gm-prompts.ts` — rejected because users must be able to tune the
  GM voice without a fork, and the chat pipeline already owns ordering/budgeting.
- **Scene bubbles → chat `forkChat` + rpg merge-summary** (07 §scenes). Rejected alternative: an
  rpg-private fork mechanism — rejected: D27 already defines fork semantics; one fork concept.

### DROP (with the reason — do not resurrect without a new ledger decision)
- **Turn-games (Uno framework)** — one game, zero demand signal; a self-contained graft if ever wanted.
- **Discord mirroring** — legacy side channel; out of product scope.
- **Spotify / haptics agents** — media/hardware side-features; explicitly out (Feature-Slot-Map §3d).
- **The ~10 `apply-json` repair-twin endpoints + the human JSON-repair modal** — native tool-use
  removes the failure mode on Tier-1 models; the local-model path gets the Tier-3b polyfill instead.
- **The client game-tag parser + client dice + client game math** — the client renders server truth;
  it computes nothing (08 §client).
- **Elemental aura-gauge reactions — NOT dropped, but SEQUENCED LAST.** The deep-dive verdict ranked
  it the single most genuinely designed system in marinara (real combinatorial depth, complete
  swappable preset tables). It only pays off inside the encounter engine, so it builds as the final
  encounter chunk (10 §chunks) — the full tables + resolver are specced in 04 §12 so the future
  builder ports data, not judgment. **DECIDED (D58): ship-last-OPTIONAL (R8b), confirmed.** The encounter contract carries `element` from day one
  (reserved-additive; no schema change later).
- **`GameGmMode` / intro "direction command" sequences** — presentation-era features of marinara's VN
  layer; orbweaver's client owns presentation (D44 world).

### ADD (net-new — tabletop theory says these are the missing pieces)
- **Progress clocks** (`rpg_clocks`) — the pressure mechanic (04 §7). Named source: Blades in the Dark.
- **Degrees-of-success bands + fail-forward consequence hooks** (04 §2). Named source: PbtA.
- **Advantage / disadvantage** on any d20 roll (04 §1). Named source: 5e.
- **Session-zero setup wizard as a first-class flow** (06 §setup) — genre/tone/safety/stakes chosen
  BEFORE the model writes a word; marinara buried this in one mega-endpoint.
- **Fog-of-war map reveal** (04 §11) — `revealed` flags on map cells/nodes; the client renders only
  revealed geometry. Named source: OSR play culture.
- **A party sheet the players own** — member-editable character notes + host/GM-locked mechanical
  fields, mediated by field-locks (03 §locks): the "character sheet is mine, the rules are the
  table's" split.
- **Downtime hook at session wrap** — the concluding Workload proposes downtime outcomes (recovery,
  training, clock regression) the host can accept — cheap, and it gives sessions a rhythm.

## 6. Non-goals (v1)

- No grid-tactical combat UI (the encounter engine is stat-and-declaration based; positioning is
  narrative). Rejected alternative: a battle-map renderer — rejected as a client mega-feature with
  no server design impact; addable later over the same encounter state.
- No rules-system plugins (5e SRD import, PF2e…). The mechanic set is THE house system; D46 Tier-2
  plugins are the eventual extension point (09 §c).
- No voice/dice-cam/table telemetry.
- No elemental reactions v1 (deferred above).
- No local-SD image paths (D39) — all art via the committed hosted `domain/imagery`.

## 7. Cross-refs

- The loop's code homes: 02 (domain shape) · 03 (state) · 04 (mechanics) · 05 (turn integration) ·
  06 (GM + crew) · 07 (encounters/scenes/party) · 08 (generative + client) · 09 (seams) · 10 (build).
- Orbweaver law this design obeys: `domains/chat.md` (turn pipeline, Part III roster),
  `domains/buddy.md` (agent = pattern; sealed `agentTurn`), `domains/tool-use.md` (D48 one registry),
  `domains/workloads.md` (WorkloadKind gold standard), `domains/automation.md` (D46),
  D44/D45/D51 (content blocks / vision / wire seam), D24 (per-type FK), D26 (variants), D27 (fork).
