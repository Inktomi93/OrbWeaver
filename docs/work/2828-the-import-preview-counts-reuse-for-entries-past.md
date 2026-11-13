---
kind: bug
status: open
updated: 2026-11-13
priority: P2
area: server
plan: import-robustness
---

# The import preview counts reuse for entries past its listed cap

## What

The preview lists a capped number of entries per kind, and the count of writes is taken from the flags on listed entries only. An entry past the cap is counted as a write whether or not the library or another upload already holds it.

## Why

A large library previews writes the run does not make, and nothing says the tail was not compared.

## Done when

The server sends exact reuse counts per kind beside the capped list, the count line uses them, and where a tail cannot be compared across uploads the line says so; a test previews more owned presets than the cap and reads zero writes.

## Evidence

Filled at landing: what ran and where its output is.
