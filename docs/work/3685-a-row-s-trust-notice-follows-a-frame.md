---
kind: bug
status: doing
updated: 2026-11-20
priority: P3
area: chat
lane: wt/agent-ae2df25e70dc0ee58
plan: chat-html-and-presets
---

# A row's trust notice follows a frame whose later serve narrows its grant

## What

The Character trust notice on a row is built from what each frame's mint grant reports. When a later serve of the same frame narrows its grant, the notice keeps the earlier report until the frame is minted again.

## Why

The notice under-reports what is held back. It never widens what a frame may do, but the user sees a stale reason.

## Done when

A frame's narrower grant on a later serve updates the row notice, and a CT covers a grant that narrows after the first report.

## Evidence

Filled at landing: what ran and where its output is.
