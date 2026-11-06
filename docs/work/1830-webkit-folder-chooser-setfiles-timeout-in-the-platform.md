---
kind: bug
status: open
updated: 2026-11-06
priority: P3
area: testing
---

# WebKit folder-chooser setFiles timeout in the platform action groups collision case

## What

Find why setFiles times out in WebKit in the platform action groups collision case, and remove the cause.

## Why

The case failed once on a folder chooser setFiles call and then passed on rerun, so it is a flake and will fail some later run.

## Done when

The case passes 20 consecutive WebKit runs.

## Evidence

Filled at landing: what ran and where its output is.

Seen once; passed 4 of 4 on rerun. Done when it passes 20 consecutive runs.
