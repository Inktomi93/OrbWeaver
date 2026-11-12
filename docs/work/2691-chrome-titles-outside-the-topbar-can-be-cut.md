---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: client
plan: cross-surface-consistency
---

# Chrome titles outside the topbar can be cut with no way to read the whole text

## What

The ruling in `docs/law/ui-platform-rulings.md` lets a one-line chrome title cut its text only when the whole text is reachable from that control. The topbar title now conforms. The client lane's survey lists titles that can still be cut with no reveal: the list band title in `packages/client/src/components/list-pane-header.tsx`, the title and captions of the context rail, and the analytics, corpus, regex, game takeover, preset readout, plugin surface shell and persona panel headers. The survey is in the lane's fix leg report under reports/lanes.

## Why

The ruling binds every chrome title, and the walk now reports each remaining one as a finding.

## Done when

Each listed title either cannot be cut at any width and text size or opens its whole text through the shared reveal, with a component test per header family, and the walk lists no cut chrome title.

## Evidence

Filled at landing: what ran and where its output is.
