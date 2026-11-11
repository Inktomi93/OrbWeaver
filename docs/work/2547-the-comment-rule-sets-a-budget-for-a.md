---
kind: decision
status: open
updated: 2026-11-11
priority: P2
area: tooling
plan: checked-law
---

# The comment rule sets a budget for a file header and says what a comment may claim

## What

Comment lines are a large share of source lines in the app packages, far above the tooling and test trees; a tokei run per package shows the ratio. Most of the volume is file headers that restate the code, recount how the file came to be, or describe checks. .claude/rules/comments.md says a comment gives a non-obvious reason but sets no size and does not separate a ruling from a status claim. AGENTS.md says per-domain law is the code and its file headers, so a header can hold a ruling that must stay.

## Why

Nobody can keep that much prose true, and each false sentence costs a cold author more than a missing one. The prune cannot start until the rule says what survives.

## Done when

The owner approves a rewritten comment rule that states what a header holds (the ruling in a line or two and its cite), what no comment may hold (restated code, the story of a change, an enforcement claim without a cite), and how a ruling in a header is kept when the header shrinks. AGENTS.md and the writing rule agree with it.

## Evidence

Filled at landing: what ran and where its output is.
