---
kind: bug
status: doing
updated: 2026-11-25
priority: P2
area: tooling
lane: wt/agent-a1540a588e0ac9772
---

# The native npm ci case in the container security suite fails on main

## What

tests/tooling/container-security-config.int.test.ts "native npm ci executes a matching locked package" fails on main with ENOENT on the installed marker of its planted orb-integrity-control package, so npm ci in the temp project did not run that package's install script.

## Why

The case guards that the container's npm config still runs a locked package's scripts as configured; red on main hides whether the real config regressed or the box's npm changed.

## Done when

The case passes on main with the cause named (a config change, an npm version change on the box, or the case's own setup), and if the cause is the box, the case pins the npm behavior it depends on rather than the ambient install.

## Evidence

Filled at landing: what ran and where its output is.
