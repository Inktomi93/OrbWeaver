# Seeded background placeholders (TEMPORARY — replace before ship)

Four 1920×1080 scenic backgrounds used as the initial seeded-background set for the
theme engine's `background` token (upload · seeded · external-URL). They demonstrate
the feature; they are NOT final art.

- `misty-highlands.jpg` — Scottish Highlands (Quiraing)
- `granite-valley.jpg`  — Yosemite valley
- `forest-falls.jpg`    — forest waterfall (Salt Creek Falls)
- `blue-fjord.jpg`      — Norwegian fjord (Preikestolen)

## Provenance / license
Pulled from Lorem Picsum (picsum.photos), which serves Unsplash photos under the
**Unsplash License** (free to use, no attribution required). Fine for dev placeholders.
**Action before any real ship:** swap for original/CC0 art or properly-attributed
images — do not assume these are clearable for production.

## Home
Served statically from the client at `/backgrounds/<name>.jpg` (vite `public/`).
WS3 / the background-image feature wires the seeded-background list (`listSeededBackgrounds`)
to read this folder; the `background` token references them as a seeded source.
