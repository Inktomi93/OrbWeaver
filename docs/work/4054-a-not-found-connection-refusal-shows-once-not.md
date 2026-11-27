---
kind: bug
status: open
updated: 2026-11-27
priority: P3
area: client
plan: unwired-code
---

# A not_found connection refusal shows once, not inline and as a toast

## What

In the connection editor a not_found refusal is placed inline (connection-editor.tsx) and also raised as a toast by connection-role-mutations.ts, so the person sees the same refusal twice.

## Why

A doubled message reads as two failures and buries which control to fix.

## Done when

A not_found refusal appears in one place chosen by the ux review, and a CT proves it appears once.

## Evidence

Filled at landing: what ran and where its output is.
