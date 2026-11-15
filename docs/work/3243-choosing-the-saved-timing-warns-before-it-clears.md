---
kind: bug
status: open
updated: 2026-11-15
priority: P2
area: regex
---

# Choosing the saved timing warns before it clears depth and author scope

## What

In the regex editor, picking 'Change the saved message' on a script with a depth range or whose-messages lists clears both and autosaves with no warning; the bulk dialog warns about the same loss before Apply.

## Why

The user loses scope settings they set with no notice, and the two doors that make the same change behave differently.

## Done when

Picking the saved choice while depth or authors are set shows the bulk dialog's warning and waits for a confirm, or offers Undo with the cleared values named.

## Evidence

Filled at landing: what ran and where its output is.
