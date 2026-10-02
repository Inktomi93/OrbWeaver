---
kind: work
status: open
updated: 2026-10-02
priority: P3
area: kit
---

# Reuse canonical time unit constants from kit time

## What

Expose the existing time conversion constants from the kit time module and replace equivalent product-local declarations.

## Why

Physical time unit conversions are redeclared across product modules despite an existing pure time home.

## Done when

Equivalent unit conversions derive from kit time. Preserve distinct domain durations, calendar semantics and package direction; verify affected consumers.

## Evidence

Source audit: `/tmp/claude-launch-alias-audit/results.json` and its summary. Main checked the relevant declarations and canonical ownership. Implementation and affected checks remain pending.
