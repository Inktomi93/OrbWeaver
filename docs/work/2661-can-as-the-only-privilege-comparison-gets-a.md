---
kind: tooling
status: doing
updated: 2026-11-12
priority: P2
area: security
lane: wt/agent-a84eabc3e8d8f0a49
plan: checked-law
---

# can() as the only privilege comparison gets a lint rule, and the invariant states its scope

## What

Invariant six of `docs/law/Spine-Identity-and-Auth.md` forbids a role comparison outside `can()` and nothing checks it. `packages/client/src/features/chat/lib/member-rows.ts` compares `p.role` with `host` to draw a label. Rule whether a display label is inside the invariant: either derive the label from a server-sent fact, or scope the sentence to privilege decisions. Then turn on a lint selector that refuses a role comparison outside the `can()` home.

## Why

A stray role comparison is a second authorization path that review has to find by eye.

## Done when

The selector is on at zero over server and client with a planted control, and the invariant's wording matches what the selector refuses.

## Evidence

Filled at landing: what ran and where its output is.
