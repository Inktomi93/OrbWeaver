---
kind: work
status: open
updated: 2026-11-17
priority: P3
area: inference
---

# Reap superseded agent-sdk session lineages

## What

claude-sub (agent-sdk) chats accumulate session_entries rows and their on-disk SDK session files forever: the writer demotes old primaries (isPrimary=false) on every reseed, fork and branch, but no code path anywhere deletes session_entries rows except the chat/connection CASCADE. Add a bounded reaper (e.g. at seed time, delete non-primary rows for the (chat, connection) older than the last N lineages, and remove their session-store files), or rule in the ledger that CASCADE-lifetime is the retention policy and fix the isPrimary header's 'reap candidates' wording.

## Why

Found while auditing the column readers: the schema comment names reap candidates that nothing reaps, so the accumulation is unbounded growth with a documented-but-missing owner. Small per row, but every forked branch keeps a cache file for its whole chat's life.

## Done when

Either a reaper wired through the session-store seam with a test that a demoted lineage older than the bound disappears (and a fresh fork for swipe-back survives), or a ledger ruling plus header wording fix. Evidence: reports/code-reviewer/ under the column-readers report.

## Evidence

Filled at landing: what ran and where its output is.
