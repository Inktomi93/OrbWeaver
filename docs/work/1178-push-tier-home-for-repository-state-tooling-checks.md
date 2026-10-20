---
kind: work
status: open
updated: 2026-10-19
priority: P2
plan: test-foundation
---

# Push-tier home for repository-state tooling checks

## What

Audit rows 36, 112 and 336 name a tooling test as successor, but tests/tooling runs only in the weekly tier while the gates run in structure:full on every push. The gates stay until repository-state checks such as work-item liveness and diagnostic legibility have a push-tier home.

## Why

Moving them now would drop their enforcement from every push to weekly.

## Done when

Repository-state checks have a push-tier home listed in verify --list; rows 36, 112 and 336 move there with planted red controls and their gates are deleted.

## Evidence

Filled at landing: what ran and where its output is.
