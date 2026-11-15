---
kind: bug
status: open
updated: 2026-11-15
priority: P2
area: appearance
---

# Matrix cell v01 fails header-structure on the provisioned room

## What

In cell v01-bf36816fab27 the row dark-name-time-short-bubble fails header-structure: bubble/name-row/attribution/timestamp sampled 5/5/4/4, against an expectation of equal counts. The cell runs on an iPhone 14 Pro Max (430x740, coarse pointer), dark OS, contrast more, transparency reduced and the rated custom dark theme. Its appearance is bubble, compact, fontScale 1, readingBodyScale 1.6, readingLineHeight 1.2, showTimestamps, messageActions expanded, chatWidthPct 60. Not yet classified as product or instrument. Lead: in tooling/src/snap/ops/appearance-invariant-dom.ts, bubble and name-row are geometry samples while attribution and timestamp are pixel samples, and a pixel sample is dropped when it is occluded or off-viewport. The anchor in appearance-surface-drive.ts centres only the first attribution. One row's header under the topbar or composer would give exactly 5/5/4/4. The provisioned transcript alternates You and the character over 6 messages, so a shared name row for consecutive messages is not the cause.

## Why

Until it is classified, the matrix cannot say whether a user on that appearance loses a name or timestamp.

## Done when

A per-row DOM dump of that cell names which subject fell out and why. If it is the sampler, the check compares per-row structure (each sampled bubble's row has one name row, attribution and timestamp), not visibility-filtered counts across sample kinds. If it is the product, the missing ink is fixed with a CT that goes red first.

## Evidence

Filled at landing: what ran and where its output is.
