---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: server
plan: import-robustness
---

# Import preview entries with long paths stay distinct, and a group seats only its own profile's cards

## What

Two paths in one profile that share their first 200 characters merge to one preview entry after clipping. Group member resolution matches card filenames across the whole upload, so a group in one profile can seat another profile's card.

## Why

The preview drops an entry the run writes, and a group can gain a member its owner never gave it.

## Done when

Clipping is for display only and identity uses the whole path, with a test; and group seating is scoped to the group's profile or the cross-profile match is ruled deliberate with a cited decision, with a test either way.

## Evidence

Filled at landing: what ran and where its output is.
