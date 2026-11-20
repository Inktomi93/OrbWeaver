---
kind: work
status: doing
updated: 2026-11-20
priority: P2
area: ui
lane: wt/agent-a08e6a0b2439f66f2
plan: cross-surface-consistency
---

# One content pane template owns the scroll edge, the column and the header band

## What

No owner holds the main pane's side inset, content column or header band, so each section decides: at 1920 wide with both side panes open, content starts at five different x positions and the scroll box ends at four. The section inset is applied outside the scroller by three owners: contentInset in packages/client/src/state/section-registry.ts with RegionAnchor's inset in packages/client/src/features/app-shell/anchors/region-anchor.tsx (Presets, Characters, Corpus, Databank, Refinery), Settings by hand in packages/client/src/features/config/surfaces/config-content-surface.tsx, and Home, Chats landing and Extensions inside their scroller. That floats the scrollbar off the pane edge and leaves dead wheel strips. Bodies pick one of six width caps; EditorPage is used only by member editors, and the Settings rows cap and sit left (packages/client/src/components/setting-row-group.tsx). Header bands are hand-built per editor (packages/client/src/features/preset/components/preset-editor-header.tsx). Add a ContentPane template beside EditorPage that is the one scroller of a content body with the inset inside it, a centred column (column, instrument, or full with a stated reason) and an optional pinned band drawn across the pane with its content on the column; delete contentInset and RegionAnchor's inset; move every content root onto it; let the Settings pane use the column and drop its row cap; name ContentPane as the owner in UI-Architecture-and-Layout.md.

## Why

Each section improvising its own geometry gives the owner-visible jank of a floating scrollbar, dead wheel strips, a band that misses its own title and a dead right gutter, and fixing it page by page means chasing it forever.

## Done when

Every content section renders through ContentPane; contentInset and RegionAnchor's inset are gone; at 1920, 1280 and a phone width every section's column edges, band edges and scroll edge match the template's values, measured; the layout law names the owner; a component test pins the template's geometry; a motion check covers the pane slide.

## Evidence

Filled at landing: what ran and where its output is.
