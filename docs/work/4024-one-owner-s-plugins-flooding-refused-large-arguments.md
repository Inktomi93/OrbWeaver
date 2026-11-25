---
kind: bug
status: doing
updated: 2026-11-25
priority: P3
area: security
lane: wt/agent-a220f2b48f0e6dc9a
---

# One owner's plugins flooding refused large arguments cannot push the plugin broker past its memory ceiling

## What

Several Workers of one owner sending a stream of host calls whose large arguments the membrane refuses still grow the broker's resident memory past its ceiling, because the refused argument bytes are buffered before the refusal; a per-Worker heap limit does not bound it, and a tight one ends honest Workers.

## Why

Crossing the broker ceiling stops the plugin host for every owner on the box.

## Done when

Refused argument bytes are bounded per owner before they are buffered, with a case of one owner's Workers flooding refused calls that keeps the broker under its ceiling and an honest Worker of another owner served.

## Evidence

Filled at landing: what ran and where its output is.
