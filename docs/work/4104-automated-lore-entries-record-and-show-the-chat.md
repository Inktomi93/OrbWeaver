---
kind: work
status: open
updated: 2026-11-27
priority: P3
area: world-info
plan: unwired-code
---

# Automated lore entries record and show the chat span they came from

## What

The automation analysis computed the message span each automated lore entry came from and stored it in the entry's provenance; nothing showed it, and the old fields scan removed the field and its writer, so the app no longer collects it.

## Why

Owner rule: data the app collects and never shows is a product item; the span also served re-run idempotency.

## Done when

The entry editor shows the message span for a rule-owned entry with a CT and the span is written again, or the item rules it out with its reason.

## Evidence

Filled at landing: what ran and where its output is.
