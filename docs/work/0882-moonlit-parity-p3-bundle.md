---
kind: work
status: open
updated: 2026-10-11
priority: P3
area: chat
---

# Moonlit parity P3 bundle

## What

From the Moonlit desktop-mobile parity side-eye report: desktop width caps (bubble 80%, tide 70%); timestamp under the name on phones except echo; asymmetric bubble radii and 18px tide pills; ripple portrait fade, name divider and older-count placement; whisper short right-edge tick instead of a full top border.

## Why

Smaller Moonlit fidelity gaps.

## Done when

Each item matches Moonlit or is ruled with a reason in Evidence.

## Evidence

Not changed. Each item below was measured against `reports/moonlit-reference/`; none is a clear match-or-fix at the table level.

- Desktop width caps. Moonlit: bubble cards 80% of the chat width (744px at 1920), tide pill column 70% (634.9px), 90% on a phone. Orbweaver: bubble and tide cap at the `--reading-bubble-cap` token (65ch, 450px at 1280 and 1920), which is the reading-measure law and a tone-lane token. Recorded difference; the fork is reading measure against Moonlit parity, default keep.
- Timestamp under the name on phones except echo: Orbweaver keeps name and timestamp on one wrapped line in the sticky header; moving it changes the pinned band's height, which `tests/client/features/chat/components/platform-pinned-band-height.suite.ct.tsx` pins. Needs a ruling.
- Bubble and tide radii: Moonlit's asymmetric bubble corners and 18px tide pills need a new `Card` shape in `@orb/ui` (tone lane).
- Ripple: Moonlit fades the portrait's right edge, draws a rule under the header and places the count under the portrait; the divider and the count are header and footer anatomy in `message-row.tsx` and `message-row-parts.tsx`, owned by the 1435 lane.
- Whisper short right-edge tick: the same new `artDecoration` treatment as hush's (see 0880).
