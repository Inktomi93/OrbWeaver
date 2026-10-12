---
kind: work
status: open
updated: 2026-10-12
---

# Tests enter packages through public entries

## What

Each test that reaches a package through a root `#<pkg>/*` specifier holds a grant in the `tests-raw-package-reach` grant tables. Move each reach to the package's public entry or testing door, and export from the owning layer where a test needs a seam.

## Why

A raw reach couples a test to internal paths, so a refactor breaks tests that never tested that path, and the test stops proving the public contract.

## Done when

No rows remain in the `tests-raw-package-reach` grant tables and its budget row is gone.

## Evidence

Filled at landing: what ran and where its output is.
