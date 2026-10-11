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

Done in cb-ui-cleanup. Root cause fixed earlier in 3536e7eb37 (measuring the `display: contents` ghost-stream-body). The gap read in `ghost-message-row.ct.tsx` is now an `expect.poll`. Before the change the single-read test passed 10 of 10 under `--repeat-each=10` (the flake was already gone, so no red is reproducible); after it, `pnpm test:ct tests/client/features/chat/components/ghost-message-row.ct.tsx --repeat-each=10` passes 270 of 270 (27 tests x 10), 0 flaky.
