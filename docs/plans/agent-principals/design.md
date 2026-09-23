---
kind: plan
status: active
updated: 2026-09-23
---

# Agent principals: agents with their own identity, seats and ceiling

## Goal

An agent holds its own principal and seat in a room, so what it does is attributed to it and bounded by a closed capability ceiling.

## Shape

**Already built:** only dormant columns: `users.kind` and `users.ownerUserId` in `packages/db/src/schema/users.ts`, and the agent member of the participant kinds in `packages/contracts/src/chat/participants.ts`. The mint, the seating path and `canAgent` do not exist.

The design (D60):

- **Identity.** An agent is a `users` row with `kind: agent`, structurally loginless (a CHECK, not a convention), owned by a human through `ownerUserId` (owner deletion cascades). It is minted lazily and idempotently at first seat-join by a sessions verb, in a reserved handle namespace.
- **Roster.** `chat_participants` gains the agent kind: user-backed and AI-driven at once. An agent's room speech is real chat canon attributed to the agent.
- **Funding does not move (D19).** The host's `runAsUserId` funds room turns and a human `triggeredBy` stays responsible; only authorship changes hands.
- **The ceiling has two walls.** Agents are sessionless and Principal-less, so no request path can act as one; the one runtime gate is a `canAgent(actor, action, room)` case on the existing `can()` seam, whose closed `AgentAction` union is the ceiling. Containment is one flip of `users.enabled` plus a kick.
- **Seats.** An agent can hold the RPG GM seat (a headline goal) and sit in a party.
- **Tool postures.** Standing seat authority means direct execution (the GM seat, rpg tools only). No standing authority means propose and confirm: a seated agent calls derived `propose_*` tools that write a durable proposal row, and the room's host confirms, which runs the same registered tool through the one tool-use pipeline under the confirmer's Principal. Structured-output-only actors (the crew) get no tools. A fourth posture, direct execution without a seat-shaped authority, must never exist.

## Open questions

- Rebuild or delete: `docs/work/0048-agent-principal-program.md`.
- If rebuilt: which tools join the closed proposable tuple, and how long a proposal lives.

## Rejected

- A boolean agent flag on `users`: a kind tuple keeps every consumer exhaustive.
- A second auth model or dispatch path for agents: every decision routes through `can()` and one turn path.
- Letting an agent fund turns: funding follows D19.
- Gating proposals by agent source: chat stays source-blind; the ceiling gates the principal.
- Direct tool execution for agents without a seat: it is host-authority execution with no human in the loop.

## Coupled sites

- `packages/db/src/schema/users.ts` and `packages/db/src/schema/chat.ts` (forward migrations)
- `packages/server/src/domain/sessions/` (the mint)
- `packages/server/src/domain/admin/guard.ts` (`can()` and `canAgent`)
- `packages/server/src/domain/chat/` (seating and attribution)
- `packages/server/src/domain/tool-use/` (the proposable tuple and the confirm path)
- `docs/law/Spine-Identity-and-Auth.md`

## Test plan

- A containment suite: a disabled agent principal can do nothing on any path.
- Structural tests that no auth mode ever resolves an agent row to a session.
- Attribution tests: agent speech is canon attributed to the agent while the host funds it.
- Propose and confirm: nothing executes until a host confirms, and execution runs under the confirmer.
