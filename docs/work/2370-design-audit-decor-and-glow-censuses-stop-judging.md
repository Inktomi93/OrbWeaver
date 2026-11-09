---
kind: tooling
status: doing
updated: 2026-11-09
priority: P3
area: tooling
lane: wt/agent-a7e614c3dc6eac284
plan: cross-surface-consistency
---

# Design-audit decor and glow censuses stop judging ratified frames and the hover glow

## What

From the evidence-walk triage: the rest glow census (tooling/src/ui-audit/ops/walker/census-glow\.ts) lacks the --shadow-cta-glow token match the forced-state census has, so a hovered call to action reads as a stray glow; the nested-card census treats an iframe as a card (IFRAME missing from the media list in census-decor.ts), a divider-only inner strip as a card edge, an embedded picker panel inside a popover, dialog or card as a doubled frame, and a transparent-bordered outer as a card on radius alone.

## Why

Each fires on a ratified design, so the rule's findings stop meaning a defect.

## Done when

Each case has a fixture that reads clean, a real stray glow and a real nested card still fail, and the excluded subjects appear in the rule's accounting.

## Evidence

Filled at landing: what ran and where its output is.
