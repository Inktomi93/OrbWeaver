---
kind: bug
status: open
updated: 2026-10-12
priority: P1
plan: test-foundation
---

# Static checks and pnpm ast run within a standard CI runner's memory

## What

A single pnpm ast verb holds five to ten gigabytes, and a structure run loads several TypeScript programs; on a standard hosted CI runner or a contributor's machine that fails or swaps. Measure peak memory of pnpm check, the structure stage and each pnpm ast verb against the hosted runner's memory, find what loads a program more than once, and make the shared code-facts engine (items 953 to 957) load one program per world and reuse it across gates and verbs. Add a memory check that fails when a whole structure run exceeds the runner's memory.

## Why

The project is public and builds on hosted runners and contributors' machines; a check that only fits on a large workstation is a broken check for everyone else.

## Done when

pnpm check, the structure stage and every pnpm ast verb complete within the hosted runner's memory with their peak recorded; a regression past it fails.

## Evidence

Filled at landing: what ran and where its output is.
