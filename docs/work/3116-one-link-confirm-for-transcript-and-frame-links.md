---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: chat
---

# One link confirm for transcript and frame links

## What

Markdown links in the main document open through Streamdown's own link-safety modal; links inside a reply frame open through the client's ConfirmDialog with the same copy, because Streamdown's modal is not exported.

## Why

Two confirms for one action are separate places for the copy and the behaviour to drift.

## Done when

Both link paths open through one confirm component, proven by a CT clicking a link in each.

## Evidence

Filled at landing: what ran and where its output is.
