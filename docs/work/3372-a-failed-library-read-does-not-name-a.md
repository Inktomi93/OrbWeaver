---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: chat
---

# A failed library read does not name a live script as gone from the library

## What

Tell a failed host-library read apart from an id the library does not hold, and word the notice for each.

## Why

scriptOf in packages/client/src/features/chat/components/chat-content.tsx maps a read failure to null, so a live script reads as no longer in your library. Code review of ee979313d0, Combined tip delta (reports/code-reviewer/-cb-review-regex-client.md in agent-a8071996f9c5e8978).

## Done when

A notice raised during a failed library read does not claim the script is gone, and a CT plants the failed read.

## Evidence

Filled at landing: what ran and where its output is.
