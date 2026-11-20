---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: client
---

# The image switch gloss matches the limit guesses' size

## What

In the limits step the Takes images gloss renders at 10.5px while each limit's Our guess line renders at 13px (packages/client/src/features/credentials/components/connection-image-switch.tsx, voice gloss).

## Why

One Our guess grammar at two sizes reads as two kinds of fact, and 10.5px is hard to read at phone width.

## Done when

The switch gloss and the field guesses render in the same voice and size.

## Evidence

Filled at landing: what ran and where its output is.
