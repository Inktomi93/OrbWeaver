---
kind: bug
status: open
updated: 2026-11-27
priority: P3
area: world-info
plan: unwired-code
---

# A lore seat the host never moved is not read as a host move

## What

The entry editor always writes position as metadata position or before (packages/client/src/features/world-info entry-editor-model.ts), so seatMoved in packages/server/src/domain/world-info/verbs/entries/upsert-entries.ts reads an unseated entry the host only re-keyed as host-moved, and a later machine upsert with a seat never applies. The seatless-stamp branch has no test, dispatch.int.test.ts calls the moved seat the rule's default, and upsert-entries.int.test.ts sits outside the verbs/entries mirror so a mutation run on the verb finds no test unless tests are named.

## Why

A machine writer's chosen seat should apply until the host actually moves it; an editor save that changes nothing about the seat is not a move.

## Done when

An editor save that does not change the seat leaves the seat counted as the writer's, a test drives guest upsert without seat, host key edit, guest upsert with after and sees after, the seatless-stamp branch has a test, the dispatch comment names the author's seat, and the upsert test sits in the verbs/entries mirror.

## Evidence

Filled at landing: what ran and where its output is.
