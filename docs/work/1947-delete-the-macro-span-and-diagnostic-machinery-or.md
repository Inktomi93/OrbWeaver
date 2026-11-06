---
kind: decision
status: open
updated: 2026-11-06
priority: P3
area: kit
plan: unwired-code
---

# Delete the macro span and diagnostic machinery, or give it an editor consumer

## What

MacroDiagnostic.code, MacroDiagnostic.span and the MacroSpan fields have no reader, yet span presence gates diagnostic emission and the parser's cursor depends on it.

## Why

The machinery runs and nothing shows its output.

## Done when

The machinery is removed, or an editor shows the diagnostics.

## Evidence

Filled at landing: what ran and where its output is.
