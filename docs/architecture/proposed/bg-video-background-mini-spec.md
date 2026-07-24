# BG-E mini-spec: video chat-backgrounds, 2026 approach

## Bottom line

**Don't convert video to animated WebP. Play the video.** Add a second background-layer
component that renders `<video muted loop autoplay playsinline>` instead of a CSS
`background-image`. Skip BG-E's premise entirely — no ffmpeg.wasm, no WASM image
encoder, no conversion step at upload time. This is less code than the "modern"
conversion pipeline, not more, and it's strictly better on every axis (quality,
file size, CPU, battery) than any animated-image encode of the same clip.

This isn't "ST does it dumbly" being fixed with a shinier wasm blob — it's dropping
the conversion requirement altogether, which the 2026 platform now cleanly supports
(muted autoplay has been unconditionally allowed since Chrome 53 / iOS Safari 10).

## Why the original assumption breaks down

1. **ffmpeg.wasm is a non-starter regardless.** It ships the full libavcodec/libavformat/
   libswscale/libswresample stack as a \~31MB WASM module. That's the dumb-and-heavy
   option ST reaches for because ST doesn't have WebCodecs-based alternatives baked
   into its extension model. Orbweaver shouldn't vendor it for any reason. ([Dayverse: ffmpeg.wasm alternatives](https://dayverse.id/en/articles/best-ffmpeg-wasm-alternatives-client-side/))

