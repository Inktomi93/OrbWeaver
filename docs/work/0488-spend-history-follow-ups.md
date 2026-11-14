---
kind: work
status: open
updated: 2026-11-14
priority: P2
area: stats
---

# Spend history follow-ups

## What

Generated-image spend is history: it is kept in its own ledger, as compaction spend is, so deleting a picture never lowers shown spend, and a stats rebuild gives the same total as the live path. Only turns count as character activity: the rebuild reads message times for last activity and ignores other writes to a chat. Compaction spend travels in the bundle. An image delta adds its generation time and cost samples with its counts.

## Why

Owner ruling: spend is money already paid, so a delete does not refund it on screen. Today a rebuild after a delete lowers the total, and a chat-metadata write moves a character's last activity.

## Done when

A server case through the composed root generates a picture, deletes it and rebuilds, and the shown spend is unchanged and equal on the live and rebuilt paths. A case shows a chat-metadata write leaves last activity unmoved on both paths. A bundle round trip keeps compaction spend. Image averages equal a rebuild's.

## Evidence

The launch cut discloses partial retained accounting without rebuilding absent telemetry. Its client controls passed scoped behavioral checks and independent source and rendered reviews. Implementation: `d9ff5c6704516c5f88c0d1b3dcfe675bd8d62183`.

The original accounting, restore, sample and owner-enumeration work remains open.

Also: extraction and caption spend (`packages/server/src/domain/imagery/verbs/generate-picture.ts:262`) never reach stats at all; reconcileStats all-owner mode enumerates only owners with characters.

Also: the TSDoc of reconcileOwnersMissingTimeline (`packages/server/src/domain/stats/persistence/rebuild-from-canon.ts:91`) should name owners whose generated assets were deleted among the per-boot re-run cases; the model_stats-only case of the heal predicate (unpriced generations) has no test of its own.
