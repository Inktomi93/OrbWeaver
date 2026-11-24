---
kind: work
status: doing
updated: 2026-11-24
priority: P3
area: client
lane: wt/agent-afca5223c7596f5fc
plan: unwired-code
---

# Context tabs drop the disabledReason nothing sets

## What

ContextTabDef.disabledReason in packages/client/src/lib/registry-contracts.ts is never set by any tab definition, so the resolved tab's disabledReason is always null and the locked branches in context-rail.tsx (the lock glyph and the aria-disabled path) never run.

## Why

Dead locked-tab paths read as a feature that exists and mislead the next change to the rail.

## Done when

The field leaves ContextTabDef and ResolvedContextTab, the locked branches go, docs/law/client-architecture-lockdown.md is checked and amended if it promises the locked state, and the context rail tests still pass.

## Evidence

Filled at landing: what ran and where its output is.
