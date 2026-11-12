---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: embeddings
plan: authorization-and-visibility
---

# A box-wide embed sweep skips a disabled owner's rows

## What

A bulk index of cards and images and a bulk databank reindex run each row on its owner's own encoder (`packages/server/src/domain/embeddings/` and the databank ingest). The auto-index catch-up starts with no funder, so the disabled-account check is skipped, and an admin turning corpus auto-index on reaches it unattended. The `csls`, `compute-themes` and `compute-cooccurrence` jobs have not been traced for the same reach.

## Why

A disabled account's connection still pays for embedding calls.

## Done when

Each sweep skips a disabled owner's rows, with a test per sweep that reads the recorded provider requests, and the three untraced jobs are traced and either gated or shown to spend nothing.

## Evidence

Filled at landing: what ran and where its output is.
