---
kind: work
status: open
updated: 2026-11-22
priority: P3
area: import
plan: unwired-code
---

# A failed card import logs the server sentence by name

## What

failedCardSchema.error is documented as the server sentence for the log; importFailureText builds it and the response carries it whole, and nothing logs it. The client keys on reason and never shows it.

## Why

A sent field counts only when the receiver reads it; the receiver is the log.

## Done when

The import route logs each failed card filename, reason and error by name, and a test reads the log call.

## Evidence

Filled at landing: what ran and where its output is.
