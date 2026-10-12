---
kind: bug
status: doing
updated: 2026-10-12
priority: P1
lane: codex/production-exports-989
plan: test-foundation
---

# Static checks and pnpm ast run within a standard CI runner's memory

## What

A single pnpm ast verb holds five to ten gigabytes, and a structure run loads several TypeScript programs; on a standard hosted CI runner or a contributor's machine that fails or swaps. Measure peak memory of pnpm check, the structure stage and each pnpm ast verb against the hosted runner's memory, find what loads a program more than once, and fix it in the design: the code-facts engine (items 953 to 957) becomes one persisted, incrementally updated fact store that every gate, verb and codemod queries, so no caller loads its own program. The measurement is the evidence; there is no cap.

## Why

The project is public and builds on hosted runners and contributors' machines; a check that only fits on a large workstation is a broken check for everyone else.

## Done when

pnpm check, the structure stage and every pnpm ast verb complete within the hosted runner's memory with their peak recorded; concurrent pnpm ast verbs share the one store.

## Evidence

The production-export lane's batched native semantic inventory exhausts the default Node heap before reporting a population. Its approved retry exhausts a larger heap after source-corpus construction and shared liveness, before the complete inventory. Both exit 134 and supply no completed typed verdict. No further heap escalation is scheduled; this blocks bulk export adjudication, not native Knip's completed result.

The existing semantic workspace caches programs within one invocation. Its source-corpus enumeration materializes primary native programs across authored roots; containing-program lookup can materialize every program. This is not the persisted, incrementally updated fact store required by this plan. The production-export lane owns the compiler/fact lifecycle correction with its preserved codemod preparation. Preserve native world semantics and the complete consumer census; do not cut populations to fit memory. Retain both failed logs and measure peak memory rather than inferring it from the configured heap.
