---
kind: work
status: open
updated: 2026-10-24
priority: P2
area: ui
plan: css-system
---

# Text datum voice is ruled

## What

`font-mono` with `tabular-nums` (28 and 19 sites) and `text-info` paint datum text in features with no voice or tone arm to move to; they block items 1316 and 1326.

## Why

UI-Density-Law §2.3: features speak voices, not axes.

## Done when

The density law records the ruling; both voices and the tone exist in `@orb/ui`; a codemod moves the sites.

## Owner ruling

2026-10-24: a `datum` voice for numeric readouts, counts and timers (`tabular-nums` in the body face, at the gloss size); a separate `code` voice (Geist Mono) for ids, hashes and keys; `text-info` becomes a tone, not a voice.

## Evidence

Filled at landing: what ran and where its output is.
