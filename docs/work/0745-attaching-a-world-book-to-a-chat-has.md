---
kind: bug
status: open
updated: 2026-10-04
priority: P3
area: chat
---

# Attaching a world book to a chat has a visible exit

## What

The Attach a world book to this chat dialog (add-chat-book-dialog.tsx:78) has no close glyph and no Cancel, so with candidates in the picker it has no visible exit, against FormDialog's rule that every dialog owes one (form-dialog.tsx:63). Twin of the Add a document dialog that 0628 fixed. Found by the S3 recheck.

## Why

A dialog with no visible exit traps pointer users.

## Done when

The dialog carries the shared closeButton and a Cancel, with a CT.

## Evidence

Filled at landing: what ran and where its output is.
