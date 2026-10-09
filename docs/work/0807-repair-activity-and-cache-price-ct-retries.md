---
kind: bug
status: doing
updated: 2026-10-09
priority: P1
area: testing
lane: codex/weekly-corpus-progress
---

# Repair Activity and cache-price CT retries

## What

Diagnose and repair missing Activity refresh and cache-price editor activation in component tests.

## Why

Retry-assisted passes leave the first interaction behavior unproven.

## Done when

Prove the failure mechanisms with native or deterministic controls. Preserve visible Activity refresh, zero-price persistence and base rates. Require retry-free affected tests.

## Evidence

Filled at landing: what ran and where its output is.
