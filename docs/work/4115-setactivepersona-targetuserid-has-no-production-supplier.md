---
kind: bug
status: open
updated: 2026-11-27
priority: P2
area: identity
---

# setActivePersona targetUserId has no production supplier

## What

SetActivePersonaParams.targetUserId in packages/server/src/domain/persona/contract/params.ts lets a host set another participant's persona, but the tRPC setActivePersona input in packages/server/src/transport/trpc/routers/persona.ts never takes or passes it; only tests supply it.

## Why

An identity path that only tests reach can drift from its gate unseen, and a host cannot use a feature the verb was built for.

## Done when

Either the router takes a target user with its host-or-self gate tested cross-tenant, or the parameter and its branch in verbs/set-active.ts are deleted with their tests moved onto the production door; routed to security-builder.

## Evidence

Filled at landing: what ran and where its output is.
