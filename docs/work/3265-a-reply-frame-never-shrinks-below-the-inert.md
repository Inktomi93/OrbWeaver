---
kind: bug
status: open
updated: 2026-11-15
priority: P1
area: chat
plan: import-robustness
---

# A reply frame never shrinks below the inert fallback's height and leaves a blank bubble

## What

The app rule body { min-block-size: 100dvh } in client globals.css matches body in the parsed reply, so matchedAppCss carries it into the frame document. FRAME_REPLY_CSS does not reset it. Inside the frame, 100dvh is the iframe's own height, which ReplyFrame seeds from the fallback's measured height. The pinned script's body.scrollHeight therefore never reports less than the seed, and the grow-only fold keeps it. A short reply after a tall fallback keeps a large blank tail.

## Why

Styled replies show large empty areas under their last line, which reads as a layout bug and pushes the variant counter and the next message far down.

## Done when

The frame document resets min-block-size on html and body, or matchedAppCss skips html, body and :root rules. A CT frames a short styled reply after a taller fallback and asserts that the frame height equals the content height. It fails before the fix.

## Evidence

Filled at landing: what ran and where its output is.
