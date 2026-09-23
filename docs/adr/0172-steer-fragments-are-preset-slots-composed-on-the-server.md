---
kind: adr
status: active
updated: 2026-09-23
---

# Rewrite toggles and greeting transforms are preset slots composed on the server

## Context

The rewrite-toggle and greeting-transform fragments were the last model-facing prose composed in the browser: the client joined the picked fragments and sent the composed string, so the server never knew which toggles fired and hosts could not edit the bytes.

## Decision

Each fragment is a preset-homed prose slot with `macros: "none"`. The catalogs keep id, label and axis and point at their slot instead of carrying text. The wire carries the picked kinds (`guidedSteerSchema.rewriteToggles`, greeting `transforms`). `resolveSteerFragments` in `@orb/contracts/prose` is the one resolver, and the server composes at the two seams that already hold the preset prose: chat assembly (`composeSteerInput`) and the greeting studio (`composeGreetingSteer`). `composeRewriteSteer` in kit is unchanged; only its caller moved.

## Consequences

Prose resolution stays a server-tier invariant, and the provenance of which bytes reached the model is recorded. The Templates tab shows the fragments under the existing `steer` and `studio` kinds.

## Alternatives rejected

- Resolve on the client: it forks the rule that prose resolves on the server and loses the record of which bytes reached the model.
- Rule the fragments out of scope and keep them in code: it contradicts the slot registry's rule that hardcoded prose is not a home (D132).
