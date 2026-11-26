---
kind: decision
status: open
updated: 2026-11-26
priority: P2
area: inference
---

# Decide how orbweaver offers the antislop proxy's banned strings and slop lists

## What

The owner's box runs an antislop proxy in front of vLLM that honors top-level banned_strings (a backtracking ban), slop_list with slop_strength and slop_allow, and passes every other request through. It is box tooling, not a shipped server, so a builtin row for it would ship one install's proxy to everyone. Options: a provider row feature any compatible proxy can declare, a custom-connection toggle, or leave it out and send banned strings as a warning-drop.

## Why

Banned strings only work on vLLM through that proxy, and its slop lists need the character and user names in slop_allow or they push down the character's own name.

## Done when

The decision is recorded (an ADR if it adds a feature), and if the proxy is offered, its fields ride as an endpoint feature with slop_allow filled from the room's character and user names, and close_thinking rides vllm_xargs for a thinking turn.

## Evidence

Filled at landing: what ran and where its output is.
