---
kind: plan
status: active
updated: 2026-09-23
---

# RPG: the game engines beyond the lite substrate

## Goal

A chat becomes a table where the server is the rules engine and the model or a human narrates, with the full game engines on top of the built lite substrate.

## Shape

**Already built:** the lite substrate (D108, D109, D111): games, sheets, the Tracker (D113), journal and quests, checkpoints, the dice tool, actors and NPC promotion, the state round, fork and portability, and the context-pane takeover with its tabs (D119, D149, D150). Code: `packages/server/src/domain/rpg/`, `packages/contracts/src/rpg/`, `packages/client/src/features/rpg/`. Full mode is data in `MODE_POLICY` (`packages/contracts/src/rpg/mode.ts`) and is refused at game creation until its engines exist.

The standing design (D58, D86):

- **The GM is a seat, not a mode.** The model holds it by default; a human or an agent principal can hold it. Authority differences live only in `can()`; no `if (gmMode)` anywhere.
- **One chat turn per action.** RPG context enters at gather through macros and one reminder injection; structured side effects leave as tool calls the server resolves deterministically in the same recurse loop (server rolls, model narrates).
- **Typed, swipe-safe state.** Snapshots key on message variants; campaign canon lives in real rows; hidden information is projected by the server, never hoped for in the prompt.
- **Better game rules:** degrees of success with fail-forward, visible progress clocks, fog-of-war maps, information rings, and one deterministic encounter engine where the model designs through validated tool arguments and the engine owns legality.
- **Async GM work is workloads:** world generation, recap, session distill, the director, lorebook upkeep, illustrations and NPC portraits. A crew failure is a retryable workload, never a wedged game; the director never runs while a human holds the seat.
- **Scenes are `chat.forkChat` cuts**, never a private fork; the roster is the party.
- **A human GM's console act is a direct commit**, not swipeable content: it applies the same engine the tool path uses, writes in place on the resolved variant's snapshot, and emits the same bus event. An encounter round resolved by a human carries a null variant. Rulings: the engine rolls and offers, `resolvedByUserId` attributes the act, and the server mints the narrator line. A reference implementation exists only on the `legacy-main` branch.
- **Owner-settled:** elements ship last and optional; a death under brutal difficulty always needs a per-death host confirm; the client polish pass (scene backdrop, table-edge sprites, weather, cinematic effects, readables, dice tumble) is committed.
- **Out:** QTEs, a music layer, turn games, Discord or Spotify integration, haptics, the JSON-repair modal.

## Open questions

- Which remaining engines stay in the program, and in what order: `docs/work/0050-rpg-domain-program-remaining-scope.md`.
- Human and agent GM seats depend on the agent-principal ruling (`docs/plans/agent-principals/design.md`).
- Takeover questions: an optional stone-and-parchment theme; pool orbs by definition order or an explicit pin control; the live encounter block inside Status or a transient encounter tab; the Injections tab in full games or all steering through the GM console.

## Rejected

- A client-orchestrated multi-call turn: one server-driven turn with tools gives same-turn dice feedback.
- A text tag grammar for side effects: tools with schemas replace parsers that drift.
- A metadata blob for game state: typed tables with zod at persistence and model edges.
- Chat-per-session: sessions are rows in one chat.
- A second agent system for the crew: crew work runs as workloads on the sealed agent turn.
- A console-minted turn for a human GM act: a host act is not swipeable content.

## Coupled sites

- `packages/server/src/domain/rpg/` and `packages/contracts/src/rpg/`
- `packages/db/src/schema/rpg.ts` (forward migrations for any new table)
- `packages/server/src/domain/chat/` (the gather and tool seams, `forkChat`)
- `packages/server/src/domain/workloads/` and `packages/server/src/entry/compose/workload-contributions.ts`
- `packages/client/src/features/rpg/`

## Test plan

- Golden tests for every engine formula and table before its chunk ships.
- Scripted tool sequences through the real recurse loop that mutate state correctly, with non-game chats byte-identical.
- Swipe, rewind and hidden-information fixtures for each new state plane.
- A scripted campaign transcript re-run after each crew chunk as a game-feel regression check.
