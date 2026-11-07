---
kind: work
status: doing
updated: 2026-11-07
priority: P3
area: tests
lane: main
plan: test-foundation
---

# Refuse checks that pass on nothing

## What

Add `nonEmpty`, fix the eight flagged cases, rewrite the 39 chain sites and 192 `every` sites by codemod, and turn both rules on. Group LK3 in the ledger triage, reports/codex-test-audit/ledger-triage.md, holds the rows, causes and the defect control that must go red first.

## Why

A check true of an empty set proves nothing, and it reads exactly like a check that ran.

## Done when

Each flagged case fails on its stated counterexample, both rules refuse a planted site, and neither has a suppression or baseline.

## Evidence

Filled at landing: what ran and where its output is.
