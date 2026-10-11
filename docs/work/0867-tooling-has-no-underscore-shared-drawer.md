---
kind: tooling
status: doing
updated: 2026-10-11
priority: P2
area: tooling
lane: wt/agent-ab4068ef65b2864f9
---

# Tooling has no underscore shared drawer

## What

tooling/src/\_shared holds a large drawer (browser capture and emulation, git, process, ports, appearance, artifacts and more) and tests/tooling/\_shared mirrors it, against docs/law/Core-0-Architecture-and-Structure.md rule 3 (no underscore junk drawers).

## Why

The architecture law's crowning claim is false while the drawer exists.

## Done when

tooling/src/\_shared and tests/tooling/\_shared are gone; their files live in role-named folders with the test tree mirroring src; every importer and every gate or doc citing \_shared paths is updated; no folder named \_shared remains in the repo.

## Evidence

Filled at landing: what ran and where its output is.
