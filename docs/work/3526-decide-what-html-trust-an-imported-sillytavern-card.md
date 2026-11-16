---
kind: decision
status: open
updated: 2026-11-16
priority: P2
area: import
---

# Decide what HTML trust an imported SillyTavern card or preset starts with

## What

SillyTavern renders HTML in messages by default, with styles and without scripts. Here a row draws rich content only when the install setting and the character's trust step allow it, and a new character starts below that. A user who imports a card or preset built around styled panels sees plain rows and the plain-content notice until they change a setting.

## Why

The first thing an importing user sees is that their preset does not work, and the fix is a setting they have not met.

## Done when

A ruling on the starting trust for imported content and on what the import flow tells the user, for example an offer at import when the card or preset carries styled markup. The ruling names who may raise trust in a shared room. The import flow and its copy follow it.

## Evidence

Filled at landing: what ran and where its output is.
