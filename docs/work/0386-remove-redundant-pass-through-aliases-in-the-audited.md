---
kind: work
status: open
updated: 2026-10-02
priority: P3
area: architecture
---

# Remove redundant pass-through aliases in the audited product modules

## What

Remove the audited cosmetic aliases in plugin bundle handling, plugin realm logging, UI clamp tuples, workload params and the app environment.

## Why

These aliases introduce unnecessary alternate names for canonical values or types without changing their role.

## Done when

Use canonical names while preserving sanctioned vendor, collision and per-verb aliases. Recheck each recorded site and pass its affected behavioral and compiler checks.

## Evidence

Source audit: `/tmp/claude-launch-alias-audit/results.json` and its summary. Main checked the relevant declarations and canonical ownership. Implementation and affected checks remain pending.
