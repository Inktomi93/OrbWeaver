---
kind: bug
status: open
updated: 2026-11-24
priority: P2
area: server
---

# Cross-brand id flows land in a slot of their own brand

## What

pnpm brand-flow lists crossBrand rows: a value of one id brand widened into a slot named for another, such as AgentSdkSessionId into SessionKey.sessionId in packages/inference/src/backends/agent-sdk/session/store.ts.

## Why

A slot named for one brand that receives another is the one brand finding that can be a real mix-up: the compiler cannot catch a wrong id there.

## Done when

Each crossBrand row is a slot typed as the brand it holds, or a kind ref where it holds several, or is shown with path:line to be the heuristic naming a slot wrongly; a whole-tree brand-flow lists no production crossBrand row.

## Evidence

Filled at landing: what ran and where its output is.
