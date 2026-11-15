---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: plugin
---

# The display-transform verb header cites the regex-scripts ruling for its refusal posture

## What

The header of `packages/server/src/domain/plugin/verbs/transform-for-display.ts` says the refusal posture is the regex-scripts ruling's, verbatim. That ruling is about where regex scripts attach and holds no plugin skip-on-throw posture. No other ADR title names the display-transform skip posture.

## Why

The containment of every display-transform fault is the ruling that lets that catch answer a constant. A cite that resolves to an unrelated ruling leaves the containment unanchored.

## Done when

The header cites the ADR that rules a throwing or overrunning display transform is skipped, or the ruling is minted and cited.

## Evidence

Filled at landing: what ran and where its output is.
