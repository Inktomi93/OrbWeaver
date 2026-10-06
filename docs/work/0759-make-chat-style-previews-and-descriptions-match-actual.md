---
kind: bug
status: doing
updated: 2026-10-06
priority: P2
area: ui
lane: main
---

# Make chat style previews and descriptions match actual rendering

## What

Compare every chat display style with its real transcript renderer. Correct inaccurate option descriptions and miniature preview geometry, artwork and placement. Preserve existing style behavior and selection.

## Why

The owner identified misleading chat style previews in the wiki capture. The picker must show the appearance users actually select.

## Done when

Every style preview and description agrees with actual rendered messages. Representative artwork, paragraph layout, header placement and role alignment remain readable in narrow and wide picker hosts. Meaningful scoped checks and independent rendered review pass. Replace the affected wiki screenshot.

## Evidence

Implementation is integrated at `0a0de93fac7b2980dbd521732f8683d01e758faf` from `6bfd980928666503ea631857be37016e4a813dad`. Independent source and rendered reviews cleared the required corrections. Native PNG inspection confirmed the Light artwork. Matching scoped behavioral, compiler and static checks passed. Wiki screenshot replacement and combined product verification remain required.
