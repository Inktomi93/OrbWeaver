---
kind: work
status: doing
updated: 2026-10-25
priority: P3
area: client
lane: closeout/rendered
plan: test-foundation
---

# Focus moves in five feature flows have a CT

## What

The DOM-lock rewrite moved focus to refs in flows that no CT pins: greeting remove, plugin hide (focus now lands on the shell main region, not the chat room surface), tag apply, connection fact-row focus and the refinery landing search (mount refinerySection through useSectionRegistry, serve character.list, call requestRefineryLandingFocus). The InlineFlankFitProbe sentinel width is unmeasured; it is reachable only in the full chat room. Model picker centring with a picked id in both Recent and its group is unpinned.

## Why

Each rewrite changed which code finds the focus target; without a CT a wrong target or an accessible-name change ships silently.

## Done when

Each flow has a CT through the real door that goes red on a planted wrong target; the plugin-hide target is ruled and recorded; the sentinel width is measured in an e2e or CT.

## Evidence

Filled at landing: what ran and where its output is.
