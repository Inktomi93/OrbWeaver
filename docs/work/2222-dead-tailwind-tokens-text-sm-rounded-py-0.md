---
kind: bug
status: open
updated: 2026-11-08
priority: P3
area: client
plan: surface-walk
---

# Dead Tailwind tokens text-sm, rounded, py-0.5 and px-1.5 on a walked surface

## What

A phase B evidence walk reported the class tokens text-sm, rounded, py-0.5 and px-1.5 absent from the readable CSSOM at several checkpoints.

## Why

A class that renders no rule is a styling defect the hygiene scan exists to catch.

## Done when

The owning surface is named from the walk attachments, and the tokens are either generated or removed.

## Evidence

Filled at landing: what ran and where its output is.
