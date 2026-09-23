---
kind: work
status: blocked
updated: 2026-09-23
priority: P3
area: inference
blocked: owner
---

# Add an image and video quality control for attachments

## What

Attachments go to the model at full stored fidelity. No request sets `detail` on an image or video part,
and nothing resizes video. Add a user-set quality control:

1. Images: a `detail` level (low, high or auto) and an optional resize or recompress through `sharp`, which
   already normalizes images in `packages/inference/src/backends/kit/image-normalize.ts`.
2. Video: an optional maximum resolution, applied with `ffmpeg` before encoding. `sharp` cannot process
   video, and per-request processor settings do not reach the local vLLM engine.
3. Send `detail` only to connections whose capabilities accept it.

## Why

A high-resolution video costs many vision tokens on every turn it stays in history. A quality control lets
the user trade fidelity for cost and context. The owner still has to settle the control's semantics,
including how a GIF is handled.

## Done when

A user can set the image detail and a video maximum resolution. Tests show that the request body carries
`detail` only for capable connections, and that a video is resized before encoding. A live request shows
that the OpenRouter path honors `detail`. The setting's hint states the cost tradeoff.

## Evidence

Filled at landing: what ran and where its output is.
