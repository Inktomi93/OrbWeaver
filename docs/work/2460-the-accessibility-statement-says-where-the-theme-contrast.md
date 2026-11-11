---
kind: bug
status: doing
updated: 2026-11-11
priority: P3
area: docs
lane: wt/agent-a30ee1d42d1997dfe
---

# The accessibility statement says where the theme contrast check runs

## What

`ACCESSIBILITY.md` says shipped themes are checked at build time and that a failing theme fails the build. The check is the component test `tests/ui/content/theme-scope/emitted-contrast.ct.tsx`, which runs in CI, not in the build.

## Why

A public claim should name the check that exists.

## Done when

The passage says the component tests check each shipped theme and names the test file.

## Evidence

Filled at landing: what ran and where its output is.
