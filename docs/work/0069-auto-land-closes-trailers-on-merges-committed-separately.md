---
kind: tooling
status: open
updated: 2026-09-23
priority: P2
area: doc
---

# Auto-land Closes trailers on merges committed separately

## What

The lefthook post-merge auto-land (pnpm doc land --merged) fires only on a completed git merge. A merge made with --no-commit then git commit, or a conflict-resolved merge, fires post-commit instead, so its Closes: trailers never land. landMerged also reads ORIG_HEAD..HEAD, which is wrong for a merge commit made by git commit.

## Why

Primary landed about 20 items by hand because of this. Items that should close stay open, and the drift nag fills with false positives.

## Done when

A merge commit made by git merge, by --no-commit plus git commit, or after a conflict resolution lands its Closes: trailers on main. Tests cover all three spellings and the fast-forward case.

## Evidence

Filled at landing: what ran and where its output is.
