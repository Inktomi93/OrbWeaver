---
kind: bug
status: doing
updated: 2026-10-08
priority: P1
area: chat
lane: wt/chat-ct-settling
---

# Repair chat menu completion ownership and track geometry proof

## What

Keep game mutation completion owned by the persistent room menu. Read transcript, composer and pager geometry from one browser snapshot.

## Why

Popup unmount can discard a delayed mutation callback. Separate geometry reads can observe different layout states.

## Done when

Held responses complete after popup removal without affecting a replacement room. Rendered controls preserve announcements, panel admission and exact track alignment.

## Evidence

Filled at landing: what ran and where its output is.
