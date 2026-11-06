---
kind: decision
status: open
updated: 2026-11-06
priority: P3
area: kit
plan: unwired-code
---

# Wire the setglobalvar drain or delete the sink

## What

The setglobalvar macro pushes GlobalVarWrite values to a sink that nothing drains.

## Why

A macro appears to work and its write goes nowhere.

## Done when

The write reaches a store, or the sink and macro are removed with a reason.

## Evidence

Filled at landing: what ran and where its output is.
