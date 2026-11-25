---
kind: tooling
status: open
updated: 2026-11-25
priority: P3
area: tooling
plan: unwired-code
---

# The unwired world loader reads tsconfigs through the TypeScript 7.1 API

## What

worlds.ts reads every world through tooling/src/floor/testing/test-worlds.ts, which imports typescript (TypeScript 6) to parse tsconfig files, so the unwired tool loads TypeScript 6 outside the ports census D357 names.

## Why

The unwired tool otherwise runs on the TypeScript 7.1 compiler alone; a second compiler for config parsing is a second answer to how a world's files and options are read.

## Done when

The world loader parses configs through the TypeScript 7.1 API and its world sets match the old loader's on the real tree, or the item records with evidence why the floor module keeps TypeScript 6.

## Evidence

Filled at landing: what ran and where its output is.
