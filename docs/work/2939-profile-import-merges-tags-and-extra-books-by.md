---
kind: bug
status: open
updated: 2026-11-14
priority: P2
area: import
plan: import-robustness
---

# Profile import merges tags and extra books by card filename across profiles

## What

`collectProfileRoot` in `packages/server/src/domain/import/loader/profile-directory.ts` keys `tagsByEntityKey` and `extraBooksByCardStem` by card filename over every profile of the picked folder, and `importCollectedBundles` reads the tags by `bundle.filename`. Two profiles that keep different cards under one filename merge their tags and extra books onto both cards.

## Why

A folder of several SillyTavern profiles is a normal import, and each profile's card must keep only its own tags and books. Group seating had the same defect and is now scoped per profile.

## Done when

Both maps are keyed per profile, the run and the dry run read them per profile, and a two-profile test with one shared filename shows each card with only its own tags and extra books.

## Evidence

Filled at landing: what ran and where its output is.
