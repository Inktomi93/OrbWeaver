---
kind: work
status: doing
updated: 2026-11-27
priority: P3
area: imagery
lane: wt/agent-ac2c798ce3e21fdef
plan: unwired-code
---

# The lightbox provenance strip shows the negative prompt, spend detail, subject and time

## What

imagery.readProvenance returns negativePrompt, usage, subjectCharacterId and createdAt, stored per generated picture; provenance-strip.tsx shows prompt, model, mode, edited and cost only.

## Why

Owner ruling: data the app collects and never shows is a product item.

## Done when

The strip shows the negative prompt when set, the token and cache detail, the character the picture is of, and when it was made, and a CT covers a picture with each.

## Evidence

Filled at landing: what ran and where its output is.
