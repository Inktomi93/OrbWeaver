---
kind: tooling
status: open
updated: 2026-10-12
priority: P2
area: tooling
---

# Design audit gives per-rule verdicts and samples contrast against the glyph, not the box edge

## What

(1) populationEvidenceGap (`tooling/src/ui-audit/lib/population.ts:133`) voids the whole run as NO VERDICT on any withheld candidate in any rule; only the representative cap is presentation-only (contract/findings.ts:46). Report per-rule verdicts, a partial population verdict naming the rules, with complete rules keeping theirs. (2) maskedForeground is a measured inapplicability (`tooling/src/ui-audit/lib/checks-color.ts:38,60`) and must count as excluded, not withheld. (3) Hover and border contrast have no pixel path: pixels.ts:36-37 pixel-settles text samples only, while hover (hover-walker-read.ts:106) and border (census-border.ts:78 to checks-border.ts:92) do not. Pixel-settle them, hover with :hover held, or reclassify paint-layer-over-base for them as was done for text. (4) Zero of N chosen at rest in selection-idiom (remedy text at population.ts:121-122) becomes excluded as structurally unjudgeable. (5) Contrast samples the perimeter ring of the element box (tooling/src/floor/instrument/pixel-backdrop.ts:48-71, used by ui-audit/ops/pixels.ts and snap/ops/contrast-pixels.ts:16-37) with no uniformity check, so an unmasked letter laid over a feathered sibling tile reads the card through the feather (1.05:1) instead of the solid centre (6.7:1). Ring the text ink box (Range.getBoundingClientRect) when the element box is larger, and refuse a non-uniform ring (luminance p10 to p90 spread) as unresolved, which --contrast prints as NO VERDICT.

## Why

Design-audit runs on owner data void on most pages, so reviewers stop reading them; the contrast instrument flagged a legible letter as failing.

## Done when

A run with one withheld rule reports the others' verdicts; maskedForeground and zero-chosen cases are excluded; hover and border contrast resolve by pixels; the echo fallback letter measures its real contrast and a planted non-uniform ring reports unresolved; the main pages on owner data return verdicts at desktop and phone width; tests cover each.

## Evidence

Filled at landing: what ran and where its output is.
