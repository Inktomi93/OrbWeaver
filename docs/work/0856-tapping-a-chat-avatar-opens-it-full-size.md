---
kind: work
status: open
updated: 2026-10-11
priority: P2
area: chat
---

# Tapping a chat avatar opens it full size

## What

SillyTavern opens a zoomed avatar when you click it in chat; Orbweaver's message rows have no click handler on the avatar chip or the art-style portraits (message-row-parts.tsx). A lightbox already exists for the character gallery (packages/client/src/features/chat/components/gallery-lightbox.tsx).

## Why

Owner: parity with SillyTavern's click-to-view avatar.

## Done when

Clicking or tapping a speaker's avatar, or the echo art, whisper banner or ripple portrait, opens the full-resolution image in the shared lightbox for both character and persona rows, at every chat style; Escape and tap-outside close it and focus returns to the avatar; the avatar is a labelled button; CTs cover open, close and focus return at phone and desktop.

## Evidence

Filled at landing: what ran and where its output is.
