---
kind: bug
status: open
updated: 2026-10-20
priority: P1
plan: test-foundation
---

# Fact store input checks stat before re-hashing

## What

inputsCurrent (floor/code-facts/semantic-inventory-inputs.ts) proves an input unchanged by reading the whole file and hashing it with SHA-256 plus a realpath, for every source, config and dependency declaration input, several times per call: before reuse, after worker exit and before publication. A warm run with nothing changed still re-reads and re-hashes every input.

## Why

A cache whose validity check costs as much as reading the whole tree makes warm runs slow; git, tsc incremental and other build caches compare stat first and hash only on a stat change.

## Done when

Each stored input records its stat identity (mtime, size, inode) beside its content hash; a check re-hashes only when the stat differs, and treats an mtime at or after the recording time as dirty, as git does; content hashes stay the version; a warm no-change run and a one-file-edit run are measured before and after with identical reuse decisions, and a red-first test proves a same-size same-mtime edit is still caught.

## Evidence

Filled at landing: what ran and where its output is.
