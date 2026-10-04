---
kind: bug
status: open
updated: 2026-10-04
priority: P3
area: ui
---

# The pinned header band matches across chat styles on touch

## What

On a coarse pointer the sticky band shows 16 px of fill under the name against tide's 8 px, and the action rail ends flush with the body (message-row-header.tsx comment near the frame is stale). Final visual pass; review: ~/homelab/development/probe-archive/side-eye-reviews/final-pass-1-rails-home.md.

## Why

Launch visual pass finding.

## Done when

The pinned band height matches across styles on touch and the comment is current.

## Evidence

Filled at landing: what ran and where its output is.
