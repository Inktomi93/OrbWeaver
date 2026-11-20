---
kind: tooling
status: doing
updated: 2026-11-20
priority: P2
area: tooling
lane: wt/agent-acafe70a253c76f7e
plan: unwired-code
---

# The unwired scan runs one pass with no redundant work and reports no false positives

## What

The owner reports that the unwired scan (tooling/src/unwired) no longer needs its two passes, carries redundant work, and still flags many false positives.

## Why

A scan that cries wolf gets ignored, and its findings feed deletion decisions.

## Done when

The scan runs one pass with the redundancy removed and its wall time measured before and after; each false-positive class in the latest report is classified and fixed at the classifier with a fixture that fails before the fix; a fresh run on main reports only real or deliberate findings, each deliberate one with a cited ruling.

## Evidence

Filled at landing: what ran and where its output is.
