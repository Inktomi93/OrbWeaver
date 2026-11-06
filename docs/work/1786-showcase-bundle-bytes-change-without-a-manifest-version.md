---
kind: bug
status: open
updated: 2026-11-06
priority: P3
area: plugins
plan: unwired-code
---

# Showcase bundle bytes change without a manifest version bump, so seeded installs keep the old bytes

## What

Add a check that fails when a showcase bundle's bytes change and its manifest version does not.

## Why

A seeded install keeps the bytes it already has when the version is unchanged, so a changed bundle never reaches existing installs.

## Done when

A planted showcase bundle with changed bytes and the same version fails the check. The same bundle with a bumped version, and an unchanged bundle, pass.

## Evidence

Filled at landing: what ran and where its output is.
