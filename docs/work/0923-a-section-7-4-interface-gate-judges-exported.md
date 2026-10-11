---
kind: tooling
status: open
updated: 2026-10-11
priority: P2
area: tooling
plan: test-mirror
---

# A section 7.4 interface gate judges exported interfaces outside the section 7.4 homes

## What

no-inline-types judges only exported type aliases and zod consts (tooling/src/verify/gates/no-inline-types.ts:106) and no-inline-domain-interface only server domains, so an exported interface in server entry, infra or foundation or in inference is judged only by no-inline-wire-interface, and only when its name ends in a wire suffix. Owner ruling: client is a home for client-only views (the section 7.4 table), so client interfaces are out of its scope. Add a no-inline-types sibling over exported interfaces in server entry, infra, foundation and inference, baseline its hits as waivers naming a burn-down item, then narrow no-inline-wire-interface to shapes that cross a boundary and delete the hook-result and compose-bundle waivers it no longer needs (item 900 lane lists them).

## Why

Spine-TypeScript-and-Patterns section 7.4 bans exported interfaces outside the homes; the gates enforce it only for aliases and server domains, and the wire rule's name heuristic currently stands in for it with false positives.

## Done when

The sibling gate runs with a planted failing and passing control and a waiver budget row; no-inline-wire-interface no longer flags client hook results or entry/compose bundles; no exported interface outside a home is judged by nothing.

## Evidence

Filled at landing: what ran and where its output is.
