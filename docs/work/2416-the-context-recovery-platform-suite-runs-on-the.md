---
kind: bug
status: open
updated: 2026-11-10
priority: P3
area: testing
plan: test-foundation
---

# The context recovery platform suite runs on the WebKit iPhone project

## What

tests/client/features/app-shell/surfaces/platform-context-recovery.suite.ct.tsx fails most of its cases on the webkit-iphone project: its helper clicks a Show details toggle the iPhone layout never draws. It fails the same way on main before the type-law changes.

## Why

The suite claims WebKit coverage of context recovery and proves none on the phone layout.

## Done when

The suite's helper opens the context surface through the control the phone layout actually draws, and the suite passes on webkit-iphone.

## Evidence

Filled at landing: what ran and where its output is.
