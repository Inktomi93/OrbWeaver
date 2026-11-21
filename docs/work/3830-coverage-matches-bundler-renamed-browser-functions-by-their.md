---
kind: tooling
status: open
updated: 2026-11-21
priority: P3
area: tooling
plan: unwired-code
---

# Coverage matches bundler-renamed browser functions by their source name

## What

After 3825 a few browser functions stay unmatched in the coverage merge because the bundler renames them with a $N suffix, such as a store's migrate$N.

## Why

An unmatched function can never be reported executed, so a live function reads as dead.

## Done when

A browser function the bundler renamed matches its source function through the source map or the original name, a red-first planted case covers a renamed function with a twin, and the targeted coverage run reports no renamed function unmatched.

## Evidence

Filled at landing: what ran and where its output is.
