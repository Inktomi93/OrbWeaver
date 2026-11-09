---
kind: bug
status: doing
updated: 2026-11-09
priority: P2
area: client
lane: wt/agent-a68b323e72355d03f
plan: cross-surface-consistency
---

# Evidence walk: label-content-name-mismatch on the rails and Characters, Chat, Config

## What

The axe rule label-content-name-mismatch fails in the desktop-1440-all-panes-evidence walk on the rails and Characters, Chat, Config. Runs: surface-Nn5cKU, surface-q297LL, surface-2sWzKu under ~/.local/state/orbweaver/surface-walk; each case's error-context.md lists every subject.

## Why

A control whose accessible name does not start with its visible label breaks speech input and screen reader matching.

## Done when

The label-content-name-mismatch finding is gone from these surfaces' evidence checkpoints, fixed at the shared owner, or each remaining subject is answered with a cited reason. A false positive goes to the audit engine with a fixture instead.

## Evidence

Partial, in 9d02fc25cb: Avatar initials paint from data-initials through a pseudo-element, so a control wrapping an avatar no longer carries the initials in its visible label (face-strip-tile.ct.tsx, red on main); Band spaces its label, census and marks (band-name.ct.tsx, red on main); the Talkativeness chip spaces its level (talkativeness-name.ct.tsx, red on main). ListRow and the menu-item subtitle rows stay as they are: owner ruling #512 (packages/ui/src/primitives/list-row/list-row\.tsx header) names a row by its title and gives the subtitle as its description, accepting this axe rule on every subtitled row, and the surface-walk plan's vendor options keep a vendor violation visible where it conflicts with a production naming policy, so the audit does not reclassify those nodes. Still open: tracker value Status line, automation switch rows with their description inside the button, collapsible-trigger, card-root Resume Image variant.
