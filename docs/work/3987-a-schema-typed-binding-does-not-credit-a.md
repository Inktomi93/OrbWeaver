---
kind: tooling
status: doing
updated: 2026-11-24
priority: P3
area: tooling
lane: wt/agent-abf90df0f06f44a65
plan: unwired-code
---

# A schema-typed binding does not credit a banned member from the type's same-named member

## What

A z.ZodType binding over PluginSurfaceSpec pairs PluginSurfaceNode.when, a type member, with the spec's when-is-undefined ban member, so the node's reads credit the ban and PluginSurfaceSpec.when leaves sent-only; deleting the ban member still compiles.

## Why

A ban member exists to forbid a key, so crediting it with another type's reads hides that nothing writes or reads it.

## Done when

A member typed undefined that bans a key takes no read from a same-named member of another type through a schema binding, a planted ban case stays unread without breaking the shared-declaration pairing, or a ruling names ban members as judged by their own rule with its reason.

## Evidence

Filled at landing: what ran and where its output is.
