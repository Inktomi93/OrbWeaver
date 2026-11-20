---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: ui
---

# Give the shared dialog body a scroll cue

## What

The dialog body (DialogBody in packages/ui/src/layout/dialog-body.tsx, drawn by DialogFrame in packages/client/src/components/form-dialog.tsx) scrolls with overflow-y-auto and no cue: no fade, no scrollbar skin. At 200 percent text the preset import summary is cut mid-sentence at the body's edge and nothing says more is below. The Stack scrollFade prop and useScrollFadeY already exist for a self-scrolling surface.

## Why

Every dialog with a tall body at enlarged text or on a short phone hides content with no sign that it scrolls. A per-dialog fix leaves the rest cut.

## Done when

DialogBody shows the shared scroll-fade cue only on the edge that hides content, a CT pins it at enlarged text in one commit dialog, and the preset import dialog needs no local scroll region beyond its dropped-settings list.

## Evidence

Filled at landing: what ran and where its output is.
