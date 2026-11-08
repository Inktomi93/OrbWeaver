---
kind: work
status: open
updated: 2026-11-08
priority: P3
area: tests
plan: test-foundation
---

# Socket CTs that assert frame effects after mount await served()

## What

Other socket CTs assert the effect of scripted frames right after mount, so their deadline includes shell boot and the attach round trip.

## Why

That is the cause of the image-drop-notices flake and can flake the same way elsewhere under load.

## Done when

Each such CT awaits served() or a rendered witness of the frames before asserting, found by a sweep of routeOrbSocket callers.

## Evidence

Filled at landing: what ran and where its output is.
