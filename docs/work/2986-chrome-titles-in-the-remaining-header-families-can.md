---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: client
---

# Chrome titles in the remaining header families can be cut with no reveal

## What

The list band title now opens its whole text through the shared reveal. The context rail title and captions, and the analytics, corpus, regex, game takeover, preset readout, plugin surface shell and persona panel headers still truncate a title with no way to read the whole text. Each needs the shared reveal or a width that cannot cut, with a component test per header family at enlarged text on a phone.

## Why

The chrome-title ruling binds every one-line chrome title, and the enlarged-text walk reports each cut title outside the reveal box as a finding.

## Done when

Each listed title either cannot be cut at any width and text size or opens its whole text through the shared reveal, with a component test per header family, and the walk lists no cut chrome title.

## Evidence

Filled at landing: what ran and where its output is.
