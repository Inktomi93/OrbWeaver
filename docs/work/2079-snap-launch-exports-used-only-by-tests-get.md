---
kind: tooling
status: doing
updated: 2026-11-08
priority: P3
area: tooling
lane: wt/agent-a9db028f1d127e510
plan: test-foundation
---

# Snap launch exports used only by tests get a production caller or a reach row

## What

ownedLaunchOptions, evidenceFor, applyLoadEmulation, LoadEmulationTarget and the bound input on stageBandViews are exported only for tests, and OwnedLaunch has no importer.

## Why

An export kept for a test widens the tool's surface and hides dead code.

## Done when

Each has a production caller, a reach row, or is removed, and knip stays clean.

## Evidence

Filled at landing: what ran and where its output is.
