---
kind: work
status: open
updated: 2026-11-21
priority: P3
area: auth
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
