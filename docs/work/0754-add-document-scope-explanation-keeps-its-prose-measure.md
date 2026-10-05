---
kind: bug
status: open
updated: 2026-10-05
priority: P3
area: ui
---

# Add-document scope explanation keeps its prose measure

## What

The scope explanation in the reviewed Add-document view has no prose measure. Its text box uses the full dialog width. The component is packages/client/src/features/databank/components/add-document-body.tsx.

## Why

The consent explanation is harder to read at the wide desktop dialog width.

## Done when

The scope paragraph uses the governed prose measure and keeps its destination and additive-consent wording. Desktop and phone text remain contained.

## Evidence

The reviewed ref is `7d4018247819c2c7956fddd34f844ea7714e7d90`. Independent runs `2554243` and `2557675` show no paragraph measure and a long desktop line. Contrast passed. The owner deferred this separate cosmetic finding outside the functional launch cut.
