---
kind: bug
status: open
updated: 2026-11-25
priority: P2
area: security
---

# On WebKit a static preconnect link in a card or plugin frame opens a connection the frame policy refuses

## What

In WebKit a <link rel=preconnect> inside a sandboxed frame opens a connection to its origin even under a frame policy that refuses fetch, so a character card's Rich HTML with external media blocked, and a plugin frame, can beacon to a third-party host; D294 and the card-frame census state that blocked external media makes no request.

## Why

A beacon reveals that a card was opened, and from where, to whoever wrote it, which the external-media block exists to stop.

## Done when

Card and plugin frame HTML has preconnect, dns-prefetch, prefetch and preload links removed or neutralized before render, with a frame case in Chromium, WebKit and Firefox that observes no connection to the planted origin.

## Evidence

Filled at landing: what ran and where its output is.
