---
kind: work
status: open
updated: 2026-10-02
priority: P3
area: ui
---

# Align theme proof helpers with the active color pipeline

## What

Remove the unused oklabToOklch converter and obsolete muted-foreground solver. Keep contrast proof helpers in test support when no product caller needs them.

## Why

The color clamp parses through ColorJS and srgbToOklch. The emitted muted foreground uses derivedMutedForegroundPair, while a focused regression still tests derivedMutedForegroundLightness instead. The remaining derivedForeground and inputCompositeSurface exports only support tests.

## Done when

Confirm consumers across packages, barrels, tooling and tests. Preserve OKLab parsing coverage through the active parser. Rebind the pivot regression to the actual muted pair including its input alpha. Preserve the accepted-base matrix, contrast assertions and failing controls. Relocate test-only convenience calculations without duplicating production algorithms or weakening proofs. Verify affected theme suites and rendered color parity.

## Evidence

Filled at landing: what ran and where its output is.
