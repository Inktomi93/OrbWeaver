---
kind: plan
status: parked
updated: 2026-10-02
blocked: owner
---

# RPG: future game engines

## Goal

Extend Orbweaver’s existing game state with server-resolved game rules when the owner resumes the program.

## Shape

Keep the implemented RPG experience unchanged. Design future engines from the table’s needs, with typed, selected-lineage state and server-enforced hidden information. D285 preserves the implemented foundations.

## Open questions

The owner selects scope and ordering before design resumes. Keep resource orbs, omit the optional theme, and leave encounter placement and full-game steering deferred.

## Rejected

Inherited feature lists are not a build commitment.

## Coupled sites

`packages/server/src/domain/rpg/`, `packages/contracts/src/rpg/` and `packages/client/src/features/rpg/`.

## Test plan

A resumed design must prove rule behavior, selected-lineage state and hidden-information boundaries.
