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

The staged member screenshot shows the section headings at different heights. Evidence: `reports/runs/snap/main-3487408-2026-10-05T01-12-29-777Z/run.json`. This is a visual observation, not a measured geometry verdict. The item remains open.

Re-measured at 1440x900 on a fresh install: "Your first room" heading top 153 px (band top), "Rosters" heading top 163 px. The 10 px offset reproduces. Run: `reports/runs/snap/agent-a46b39870d7116c01-3533786-2026-10-24T13-11-01-335Z`.

Cause: `TileBand` gave only bands with a declared action the control min height, so the Rosters heading sat centred in a taller band than the actionless hearth band.

Fix: the first tile of a column also takes the control height (`home-tile.tsx`, `group-first/tile:min-h-control-sm`). Measured after: both headings at 163 px, columns 730 / 643 (87 px gap, unchanged). Run: `reports/runs/snap/agent-a46b39870d7116c01-3594782-2026-10-24T13-20-02-428Z`. Container-clone house after: both at 163 px. Run: `reports/runs/snap/agent-a46b39870d7116c01-3605466-2026-10-24T13-22-03-787Z`. Phone 390x844 has one column and a settled layout. Run: `reports/runs/snap/agent-a46b39870d7116c01-3596119-2026-10-24T13-20-17-494Z`.

Growing every band instead pushed the fresh columns to 768 / 643 (125 px), past the 120 px budget; that is why only the first tile of a column grows. No Home layout CT exists, so the snap runs are the proof.
