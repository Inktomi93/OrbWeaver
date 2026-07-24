---
kind: spec
status: active
updated: 2026-07-03
---

# RPG Design — the prescriptive plan for `domain/rpg` (doc-set index)

> **Status: COMMITTED (D58, 2026-07-01).** RPG mode IS a product goal — the Feature-Slot-Map §2
> gate question is CLOSED (Nate). This doc set is the authoritative design (`Core-Laws-and-Precedents.md`
> D58 is the decision record and wins on any conflict); the marinara research
> corpus is the evidence base (what marinara DOES — archived to git history; `../rpg/` is the tombstone). Everything here is prescriptive and
> self-contained: a builder with ONLY this doc set + the orbweaver law docs (AGENTS-1/2/3, the
> domain docs it cites) can build the whole system — no marinara reading required. Every decision
> carries its WHY + the rejected alternative.

> **Triage 2026-07-09 (dispatch board — `../README.md` §0):** READY-TO-BUILD. Next: R1-proper (the rpg contracts MODULE — schema/brands/workload stubs already landed 2026-07-09 as baseline riders). R2+ is blocked on the D46 variables substrate finishing; R4's chat-side obligations (#1–#2) landed with tool-use T1–T4.

## The one-paragraph design

A chat becomes a **table**: the GM is a **SEAT** (held by the model by default, or by a human
participant — doc 12), the server is the rules engine, every human in the roster is a player. ONE
chat turn per action — RPG context enters in GATHER (macros + one format-reminder injection,
ordered by a user-tunable GM preset), structured side-effects leave as D48 TOOL CALLS the server
resolves deterministically and feeds back in the same recurse loop (server rolls, model narrates —
same turn), async GM work is Workloads (world-gen, session distill, director, lorebook upkeep),
and all state is typed swipe-safe tables (snapshots keyed on message variants; campaign canon in
real rows). Degrees-of-success + fail-forward checks, visible progress clocks, fog-of-war maps,
hidden-information rings, and a deterministic encounter engine make it a better GAME than
marinara; the one-turn/tools/Workloads shape makes it a better SYSTEM; the seat makes it serve
both solo tables and human-run tables with one codebase (no `if(gmMode)`).

## Reading order

| Doc | What it locks |
|---|---|
| [`01-vision-and-experience-loop.md`](01-vision-and-experience-loop.md) | the pillars, the loop, tabletop grounding, per-mechanic keep/upgrade/drop/add verdicts, non-goals |
| [`02-domain-shape.md`](02-domain-shape.md) | one `domain/rpg` + satellites, the 8-slot layout, `RpgContext` injected ops, one-home-per-mechanic kill list, the service surface |
| [`03-state-and-schema.md`](03-state-and-schema.md) | all 14 tables (DDL intent), every zod contract, swipe/commit/lock semantics, the variables-vs-snapshots reconciliation, hidden-column rule |
| [`04-mechanics.md`](04-mechanics.md) | the house rules: every formula/constant/table (verbatim ports cited; redesigns argued), the consequence engine, golden-test plan |
| [`05-turn-integration-and-tools.md`](05-turn-integration-and-tools.md) | the chat graft (3 injected ops, `no-if(isGame)`), `RpgGatherResult` (+ the `presetOverride` GM-voice field), the 26-tool registry (23 overworld + 3 encounter), write staging, the rpg bus, dice queueing, address modes |
| [`06-gm-and-crew.md`](06-gm-and-crew.md) | the GM preset + format reminder (with the stolen-verbatim instruction set), the WorkloadKind crew, session zero, the coherence interlock, information rings |
| [`07-encounters-scenes-party.md`](07-encounters-scenes-party.md) | the ONE deterministic encounter engine, scenes over `forkChat`, party = roster, the `can()` matrix |
| [`08-generative-and-client-contract.md`](08-generative-and-client-contract.md) | imagery policy over the committed domain, illustration cadence, the client read contract, in-stream rendering rules, what the client may compute |
| [`09-integration-seams.md`](09-integration-seams.md) | the nine seam answers (presets/automation/plugins/databank/imagery-gallery-expressions/memory/stats/variables/multi-human) + the Tier-3b polyfill posture |
| [`10-build-plan.md`](10-build-plan.md) | R1–R11 shippable chunks with checkpoints, sizes, committed-domain dependencies, the hard parts, the D58 + seat deltas |
| [`11-client-ui.md`](11-client-ui.md) | the client/UI design: the `features/rpg` slice, HUD primitives, data flow, in-stream chips, wizard, encounter panel, the GM console (§15–16), chunks U1 + C1–C13 |
| [`12-human-gm-and-seats.md`](12-human-gm-and-seats.md) | **the GM SEAT** (AI GM · human GM · hybrid): seat storage/assignment, the seat `can()` axis, the check request/resolve handshake, `assist` modes + AI NPC actors, spoiler-free-host GM-eyes rules |

## The five D58 sub-decisions (Nate, 2026-07-01 — settled, do not re-open)

1. **Build per R1–R11**; rpg tables ride the `0000_baseline` squash.
2. **HUD on the CONTENT thread flanks** (11 §1), not a CONTEXT tab.
3. **Elements ship LAST and OPTIONAL** (R8b), fully specced in 04 §12.
4. **Character death under brutal ALWAYS requires per-death host confirm** — no unconfirmed kills.
5. **The C11 polish pass is COMMITTED** (scene backdrop, table-edge sprites, weather flourish,
   cinematic effect map, readables, dice-tumble — 11 §12.2).

Plus the seat directive: **the GM is a seat, not a mode** (doc 12) — human GM and AI GM run the
same verbs, the same engine, the same rings; authority differences live entirely in `can()`.

## The top design deltas vs marinara (the executive card)

1. One server-driven turn (GATHER/tools/recurse) replaces the client-orchestrated 3-call turn.
2. Tools replace the 20+-tag text grammar (and its 3× drifted parsers) — same-turn dice feedback.
3. Typed tables + zod at persistence/LLM edges replace the ~30-key metadata blob + 413 raw parses.
4. Degrees-of-success + fail-forward + clocks + fog-of-war replace flat pass/fail + hidden ints.
5. The roster IS the party — multi-human native; the vestigial party-turn agent is not ported.
6. The GM voice is a user-tunable preset; volatile state rides macros + one reminder injection.
7. The agent pipeline dissolves: trackers → tools; director/keeper/distill → WorkloadKinds on the
   sealed `agentTurn`; no second agent system (buddy invariant #3).
8. ONE deterministic encounter engine (model designs via validated tool args; engine owns legality
   and terminality) replaces the dual runtime + the no-authority LLM sidecar.
9. Snapshots key on `message_variants` (real FKs, swipe-safe by pointer walk), reconciled with the
   D46 variable planes under one story.
10. Sessions are rows in ONE chat (not chat-per-session); checkpoints are RESTRICT'd pointers;
    hidden information is server-projected, not prompt-hoped — and GM-eyes follows the SEAT, so a
    playing host with a friend GM stays spoiler-free (doc 12 §6). Marinara has no human-GM concept
    at all.

## Standing decisions a cold agent must not re-litigate

Scenes consume `chat.forkChat`, never a private fork · no QTE, no music layer, no turn-games, no
Discord/Spotify/haptics · the JSON-repair modal is dead (structured output + workload retry) ·
game chats require tool-capable models until the Tier-3b polyfill ships · the GM seat is data, not
a mode — no `if(gmMode)` anywhere · `rpg-director` never runs while a human holds the seat.
