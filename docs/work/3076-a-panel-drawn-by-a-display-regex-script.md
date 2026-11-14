---
kind: work
status: open
updated: 2026-11-14
priority: P1
area: security
---

# A panel drawn by a display regex script renders at its row's existing trust tier

## What

Ruled by the owner: no new consent and no new setting. A card block the model writes already renders in the sandboxed card frame on any trusted row in any chat (`cardTier` in `packages/client/src/lib/render-trust.ts`, which folds the deployment settings, the speaking character's Trust step and the room's immersive switch, D294). The one gap: a display regex script emits bare HTML with no card block around it, and bare HTML becomes a card only through the lenient option of `toContentBlocks` in `packages/client/src/features/chat/lib/content-blocks.ts`, which is on only in a game room with the immersive switch. Treat HTML that a display regex script produced as a card on a row whose `cardTier` is the sandboxed tier, so it renders in the card frame (`@orb/kit/card-frame`) with its own style blocks, inline styles, keyframes and SVG. On any other row it renders through the inert allowlist as today. It never gets styles in the main DOM. Scripts follow the existing top step and the viewer's own card-script setting; nothing here widens them. Model-written bare HTML outside a game room keeps today's behaviour: the widening is for regex output only, which the room's host attached. Amend D294 with the rule. Route to security-builder.

## Why

A preset's HUD depends on its CSS, and the app already has a deployment setting, a per-character step, a per-viewer setting and a room switch for HTML. A fifth control for presets would be one more thing to find; the existing tier already says whether this row may draw styled HTML.

## Done when

With the Sola preset's scripts attached and a character on the default step, the scene banner renders styled inside the card frame; with the character set to plain text, or the deployment setting off, the same reply renders through the inert allowlist with no style applied. A CT pins both, and a case shows a style block from regex output never reaches the main document.

## Evidence

Filled at landing: what ran and where its output is.
