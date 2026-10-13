---
kind: bug
status: open
updated: 2026-10-12
priority: P1
plan: test-foundation
---

# Static checks and pnpm ast run within a standard CI runner's memory

## What

Native analysis retains TypeScript programs across worlds. Measure the actual hosted-runner budget and completed tool peaks before attributing failures to duplication or contention. Measure peak memory of pnpm check, the structure stage and each pnpm ast verb against the hosted runner's memory, find what loads a program more than once, and fix it in the design: the code-facts engine (items 953 to 957) becomes one persisted, incrementally updated fact store that every gate, verb and codemod queries, so no caller loads its own program. The measurement is the evidence; there is no cap.

## Why

The project is public and builds on hosted runners and contributors' machines; a check that only fits on a large workstation is a broken check for everyone else.

## Done when

pnpm check, the structure stage and every pnpm ast verb complete within the hosted runner's memory with their peak recorded; concurrent pnpm ast verbs share the one store.

## Evidence

Custom production-export inventory attempts exit 134 without a complete typed verdict. Both use bare Node instead of the workspace-managed runtime. The first bypasses the configured heap; the retry changes the heap but retains the older runtime. These attempts do not establish shipped-command failure.

The correctly invoked `pnpm ast apisurface --in /src/ --public --json --max 1000000` completes on managed Node 26.10.0. Its timing artifact records exit 0, elapsed 2:37.88 and maximum RSS 15,719,224 KiB, without swaps. The JSON reports complete output, with total and shown equal. This measures one verb; it does not establish every tool's hosted-runner qualification.

A bounded native fixture confirms one workspace and one materialized project per demanded descriptor. Shared and separate collector calls preserve results without duplicating those projects. The custom wrapper retains a native world population and multiple collector outputs; its exact aborting phase remains unresolved.

The sequential native UI export projection completes on managed Node with a released worker per demanded world. Its timing artifact reports exit 0, elapsed 1:58.62 and maximum RSS 2,501,396 KiB without swaps. This measures the bounded UI selector work set, not the full apisurface verb or aggregate concurrent-process memory. It neither diagnoses the earlier wrapper's aborting phase nor establishes a persisted shared store.

Export adjudication continues separately. Its grouped projection reuses completed world results and resumes only unfinished descriptors after checking source and config identity. Preserve the store design, but hold emergency store construction. The canonical plan still requires persisted shared facts independently of this diagnosis. Full runner measurements and the shared-store work remain unassigned here.
