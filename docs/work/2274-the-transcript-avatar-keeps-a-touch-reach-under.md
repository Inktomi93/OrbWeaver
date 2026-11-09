---
kind: bug
status: doing
updated: 2026-11-09
priority: P3
area: client
lane: wt/agent-a1c1c7a87cab455a1
plan: cross-surface-consistency
---

# The transcript avatar keeps a touch reach under enlarged text

## What

Below the cq-16 step the transcript avatar chip is the enlarged size.avatar-sm (30px at 125% text on a 320 phone) with no 44px reach, because the avatar-reach ruling gives that space to the text.

## Why

A reader who enlarges text gets a smaller target relative to the floor the rest of the room meets.

## Done when

Below cq-16 the avatar reaches the coarse floor without breaking the text-scale word-break bound, or the avatar-reach header states why the floor yields there, with a CT at 125% on a 320 phone.

## Evidence

Filled at landing: what ran and where its output is.
