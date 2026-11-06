---
kind: work
status: open
updated: 2026-11-06
priority: P3
area: kit
plan: unwired-code
---

# Wire the setglobalvar drain so the macro's write reaches a store

## What

The setglobalvar macro pushes GlobalVarWrite values to a sink nothing drains. Wire the drain to a store, as SillyTavern cards expect. Owner ruling: wire it.

## Why

A macro appears to work and its write goes nowhere.

## Done when

A setglobalvar write is read back by getglobalvar on a later turn, with a test at the production entry.

## Evidence

Filled at landing: what ran and where its output is.
