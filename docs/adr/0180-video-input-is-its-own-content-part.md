---
kind: adr
status: active
updated: 2026-09-23
---

# Video input is its own content part

## Context

Chat attachments reached models only as images. Users attach video files and animated gifs. The owner wants the model to see the motion, not a single frame.

## Decision

`ChatContentPart` in `packages/contracts/src/chat/bus.ts` has a `video` member beside `image`. The model's `video` input modality gates it (`packages/contracts/src/inference/capability/reads.ts`), in the same way `vision` gates images. The media kind is classified once, in `packages/server/src/entry/compose/resolve-image-ref.ts`: a `video/*` asset is video, an animated `image/gif` (kit `isAnimated`) is video, and every other image is an image. Backend translators dispatch on `type` and never sniff bytes again. This extends ADR 0045, whose content-part list names only `text` and `image`.

## Consequences

Each backend translator handles `video` as its own case. A static gif stays an image.

## Alternatives rejected

A `media: "video"` flag on the image part. A translator that does not read the flag sends video bytes in an image part, and the models that accept video reject that request. Sending the first frame of a gif as an image. The model loses the motion the owner asked for.
