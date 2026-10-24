---
kind: work
status: open
updated: 2026-10-24
priority: P3
area: server
---

# Macro dice and rpg dice share one notation policy

## What

Two dice-notation parsers exist with different caps: kit's `{{roll::NdM}}` macro in `packages/kit/src/macro/registry.ts` (`ROLL_MAX = 10_000`, no modifier) and the rpg policy in `packages/server/src/domain/rpg/tools/dice.ts` (`MAX_DICE`, `MAX_FACES`, `MAX_MODIFIER`; item 1007 moves it under the rpg substrate and shares it between the `roll_dice` tool and the member `rollDice` verb). The chat persistence layer also carries a second SQL spelling of the history floor, `queries.ts::callerHistoryFloorSql`, beside `resolveHistoryFloorSeq`, which its own comment admits.

## Why

One home per concept; two parsers drift on what a valid roll is, and two floor spellings drift on who may see a row.

## Done when

One dice notation parser and bound table, in kit if the macro engine must stay isomorphic and the rpg policy imports it, with a cited ruling if two must remain; `callerHistoryFloorSql` is either generated from `resolveHistoryFloorSeq` or replaced by a read that applies the one predicate, with the co-participant and message-list reads asserting the same floor in one test.

## Evidence

Filled at landing: what ran and where its output is.
