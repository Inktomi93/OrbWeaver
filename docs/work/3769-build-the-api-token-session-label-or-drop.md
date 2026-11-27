---
kind: work
status: doing
updated: 2026-11-27
priority: P3
area: auth
lane: wt/agent-a17fbff7022b3eefb
plan: unwired-code
---

# Build the API-token session label or drop the column

## What

sessions.label in packages/db/src/schema/sessions.ts is reserved for an API-token surface that does not exist; nothing reads or writes it.

## Why

A reserved column with no plan is dead schema.

## Done when

A numbered migration drops the column, or an item for the API-token surface owns it.

## Evidence

Filled at landing: what ran and where its output is.
