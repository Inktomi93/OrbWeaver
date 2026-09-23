---
kind: work
status: open
updated: 2026-09-23
priority: P2
area: chat
---

# Keep carried thinking valid on models that bind it to its prefix

## What

Claude Fable 5.1 and Opus 5.5 bind each carried thinking block to everything before it. Today the speaker cue is a one-call user row that disappears next call, so any carried thinking after it is refused (enforced accounts) or dropped. OR-10 (scripts/probes/openrouter/RESULTS.md) measured every layout.

## Why

Carry-reasoning is opt-in, but with it on, group rounds on these models lose every earlier reply's thinking and read 0 from the cache; new accounts get a 400.

## Done when

On binding models with carry on: the speaker cue is rebuilt as an ordinary user row byte-identically on every later call, derived from the next row's author (OR-10 S2c); requests set thinking.block_binding.prefix_mismatch_behavior drop_block with the thinking-binding-controls beta and record input_transformations, alarming on any prefix_binding_mismatch. Sections stay where the prompt order puts them (ADR 0251). Continue and impersonate nudges are probed before carry covers them. A live pnpm cache:check-style run shows zero drops on a group round.

## Evidence

Filled at landing: what ran and where its output is.
