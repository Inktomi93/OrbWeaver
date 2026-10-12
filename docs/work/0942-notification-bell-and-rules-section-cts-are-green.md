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

Bell half fixed on wt/agent-a50e4b1771aefbb23 (4144a67807): the unfed read came from the installed-plugin card the phone destination test renders, now fed with userSettingsView(). Rules-section half not reproduced: 3 full-file runs plus 50 targeted repeats under load 22-30 were all green, and the 921 lane's failing run left no ct-flaky record. Lead: both failing tests click a nested disclosure inside the rule CollapsiblePanel while its height animates. Reopen with the failing trace when it recurs.
