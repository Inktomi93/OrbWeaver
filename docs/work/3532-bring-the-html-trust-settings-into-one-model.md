---
kind: work
status: open
updated: 2026-11-16
priority: P1
area: chat
---

# Bring the HTML trust settings into one model a user can read as a single chain

## What

The enforcement is one ladder resolved in `packages/contracts/src/chat/roster.ts` and checked by the server when a frame is minted and served. The settings around it read as separate knobs. The install's Render HTML default governs only seats with no card, because an inheriting character resolves to the interactive step whenever the install's interactive switch is on. The sandboxed frame is reached by the character ladder and also by the room's immersive HTML switch, as a second consent. Whether scripts run is decided by the character step, the install ceiling and each viewer's own script setting, and no surface shows them as one chain. A member's message resolves by a different path from a character's message, and no surface states that rule.

## Why

The owner reads the posture as fragmented. A setting that does not mean what its name says leads a host to change the wrong one, and a host cannot predict what a room will render.

## Done when

A design is ruled and recorded in `docs/law/UI-Theming-and-Content.md`: one table that gives, for each author kind and each setting, what renders and who may change it, with every setting either doing what its name says or renamed or removed. The room switch and the character ladder are one consent or their difference is stated. The settings surfaces and the plain-content notice use that model's words. The resolver and the card frame route agree with the table, and tests cover each row of it. Stored settings keep their meaning or ship a numbered migration.

## Evidence

Filled at landing: what ran and where its output is.
