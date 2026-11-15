---
kind: work
status: open
updated: 2026-11-15
priority: P2
area: chat
plan: cross-surface-consistency
---

# Card frames lack the link hand-off, lost-frame recovery and loading veil that reply frames have

## What

Both wrappers draw through `SandboxFrame` in `packages/ui/src/content/sandbox-frame/sandbox-frame.tsx`. `reply-frame.tsx` passes `onLink` with a confirm and pacing, `onMissing` with one re-mint, and `pending` so the frame shows only after its first height. `card-block.tsx` and `immersive-card.tsx` pass none of them: a link in a card does nothing, a card whose frame handle is gone may sit on the miss notice, and a short card shows at the default height before it shrinks. The two wrappers also mint through two hooks for one endpoint. Whether the card's data hook already recovers a lost handle is not yet read.

## Why

The same kind of framed content behaves differently by wrapper, and each gap is something a reader meets.

## Done when

Each behaviour is read and either shared or ruled a deliberate difference with the reason written at the wrapper. Where shared, the card uses the same link confirm, the same recovery and the same veil as the reply, with its own fallback. One mint hook serves both. Component tests cover a card link, a lost card frame and a short card's first paint.

## Evidence

Filled at landing: what ran and where its output is.
