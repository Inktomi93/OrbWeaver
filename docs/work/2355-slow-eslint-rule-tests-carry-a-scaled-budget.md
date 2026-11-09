---
kind: tooling
status: open
updated: 2026-11-09
priority: P3
area: tooling
plan: test-enforcement
---

# Slow eslint rule tests carry a scaled budget or a faster fixture

## What

eslint-container-ownership and eslint-opaque-variant-spread run cases of three to four seconds against the five-second default timeout, so they fail under load; eslint-ct-responder and eslint-tests-coverage are close behind.

## Why

A tooling test that fails only under load is noise that hides real reds.

## Done when

Each of these files runs its cases well under the default timeout through a shared parsed program or a smaller fixture, and passes under the box's normal load.

## Evidence

Filled at landing: what ran and where its output is.
