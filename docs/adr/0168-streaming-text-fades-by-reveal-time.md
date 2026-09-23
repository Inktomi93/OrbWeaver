---
kind: adr
status: active
updated: 2026-09-23
---

# Streaming text fades by reveal time, and the caret is ours

## Context

Streamdown's word fade never played: its CSS was not loaded, and at the measured commit cadence its per-render restart truncated every fade and snapped delayed words to opaque. Its caret attached one level too shallow and rendered on a new line.

## Decision

`packages/ui/src/markdown/reveal-plugin.ts` wraps each streamed word in a span whose negative `animation-delay` is its age since reveal, so a replaced node resumes mid-fade instead of restarting. The fade is token CSS in the ui globals and rides streaming mode, not the smooth-stream setting. Streamdown's `animated` and `caret` options are unused; our caret targets the true last block through the direction wrapper. The pacer tick matches the fade so small word batches overlap. Reduced motion injects no plugin.

## Consequences

Without an animate plugin Streamdown commits streaming blocks through a transition. The dialogue tint copies the reveal attribute and delay onto the spans it mints, so quoted speech keeps fading. Settled rows are byte-identical.

## Alternatives rejected

- Import Streamdown's styles to make its fade live: the commit cadence still truncates every fade, and its animate path commits synchronously.
- Slow the pacer until the stock fade fits: fades still snap at the next commit, and reveal latency grows.
- A DOM-side fader with a mutation observer: it fights reconciliation and the CSS-first motion law.
- Keep Streamdown's caret and deepen our override: two owners paint the caret.
- Smooth scrolling for follow mode in the same change: the virtualizer reads `scrollTop` right after `scrollTo`, and smooth scrolling breaks follow detection.
