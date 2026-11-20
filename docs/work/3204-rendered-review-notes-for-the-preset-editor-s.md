---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: preset
---

# Rendered review notes for the preset editor's Output cluster and the limits step

## What

Facts seen while building 3069, 3070 and the review fixes: the guessed-limits line and its door sit under the Output KnobGrid as one wrapping Row; each knob's hint is a popup only, so on touch the guess wording sits behind the info button and the visible line carries it; a row note (blank Max output, capped by a guess) takes the KnobRow note slot, which outranks the gloss, so a row with a note shows no clamp gloss; the blank note shows only on the floor and clamp steps and the quality and model-default steps keep their ghost gloss. Nothing was snapped.

## Why

3072 reviews the editor as rendered; these are the facts, not a redesign.

## Done when

3072's rendered review rules each note keep or change, with ux-reviewer seeing the limits step and the guess line at 390px and 200%/300% text.

## Evidence

Filled at landing: what ran and where its output is.
