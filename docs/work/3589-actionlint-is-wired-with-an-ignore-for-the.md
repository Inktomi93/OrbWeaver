---
kind: tooling
status: open
updated: 2026-11-20
priority: P3
area: tooling
---

# Actionlint is wired with an ignore for the local setup action path

## What

Actionlint reports hard format errors on every use of the local setup action path written as `$/.github/actions/setup`. GitHub accepts the form and CI runs green. Add an ignore for that pattern in the actionlint configuration when the existing item that wires actionlint into a check lands.

## Why

Without the ignore, wiring actionlint into a gate fails a tree that passes CI.

## Done when

Actionlint runs over the workflows and passes with the ignore recorded and its reason in the config.

## Evidence

Filled at landing: what ran and where its output is.