2. **There is no native browser API that encodes animated WebP or AVIF.** WebCodecs
   ships `ImageDecoder` (decode only) — there is no shipped `ImageEncoder` for
   animated image formats in any browser as of 2026; it never left W3C/WICG
   discussion for this use case. ([WebCodecs spec status](https://wicg.github.io/web-codecs/), [ImageDecoder — MDN](https://developer.mozilla.org/en-US/docs/Web/API/ImageDecoder)) Any encode path
   requires a WASM codec (libwebp/libavif), full stop — there's no "just use the
   platform" shortcut for the encode side, only for decode.
   <!-- Re-verified 2026-07-18 (owner asked "I thought browsers had it now"): still true. WebCodecs
   is now UNIVERSAL (Safari 26 + Firefox 130 shipped) which strengthens the DECODE half, and
   small wasm muxers (@jsquash/webp + RIFF stitchers) make conversion genuinely FEASIBLE without
   ffmpeg.wasm — but there is still no native animated-image ENCODER, and the §4 merits argument
   is unchanged: conversion inflates a 1–2MB mp4 into a 10–30MB animated webp and trades
   hardware video decode at render time for CPU image decode. Feasible ≠ better; the native
   <video> layer ruling stands. -->

3. **The lightest realistic *conversion* pipeline still needs two separate pieces**
   glued together by hand: WebCodecs `VideoDecoder` (or a thin wrapper) to pull raw
   frames off the video, and a separate libwebp-wasm animation encoder
   (`WebPAnimEncoder`) to mux them into one animated `.webp`. Nothing ships this as
   one clean library — `mediabunny` (the best modern ffmpeg.wasm replacement) reads/
   writes MP4/WebM/MKV/MP3/etc. via WebCodecs but explicitly does **not** write
   animated WebP or GIF; its container support stops at video/audio containers.
   ([mediabunny supported formats](https://mediabunny.dev/guide/supported-formats-and-codecs)) You'd be hand-rolling a
   decode→encode→mux pipeline from two different libraries for a feature nobody
   asked to have look like a still image.

4. **Video is a strictly better output format for a looping background than any
   animated image codec.** Chrome's own guidance for the "GIF-replacement" use case
   is literally "use `<video muted autoplay loop playsinline>`, don't use
   canvas/GIF hacks" — citing \~10x average / \~100x best-case compression advantage
   over GIF-class formats and explicitly calling out that JS-side video decoding
   (which is what a canvas/animated-image approach requires) is "a huge drain on
   battery power" compared to native `<video>` playback, which uses the hardware
   decoder. ([Chrome for Developers: Muted Autoplay on Mobile](https://developer.chrome.com/blog/autoplay-2?hl=en)) Animated
   WebP narrows the gap vs. GIF (50–70% smaller than GIF) but is still an image
   codec being asked to do a video codec's job — it will never match H.264/VP9/AV1
   for a live-motion clip. ([Cloudinary: GIF vs WebP](https://cloudinary.com/guides/image-formats/gif-vs-webp))

## Ranked options

**1. Native `<video>` background layer — RECOMMENDED, do this.**
Accept the video file as-is at upload (webm/mp4), store and serve it unmodified,
render it in a new background-layer variant. Zero conversion code, zero new
dependencies. Tradeoff: needs its own small runtime discipline (below) that a
static image layer doesn't need — pause when tab hidden, respect
`prefers-reduced-motion`, and note the browser will not let the screen auto-sleep
while playing (acceptable for an active chat session; not a background-tab
concern since it should pause there anyway).

**2. Do nothing / keep current behavior — fallback, not a real option here.**
BG-E's own doc note is already right that raw animated WebP/GIF uploads work
today with zero new code. That's fine as a baseline but doesn't serve the actual
ask (users uploading a video clip), so it's not a resolution, just the status quo.

**3. Client-side video→animated-WebP conversion — possible now, not recommended.**
If a product reason ever forces "must be a static image asset, no `<video>`
element allowed" (e.g. server-side thumbnail-only rendering, no motion at all
in some context), this is buildable without ffmpeg.wasm:

- Decode: WebCodecs `VideoDecoder` fed frames via `MP4Box.js`/`mediabunny`
  demuxing (mediabunny is the demuxer; \~30KB gzip for "read all formats").
- Encode+mux: `wasm-webp` (npm `wasm-webp`, MIT, wraps libwebp via Emscripten,
  exposes `encodeAnimation(width, height, hasAlpha, frames)`) — a real
  browser-usable animated-WebP muxer/encoder, unlike jSquash's `@jsquash/webp`
  which only encodes single still frames (no animation muxer exposed).
  ([nieyuyao/webp-wasm](https://github.com/nieyuyao/webp-wasm)) Expect a single-digit-hundred-KB
  gzipped WASM payload (jSquash's comparable single-codec libwebp build lands
  around that range; exact `wasm-webp` size isn't published, verify before
  vendoring). ([@jsquash/webp size notes](https://www.npmjs.com/package/@jsquash/webp))
- This is real work (frame-rate downsampling, palette/quality tuning, loading
  the wasm off the main thread) for a strictly worse output than just keeping
  the video. Only build this if a concrete requirement forces it.

**4. Animated AVIF instead of WebP — not viable client-side.**
No maintained browser-usable AVIF *animation* encoder wasm exists with the
ecosystem maturity of libwebp's. Skip.

## What to vendor: nothing, for the recommended path

No new dependency. `ThemeBackgroundLayer` already exists at
`packages/client/src/features/app-shell/components/theme-background-layer.tsx` as
the fixed `background-image` div; add a sibling variant, not a conversion
pipeline. If option 3 is ever triggered, vendor `wasm-webp` (npm) +
`mediabunny` (npm, `@mediabunny/mediabunny`-style import, tree-shakeable, cite
exact package path at implementation time) — nothing bigger.

## Browser-support caveats

- Muted `<video autoplay loop playsinline>`: supported everywhere that matters —
  Chrome/Android since Chrome 53, iOS Safari since iOS 10. No feature-detection
  needed, just the standard attributes. ([Chrome for Developers: Muted Autoplay on Mobile](https://developer.chrome.com/blog/autoplay-2?hl=en))
- WebCodecs `VideoDecoder` (only relevant if option 3 is ever built): Chrome/Edge/
  Opera/Samsung Internet full support since \~2021; Firefox desktop since Firefox
  130 (Firefox Android still lacks it — `VideoDecoder` is `undefined`); Safari
  full support from Safari 26, partial (video-only, no audio/image classes) from
  Safari 16.4–18.7. Hardware AV1/HEVC decode varies by OS/silicon. ([WebCodecs Fundamentals: codec support dataset](https://webcodecsfundamentals.org/datasets/codec-support/), [WebCodecs — MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API))

## File-size / battery reality

- H.264/VP9/AV1 video vs. animated GIF: \~10x smaller on average, up to 100x in the
  best case, for equivalent visual quality. Animated WebP: 50–70% smaller than GIF
  but still an image codec, not a video codec — always larger than an equivalent
  video encode of live motion. ([Chrome for Developers](https://developer.chrome.com/blog/autoplay-2?hl=en), [Cloudinary](https://cloudinary.com/guides/image-formats/gif-vs-webp))
- Battery: native `<video>` playback uses the hardware decoder; JS-side frame
  decoding (WebCodecs-in-JS or any canvas/animated-image playback loop) does not,
  and is explicitly called out as "a huge drain on battery power" by Chrome's own
  engineering guidance. A `<video>` background layer is the *lower*-battery option,
  not the tradeoff-for-quality option. ([Chrome for Developers](https://developer.chrome.com/blog/autoplay-2?hl=en))
- Caveat that does cut the other way: a playing `<video>` element blocks the
  screen from auto-sleeping on some platforms, which a static/animated image layer
  does not. Mitigate by pausing on `document.hidden` (Page Visibility API) —
  needed anyway to stop wasted decode work in background tabs — and by respecting
  `prefers-reduced-motion` (pause or fall back to a poster frame).

## Build-shape sketch

**Primary (do this):**

1. `BG-D` (already scheduled) extends the uploader to accept video mime types
   (`video/mp4`, `video/webm`) alongside images — validated the same way the
   existing `assertMagicMatches` sniffs images in
   `packages/server/src/domain/assets/substrate/mime.ts`, just adding a video
   branch (magic bytes, not conversion).
2. New sibling component next to `ThemeBackgroundLayer` — e.g.
   `ThemeBackgroundVideoLayer` in the same directory — rendering `<video>` with
   `object-fit` mapped from the same `AppearanceBackgroundFit` union
   (`cover`/`contain`/`stretch`/`center`) that `BACKGROUND_SIZE_BY_FIT` already
   encodes for the image layer, `fixed inset-0` positioning, `muted loop
   autoplay playsinline`, paused via a `document.hidden` listener, and skipped
   (falls back to a poster frame / first frame) under `prefers-reduced-motion:
   reduce`.
3. `resolve-theme-background.ts` picks the video vs. image variant off the
   stored asset's `mime` field (already tracked per the contracts schema in
   `packages/contracts/src/assets/index.ts`) — no new field needed, just a
   branch on mime type at render time.
4. Retire BG-E from the BUILD-QUEUE as "resolved by not needing it" rather than
   "unscheduled" — the conversion premise is gone, not deferred.

**Secondary (only if a real requirement shows up later):** the option-3 pipeline
above (`VideoDecoder` + `wasm-webp`), scoped narrowly to generating a small
poster/preview thumbnail (e.g. for a settings-panel gallery grid where a live
`<video>` per grid cell would be wasteful), never as the actual background
render path.

## Sources

- [Chrome for Developers — Muted Autoplay on Mobile: "Say goodbye to canvas hacks and animated GIFs!"](https://developer.chrome.com/blog/autoplay-2?hl=en)
- [WebCodecs Fundamentals — Codec Support Dataset](https://webcodecsfundamentals.org/datasets/codec-support/)
- [MDN — WebCodecs API](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API)
- [MDN — ImageDecoder](https://developer.mozilla.org/en-US/docs/Web/API/ImageDecoder)
- [WICG WebCodecs spec](https://wicg.github.io/web-codecs/)
- [Mediabunny — supported formats & codecs](https://mediabunny.dev/guide/supported-formats-and-codecs)
- [Mediabunny homepage / bundle-size notes](https://mediabunny.dev/)
- [Dayverse — Best ffmpeg.wasm Alternatives for Client-Side Video Processing](https://dayverse.id/en/articles/best-ffmpeg-wasm-alternatives-client-side/)
- [nieyuyao/webp-wasm (npm: wasm-webp) — animated WebP encode/decode](https://github.com/nieyuyao/webp-wasm)
- [@jsquash/webp — npm](https://www.npmjs.com/package/@jsquash/webp)
- [Cloudinary — GIF vs WebP: Small Animations, Huge Differences](https://cloudinary.com/guides/image-formats/gif-vs-webp)
- Repo: `docs/architecture/proposed/BUILD-QUEUE.md:54` (BG-E entry, as-is today)
- Repo: `packages/client/src/features/app-shell/components/theme-background-layer.tsx`
- Repo: `packages/server/src/domain/assets/substrate/mime.ts`
- Repo: `packages/contracts/src/assets/index.ts`
