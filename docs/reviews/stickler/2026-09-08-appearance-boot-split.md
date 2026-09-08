---
kind: review
status: active
updated: 2026-09-08
---

# Appearance boot split review

Review target: the uncommitted appearance boot split over `9cde150af`: `state/appearance-boot-hint.ts`, the new `compose/stamp-appearance-boot-hint.ts`, the state barrel, the two import sites, and the appearance-carrier gate's boot-file relocation. Concurrent session/auth changes in `main.tsx` and unrelated scroll-codemod work were excluded.

## Findings

No confirmed findings.

## Verified clean

- Read every touched file in the bounded manifest in full, including the complete state barrel, CT story module, and appearance-carrier gate. Read the existing appearance CT, appearance schema, theme-name resolver, persisted-store door, and root-effects reconciliation seam.
- The state module contains no executable `document`/`window` access. The only DOM writer is `compose/stamp-appearance-boot-hint.ts`; the composition-tier module is imported only by `main.tsx` and the browser CT story.
- The split does not claim bare Node can load the client's TSX-bearing `#lib` barrel. The relevant boundary is the established Node-without-DOM compiler program; the client package remains a browser world, and no live Node runtime imports the appearance state module.
- `main.tsx` invokes `stampAppearanceBootHint()` before the root lookup and `createRoot(...).render`, preserving the same pre-paint call position. Module initialization still rehydrates the persisted hint synchronously before that call.
- `readAppearanceBootHint()` returns the same store `getState()` the old writer read directly. It is intentionally absent from the state front door and consumed only by the composition writer.
- `DEFAULT_APPEARANCE_FONT_SCALE` is derived from the same `appearanceSettingsSchema.parse({})` result as `DEFAULT_STATE`; the writer's non-default comparison is therefore identical to the old private `DEFAULT_AXES.fontScale` comparison. Reduced motion, font scale, theme, and React-only density behavior are unchanged.
- The state front door no longer exposes the DOM writer. Existing root-effects consumers retain the three DOM-name constants from the state module, so hydrated cleanup still uses the same attribute/property spellings.
- Structural sweeps covered 5,864 TypeScript and 1,406 TSX files. `stampAppearanceBootHint` has two live calls: the pre-render composition root and the CT probe. `readAppearanceBootHint` has one call, inside the writer. No state-to-compose import exists.
- The gate's `BOOT_FILE` now points at the declaring composition module. Supplied native evidence: 1,318 source files and 41 appearance keys clean; erasing the real stamp body in memory produces the two expected missing-prepaint-key findings.
- Supplied rendered evidence: the existing appearance boot CT passed 5/5, including loud replay, fresh-device no-stamp, authoritative write-back, and corrupt-blob healing. Client TS7 and scoped lint were green.
- `git diff --check` passed on the reviewed paths. No broad gate, real-tree probe, or unrelated auth review was run.

## Unconfirmed, low priority

None.

## Issue summary

Appearance boot split review confirmed zero findings. The DOM writer now lives at the composition tier, the state cache/getter remains compiler-safe without DOM globals, pre-render ordering and schema-derived defaults are preserved, and the carrier gate plus 5/5 browser CT cover both structural and rendered behavior. Report: `docs/reviews/stickler/2026-09-08-appearance-boot-split.md`.
