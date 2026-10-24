---
kind: bug
status: open
updated: 2026-10-04
priority: P3
area: client
---

# Home columns end level at 1440

## What

At 1440 the left column ends near y 590 and the right near 760. Final visual pass; review: ~/homelab/development/probe-archive/side-eye-reviews/final-pass-1-rails-home.md.

## Why

Launch visual pass finding.

## Done when

Columns balance at 1440.

## Evidence

Lane S3 shipped nothing: balancing the Home columns needs measurement against the Home layout balance tests and live data.

Re-measured at 1440x900 on the current tree (column bottoms in px, hearth / shelf):

- Container-clone house (rooms, rosters): 887 / 929, a 42 px gap. Run: `reports/runs/snap/agent-a46b39870d7116c01-3553918-2026-10-24T13-14-02-093Z`.
- Fresh install: 711 / 624, an 87 px gap, inside the 120 px budget in `home-surface.tsx`. Run: `reports/runs/snap/agent-a46b39870d7116c01-3533786-2026-10-24T13-11-01-335Z`.

The 590 / 760 gap from the pre-launch pass does not reproduce. Both houses sit inside the budget, so no balance change shipped. The 0656 fix leaves the fresh gap at 87 px (730 / 643, run `reports/runs/snap/agent-a46b39870d7116c01-3594782-2026-10-24T13-20-02-428Z`) and the clone house at 61 px (906 / 967, run `reports/runs/snap/agent-a46b39870d7116c01-3605466-2026-10-24T13-22-03-787Z`).
