---
kind: work
status: open
updated: 2026-11-08
priority: P3
area: tooling
---

# The diagnostics workflow test checks the upload-artifact pin by its shape

## What

tests/tooling/select-cpu-diagnostic-workflow\.test.ts asserts the upload-artifact action by a literal SHA, so every Dependabot bump has to edit the test. Assert the pin's shape (a full commit SHA with a version comment) instead.

## Why

A test that restates a pinned value breaks on every routine bump and proves nothing the pin itself does not.

## Done when

The test passes across an upload-artifact bump without an edit, and fails when the action is referenced by a tag instead of a SHA.

## Evidence

Filled at landing: what ran and where its output is.
