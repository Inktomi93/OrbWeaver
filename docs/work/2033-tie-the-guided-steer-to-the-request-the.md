---
kind: work
status: open
updated: 2026-11-07
priority: P2
area: tests
plan: test-foundation
---

# Tie the guided steer to the request the composer fires

## What

Fix the rows below. Group LB4 in the ledger triage, reports/codex-test-audit/ledger-triage.md, holds the rows, causes and the defect control that must go red first.

## Why

A composer that drops the steer still commits a plain turn.

## Done when

Removing `guided` from `fireResponse` fails a CT. A list with no pending state fails the held window.

## Evidence

Filled at landing: what ran and where its output is.
