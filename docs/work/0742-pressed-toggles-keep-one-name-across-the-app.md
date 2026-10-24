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

`RowToggleAction` takes one `label`, so a pressed-style toggle cannot flip its name and carries its state in aria-pressed only. One component CT proves it.

## Evidence

`RowToggleAction` replaced `labelOn` and `labelOff` with one `label` (`packages/client/src/components/row-toggle-action.tsx`). All five callers pass one constant name: `character-card.tsx` "Star <subject>", `chat-summary-row.tsx` "Star <row name>", `chat-documents-section.tsx` "Feed <document> to this chat", `databank-library-row.tsx` "Use <document> in every chat", `preset-library-row.tsx` "Activate <preset> for generation". The kebab menu items keep their Star/Unstar text; they are menu items, not pressed toggles.

CT: `tests/client/components/row-toggle-action.ct.tsx` asserts the button name stays constant and `aria-pressed` flips across two presses. It failed with a flipped name in the component, then passed.
