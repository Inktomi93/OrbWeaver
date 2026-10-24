---
kind: tooling
status: open
updated: 2026-10-24
priority: P2
area: tests
plan: test-foundation
---

# Corpus republish is not byte-identical run to run

## What

While adding the shell-ambient cohort, about half of repeated corpus publishes from one tree differed in one id in notificationInbox.readerFinal, and a baseline without the new cohort also differed in asset and database bytes between runs. tests/support/README.md says two publishes from one tree are byte-identical because every producer draws ids from the injected source in a fixed order.

## Why

A corpus that republishes differently makes every capture-backed CT and e2e case depend on which publish was committed, and hides real drift.

## Done when

The producer that varies under load is named (the notifications inbox producer is the first suspect) and draws its ids and order deterministically; a loop of repeated publishes from one tree is byte-identical, run as a test or a recorded check.

## Evidence

Filled at landing: what ran and where its output is.
