---
kind: work
status: open
updated: 2026-10-02
priority: P3
area: ui
---

# Clean up audited UI re-exports and prebuilt markers

## What

Remove confirmed unused CircleGauge, PinOff, Syringe and Unlock re-exports from the curated icon barrel. Review the safe-color pass-through exports and correct misleading prebuilt marker anchors without deleting retained primitives.

## Why

The source audit found unused external re-exports that native symbol scans omit, plus ambiguous or blank intent markers. Public compound contracts and retained primitives are not dead implementations.

## Done when

Reconfirm named, JSX, string, test and tool consumers before narrowing exports. Preserve live icon variants and canonical public parts. If narrowing safe-color exports, repoint actual UI consumers to the existing kit home. Repair the StatusChip marker using real retained authority. Verify the StreamText citation before changing it; conflicting audit rows do not prove a broken reference. Do not invent consumers or revive held programs. Run affected import and type checks.

## Evidence

Source audit and owner ruling: `/tmp/claude-launch-ui-package-audit/STATUS.md` and `/tmp/claude-launch-ui-package-audit/RESULTS.md`. Native UI captures remain pending. This records source classification and approved intent, not implementation or runtime acceptance.
