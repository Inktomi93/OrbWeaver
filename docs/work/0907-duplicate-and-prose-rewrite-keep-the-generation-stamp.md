---
kind: bug
status: open
updated: 2026-10-11
priority: P2
area: chat
---

# Duplicate and prose rewrite keep the generation stamp so a greeting never overwrites them

## What

The greeting pager and setSeededGreeting gate on isSeededGreetingRow (packages/contracts/src/chat/messages.ts), which treats an assistant row with a null genStartedAt as a seeded greeting. Two verbs write model text with a null stamp. duplicateMessage (packages/server/src/domain/chat/verbs/edit.ts, the duplicate builder near line 1054) copies model, tokens and cost but not genStartedAt or genFinishedAt, and variantEconomics in persistence/canon-write.ts defaults them to null. applyProseRewrite (edit.ts near line 668, via appendedVariantOf near line 322) appends the rewrite as a variant with a null stamp. In a room with no user turn, setSeededGreeting then succeeds on either row and overwrites the text with a greeting. A verifier reproduced both against the real createEdit. Fix: carry the stamps through duplicate and the rewrite variant, or key the predicate on a fact only the greeting seeder (substrate/greeting-seed.ts) writes. Also check whether a SillyTavern import without gen_started (serde/chat/index.ts) yields null-stamped replies.

## Why

Item 903 closed this for engine-committed replies only; the predicate's comment claims every generated row is stamped, which is false for these two writers.

## Done when

Int tests in tests/server/domain/chat/verbs/seeded-greeting.suite.int.test.ts show setSeededGreeting refuses with notGreetingRow on a duplicated generated reply and on a prose-rewritten reply, red on the current code.

## Evidence

Filled at landing: what ran and where its output is.
