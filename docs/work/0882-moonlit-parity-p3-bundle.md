---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: chat
plan: cross-surface-consistency
---

# Moonlit parity P3 bundle

## What

From the Moonlit desktop-mobile parity side-eye report: desktop width caps (bubble 80%, tide 70%); timestamp under the name on phones except echo; asymmetric bubble radii and 18px tide pills; ripple portrait fade, name divider and older-count placement; whisper short right-edge tick instead of a full top border.

## Why

Smaller Moonlit fidelity gaps.

## Done when

Each item matches Moonlit or is ruled with a reason in Evidence.

## Evidence

One point is built; the rest stay open, each with the evidence that blocks it. Reference: `reports/moonlit-reference/` (captures `194311` bubbles, `194745` ripple, `194600` whisper, `194641` hush; `codex-2026-10-26-measurements.md`).

Built:

- Whisper's short right-edge tick instead of a full top border, with Hush's: the `tickEnd` treatment (item 1444). The old `stripeTop` and `stripeStart` are deleted.

Open:

- Desktop width caps. Moonlit: bubble cards 80% of the chat width (744px at 1920), tide pill column 70% (634.9px), 90% on a phone. Orbweaver: bubble and tide cap at `--reading-bubble-cap` (65ch), the reading-measure token. The fork is reading measure against Moonlit parity; default keep, which needs the owner's ruling to change.
- Timestamp under the name on phones except echo. Orbweaver keeps name and timestamp on one wrapped line in the sticky header; stacking them changes the pinned band's height, which `tests/client/features/chat/components/platform-pinned-band-height.suite.ct.tsx` pins. Needs a ruling on that pin before the header changes.
- Bubble and tide radii. The measurements note holds one sample: Bubbles mode `.mes_block` radius `5px 20px 20px 40px` with `15px 15px 25px` padding (assistant row, 1920px). No user-row sample and no tide pill radius were taken, so a mirrored corner set or an 18px pill would be a guess; they need a capture of a user bubble and a tide pill. The box is `MessageBubble` (`packages/ui/src/primitives/message-bubble/variants.ts`, `MESSAGE_BUBBLE_BOX`), which is where the corners would go.
- Ripple (capture `194745`): Moonlit draws a 1px rule under the name row across the text column, fades the portrait's right edge, and places the message number (`#10`) under the portrait. Each is anatomy in `message-name-row-frame.tsx` (a header rule beside the pinned and sticky paint), `message-row-avatar.tsx` (a mask on the welded portrait, which `Avatar` has no prop for) and the metadata row; none is built here.

No code changed for the open points.
