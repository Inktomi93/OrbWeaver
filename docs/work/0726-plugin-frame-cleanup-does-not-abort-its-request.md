---
kind: bug
status: open
updated: 2026-10-04
priority: P3
area: plugin
---

# Plugin frame cleanup does not abort its request

## What

Every frame unmount logs DELETE /api/plugin-frame/<id> as 204 net::ERR_ABORTED, likely cleanup racing navigation; it reddens every snap run while a frame plugin is on. Final pass leg 2 (plugins); review: ~/homelab/development/probe-archive/side-eye-reviews/final-pass-2-plugins.md.

## Why

Plugin final pass finding.

## Done when

Frame cleanup completes or is fire-and-forget without an aborted request in the console.

## Evidence

Filled at landing: what ran and where its output is.
