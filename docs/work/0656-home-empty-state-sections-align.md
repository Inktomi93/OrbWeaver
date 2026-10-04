---
kind: bug
status: open
updated: 2026-10-04
priority: P3
area: client
---

# Home empty-state sections align

## What

On a fresh install the 'YOUR FIRST ROOM' kicker sits 10 px above 'ROSTERS' (fp1-boot.png). Final visual pass; review: ~/homelab/development/probe-archive/side-eye-reviews/final-pass-1-rails-home.md.

## Why

Launch visual pass finding.

## Done when

The section tops align.

## Evidence

Lane S3 tried a minimum band height on every Home tile band; it broke the Home REGIONS layout tests, so it was reverted. Needs measurement against those tests and live data.
