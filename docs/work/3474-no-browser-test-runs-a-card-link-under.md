---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: chat
plan: test-foundation
---

# No browser test runs a card link under the app's served headers

## What

The card frame component test page carries none of the app's response headers, so a card link the frame script leaves alone, and every link in a fallback card, navigates the frame off its document there. In the app the embedder's `frame-src` refuses that navigation (`packages/kit/src/card-frame/index.ts` header). Nothing shows that a refused navigation leaves the card drawn.

## Why

A custom-scheme or fallback link that blanks a card in the app would read as a broken card.

## Done when

A browser test under the app's served headers clicks a custom-scheme link in a routed card and a link in a fallback card and asserts the card stays drawn with no confirm. If it blanks, the frame script swallows those clicks in a card.

## Evidence

Filled at landing: what ran and where its output is.
