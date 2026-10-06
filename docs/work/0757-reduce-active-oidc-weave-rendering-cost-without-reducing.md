---
kind: bug
status: doing
updated: 2026-10-06
priority: P2
area: ui
lane: codex/launch-weaver
---

# Reduce active OIDC weave rendering cost without reducing interaction

## What

Optimize the measured active rendering cost in packages/ui/src/art/web-weave/. Preserve mouse and touch dragging, strand deformation, glow, spider motion and theme behavior.

## Why

Hardware-backed OIDC observations show active frame gaps and substantial strand drawing cost. Idle drawing remains steady. The owner wants visual fixes before launch.

## Done when

A matching hardware-backed interaction comparison shows reduced rendering cost without lost behavior or visible degradation. Applicable scoped checks pass. Independent source and rendered reviews clear required findings.

## Evidence

Filled at landing: what ran and where its output is.
