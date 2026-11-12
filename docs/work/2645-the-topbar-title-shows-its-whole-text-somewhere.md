---
kind: bug
status: open
updated: 2026-11-12
priority: P2
area: client
plan: surface-walk
---

# The topbar title shows its whole text somewhere a sighted person can reach

## What

The chat topbar title (packages/client/src/features/chat/components/chat-header-title.tsx) and the narrow screen name (packages/client/src/features/app-shell/components/shell-topbar.tsx) cut a long title with an ellipsis, and nothing near them shows the rest: there is no tooltip, and the rename field opened from the title shows only the room name, itself cut, while the participants stay cut. A long cast or room name is unreadable from the topbar at every text size, on desktop and phone. Ruling: a title in a one-line chrome bar may cut its text only when its accessible name carries the whole title, the whole title can be read from that control without leaving the surface, and it never shrinks under its floor. The name and the floor hold today; the second condition does not. Measurements: the topbar title conditions page under reports/cb-walk-text.

## Why

The title is the only place the room's cast and name appear together, and it accounts for most of the desktop enlarged-text walk findings and every reading-style failure there.

## Done when

The whole title, participants and room name, is readable from the title on desktop and phone at standard and enlarged text, through a tooltip or the surface the title opens, proved by a component test over the production shell. The ruling's bullet lands in docs/law/ui-platform-rulings.md, and the walk's probe lists the title's slot apart.

## Evidence

Filled at landing: what ran and where its output is.
