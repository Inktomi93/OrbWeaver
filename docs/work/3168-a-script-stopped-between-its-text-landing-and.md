---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: regex
plan: import-robustness
---

# A script stopped between its text landing and its index moving is not applied twice

## What

In `runScripts` (`packages/server/src/primitives/regex/index.ts`), a deadline that lands after `state.text` is assigned and before `state.next` increments blames a script that had finished; in a shared entry the retry-alone rule then applies it again to already-changed text.

## Why

A narrow timing window can double-apply one script.

## Done when

Text and index commit together (or the rerun starts from a saved copy), with a case that forces the window.

## Evidence

Filled at landing: what ran and where its output is.
