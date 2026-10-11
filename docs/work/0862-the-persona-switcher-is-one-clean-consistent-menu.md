---
kind: bug
status: open
updated: 2026-10-11
priority: P2
area: persona
---

# The persona switcher is one clean, consistent menu

## What

Owner screenshots (~/Archives/orbweaver-reviews/persona-switcher-a.png and -b.png) of the persona switcher popover (persona-panel-surface.tsx, persona-this-chat-section.tsx): about eight text styles with no shared scale; the Applies Everywhere/This chat segmented block is oversized; the pin icon shows on an unrelated, unhovered row; hovering a name hides it; 'pinned' pill and pin icon say the same thing; a literal {{user}} renders in 'pinned · {{user}}'; black silhouette and orange initial placeholders mix; the room kicker shows the date title; 'Playing as' repeats in the header and the row; an 'oidc' badge shows an implementation detail.

## Why

Owner: a clusterfuck of fonts and sizes, and the Applies control looks gross.

## Done when

The popover uses the app's standard type steps (one row style, one kicker style); Applies is a compact select sized like a row; row affordances show only on hover or focus of that row and never hide the name; pinned state is the pin icon alone; no raw macro renders; one avatar placeholder style; the room label uses the shared participant title; Playing as appears once; auth method badges are dropped; CTs cover the row affordance visibility, no literal macro text and the Applies select, with snaps at desktop and phone.

## Evidence

Filled at landing: what ran and where its output is.
