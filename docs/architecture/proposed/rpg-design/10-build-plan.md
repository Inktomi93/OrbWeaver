# 10 — The Phased Build Plan (independently shippable chunks)

> **Status: COMMITTED (D58, 2026-07-01) — prescriptive design; the ledger D-entry wins on any conflict.** Phase 7+ work (this maps onto orbweaver's phase
> numbering: everything here follows Phase 5 chat — BUILT — and rides Phase-7 committed domains).
> Each chunk: scope → checkpoint (the observable it ships) → size (S/M/L) → hard dependencies.
> Chunks are ordered so every one lands green (`pnpm check` + `pnpm test`) and playable-or-testable
> on its own; no chunk requires a later one to be non-broken.

## Dependencies on committed work (what must exist first)

| Dependency | Needed by | Status |
|---|---|---|
| Phase 5 chat (pipeline, injections, roster, narrator mode, forkChat, `can()`) | everything | BUILT |
| D48 tool-use: `domain/tool-use` registry + the chat recurse loop | R4+ | Phase 5/7 chunk (BUILD-PLAN §Phase-5 item 4c + Phase 7) — **hard prerequisite; verify before R4** |
| `domain/workloads` runner-env pattern | R6+ | BUILT |
| sealed `agentTurn` (`infra/providers` agent role) | R6+ | BUILT |
| `domain/imagery` (D49 leaf) | R9 | Phase 7 — R9 blocks on it (or ships `dryRun`-only) |
| `domain/databank` `{{databank}}` slot | seam (d) | Phase 7 — optional; preset slot resolves empty until it lands |
| `domain/expressions` classify hook | seam (e) | Phase 7 — independent |
| D46 automation Tier-1 | seam (b) | Phase 8 — the event mirror ships in R5 regardless |

## The chunks

**R1 — Contracts + schema + substrate (the bedrock).** `@orb/contracts/rpg` (tuples, view/bus/
tool-result schemas) · `@orb/db/schema/rpg.ts` (14 tables into baseline) · `@orb/kit/ids` prefixes ·
ALL of `substrate/` (04: every engine + constants + `applyLockedPatch` + consequence picker) with
the full golden suite. *Checkpoint:* `pnpm test` runs ~180 substrate goldens; schema round-trips
green. **Size: L** (bulk is mechanical table-porting; the goldens are the work).
*Hard parts:* none — this is the highest-confidence chunk (pure functions, verified formulas).

**R2 — State layer.** `persistence/` (all table families, parse-on-read) + snapshot semantics
(resolution ladder, clone-forward, commit, locks, staged-flush) + `verbs/snapshot.ts` +
`editSnapshot` + checkpoints. *Checkpoint:* the 03 §13 swipe-safety + ladder + lock fixtures green
against a real libsql test db. **Size: M.** *Hard part:* the staged-flush (quest/clock provisional
writes) — spec'd in 05 §2; test it to death here.

**R3 — Game lifecycle without a model.** `rpg_games` CRUD, `createGame` (preset clone, GroupConfig
set, capability gate), party rows + sheet seeding from cards, widgets/bindings, journal/quests/
npcs/maps/clocks verbs, the views (member/host projections), the bus + `rpg.stream`, the tRPC
router, the `can()` matrix. *Checkpoint:* a game is creatable/configurable end-to-end via tRPC;
hidden-state canary tests green; a hand-seeded game renders correct HUD/tracker/map views.
**Size: L.** *Hard part:* the view projections (binding resolution + member/host splits) — fiddly,
not deep.

**R4 — Turn integration (the heart).** `gatherTurnContext` + the 8 macros + `reminder.ts` +
the tool registry (all 23 defs) + `applyToolCall` dispatch + the chat-side injected ops +
entry wiring. *Checkpoint:* the 05 §8 suite — scripted tool sequences through the REAL recurse
loop mutate state correctly; non-game byte-identity holds; **first playable session** (solo, no
crew, no art): create → hand-write worldOverview → play with checks/clocks/time/journal live on
the HUD. **Size: L.** *Hard parts:* the reminder variants; tool-write staging interaction with the
recurse loop's persistence timing (the ToolCallRecord flush vs snapshot lazy-create ordering —
integration-test it, don't reason it).

**R5 — Event mirror + player affordances.** Domain-event mirror members, dice queueing
(`rollDice` + canonical text + GATHER flag), address modes, `offer_choices`, `retractRound`
scaffold. *Checkpoint:* dice/address variant flips proven; automation-visible events emitted.
**Size: S.**

