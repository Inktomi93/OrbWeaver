---
kind: adr
status: active
updated: 2026-11-05
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
  than substituting `muted-foreground`. Both ramp branches step toward the black/white crossover, so a base whose branch does not fit takes the mirrored branch when that keeps more of the ramp. If a member still would make a documented shared
  family impossible, that delta retracts toward the unchanged authored base on a measured 0.001 grid. If the
  translucent input fill alone makes the muted/input family impossible, its wash keeps its alpha and runs away from the ink. The page ink is solved over that wash on every panel a field sits on, the sidebar included, on the popover and sidebar panels a tone text mixes it into, and over both neutral tints; the sidebar ink is solved on the sidebar and the page, because list rows wear it on both; and a dark carried palette paints `--color-field-fill` from it. An author's prose pick is judged on the page, the card and each bubble fill it paints, picked or derived, over a seed or a carried base. A picked bubble fill paints, with or without a carried background, over the fill that background derives. Inside it, every prose ink read on it, picked or inherited, seed or carried, is judged on that fill alone, because a fill across the crossover from the page admits no ink for both. The box that paints the fill is a whole surface: `MessageBubble` restates, per role, the palette the fill derives as a carried base, foreground to tone tints, so what it holds reads it. A box-less skin and a scope that merely holds the pick keep the page's palette, and a nested scope's background paints nothing inside a box. Over a seed, a pick is judged on the surfaces the seed paints. A translucent fill is judged as its composite. Near the crossover, at about L 0.55 to 0.58, no chromatic ink clears 4.5:1, so chromatic inks give way to reading and a speaker tint may go near-white there. A solved ink keeps its chroma inside sRGB so its hue holds. A pick that clears every host stays byte-identical; one that clears its page but not a host moves only as far as its hosts need, from the author's lightness toward the polarity's end.
  A ramp member the projection holds takes its ink at the base's polarity, because the projection clears that end point on it: a member a hair across the crossover keeps the page's side, so one tint can carry both inks. The dedicated sidebar-accent surface is never retracted. The accent delta retracts toward the base where one ink cannot cover the accent and muted family, which D336 makes the neutral tone's text-on-tint hosts.
  Builder/create/update, ST import, root/nested/carried ThemeScopes and
  portals all accept the same `ThemeOverride` domain; only unreadable/contextual values without an ambient
  fail open. Seed blocks remain generated and gain only the two additive paired variables at their former
  winning values; owner custom CSS remains the later unlayered winning plane. **Framebuffer-margin rider:** 4.5 remains the legal and rendered floor, but Orb-owned neutral foreground
  derivation aims at `AA_NORMAL_DERIVATION_RATIO = 4.6` before paint. That aim is capped only by the
  authored anchor's strongest black/white endpoint (`sqrt(21) ≈ 4.5826` is the physical crossover ceiling),
  and derived ramps and the input wash project to the same attainable target. The 2,060 accepted-base matrix now
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
