---
kind: work
status: open
updated: 2026-10-02
priority: P3
area: ui
---

# Remove the competing UI theme derivation export

## What

Move test consumers to the canonical kit theme-derivation export and remove the clamp module forwarding alias.

## Why

The forwarding export preserves a redundant import path while production consumers already use the canonical home.

## Done when

Consumers use the kit export and relevant contrast and derivation behavior remains tested. Remove only proof that exists solely for the forwarding alias.

## Evidence

Source audit: `/tmp/claude-launch-alias-audit/results.json` and its summary. Main checked the relevant declarations and canonical ownership. Implementation and affected checks remain pending.