**R6 — The crew, wave 1.** `WorkloadRpgEnv` + `rpg-world-gen` + `applyWorldGen` + the setup wizard
API path (create→workload→review→start) + `rpg-recap` + `rpg-session-distill` +
`applySessionOutcome`. *Checkpoint:* full session-zero → play → conclude → next-session loop with
model-generated world + recap + distilled summary; crew failure = retryable workload, never a
wedged game. **Size: L.** *Hard part:* world-gen payload quality vs schema strictness — budget
prompt iteration time; the schema's bounded-retry telemetry (log the failure shapes) is the tuning
instrument.

**R7 — The crew, wave 2.** `rpg-director` (cadence + clock ticks + twist upkeep) +
`rpg-lorebook-upkeep` (world-info injected op) + downtime proposals. *Checkpoint:* a 3-session
scripted campaign shows secret progression + keeper entries firing on keys. **Size: M.**

**R8 — The encounter engine.** `encounter/` subsystem + blueprint hydration + the encounter tool
set + round staging/rewind + summary merge-back + morale/checkpoint side-effects. *Checkpoint:*
scripted multi-round fights (07 §4 fixtures) + a live boss fight with counterplay + swiped-round
rewind proven. **Size: L.** *Hard part:* THE genuinely hard chunk — round staging keyed by variant
inside `rpg_encounters.state` while party volatiles live on snapshots; build the fixture harness
FIRST. Elements (`R8b`, **S**, optional tail): enable `elements.ts` in the engine + preset tables +
goldens.

**R9 — Generative layer.** `imagery/` subsystem + `rpg-illustration`/`rpg-npc-portrait` workloads
+ cadence + references + `request_illustration`. Blocks on `domain/imagery`. *Checkpoint:* NPC gets
a portrait; an illustration lands as a MessageMedia narrator message; failure never blocks a turn.
**Size: M.**

**R10 — Scenes.** `rpg_scenes` + plan/create/conclude/abandon + `rpg-scene-plan`/`rpg-scene-distill`
+ the forkChat/room-override wiring + `rpg-recruit-card` + `recruitNpc`. *Checkpoint:* fork a
scene, play it, merge the summary; recruit an NPC into the roster with a generated card.
**Size: M.**

**R11 — Client (doc 11's own chunk plan).** The `features/rpg` slice per doc 11. Can start after
R3 (views + bus exist) and grow with R4/R8. **Size: L** (see doc 11 sizing).

**D58 confirmations + the GM-seat deltas (doc 12 §8):** RPG is COMMITTED — this plan is scheduled
work, not a proposal. R8b (elements) confirmed ship-last-OPTIONAL. The C11 client polish pass is a
COMMITTED chunk (11 §12.2). Seat additions fold into existing chunks: **R1** gains
`rpg_games.gmUserId` + `rpg_pending_checks` + the `playerRollsOwnChecks`/`assist` config fields
(born into baseline); **R3** gains `requireGmSeat`/`requireGmEyes` + `assignGmSeat` + the re-keyed
GM-eyes projections + the handshake verbs; **R4** gains the speaker-identity gather variants +
`request_check` + the per-speaker GroupConfig flip on seat assignment; **R6/R7** gain the crew
seat-invokable arms + the director's seat-aware enqueue gate; the console UI is C12/C13 (11 §14).

**Later / reserved (explicitly NOT scheduled):** per-player declared-action widgets for encounters
(07 §1.2 flag) · the Tier-3b textual-tool-call polyfill (09 §+) · plugin game-tools capability (09c)
· media/audio scoring · turn-games · a `propose_scene` tool · per-player secret notes ring · the
delegate-principal seam for chat's force-turn/mute when host ≠ GM (doc 12 §5 FLAG — a chat-domain
decision).

## Cross-chunk rules

- Every chunk ends with the standing green-to-commit gate; rpg tables are in the baseline from R1
  (later chunks add NO migrations — reserved columns exist from day one; that is why 03 specs
  everything now).
- Prompt text (preset, reminder, crew briefs) lives in versioned constants from R4/R6 on — prompt
  tuning is data commits, not code churn.
- After R6, run the play-test loop each chunk: one scripted campaign transcript re-run against the
  build (a poor-man's differential oracle for game feel regressions — the transcripts live in
  `tests/fixtures/rpg/campaigns/`).
