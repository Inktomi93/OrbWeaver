---
kind: work
status: open
updated: 2026-11-14
priority: P1
area: security
---

# A panel drawn by a display regex script renders at its row's existing trust tier

## What

Ruled by the owner: no new consent and no new setting. A panel drawn by a display regex script renders at the tier its message row already resolves to in `packages/client/src/lib/render-trust.ts` (`cardTier`), which folds the deployment settings, the speaking character's Trust step and the room's immersive switch (D294). On a row that resolves to the sandboxed tier, display regex output that is an HTML block renders in the sandboxed card frame (`@orb/kit/card-frame`) with its own style blocks, inline styles, keyframes and SVG. On any other row it renders through the inert allowlist as today. It never gets styles in the main DOM. Scripts follow the existing top step and the viewer's own card-script setting; nothing here widens them. Today a naked HTML block becomes a card only in a game room with the immersive switch on (`lenientCards`); find the one place that decides that and extend it to display regex output on a sandboxed-tier row. Amend D294 with the rule. Route to security-builder.

## Why

A preset's HUD depends on its CSS, and the app already has a deployment setting, a per-character step, a per-viewer setting and a room switch for HTML. A fifth control for presets would be one more thing to find; the existing tier already says whether this row may draw styled HTML.

## Done when

With the Sola preset's scripts attached and a character on the default step, the scene banner renders styled inside the card frame; with the character set to plain text, or the deployment setting off, the same reply renders through the inert allowlist with no style applied. A CT pins both, and a case shows a style block from regex output never reaches the main document.

## Evidence

Filled at landing: what ran and where its output is.
