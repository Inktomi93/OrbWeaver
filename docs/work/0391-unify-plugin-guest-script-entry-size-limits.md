---
kind: work
status: open
updated: 2026-10-02
priority: P3
area: plugin
---

# Unify plugin guest script entry size limits

## What

Derive the shared guest script ceiling from one canonical declaration across filtering, unpacking, packing and UI byte delivery.

## Why

The same ui.js artifact is checked against separately declared equal limits at different stages.

## Done when

All script-entry stages share one ceiling without weakening existing bounds. Preserve distinct compressed-bundle and asset limits; pass focused admission tests.

## Evidence

Source audit: `/tmp/claude-launch-alias-audit/results.json` and its summary. Main checked the relevant declarations and canonical ownership. Implementation and affected checks remain pending.
