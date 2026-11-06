---
kind: tooling
status: open
updated: 2026-11-06
priority: P3
area: tooling
plan: surface-walk
---

# Design audit contrast misses small ink on a translucent plate over art

## What

The design audit reports no affected text and excludes text over art as a flat backdrop on a plate where the pixel sampler measures 4.10:1. Make the audit measure what the pixels show.

## Why

A clean audit on a failing surface hides real misses.

## Done when

The audit reports that plate, and a true flat backdrop stays excluded.

## Evidence

Filled at landing: what ran and where its output is.
