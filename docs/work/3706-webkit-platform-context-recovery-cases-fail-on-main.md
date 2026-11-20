---
kind: bug
status: open
updated: 2026-11-20
priority: P2
area: client
plan: test-foundation
---

# WebKit platform-context-recovery cases fail on main

## What

The chat lane found the WebKit platform-context-recovery suite red on a clean tree, run with pnpm test:ct:webkit. The WebKit Playwright build was only reinstalled on this box today, so the suite may have been red unseen for a while.

## Why

A red platform suite on main hides any new WebKit regression.

## Done when

The suite passes on WebKit on main, or each failing case is proved a real product defect and boarded, with the cause named.

## Evidence

Filled at landing: what ran and where its output is.
