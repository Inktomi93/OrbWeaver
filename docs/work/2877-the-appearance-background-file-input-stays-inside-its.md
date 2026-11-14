---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: client
plan: surface-walk
---

# The Appearance Background file input stays inside its dropzone at 300% text

## What

On Settings, Appearance, Background at 300% text on a phone, the Uploaded image file input paints past the dropzone that holds it. The dropzone is `packages/ui/src/primitives/file-dropzone/file-dropzone.tsx`.

## Why

A field past its box cannot be read or edited whole, and a dropzone narrower than its input hides where to drop.

## Done when

A component test in `tests/ui/primitives/file-dropzone/` mounts a dropzone in a 390px pane at 300% text. It asserts that the input's box lies inside the dropzone's box. It is red before the change and green after.

## Evidence

Filled at landing: what ran and where its output is.
