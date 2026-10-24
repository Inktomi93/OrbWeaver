---
kind: bug
status: open
updated: 2026-10-24
priority: P3
area: tooling
---

# The rename-identifier codemod misses cross-file references

## What

`tooling/src/codemods/rename-identifier` renames a declaration but its cross-file `references()` resolves nothing on this tree, so importers keep the old name and the rename only touches the declaring file. The lane that renamed four rows-tier seeds had to run `move-import-names` over 13 importers to finish the job. The likely cause is the repository's `.ts`-extension import specifiers.

## Why

A rename codemod that renames one file is a find-and-replace with a fixture tax; the point of the codemod is the references.

## Done when

A `tests-crossfile` fixture with a `.ts`-specifier import proves the rename reaches the importer and its local alias; the codemod's README or header states which specifier forms it resolves; the fixture suite passes.

## Evidence

Filled at landing: what ran and where its output is.
