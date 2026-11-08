---
kind: bug
status: open
updated: 2026-11-08
priority: P3
area: tests
plan: test-foundation
---

# The room-reads suite keeps its plugin broker under host load

## What

The room-reads integration suite loses its plugin broker under host load, so cases fail on a broker lifecycle error rather than on product behaviour.

## Why

A suite that fails on load reads as a product red and hides real ones.

## Done when

The suite passes repeatedly at the load where it lost the broker, and a broker loss fails with a message that names it.

## Evidence

Filled at landing: what ran and where its output is.
