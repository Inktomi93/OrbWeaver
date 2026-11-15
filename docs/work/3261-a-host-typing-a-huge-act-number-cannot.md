---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: rpg
---

# A host typing a huge act number cannot freeze the act rail

## What

The act rail parses the host's act number with parseInt and clamps only the low end, then buildPlotEdit in packages/client/src/features/rpg/lib/plot-edit.ts pads untitled acts in a loop up to that number before the edit is sent. The server refuses the saved plot above the plot act maximum, but the browser loop runs first.

## Why

One typo such as a long run of nines hangs the host's own tab before any request leaves, and the rail draws one stop per act it was given.

## Done when

The rail clamps the typed act to the plot act maximum from the contracts package before it reaches the padding loop, and a component case types a number far above the maximum into the act field and sees the field settle on the maximum without freezing.

## Evidence

Filled at landing: what ran and where its output is.
