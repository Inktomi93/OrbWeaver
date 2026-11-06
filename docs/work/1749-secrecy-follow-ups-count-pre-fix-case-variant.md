---
kind: bug
status: open
updated: 2026-11-06
priority: P3
area: server
plan: test-foundation
---

# Secrecy follow-ups: count pre-fix case-variant stamps in chat_events on the prod copy, fix ADR 0285's per-turn warning wording, record that an away host misses the warning

## What

Do three secrecy follow-ups. Count the pre-fix case-variant stamps in chat_events on a copy of the production database. Correct the per-turn warning wording in ADR 0285. Record in the ADR that an away host misses the warning.

## Why

ADR 0285 describes the per-turn warning in words that need a fix, and the reach of the case-variant stamps written before the fix is not yet measured.

## Done when

The count of stamps is recorded in the Evidence with the command that produced it. ADR 0285 states the corrected wording and names the away-host gap.

## Evidence

Filled at landing: what ran and where its output is.
