---
kind: tooling
status: open
updated: 2026-11-11
priority: P3
area: tooling
plan: checked-law
---

# Tooling tests wait on real deadlines with the wall clock

## What

`Date.now` reads in `tests/tooling` measure subprocess and page deadlines (`floor/process`, `dev/lib`, `dev/ops`, `snap/ops`), and the determinism selectors follow the test syntax block, which leaves `tests/tooling` out.

## Why

The determinism law names no tooling exemption.

## Done when

Each site injects a clock or reads a real lifecycle signal, and the tooling test block composes the determinism selectors at zero.

## Evidence

Filled at landing: what ran and where its output is.
