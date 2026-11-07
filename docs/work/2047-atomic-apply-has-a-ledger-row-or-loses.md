---
kind: decision
status: open
updated: 2026-11-07
priority: P3
area: server
plan: cross-surface-consistency
---

# Atomic Apply has a ledger row or loses its owner-ruling claim

## What

The server Apply code cites an owner ruling for atomic Apply that exists only in a commit message and comments.

## Why

A claim of an owner ruling needs a cited ledger row, or a later author treats a choice as settled law.

## Done when

An ADR records the ruling, or each comment states the true reason.

## Evidence

Filled at landing: what ran and where its output is.
