---
kind: work
status: doing
updated: 2026-10-07
priority: P1
area: security
lane: codex/local-hook-floor
---

# Adjudicate scanner findings against their analyzed branches

## What

Classify current CodeQL and Scorecard findings against main and release source, and repair verified current defects.

## Why

Scanner alerts can refer to the stable branch while integration carries different source.

## Done when

Every open finding has source-backed disposition and meaningful proof for required repairs, without weakening scanners or promoting release.

## Evidence

Filled at landing: what ran and where its output is.
