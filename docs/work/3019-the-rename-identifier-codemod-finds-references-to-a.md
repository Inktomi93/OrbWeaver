---
kind: tooling
status: open
updated: 2026-11-14
priority: P3
area: tooling
---

# The rename-identifier codemod finds references to a name exported through a package export map

## What

The codemod in `tooling/src/codemods/rename-identifier` renamed a contracts schema's declaration and found no reference to it, in other files or in its own file. The rename was finished with `tooling/src/codemods/move-import-names` and hand edits.

## Why

A rename that reports success with importers left on the old name breaks the build, or passes if an alias remains.

## Done when

The codemod renames every reference to a name imported through a package export map and in the declaring file, with a fixture for each.

## Evidence

Filled at landing: what ran and where its output is.
