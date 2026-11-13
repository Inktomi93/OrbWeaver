---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: client
plan: cross-surface-consistency
---

# An unknown unavailable cause shows a generic reason on Send

## What

When the send-availability read answers a cause the client does not know, the composer disables Send and shows an empty reason.

## Why

A disabled button with no reason leaves the user with nothing to act on.

## Done when

An unknown cause shows generic text from the copy module, with a component test that feeds one.

## Evidence

Filled at landing: what ran and where its output is.
