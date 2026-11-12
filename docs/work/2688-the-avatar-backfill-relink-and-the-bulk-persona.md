---
kind: bug
status: doing
updated: 2026-11-12
priority: P3
area: security
lane: wt/agent-a84eabc3e8d8f0a49
---

# The avatar backfill relink and the bulk persona import check the avatar's asset kind

## What

Character and persona avatar writes now refuse an asset that is not an image kind. The avatar backfill relink and the bulk persona import still check ownership only. Both use picture assets the host stored itself, so no bad link is reachable today. Evidence: the security review of the lane's fifteenth leg under reports/review.

## Why

The rule that an avatar is an image kind should hold at every writer, so a later change to either path cannot link a non-picture.

## Done when

Both writers refuse a non-image asset kind with the same coded reason, with a test through each production verb.

## Evidence

Filled at landing: what ran and where its output is.
