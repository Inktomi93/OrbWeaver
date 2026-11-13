---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: client
plan: cross-surface-consistency
---

# A settled streaming row keeps its height on touch

## What

At a touch pointer on the document chat style, the streaming row grows by one actions bar line when it settles, so the transcript jumps.

## Why

A row that changes height under the reader moves the text they are reading.

## Done when

The streaming row reserves or draws its actions line so its height is the same before and after it settles, with a component test that measures both.

## Evidence

Filled at landing: what ran and where its output is.
