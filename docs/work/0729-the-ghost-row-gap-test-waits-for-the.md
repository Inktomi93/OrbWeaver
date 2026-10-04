---
kind: tooling
status: open
updated: 2026-10-04
priority: P3
area: client
---

# The ghost row gap test waits for the stream to settle

## What

tests/client/features/chat/components/ghost-message-row\.ct.tsx reads the header-to-body gap once right after driveScript and fails about one run in five (reads 66 instead of 8). Final pass leg 2 (plugins); review: ~/homelab/development/probe-archive/side-eye-reviews/final-pass-2-plugins.md.

## Why

Plugin final pass finding.

## Done when

The test polls the gap and passes with --repeat-each=10.

## Evidence

Filled at landing: what ran and where its output is.
