---
kind: work
status: open
updated: 2026-11-11
priority: P3
area: docs
---

# Comments with a single-digit numbered reference name their section or lose the number

## What

The comment sweep for item 2444 left comment lines that carry a single-digit numbered reference, most of them under packages/server/src, with some in packages/db and packages/contracts. Some name a row of a law section, such as an invariant of a named doc, which the comment law allows. Others are plan-local numbers with no anchor, such as a numbered owner ruling or a numbered persona. The same sweep left the comments that say what code did before, which are mostly present-tense warnings; the lane's report holds the counts by tree.

## Why

A number with no named section cannot be followed, which is the defect item 2444 removed for issue numbers.

## Done when

Each such comment names the law section its number belongs to, or states its point without the number. A read of the before-and-after comments has rewritten the ones that are history and kept the ones that warn.

## Evidence

Filled at landing: what ran and where its output is.
