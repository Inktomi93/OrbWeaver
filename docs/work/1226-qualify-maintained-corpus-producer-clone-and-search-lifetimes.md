---
kind: bug
status: open
updated: 2026-10-21
priority: P2
area: testkit
plan: test-foundation
---

# Qualify maintained corpus producer, clone and search lifetimes

## What

Qualify the maintained corpus producer, clone, search and cleanup cases named in the runtime portion of work 1219. Preserve the exact cases and diagnose their fixture or product failure through existing testkit and production entries. The project-selection checker work remains parked outside this program.

## Why

These are actual corpus and testkit runtime failures, separate from the stopped tooling and semantic-engine projects.

## Done when

The named maintained corpus cases complete with correct ownership, outputs and joined lifetimes. Preserve every meaningful assertion and identify the cause before changing timing. Do not expand checkers or use private owner data.

## Evidence

Filled at landing: what ran and where its output is.
