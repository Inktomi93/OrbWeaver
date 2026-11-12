---
kind: tooling
status: open
updated: 2026-11-12
priority: P3
plan: checked-law
---

# The cite test reads decision records, and their stale cites are repointed

## What

`tests/tooling/doc/comment-path-citations.repo.int.test.ts` does not scan `docs/adr`. Adding that directory surfaces many stale cites across many decision records: deleted docs, moved paths and renumbered sections. The tooling lane's report under reports/lanes holds the list from its trial run.

## Why

A decision record is the highest law, and a cite in it that resolves to nothing sends a reader to a ruling that is gone.

## Done when

The cite test scans `docs/adr` at zero. Each stale cite is repointed to where the ruling lives now, or, where the target is gone for good, the record says so in words the cite grammar reads as no cite; no decision text is deleted.

## Evidence

Filled at landing: what ran and where its output is.
