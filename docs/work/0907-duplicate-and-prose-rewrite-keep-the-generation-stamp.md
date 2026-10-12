---
kind: bug
status: open
updated: 2026-10-12
priority: P2
area: chat
---

# Duplicate and prose rewrite keep the generation stamp so a greeting never overwrites them

## What

The greeting pager and setSeededGreeting gate on isSeededGreetingRow (packages/contracts/src/chat/messages.ts), which treats an assistant row with a null genStartedAt as a seeded greeting. Two verbs write model text with a null stamp. duplicateMessage (packages/server/src/domain/chat/verbs/edit.ts, the duplicate builder near line 1054) copies model, tokens and cost but not genStartedAt or genFinishedAt, and variantEconomics in persistence/canon-write.ts defaults them to null. applyProseRewrite (edit.ts near line 668, via appendedVariantOf near line 322) appends the rewrite as a variant with a null stamp. In a room with no user turn, setSeededGreeting then succeeds on either row and overwrites the text with a greeting. A verifier reproduced both against the real createEdit. Fix: carry the stamps through duplicate and the rewrite variant, or key the predicate on a fact only the greeting seeder (substrate/greeting-seed.ts) writes. Also check whether a SillyTavern import without gen_started (serde/chat/index.ts) yields null-stamped replies. A third case: a hand edit of a seeded greeting (editMessage, edit.ts near line 507) rewrites the text in place and keeps the null stamp, so the pager stays bound and the next step overwrites the user's edit with card text, with no confirmation and no variant kept. editedAt cannot mark this, because setSeededGreeting itself stamps editedAt. Preferred fix for all three cases: a step that would replace text the card did not write appends the card greeting as a new selected variant instead of overwriting, so the replaced text survives as a swipe.

## Why

Item 903 closed this for engine-committed replies only; the predicate's comment claims every generated row is stamped, which is false for these two writers.

## Done when

Int tests in tests/legacy/server/domain/chat/verbs/seeded-greeting.suite.int.test.ts show setSeededGreeting refuses with notGreetingRow on a duplicated generated reply and on a prose-rewritten reply, and that stepping a hand-edited greeting keeps the edit as a variant, red on the current code.

## Evidence

Recovery material remains in `wt/agent-a4fd81354ff8efecd`: committed greeting preservation and uncommitted generation-stamp changes. No active lane owns this draft. Inspect and reproduce the production defect on current main before salvage; do not merge or discard it wholesale. Legacy fixture repair is not its deliverable.
