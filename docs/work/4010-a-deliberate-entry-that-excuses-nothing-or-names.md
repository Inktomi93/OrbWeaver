---
kind: tooling
status: open
updated: 2026-11-25
priority: P2
area: tooling
plan: unwired-code
---

# A deliberate entry that excuses nothing or names a vanished member is reported stale

## What

tooling/src/unwired/deliberate.ts DELIBERATE entries are matched by file, home and member with no staleness check: an entry whose file, home or member no longer exists, or whose member is now wired so the entry excuses no finding in any scan, keeps sitting in the list and silently matches nothing, and the D-number, law section or path cited in its reason string is not resolved by the cite check. The judged list already has this (judged.ts row-gone and item-closed); the deliberate list does not.

## Why

A deliberate excuse that outlives its member or its reason is a waiver nobody re-judges, and a later member reusing the name inherits it unseen.

## Done when

Every scan reports stale deliberate entries (no declared file, home or member; or covering no finding in any scan of the run) the way staleJudged reports judged ones, each reason's D-number, law section and repo path resolve through the cite grammar in tooling/src/eslint/cites.ts with a test that fails on a dangling one, a planted case per stale kind with a twin, and the real-tree run lists each stale entry removed or re-cited.

## Evidence

Filled at landing: what ran and where its output is.
