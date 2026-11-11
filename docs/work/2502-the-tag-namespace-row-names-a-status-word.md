---
kind: bug
status: open
updated: 2026-11-11
priority: P3
area: docs
---

# The tag namespace row names a status word the enum never ships

## What

The constitution row defining the tag domain says the suggestion state is spelled proposed — that the awaiting-accept state IS a status named proposed. The shipped surface disagrees on the word: the single junction-status enum carries exactly two members, a pending value for the suggestion awaiting accept and an accepted value, and no tag code anywhere mints or matches a proposed status value. The word proposed survives only inside descriptive phrases about the status surface and in references to the deleted predecessor design whose JSON column the enum replaced. A cold author who searches the proposed spelling to find the state finds the constitution row and the prose, then hunts for an enum member that does not exist. One row is the whole fix: the code is internally consistent, the user-facing copy uses its own words, and the register has no tag row because the drift never crossed a surface.

## Why

The constitution row is the one-line definition a reader trusts for an entire domain, and a status word it asserts that the closed enum never ships teaches the wrong vocabulary at the highest-authority line in the repo. Closed status tuples make the mismatch mechanical to check: the row word against the enum tuple.

## Done when

The tag row names the status with the word the closed enum actually ships, the enum itself is untouched, and no other law line names a tag status value that is absent from the tuple.

## Evidence

Filled at landing: what ran and where its output is.
