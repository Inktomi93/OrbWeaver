---
kind: adr
status: active
updated: 2026-09-23
---

# The brand mark is the Open Orb, one emblem at every scale

## Context

The favicon, spinner, boot loader and login backdrop were separate pictures, and the old favicon read as a ship's helm at tab size. The owner chose a mark among three directions.

## Decision

The mark is direction A, the Open Orb: spokes, one open spiral, a hub and a dew drop. It is the settled final frame of the boot weave, so favicon, `WebSpinner`, boot loader and login backdrop are one emblem at different scales. The favicon is a separate small-size cut with fewer spokes and heavier strokes, never the display mark scaled down, and carries the ember color because a tab icon cannot inherit page color. The wordmark is lowercase `orbweaver` in Geist semibold with an ember first letter. Assets: `packages/client/public/favicon.svg`, `packages/client/public/brand/orb-mark.svg`.

## Consequences

A change to the weave's settled frame is a change to the brand mark, and the reverse.

## Alternatives rejected

- The Weaver, a hanging spider: the strongest tab silhouette, but it puts a spider in every tab.
- An o-web monogram: ties mark and wordmark together, but early cuts read as a search icon at tab size.
