---
kind: work
status: doing
updated: 2026-11-15
priority: P3
area: inference
lane: wt/agent-a5487884af20f9847
---

# A hosted model nobody describes reads as text only with no mark that it is a guess

## What

The endpoint posture widens an undescribed model to image and video and marks it modalitiesEstimated, so the add flow can ask. A hosted route keeps the fail-closed text-only floor and sets no mark, so the client cannot tell an unreported model from one the provider stated as text only. The Takes images switch is shown in the editor for both, but the add step asks only when the answer is marked assumed.

## Why

A user adding an unlisted model on a hosted key is never asked about images at add time, and the editor's gloss says the provider reported text only when nothing was reported.

## Done when

The fold marks a floor text-only input on a hosted route as assumed, or the capability view says whether the provider stated its inputs, and the add step asks for the image answer in that case.

## Evidence

Filled at landing: what ran and where its output is.
