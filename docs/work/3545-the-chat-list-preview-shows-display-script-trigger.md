---
kind: bug
status: open
updated: 2026-11-16
priority: P3
area: chat
plan: chat-html-and-presets
---

# The chat list preview shows display script trigger text

## What

The chat list's last-message preview shows the raw trigger tokens a display script rewrites in the transcript.

## Why

The list shows markup the reader never sees in the room.

## Done when

The preview shows the text as the room draws it, without running a display pass per list row at a cost that is not stated.

## Evidence

Filled at landing: what ran and where its output is.
