---
kind: bug
status: doing
updated: 2026-11-08
priority: P3
area: server
lane: wt/agent-ac4fec0a6f2153940
plan: cross-surface-consistency
---

# The folder preview counts equal the final import report counts

## What

The SillyTavern folder import preview and the final report count items in two places, so their numbers can differ.

## Why

A preview that promises one number and a report that shows another reads as lost data.

## Done when

One counting function feeds both, and a test asserts equality on a corpus folder.

## Evidence

Filled at landing: what ran and where its output is.
