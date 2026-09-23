---
kind: adr
status: active
updated: 2026-09-23
---

# an in-turn chat TOOL executes under the resolved HOST Principal; there is no per-speaker authority swap at the tool seam, so a mutating tool attached to a non-human speak turn is host-authority execution with zero human in the loop and must never ship

## Context

Not recorded in the ledger row.

## Decision

Home: `entry/compose/chat.ts::buildChatToolOps` — the ONE construction site, built from the tool-use service plus a `resolveHostPrincipal` resolver, so a tool op cannot be constructed without host authority. The agent tool postures are a CLOSED set: the rpg agent-GM seat executes directly under a standing host-conferred authority object; crew mounts no tools at all (structured output only — \[\[D59]], whose disposition note records crew as dead scope); tool-propose (`docs/architecture/proposed/agent-tool-propose-spec.md`) stashes a proposal, the HOST confirms, and execution re-enters the same registry pipeline under the CONFIRMER's human Principal. The widening point to watch is the teaching seam: `attachedToolNames` is the union over `TeachingContribution.toolNames` (\[\[D145]] clause (a)), so whatever teaches a tool also attaches it. Enforcer: OWNER-RULED, PROSE-ENFORCED — no gate reads speaker kind at the tool seam, so a diff widening tool attachment for a non-human speaker is reviewed against this row, with the containment-suite re-proof (the \[\[D60]] precedent) as the test-side belt.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
