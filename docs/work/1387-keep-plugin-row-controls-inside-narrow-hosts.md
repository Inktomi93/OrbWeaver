---
kind: bug
status: open
updated: 2026-10-27
priority: P2
area: client
---

# Keep plugin row controls inside narrow hosts

## What

Make the shared plugin row renderer reflow whole controls within the available host width. Card Atlas currently requires horizontal scrolling to reach the full SFW switch on a phone.

## Why

At 390px, the switch spans x366–430 while its nested scroll host is 390px wide. The closed guest row contract exposes no wrapping option; a root overflow PASS does not prove child control containment.

## Done when

Preserve the existing SDK, grants, always-visible filter controls and coarse touch floors. Qualify the production Atlas row in portrait, landscape and narrow desktop containers, plus pager/action-row positive cases. Use existing primitives; do not add Atlas CSS or change the global Row default.

## Evidence

Filled at landing: what ran and where its output is.
