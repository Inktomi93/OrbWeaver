---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: regex
---

# Give a compaction-covered transcript row no display depth, as the prompt gives it none

## What

Read the room's compaction coverage seq on the client and leave covered rows out of `displayDepthsOf`, as `toShapeCanon` does on the server.

## Why

The prompt build gives no depth to rows its compaction summary covers, and the display count still counts them. They are older than every uncovered row, so no uncovered row's depth differs. Only a covered row disagrees: a depth-bounded display script with a wide max can still draw on a covered row that the prompt treats as having no position.

## Done when

A covered row takes no display depth, and tests/client/features/chat/lib/display-row\.test.ts (on its branch) has a case for it.

## Evidence

Filled at landing: what ran and where its output is.
