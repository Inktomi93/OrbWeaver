---
kind: work
status: open
updated: 2026-11-07
priority: P3
area: server
plan: test-foundation
---

# The Databank count matches the phase filter too

## What

The Databank list's totalCount uses the same filter as the rows, but only the search case is tested; the phase filter is not.

## Why

A filtered count that drifts from its rows reads as missing documents.

## Done when

A server test proves totalCount matches the phase filter and fails on an unfiltered count.

## Evidence

Filled at landing: what ran and where its output is.
