---
kind: work
status: open
updated: 2026-09-23
priority: P3
area: chat
---

# Carry the parent's user-macro picks into a fork

## What

`domain/chat/verbs/fork.ts` copies `variableValues`, `runtimeVariables` and `standaloneVariableDeltas` into a forked chat but not `userMacroValues`, so a fork starts with default user-macro picks. Copy `userMacroValues` in the fork insert, and state the rule in ADR 0169.

## Why

The owner ruled that a fork carries the parent's user-macro picks, the same as ChoiceBlock picks under ADR 0046. A fork continues the same setup.

## Done when

A fork carries `userMacroValues`, a fork test asserts it, and ADR 0169 states the rule.

## Evidence

Filled at landing: what ran and where its output is.
