---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: ui
---

# The picture button has one tv() export

## What

`packages/ui/src/primitives/picture-button/variants.ts` exports a second `tv()`, `pictureCueVariants`, beside the one named for the primitive. `tests/ui/primitive-trio.test.ts` fails on it on main.

## Why

The primitive rule gives each primitive one variants export so its parts carry one name, and the test that holds it is red.

## Done when

The cue is a slot of the primitive's one `tv()` export, the trio test passes, and the button renders the same, shown by its existing component tests.

## Evidence

Filled at landing: what ran and where its output is.
