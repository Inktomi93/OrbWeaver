---
kind: work
status: open
updated: 2026-11-11
priority: P3
area: tooling
plan: checked-law
---

# Prune source comments package by package against the new comment rule

## What

Once the comment rule states what survives, the existing comments are judged against it one package at a time: restated code and change stories go, an enforcement claim gets its cite or goes, a reason stays and is shortened, and a ruling held in a header stays with its cite. The work is too large for one author and fits a classify and rewrite pass with a second reader per package.

## Why

The rule alone stops growth; it does not remove the false and redundant prose already there, which is what misleads authors today.

## Done when

Each app package is pruned in its own reviewed change with the cite test and the claim rule green, no ruling lost (a reviewer compares the rulings before and after), and the package's tests unchanged. The comment share per package is recorded before and after in the change's report.

## Evidence

Filled at landing: what ran and where its output is.
