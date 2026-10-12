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

The custom production-export inventory attempts exit 134 without a complete typed verdict. Both use bare Node instead of the workspace-managed runtime. The first bypasses the configured heap floor; the retry sets that heap explicitly but retains the older runtime. These are not shipped-command failure evidence. Native Knip's completed result remains valid.

The wrapper invokes the supported typed workspace once; it does not launch concurrent AST commands. That workspace can retain native programs across worlds, and the custom batch also retains multiple collector outputs. The lane owns invocation and bounded retention comparison before implementation. Preserve the codemod preparation and store design, but hold store construction until the actual failure mechanism is established. The plan still requires shared persisted facts independently of this diagnosis. Preserve populations and native world semantics; do not infer peak memory from a configured heap or GC line.
