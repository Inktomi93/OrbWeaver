---
kind: work
status: open
updated: 2026-10-03
priority: P3
area: inference
---

# Sonnet 5.5 follow-ups

## What

Bundle from the Sonnet 5.5 lane: (1) bump the Claude Agent SDK and probe whether its CLI can send between_tools; if so, drop the agent-sdk mandatory row. (2) Probe a longer between_tools tool loop: off turns do not replay progress-note thinking on later hops, which the docs advise against. (3) WireMeta.effort has no producer; under between_tools a differing per-message effort is a 400; wire it with a guard or delete it. (4) The display updates beta is not modelled.

## Why

Found by the Sonnet 5.5 lane outside its done criteria.

## Done when

Each point built with a test, measured, or ruled.

## Evidence

Filled at landing: what ran and where its output is.
