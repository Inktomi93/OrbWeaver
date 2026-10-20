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

Prior-art review (`reports/review/semantic-store-prior-art.md`): codegraph stat-gates on size and mtime and hashes only on mismatch; git adds the racy rule. A cache copy shows the tooling partition records 32,599 inputs, most under node_modules, verified at least three times per call. Treat node_modules and .pnpm as a durable tier checked by its lockfile and patch identity, and check the executing-implementation attestation once per process.

Constraint from 1002 (tests/tooling/floor/code-facts/semantic-inventory-native.test.ts): a same-size edit with its mtime restored must rebuild. A size and mtime stat gate misses that edit, so the stat identity must include ctime and inode, which change on any content write, beside size and mtime.

Baseline on main 492d691d89 (`reports/review/warm/`): rot server cold 1:44:07 at 14.1 GB; warm with nothing changed 17:01 at 10.9 GB; after a one-line tooling edit 1:29:48 at 14.3 GB.
