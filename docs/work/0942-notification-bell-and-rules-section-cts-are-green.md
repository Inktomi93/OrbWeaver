---
kind: bug
status: open
updated: 2026-10-12
priority: P2
area: client
plan: test-mirror
---

# Notification bell and rules section CTs are green and stable on main

## What

Two CT reds on main reproduced by the 921 lane in a clean worktree: tests/client/features/notifications notification-bell.ct.tsx trips the unfed-read ratchet on settings.getUserSettings (never stubbed), and rules-section.ct.tsx fails a different test per run (the fire log shows a rule's recent fire; a rule bound to a connection that is gone), which reads as a flake. Feed the bell's read with full contract output, and find the nondeterminism in the rules section stories (inject the clock and ids) rather than retrying.

## Why

Reds on main poison every lane's CT evidence for those files and hide new failures.

## Done when

notification-bell.ct.tsx exits 0 with no unfed read, and rules-section.ct.tsx passes on repeated runs.

## Evidence

Filled at landing: what ran and where its output is.
