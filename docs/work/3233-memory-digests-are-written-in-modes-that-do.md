---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: chat
---

# Memory digests are written in modes that do not search by vector

## What

Writing a digest needs an embed binding even in modes that do not search by vector. Write digests with no binding in such modes, or have setup state the requirement before the first turn.

## Why

Memory silently writes nothing, or fails, for a user who never asked for vector search.

## Done when

A test in a non-vector mode with no embed binding writes digests, or setup shows the requirement before the first turn.

## Evidence

Filled at landing: what ran and where its output is.
