---
kind: adr
status: active
updated: 2026-09-23
---

# A video background plays as native video

## Context

A background asset can be a video. No browser ships a native encoder for animated WebP or AVIF; WebCodecs `ImageDecoder` only decodes. Any conversion to an animated image needs a vendored WASM codec. Native `<video>` uses the hardware decoder. Frame decoding in JavaScript costs CPU and battery.

## Decision

The app plays a `video/*` background asset in a native `<video>` element. `packages/client/src/features/app-shell/lib/resolve-theme-background.ts` branches on the stored asset's `mime`. `packages/client/src/features/app-shell/components/theme-background-video-layer.tsx` owns placement, the scrim and fit. The `@orb/ui` `BackgroundVideo` primitive in `packages/ui/src/primitives/background-video/background-video.tsx` owns the media policy: muted, loop, autoplay, pause on a hidden tab and a still frame under reduced motion. The client adds no WASM media codec for backgrounds.

## Consequences

Image and video backgrounds use two sibling layers that share the fit union. Upload stores the video as it is. No conversion step runs. File size and battery cost stay below an animated-image encode of the same clip.

## Alternatives rejected

Convert the video to animated WebP with ffmpeg.wasm. The module ships the whole libav stack and is very large. Convert with a small WASM WebP encoder. It works, but it trades hardware video decode for CPU image decode and gives a larger file. Convert to animated AVIF. No maintained browser encoder for AVIF animation exists.
