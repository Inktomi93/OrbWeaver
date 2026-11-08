---
kind: bug
status: open
updated: 2026-11-08
priority: P3
area: tests
---

# Extend the first-alert rule to role=alert locators and e2e specs

## What

The first-alert rule in eslint.config.ts misses the role=alert locator syntax and does not cover tests/e2e.

## Why

An e2e spec or a raw locator can read the first alert without being refused.

## Done when

Plant rows for the locator spelling and an e2e spec are refused, and the live tree stays clean.

## Evidence

Filled at landing: what ran and where its output is.
