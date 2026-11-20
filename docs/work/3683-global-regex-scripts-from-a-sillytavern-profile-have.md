---
kind: work
status: open
updated: 2026-11-20
priority: P2
area: import
plan: test-foundation
---

# Global regex scripts from a SillyTavern profile have a test that proves they land

## What

The profile import collects global regex scripts in packages/server/src/domain/import/loader/collect.ts. The existing test checks only the import report line, not the stored scripts.

## Why

A report can count scripts that were never written, so the claim that they import is unproven.

## Done when

An integration test asserts each imported global regex script's stored scope through the composed import door, red against a planted break in the scope mapping; the stored names, targets and passes are already asserted.

## Evidence

Filled at landing: what ran and where its output is.
