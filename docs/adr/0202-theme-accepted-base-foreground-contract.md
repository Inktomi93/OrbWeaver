---
kind: adr
status: active
updated: 2026-09-23
---

# Accepted-base foreground contract supersedes the raw-L pivot

## Context

Split off [ADR 0071](0071-theme-palette-pipeline.md), whose accepted-base foreground contract rider superseded clause (4) and pushed the file over the 8 KiB ADR cap.

## Decision

- **This rider supersedes D71(4)'s raw-L FG_PIVOT_L mechanism and the rider's
  `isDerivableBaseSurface` refusal consequence.** Accepted custom/carried bases have no lightness exclusion
  band. `surfacePolarity` measures black-vs-white contrast on the actual gamut-mapped pixel and is the ONE
  decision used by foregrounds, `color-scheme`, ramps, elevation, charts, accent correction, and reading
  plates. Every semantic foreground is solved against the surface it actually paints, including quantized
  pixels; a shared token is legal only for a documented host family one ink can cover. The proven splits are
  `reading-plate-foreground` (plate over black/white art plus its opaque band) and
  `sidebar-accent-foreground` (rail hover fill). Transparent action controls inherit their host ink rather
  than substituting `muted-foreground`. If a proposed derived ramp member would make a documented shared
  family impossible, that delta retracts toward the unchanged authored base on a measured 0.001 grid; if the
  translucent input fill alone makes the muted/input family impossible, only its derived alpha retracts.
  Dedicated accent/sidebar-accent surfaces are never projected.
  Builder/create/update, ST import, root/nested/carried ThemeScopes and
  portals all accept the same `ThemeOverride` domain; only unreadable/contextual values without an ambient
  fail open. Seed blocks remain generated and gain only the two additive paired variables at their former
  winning values; owner custom CSS remains the later unlayered winning plane. **Framebuffer-margin rider:** 4.5 remains the legal and rendered floor, but Orb-owned neutral foreground
  derivation aims at `AA_NORMAL_DERIVATION_RATIO = 4.6` before paint. That aim is capped only by the
  authored anchor's strongest black/white endpoint (`sqrt(21) ≈ 4.5826` is the physical crossover ceiling),
  and derived ramps/input alpha project to the same attainable target. The 2,060 accepted-base matrix now
  bottoms at 4.5798 analytically (+0.0798 over AA); exact pivot input pairs solve at 4.6127/4.6144. Shipped
  seed neutral pairs carry the full 4.6 target on their actual hosts: only Mocha's derived-role
  `muted-foreground` moves (L 0.720→0.731; its input/popover minimum 4.430→4.6286 quantized). Owner-authored
  prose still passes through unchanged at 4.5, and no base, accent, theme domain, or owner-CSS precedence
  changes. Pins:
  `theme-derivation/index.test.ts`, `theme-derivation/accepted-base-foreground.suite.test.ts`, `palette-contrast.suite.test.ts`,
  ThemeScope/chat-controls/custom-CSS CT,
  settings verb/editor/resolver tests, and generated-artifact freshness/additive diff.

## Consequences

Every semantic foreground is solved against the surface it actually paints, including quantized pixels. Owner-authored prose still passes at 4.5:1; derived neutral foregrounds aim at 4.6 capped by the authored anchor's strongest endpoint. Pins: `theme-derivation/index.test.ts`, `theme-derivation/accepted-base-foreground.suite.test.ts`, `palette-contrast.suite.test.ts`, ThemeScope/chat-controls/custom-CSS CT, settings verb/editor/resolver tests, and generated-artifact freshness/additive diff.

## Alternatives rejected

Keep D71(4)'s raw-L FG_PIVOT_L mechanism (rejected: a lightness exclusion band refuses accepted custom/carried bases that a measured black-vs-white contrast on the actual gamut-mapped pixel can resolve correctly).
