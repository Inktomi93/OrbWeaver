---
kind: bug
status: open
updated: 2026-11-01
priority: P2
area: server
plan: unwired-code
---

# RPG gather reads pendingUserText and respondsToLatestUserTurn

## What

The rpg gather reads `pendingUserText` and `respondsToLatestUserTurn`, and tells the model when the player message this turn answers carries a dice stamp.

## Why

Chat computed both inputs for every game turn and the gather dropped them. A player's roll reached the model only as text in the message, with no instruction to honour it. A swipe of the answering slot has no pending text, so `getPendingUserText`, built at compose, also had no reader.

## Done when

- A send carrying a stamp puts the `rpg.reminder.playerRolledDice` note on the wire, once.
- A swipe of the slot answering that message carries the note, read from the stored message.
- A later generate, a later plain send, and a swipe of an older slot carry no note.
- A stamp quoted as code is not a roll.
- The note carries no player text.

## Evidence

Filled at landing: what ran and where its output is.
