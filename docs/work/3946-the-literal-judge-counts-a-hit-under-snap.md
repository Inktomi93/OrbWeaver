---
kind: tooling
status: doing
updated: 2026-11-24
priority: P3
area: tooling
lane: wt/agent-a928fb0eea0de1b10
plan: unwired-code
---

# The literal judge counts a hit under snap as a product read

## What

evidenceOf in tooling/src/unwired/literal-hits.ts holds a literal hit only in source that isProduction accepts, so a read by name under tooling/src/snap only annotates its row.

## Why

The reference-graph ruling counts a read by snap as use, because snap drives the real app. The trial already counts a snap compile error as a product read through productReader, so the literal judge disagrees with both the law and the compile path.

## Done when

A literal hit under snap that names the row's own declaration holds a trial row. A planted snap read goes red when the snap rule is removed. The trial and literal-hits headers state the rule.

## Evidence

Filled at landing: what ran and where its output is.
