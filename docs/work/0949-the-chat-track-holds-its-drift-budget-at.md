---
kind: bug
status: open
updated: 2026-10-12
priority: P2
area: chat
plan: test-mirror
---

# The chat track holds its drift budget at the production chat width

## What

ChatRoomTrackStory measures at 50dvw while the production default (CHAT_WIDTH_PCT_DEFAULT) is 60. Moving the story to the production default makes the track suite fail its budgets (track drift above budget, the reading floor above expected). Decide whether the budgets were calibrated at 50dvw or the product misbehaves at its own default: measure the track at the production default, fix the product if it drifts, or recalibrate the budgets from the derivation, and import the default into the story.

## Why

A test measured at a width the product never defaults to proves a layout users don't see.

## Done when

The track story uses the production default, the suite passes at it, and any product drift is fixed or the budgets are re-derived with their reason.

## Evidence

Filled at landing: what ran and where its output is.
