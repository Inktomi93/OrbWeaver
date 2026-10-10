---
kind: work
status: open
updated: 2026-10-02
priority: P3
area: client
---

# Derive ambient field callback types from their canonical tuple

## What

Derive ambient strip callback keys from AMBIENT_FIELDS and reuse that type through the existing props contract in the RPG scene tab.

## Why

Callback and mapping sites repeat the same union independently of the canonical tuple. Existing total maps catch some additions but do not remove the duplicate definitions.

## Done when

The callbacks and scene mappings derive their field vocabulary without a second literal union. Preserve clear behavior and pass affected compiler and component checks.

## Evidence

Source review: `/tmp/claude-launch-registry-audit/results.json`, group `ambient-field-union`. Main checked the cited definitions and consumers. Implementation and affected checks remain pending.

Done in cb-ui-cleanup. `ambient-strip.tsx` uses its tuple-derived `AmbientField` for both callbacks (the `no-inline-types` gate refuses exporting it from a component file). `rpg-scene-tab.tsx` derives its local `AmbientField` from `AmbientStripProps["onEditField"]`, so all five sites use it and the three-key subset is `Exclude<AmbientField, "timeOfDay">`. No four-key literal union remains (rg over packages and tests). Client typecheck, `tracker-blocks.ct.tsx` and `rpg-context-section.ct.tsx` pass (202 tests).
