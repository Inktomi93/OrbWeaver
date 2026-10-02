---
kind: work
status: open
updated: 2026-10-02
priority: P3
area: server
---

# Give the catalog refresh check interval one owner

## What

Remove the redundant catalog check interval override in lifecycle or derive both sites from the scheduler owner.

## Why

The lifecycle override duplicates the scheduler default and prevents a change to that default from taking effect.

## Done when

One definition controls the check cadence. Preserve configured refresh cadence and failed-refresh retry behavior.

## Evidence

Source audit: `/tmp/claude-launch-alias-audit/results.json` and its summary. Main checked the relevant declarations and canonical ownership. Implementation and affected checks remain pending.
