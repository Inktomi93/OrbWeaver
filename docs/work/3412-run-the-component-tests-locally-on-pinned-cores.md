---
kind: tooling
status: open
updated: 2026-11-20
priority: P2
area: testing
---

# Run the component tests locally on pinned cores to show slow-runner races

## What

A hosted runner is several times slower than the development machine, so a component test that waits on a guess passes locally and sometimes fails in CI. CI now retries a failed component test once and names it flaky. No local command runs the component suite at runner speed.

## Why

A race is found one CI run at a time, and the retry lets one pass unseen unless the flaky list is read.

## Done when

A package script runs the browser suites pinned to the cores a standard runner has, the README names it, and a run with it reproduces the hosted timing; the CI retry already exists.

## Evidence

Filled at landing: what ran and where its output is.
