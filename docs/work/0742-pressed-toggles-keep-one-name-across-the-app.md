---
kind: bug
status: open
updated: 2026-10-04
priority: P3
area: client
---

# Pressed toggles keep one name across the app

## What

Three RowToggleAction callers still flip their accessible name while also setting aria-pressed, the defect fixed on the Databank row: character-card.tsx Star and Unstar, chat-summary-row\.tsx Star and Unstar, and chat-documents-section.tsx feed and stop-feeding. Found by the S2 verifier.

## Why

A name that flips beside aria-pressed announces the state twice and reads as two different controls.

## Done when

Each pressed-style toggle keeps one constant name and carries its state in aria-pressed, with a CT per surface.

## Evidence

Filled at landing: what ran and where its output is.
