---
kind: work
status: open
updated: 2026-10-22
priority: P3
plan: test-foundation
---

# Qualify sandbox behavior against served CSP

## What

Verify sandbox-frame behavior against the security policy production serves. Re-derive whether maintained consumers need a shared CSP directive table before moving production code.

## Why

A copied CSP table can drift; moving production policy solely to preserve a reference test creates unnecessary coupling.

## Done when

A maintained case verifies sandbox behavior against actual served policy without a copied table. Share pure policy data only if current production and test consumers need it.

## Evidence

The external sandbox-frame CT is a candidate case, not evidence that the maintained test population contains the same copy.
