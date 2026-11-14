---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: server
---

# Substrate tests follow their moved modules

## What

The substrate purity work moved modules out of `substrate/` and updated each test's subject header. The test files still sit in the mirror folders of the old paths under `tests/server/domain/`.

## Why

A test far from its subject is found late, and the mirror layout is how a reader finds a module's tests.

## Done when

Each moved module's test sits in the mirror folder of the module's new path and the named suites pass.

## Evidence

Filled at landing: what ran and where its output is.
