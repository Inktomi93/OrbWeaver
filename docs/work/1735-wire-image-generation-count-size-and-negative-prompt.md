---
kind: work
status: open
updated: 2026-11-01
priority: P2
area: server
plan: unwired-code
---

# Wire image generation count, size and negative prompt (generatePictureRequestFields.n, .size; generateImageActionArgsFields.negative, .size) (owner: wire)

## What

Let a user set image count, size and negative prompt in the imagine modal and the automation `generate_image` action, and carry each to the provider request.

## Why

The unwired scan reported `generatePictureRequestFields.n`, `.size` and `generateImageActionArgsFields.negative`, `.size` as written by no production path. The owner ruled wire.

## Done when

- A production-path test proves `n`, `size` and `negative` reach the provider request from `chat.generateImage` and from the automation action.
- A count above 1 posts every picture in one message.
- A component test proves the imagine controls and the rule editor controls drive the mutation input.
- An image wire that cannot carry a count or a chosen size warns the user through the chat `warning` event.
- A request that sets a count above 1, a size or a negative skips the reuse gate.
- A dry run renders `negative` and reports its macro error.

## Evidence

Filled at landing: what ran and where its output is.
