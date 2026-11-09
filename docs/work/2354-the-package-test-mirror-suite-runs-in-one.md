---
kind: tooling
status: open
updated: 2026-11-09
priority: P3
area: tooling
plan: test-enforcement
---

# The package test mirror suite runs in one process

## What

tests/tooling/native-package-test-mirror.test.ts spawns a cold dependency-cruiser start per case, so the file takes about seven minutes alone and times out under load.

## Why

Owner rule: a slow tooling self-test is made fast and in process or deleted.

## Done when

The file cruises its planted family once, reads each rule's verdict from that result, and runs alone in under a minute.

## Evidence

Filled at landing: what ran and where its output is.
