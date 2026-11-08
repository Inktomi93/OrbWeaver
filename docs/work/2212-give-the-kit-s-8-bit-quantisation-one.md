---
kind: work
status: open
updated: 2026-11-08
priority: P3
area: kit
---

# Give the kit's 8-bit quantisation one helper

## What

packages kit theme-derivation/index.ts spells 8-bit colour quantisation in three places.

## Why

Three copies of one rounding rule can drift apart and change emitted colours.

## Done when

One helper does the quantisation and the three sites call it, with emitted colours unchanged.

## Evidence

Filled at landing: what ran and where its output is.
