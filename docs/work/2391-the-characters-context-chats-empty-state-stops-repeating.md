---
kind: bug
status: open
updated: 2026-11-10
priority: P3
area: client
plan: cross-surface-consistency
---

# The Characters context chats empty state stops repeating the hero's New chat

## What

With a character open, the context tab's chats empty state (chats-with-character-pane.tsx) offers New chat while the character hero band (character-hero-band.tsx) offers the same action on the same screen. The only ruled dual New chat is the chat list header. On a phone the context tab hides the hero, so the empty state's action is the only door there.

## Why

Two doors to one action on one screen split attention; the house rule is one control per action per screen.

## Done when

The empty state's New chat renders only when the hero's is not visible, read from pane visibility the way databank-detail-surface.tsx reads listMode, proven by a production-mounted CT at desktop and phone, and the duplicate-action-door finding is gone from the Characters relations evidence case.

## Evidence

Filled at landing: what ran and where its output is.
