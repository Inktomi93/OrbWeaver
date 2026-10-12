---
kind: work
status: open
updated: 2026-10-12
priority: P2
---

# Every-owner reads take a typed null-owner run token

## What

Discovery and card-reads every-owner reads carry waivers whose reasons drift. Add a branded EveryOwnerRun token, minted only by the workloads runner for a null-owner row (system or box-owner bulk). Every-owner reads take it as a parameter, and owner-scoped-reads recognises that parameter type, so tsc proves who reaches the read and the waivers go away.

## Why

A prose waiver for a system read is already false in five places; a type the compiler checks cannot drift.

## Done when

Every every-owner read takes the token; only the runner mints it; the gate accepts the token instead of a waiver; the five discovery and card-reads waivers are deleted.

## Evidence

Filled at landing: what ran and where its output is.
