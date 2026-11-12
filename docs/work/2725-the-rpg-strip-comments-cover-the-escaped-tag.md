---
kind: work
status: open
updated: 2026-11-12
priority: P3
area: rpg
plan: authorization-and-visibility
---

# The rpg strip comments cover the escaped tag

## What

The rpg tool-call strip comments describe the literal tag only. A tag whose opening bracket is JSON-escaped passes a strip over raw text unchanged, which is why the strip decodes first.

## Why

The comment understates the reason for the design, so a later change could strip the raw text again.

## Done when

The comments state the escaped-tag case as the reason for decoding first.

## Evidence

Filled at landing: what ran and where its output is.
