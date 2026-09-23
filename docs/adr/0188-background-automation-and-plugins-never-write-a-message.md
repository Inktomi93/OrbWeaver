---
kind: adr
status: active
updated: 2026-09-23
---

# Background automation and plugins never write a message

## Context

Automation rules and plugins run with no human at the keyboard. If they could insert prose into a room, canon would hold model text that no seat wrote and no turn produced. The code cites this rule as the class-1 wall in three places, but no ADR or law doc defines it.

## Decision

Background code splits by how it relates to canon. Class 1, outside the room: automation actions and the plugin host API. They act through side effects only: lore writes, variable writes, suggestions, backgrounds, images, notifications and quiet analysis. Their only path to prose canon is to request a turn from the one turn pipeline (`trigger_turn`, `chat.requestTurn`). The pipeline stamps the author and the funder. Class 2, inside the room: adds to canon only through an attributed seat, which is a turn slot or a reaction. `AutomationOps` and `PluginHostV1` have no message-insert operation. Do not add one. There are two bounded exceptions. `generate_image` posts an image through `postNarratorMessage` with `initiator: "automation"`. `transform_draft` rewrites a member's own draft before commit through the prompt-transform pipeline. The op-type contract turns a call to a missing op into a compile error. Adding an op is caught only in review. Homes: `packages/server/src/domain/automation/contract/ops.ts`, `packages/server/src/domain/automation/engine/arm-executors.ts`, `packages/contracts/src/plugin/host-v1.ts`.

## Consequences

Every model-written message has a turn and an attributed author. A `run_tool` result is data. It reaches the model only through a later turn's normal assembly of a variable. A future in-room agent needs a seat and attribution. It cannot be a background op.

## Alternatives rejected

A message-insert op for automation or plugins: it would put unattributed prose into canon. A second execution path for background model output: the one turn pipeline already holds the lock, the budgets and attribution.
