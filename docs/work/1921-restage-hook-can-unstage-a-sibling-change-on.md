---
kind: bug
status: open
updated: 2026-11-06
priority: P3
area: tooling
---

# Restage hook can unstage a sibling change on an amend with a pathspec

## What

restage-docs runs git reset on every path in HEAD after a commit, so an amend with a pathspec can unstage a sibling's staged change on a file already in HEAD. Limit the reset to paths the commit changed, or skip it when the index holds text the commit did not take.

## Why

Main's checkout is shared, and a silently unstaged change can miss its commit.

## Done when

A planted repository shows the sibling's staged text stays staged after that amend, and a pathspec commit still ends clean.

## Evidence

Filled at landing: what ran and where its output is.
