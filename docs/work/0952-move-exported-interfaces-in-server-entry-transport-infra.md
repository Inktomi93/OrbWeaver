---
kind: work
status: open
updated: 2026-10-12
plan: test-mirror
---

# Move exported interfaces in server entry, transport, infra, foundation and inference into their type homes

## What

Item 923 added a gate over exported interfaces in server entry, transport, infra and foundation and in inference, and baselined each hit as a waiver naming this item. Move each interface to its type home under Spine-TypeScript-and-Patterns section 7.4, or derive it from the shape that home owns, and delete the marker.

## Why

Section 7.4 bans exported interfaces outside the type homes; a shape declared in an edge tier drifts from the contract or domain shape it copies.

## Done when

No waiver naming this item remains and the gate's budget row is gone.

## Evidence

Filled at landing: what ran and where its output is.
