---
kind: bug
status: open
updated: 2026-10-04
priority: P2
area: plugin
---

# Plugin panel host controls sit two collapsed levels deep

## What

Story Clocks host controls are under This chat, then Host controls, then Plugin panels, all collapsed. The flank says the host starts one below, but nothing shows below it. Screenshot: main-1990041-2026-10-04T21-23-26-528Z/fp2-stc-band.png. Final pass leg 2; review: ~/homelab/development/probe-archive/side-eye-reviews/final-pass-2-plugins.md.

## Why

The host cannot find the controls the flank points to.

## Done when

The flank's pointer leads to visible host controls, or the controls sit where the flank says, checked on desktop.

## Evidence

Lane S6: grafted host-control sections start closed by an earlier ruling (Rules measured 704px on desktop); the fix is either flank copy in the Story Clocks bundle or changing graft defaults against that ruling.
