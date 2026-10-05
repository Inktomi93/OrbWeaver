---
kind: bug
status: doing
updated: 2026-10-05
priority: P2
area: client
lane: codex/launch-truth
---

# The cache warning flags only content that changes per turn

## What

A new preset opens its Prompt tab on the cache warning (prompt-cache-warning.ts): world info before and after are always flagged, and Description, Personality, Scenario, User persona and Dialogue examples are false positives from the macro check. Owner ruling: the default rack matches SillyTavern and gets no warning; world info flags only when the applicable books hold dynamic entries at that position, warned where the chat's books are known. Final visual pass; review: ~/homelab/development/probe-archive/side-eye-reviews/final-pass-1-rails-home.md.

## Why

Launch visual pass finding.

## Done when

A fresh preset shows no warning, the false positives are gone, and the chat preview names dynamic world info entries, with tests.

## Evidence

Filled at landing: what ran and where its output is.
