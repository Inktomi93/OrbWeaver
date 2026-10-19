---
kind: work
status: open
updated: 2026-10-19
priority: P3
area: client
plan: test-foundation
---

# Delete the test-only WAYSTONE_WEATHERS alias

## What

WAYSTONE_WEATHERS in waystone-treatment.ts aliases WEATHER_TYPES and only a legacy test reads it. Remove the alias, point the test at WEATHER_TYPES, and correct the kit weather header.

## Why

A test-only alias keeps production surface alive for a test.

## Done when

Production Knip drops the row and the legacy test passes.

## Evidence

Filled at landing: what ran and where its output is.
