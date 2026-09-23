---
kind: decision
status: blocked
updated: 2026-09-23
priority: P3
area: chat
blocked: owner
---

# Decide whether a fork should carry the parent chat's user-macro picks

## What

`domain/chat/verbs/fork.ts` copies `variableValues`, `runtimeVariables` and `standaloneVariableDeltas` into a forked chat but does not copy `userMacroValues`, so a fork starts with default user-macro picks. ChoiceBlock picks (ADR 0046) are fork-carried; user-macro picks were designed with the same parity in mind.

## Why

Whether a fork should keep the parent's user-macro picks is a product call: a code fix is needed either way, and the ADR needs a line stating the ruled behavior.

## Done when

The owner rules for or against carrying picks into a fork; the fork verb and the user-macro ADR are updated to match.

## Evidence

Filled at landing: what ran and where its output is.
