---
kind: work
status: open
updated: 2026-11-27
priority: P3
area: client
---

# Move the remaining prose-stamp surfaces onto stampWhen

## What

Regex script labels, workload rows, the persona lists and the analytics Updated and Last active lines still format their own relative stamps instead of the shared stampWhen home in packages/client/src/lib.

## Why

Several stamp formatters give the same time different words across surfaces.

## Done when

None of those surfaces calls timeLib.formatRelative with a lead word; each reads stampWhen, and its CTs pass.

## Evidence

Filled at landing: what ran and where its output is.
